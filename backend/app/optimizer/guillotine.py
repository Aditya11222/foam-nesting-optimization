"""
3D Best-Fit Decreasing Guillotine Optimization Engine.
Minimizes unrecoverable scrap, enforces rise constraints, accounts for kerf and skin trim,
and outputs machine-valid slicing trees and step-by-step saw sequences.
Explicitly labeled as a 'heuristic solution'.
"""

from typing import List, Tuple, Optional, Dict
from datetime import datetime
import uuid

from ..domain.models import (
    OptimizationRequest,
    OptimizationResult,
    BlockLayout,
    PlacedPart,
    RemnantOutput,
    PartItem,
    MachineProfile,
    MachineCutType,
    BunStock,
    RemnantStock,
    SkinTrimConfig,
)
from ..domain.units import snap_to_16th, SIXTEENTH_INCH
from ..domain.orientation import get_permitted_orientations
from .slicing_tree import SlicingNode
from .cut_sequencer import generate_operator_cut_sequence
from .metrics import compute_block_metrics, estimate_saw_time_minutes
from .registry import registry, StrategyNotImplementedError


MIN_REMNANT_VOLUME = 18.0 * 18.0 * 10.0  # Threshold for usable remnant vs unrecoverable scrap


class GradeMismatchError(ValueError):
    pass


