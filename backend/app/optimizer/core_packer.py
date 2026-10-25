"""
Core 3D Guillotine Packing Engine.
Provides modular leaf selection (best-fit vs first-fit) and split policies (Z-X-Y vs min-residual).
Used by Best-Fit Decreasing, First-Fit Decreasing, and Simulated Annealing.
"""

from typing import List, Tuple, Optional, Dict, Any
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

MIN_REMNANT_VOLUME = 18.0 * 18.0 * 10.0


def execute_packing(
    items_to_place: List[PartItem],
    candidate_stocks: List[Tuple[str, str, Tuple[float, float, float], Tuple[float, float, float]]],
    machine: MachineProfile,
    target_grade: str,
    job_id: str,
    leaf_selection: str = "best_fit",       # "best_fit" or "first_fit"
    split_policy: str = "standard_zxy",     # "standard_zxy" or "min_residual"
    preferred_orientations: Optional[Dict[str, Tuple[float, float, float]]] = None,
    algorithm_id: str = "best_fit_decreasing",
    algorithm_name: str = "Best-Fit Decreasing"
) -> OptimizationResult:
    kerf = machine.kerf
    blocks_output: List[BlockLayout] = []
    unplaced_items: List[PartItem] = list(items_to_place)
    block_index = 1
    total_cuts_all = 0

    stock_pointer = 0
    while unplaced_items and stock_pointer < len(candidate_stocks):
        stock_type, stock_id, nominal_dims, usable_dims = candidate_stocks[stock_pointer]
        stock_pointer += 1

        ux, uy, uz = usable_dims
        if uz > machine.max_cut_height:
            continue

        root_node = SlicingNode(0.0, 0.0, 0.0, ux, uy, uz, node_id=f"root_b{block_index}")
        placed_in_this_block: List[PlacedPart] = []
        raw_cuts_in_this_block: List[dict] = []
        still_unplaced: List[PartItem] = []

        for item in unplaced_items:
            permitted_orients = get_permitted_orientations(
                item.length, item.width, item.height, item.orientation_mode
            )

            # If a preferred orientation is specified (e.g. by Simulated Annealing)
            if preferred_orientations and item.id in preferred_orientations:
                pref = preferred_orientations[item.id]
                if pref in permitted_orients:
                    permitted_orients = [pref] + [o for o in permitted_orients if o != pref]

            free_leaves = root_node.get_free_leaves()
            chosen_leaf: Optional[SlicingNode] = None
            chosen_orient: Optional[Tuple[float, float, float]] = None

            if leaf_selection == "first_fit":
                # First-fit: select first leaf that can accommodate the item
                for leaf in free_leaves:
                    for orient in permitted_orients:
                        ox, oy, oz = orient
                        if leaf.can_fit(ox, oy, oz):
                            chosen_leaf = leaf
                            chosen_orient = orient
                            break
                    if chosen_leaf is not None:
                        break
            else:
                # Best-fit: scan all free leaves and minimize residual volume
                min_waste = float("inf")
                for leaf in free_leaves:
                    for orient in permitted_orients:
                        ox, oy, oz = orient
                        if leaf.can_fit(ox, oy, oz):
                            waste = leaf.volume - (ox * oy * oz)
                            if waste < min_waste:
                                min_waste = waste
                                chosen_leaf = leaf
                                chosen_orient = orient

            if chosen_leaf is not None and chosen_orient is not None:
                ox, oy, oz = chosen_orient
                current_target = chosen_leaf

                # Determine cut order based on split policy
                if split_policy == "min_residual":
                    # Evaluate residual dimensions and cut the axis with largest residual first
                    residuals = [
                        ("X", ox, current_target.dx, current_target.x),
                        ("Y", oy, current_target.dy, current_target.y),
                        ("Z", oz, current_target.dz, current_target.z)
                    ]
                    # Sort by leftover dimension descending
                    residuals.sort(key=lambda r: (r[2] - r[1]), reverse=True)
                    axes_order = residuals
                else:
                    # Standard Z -> X -> Y
                    axes_order = [
                        ("Z", oz, current_target.dz, current_target.z),
                        ("X", ox, current_target.dx, current_target.x),
                        ("Y", oy, current_target.dy, current_target.y)
                    ]

                for axis, part_dim, box_dim, origin_coord in axes_order:
                    # Check current dimension along this axis
                    curr_dim = getattr(current_target, f"d{axis.lower()}")
                    curr_pos = getattr(current_target, axis.lower())
                    if curr_dim > part_dim + kerf + SIXTEENTH_INCH:
                        left_child, right_child = current_target.split(axis, part_dim, kerf)
                        raw_cuts_in_this_block.append({
                            "axis": axis,
                            "coord": curr_pos + part_dim,
                            "kerf": kerf,
                            "piece_dims": (current_target.dx, current_target.dy, current_target.dz),
                            "part_name": item.sku
                        })
                        current_target = left_child

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
                    orientation_used=chosen_orient,
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

        # If no parts could be placed in this block at all
        if len(placed_in_this_block) == 0:
            if stock_type == "remnant":
                # Remove empty block layout that was just appended
                if blocks_output and blocks_output[-1].block_index == block_index - 1:
                    blocks_output.pop()
                    block_index -= 1
                continue
            else:
                break

        # If items still remain and we ran out of candidate stocks (up to a reasonable limit, e.g. 20 blocks)
        if unplaced_items and stock_pointer >= len(candidate_stocks) and block_index < 20:
            extra_bun = BunStock(
                id=f"bun-extra-{block_index}",
                code=f"BUN-{target_grade}-EXT{block_index}",
                grade=target_grade,
                nominal_length=108.0,
                nominal_width=82.0,
                nominal_height=40.0,
                skin_trim=SkinTrimConfig(x=1.0, y=1.0, z=1.0)
            )
            candidate_stocks.append(("bun", extra_bun.id, (108.0, 82.0, 40.0), extra_bun.usable_dims))

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
        job_id=job_id,
        grade=target_grade,
        algorithm_id=algorithm_id,
        algorithm_name=algorithm_name,
        solution_type="heuristic solution",
        timestamp=datetime.now(),
        machine=machine,
        total_parts_demanded=len(items_to_place),
        total_parts_placed=len(items_to_place) - len(unplaced_items),
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