def optimize_guillotine_job(
    request: OptimizationRequest,
    available_buns: List[BunStock],
    available_remnants: List[RemnantStock],
    machine: MachineProfile
) -> OptimizationResult:
    """
    Executes 3D Guillotine Nesting optimization for a set of parts of a single foam grade.
    """
    if machine.cut_type != MachineCutType.GUILLOTINE:
        raise StrategyNotImplementedError(
            f"Machine '{machine.name}' has cut_type '{machine.cut_type.value}' (waterjet/CNC). "
            "Non-guillotine free nesting is registered as a future capability and is not implemented in the MVP. "
            "Please select a guillotine saw profile."
        )

    target_grade = request.grade
    kerf = machine.kerf

    # 1. Enforce Grade Segregation
    for p in request.parts:
        if p.grade != target_grade:
            raise GradeMismatchError(
                f"Part {p.sku} has grade '{p.grade}' but job is for grade '{target_grade}'. "
                "Cross-grade mixing is strictly prohibited."
            )

    # 2. Expand parts by quantity into individual instances
    instances_to_place: List[PartItem] = []
    for p in request.parts:
        for _ in range(p.quantity):
            instances_to_place.append(p)

    # Sort parts: largest volume first (Best-Fit Decreasing)
    instances_to_place.sort(key=lambda item: (item.volume, max(item.length, item.width, item.height)), reverse=True)

    # 3. Filter stock for matching grade only
    matching_remnants = [r for r in available_remnants if r.grade == target_grade]
    matching_buns = [b for b in available_buns if b.grade == target_grade]

    # Remnants first if requested, then full buns
    candidate_stocks: List[Tuple[str, str, Tuple[float, float, float], Tuple[float, float, float]]] = []
    
    if request.prefer_remnants_first:
        for rem in matching_remnants:
            dims = (rem.length, rem.width, rem.height)
            candidate_stocks.append(("remnant", rem.id, dims, dims))

    for bun in matching_buns:
        nominal = (bun.nominal_length, bun.nominal_width, bun.nominal_height)
        usable = bun.usable_dims
        candidate_stocks.append(("bun", bun.id, nominal, usable))

    # If no predefined stock available, generate standard default buns
    if not candidate_stocks:
        default_bun = BunStock(
            id=f"bun-auto-1",
            code=f"BUN-{target_grade}-AUTO",
            grade=target_grade,
            nominal_length=108.0,
            nominal_width=82.0,
            nominal_height=40.0,
            skin_trim=SkinTrimConfig(x=request.skin_trim_per_face, y=request.skin_trim_per_face, z=request.skin_trim_per_face)
        )
        candidate_stocks.append(("bun", default_bun.id, (108.0, 82.0, 40.0), default_bun.usable_dims))

    blocks_output: List[BlockLayout] = []
    unplaced_items: List[PartItem] = list(instances_to_place)
    block_index = 1
    total_cuts_all = 0

    stock_pointer = 0
    while unplaced_items and stock_pointer < len(candidate_stocks):
        stock_type, stock_id, nominal_dims, usable_dims = candidate_stocks[stock_pointer]
        stock_pointer += 1

        ux, uy, uz = usable_dims
        if uz > machine.max_cut_height:
            # Exceeds machine clearance
            continue

        root_node = SlicingNode(0.0, 0.0, 0.0, ux, uy, uz, node_id=f"root_b{block_index}")
        placed_in_this_block: List[PlacedPart] = []
        raw_cuts_in_this_block: List[dict] = []
        still_unplaced: List[PartItem] = []

        for item in unplaced_items:
            permitted_orients = get_permitted_orientations(
                item.length, item.width, item.height, item.orientation_mode
            )

            free_leaves = root_node.get_free_leaves()
            best_fit_leaf: Optional[SlicingNode] = None
            best_orient: Optional[Tuple[float, float, float]] = None
            min_waste_score = float("inf")

            for leaf in free_leaves:
                for orient in permitted_orients:
                    ox, oy, oz = orient
                    if leaf.can_fit(ox, oy, oz):
                        # Waste score = leftover volume in this leaf
                        waste = leaf.volume - (ox * oy * oz)
                        if waste < min_waste_score:
                            min_waste_score = waste
                            best_fit_leaf = leaf
                            best_orient = orient

            if best_fit_leaf is not None and best_orient is not None:
                ox, oy, oz = best_orient
                current_target = best_fit_leaf

                # Guillotine cut 1: Z axis (Horizontal slab cut) if residual height exceeds kerf
                if current_target.dz > oz + kerf + SIXTEENTH_INCH:
                    slab_left, slab_right = current_target.split("Z", oz, kerf)
                    raw_cuts_in_this_block.append({
                        "axis": "Z",
                        "coord": current_target.z + oz,
                        "kerf": kerf,
                        "piece_dims": (current_target.dx, current_target.dy, current_target.dz),
                        "part_name": item.sku
                    })
                    current_target = slab_left

                # Guillotine cut 2: X axis (Vertical rip cut) if residual length exceeds kerf
                if current_target.dx > ox + kerf + SIXTEENTH_INCH:
                    rip_left, rip_right = current_target.split("X", ox, kerf)
                    raw_cuts_in_this_block.append({
                        "axis": "X",
                        "coord": current_target.x + ox,
                        "kerf": kerf,
                        "piece_dims": (current_target.dx, current_target.dy, current_target.dz),
                        "part_name": item.sku
                    })
                    current_target = rip_left

                # Guillotine cut 3: Y axis (Crosscut) if residual width exceeds kerf
                if current_target.dy > oy + kerf + SIXTEENTH_INCH:
                    cross_left, cross_right = current_target.split("Y", oy, kerf)
                    raw_cuts_in_this_block.append({
                        "axis": "Y",
                        "coord": current_target.y + oy,
                        "kerf": kerf,
                        "piece_dims": (current_target.dx, current_target.dy, current_target.dz),
                        "part_name": item.sku
                    })
                    current_target = cross_left

                # Placed exactly inside current_target
                placed = PlacedPart(
                    part_id=item.id,
                    sku=item.sku,
                    name=item.name,
                    grade=item.grade,
                    x=current_target.x,
                    y=current_target.y,
                    z=current_target.z,
                    length=ox,
                    width=oy,
                    height=oz,
                    orientation_used=best_orient,
                    color_hex=item.color_hex or "#3b82f6"
                )
                current_target.placed_part = placed
                placed_in_this_block.append(placed)
            else:
                still_unplaced.append(item)

        unplaced_items = still_unplaced

        # Extract remnants from remaining free leaves
        remnants_in_this_block: List[RemnantOutput] = []
        rem_idx = 1
        for leaf in root_node.get_free_leaves():
            if leaf.volume >= MIN_REMNANT_VOLUME:
                leaf.is_remnant = True
                rem_code = f"REM-{target_grade}-B{block_index}-{rem_idx}"
                rem_out = RemnantOutput(
                    id=str(uuid.uuid4())[:8],
                    code=rem_code,
                    x=leaf.x,
                    y=leaf.y,
                    z=leaf.z,
                    length=leaf.dx,
                    width=leaf.dy,
                    height=leaf.dz,
                    grade=target_grade,
                    volume=leaf.volume,
                    usability_score=round(min(1.0, leaf.volume / (36.0 * 36.0 * 20.0)), 2),
                    retained=True,
                    storage_location=f"Bay R-{10 + rem_idx}"
                )
                leaf.remnant_info = rem_out
                remnants_in_this_block.append(rem_out)
                rem_idx += 1

        # Operator cut sequence
        cuts = generate_operator_cut_sequence(
            nominal_dims=nominal_dims,
            usable_dims=usable_dims,
            raw_cuts=raw_cuts_in_this_block,
            remnants=remnants_in_this_block,
            kerf=kerf
        )
        total_cuts_all += len(cuts)

        metrics = compute_block_metrics(
            nominal_dims=nominal_dims,
            usable_dims=usable_dims,
            placed_parts=placed_in_this_block,
            usable_remnants=remnants_in_this_block,
            cuts=cuts,
            kerf=kerf
        )

        layout = BlockLayout(
            block_index=block_index,
            stock_id=stock_id,
            stock_type=stock_type,  # type: ignore
            grade=target_grade,
            nominal_length=nominal_dims[0],
            nominal_width=nominal_dims[1],
            nominal_height=nominal_dims[2],
            usable_length=usable_dims[0],
            usable_width=usable_dims[1],
            usable_height=usable_dims[2],
            skin_trim_loss_volume=metrics["skin_trim_loss_volume"],
            placed_parts=placed_in_this_block,
            usable_remnants=remnants_in_this_block,
            cuts=cuts,
            gross_volume=metrics["gross_volume"],
            usable_volume=metrics["usable_volume"],
            parts_volume=metrics["parts_volume"],
            kerf_loss_volume=metrics["kerf_loss_volume"],
            unrecoverable_scrap_volume=metrics["unrecoverable_scrap_volume"],
            gross_utilization_pct=metrics["gross_utilization_pct"],
            net_utilization_pct=metrics["net_utilization_pct"],
            material_recovery_pct=metrics["material_recovery_pct"]
        )
        blocks_output.append(layout)
        block_index += 1

        # If items still remain and we ran out of candidate stocks, add more default buns
        if unplaced_items and stock_pointer >= len(candidate_stocks):
            extra_bun = BunStock(
                id=f"bun-extra-{block_index}",
                code=f"BUN-{target_grade}-EXT{block_index}",
                grade=target_grade,
                nominal_length=108.0,
                nominal_width=82.0,
                nominal_height=40.0,
                skin_trim=SkinTrimConfig(x=request.skin_trim_per_face, y=request.skin_trim_per_face, z=request.skin_trim_per_face)
            )
            candidate_stocks.append(("bun", extra_bun.id, (108.0, 82.0, 40.0), extra_bun.usable_dims))

    # Aggregates across all blocks
    total_gross = sum(b.gross_volume for b in blocks_output)
    total_usable = sum(b.usable_volume for b in blocks_output)
    total_parts_vol = sum(b.parts_volume for b in blocks_output)
    total_kerf = sum(b.kerf_loss_volume for b in blocks_output)
    total_remnant_vol = sum(sum(r.volume for r in b.usable_remnants) for b in blocks_output)
    total_scrap = sum(b.unrecoverable_scrap_volume for b in blocks_output)

    agg_gross_util = (total_parts_vol / total_gross * 100.0) if total_gross > 0 else 0.0
    agg_net_util = (total_parts_vol / total_usable * 100.0) if total_usable > 0 else 0.0

    all_cuts = [c for b in blocks_output for c in b.cuts]
    saw_time = estimate_saw_time_minutes(all_cuts)

    return OptimizationResult(
        job_id=request.job_id,
        grade=target_grade,
        solution_type="heuristic solution",
        timestamp=datetime.now(),
        machine=machine,
        total_parts_demanded=len(instances_to_place),
        total_parts_placed=len(instances_to_place) - len(unplaced_items),
        unplaced_parts=unplaced_items,
        blocks_used_count=len(blocks_output),
        blocks=blocks_output,
        total_gross_volume=round(total_gross, 2),
        total_usable_volume=round(total_usable, 2),
        total_parts_volume=round(total_parts_vol, 2),
        total_kerf_volume=round(total_kerf, 2),
        total_remnant_volume=round(total_remnant_vol, 2),
        total_unrecoverable_scrap_volume=round(total_scrap, 2),
        gross_utilization_pct=round(agg_gross_util, 1),
        net_utilization_pct=round(agg_net_util, 1),
        total_cuts_count=len(all_cuts),
        estimated_saw_time_minutes=saw_time
    )


# Register in registry
registry.register(MachineCutType.GUILLOTINE, optimize_guillotine_job)
