"""
3D Free-Nesting Optimization Strategy for Non-Guillotine Machines (Waterjet / CNC Contour).
Implements 3D maximal-empty-box anchor-point placement without edge-to-edge cut constraints.
Accounts for nozzle kerf, skin trim, rise orientation rules, and enforces machine throat clearance limits.
"""

from typing import List, Tuple, Dict, Any, Optional
from datetime import datetime
import uuid
import math

from ..domain.unplaced_helper import build_unplaced_summary
from ..domain.models import (
    OptimizationRequest,
    OptimizationResult,
    BlockLayout,
    PlacedPart,
    RemnantOutput,
    CutStep,
    CutType,
    PartItem,
    MachineProfile,
    MachineCutType,
    BunStock,
    RemnantStock,
    SkinTrimConfig,
    AlgorithmInfo
)
from ..domain.units import snap_to_16th, SIXTEENTH_INCH
from ..domain.orientation import get_permitted_orientations
from .strategies import NestingStrategy, GradeMismatchError, prepare_candidate_stocks
from .metrics import compute_block_metrics, estimate_saw_time_minutes

MIN_REMNANT_VOLUME = 18.0 * 18.0 * 10.0


class FreeBox:
    """Represents a 3D available rectangular volume in usable space."""
    def __init__(self, x: float, y: float, z: float, dx: float, dy: float, dz: float):
        self.x = round(float(x) * 16.0) / 16.0
        self.y = round(float(y) * 16.0) / 16.0
        self.z = round(float(z) * 16.0) / 16.0
        self.dx = snap_to_16th(dx, "fbox_dx")
        self.dy = snap_to_16th(dy, "fbox_dy")
        self.dz = snap_to_16th(dz, "fbox_dz")

    @property
    def volume(self) -> float:
        return self.dx * self.dy * self.dz

    def can_fit(self, ox: float, oy: float, oz: float) -> bool:
        return (ox <= self.dx + 1e-4) and (oy <= self.dy + 1e-4) and (oz <= self.dz + 1e-4)


class FreeNestingStrategy(NestingStrategy):
    @property
    def info(self) -> AlgorithmInfo:
        return AlgorithmInfo(
            id="free_nesting_heuristic",
            name="3D Free Contour Nesting (Waterjet CNC)",
            description="3D maximal-empty-box contour placement for non-guillotine CNC waterjet machines with stream kerf.",
            speed_tag="Fast (~15–35 ms)",
            supported_cut_types=["free"]
        )

    def solve(
        self,
        request: OptimizationRequest,
        available_buns: List[BunStock],
        available_remnants: List[RemnantStock],
        machine: MachineProfile
    ) -> OptimizationResult:
        target_grade = request.grade
        for p in request.parts:
            if p.grade != target_grade:
                raise GradeMismatchError(f"Part {p.sku} has grade '{p.grade}' but job is for grade '{target_grade}'.")

        kerf = request.kerf if (request.kerf is not None and request.kerf > 0) else machine.kerf

        # Expand instances
        instances: List[PartItem] = []
        for p in request.parts:
            for _ in range(p.quantity):
                instances.append(p)

        # Sort: volume descending, tie-break max dimension
        instances.sort(key=lambda item: (item.volume, max(item.length, item.width, item.height)), reverse=True)

        candidate_stocks = prepare_candidate_stocks(request, available_buns, available_remnants, target_grade)

        blocks_output: List[BlockLayout] = []
        unplaced_items: List[PartItem] = list(instances)
        block_index = 1

        stock_pointer = 0
        while unplaced_items and stock_pointer < len(candidate_stocks):
            stock_type, stock_id, nominal_dims, usable_dims = candidate_stocks[stock_pointer]
            stock_pointer += 1

            ux, uy, uz = usable_dims

            # Machine Clearance Limit Enforcement
            if uz > machine.max_cut_height:
                raise ValueError(
                    f"Block usable height ({uz} in) exceeds machine '{machine.name}' maximum throat cut height "
                    f"({machine.max_cut_height} in). Please select a thinner stock bun (height <= {machine.max_cut_height} in) "
                    "or choose a guillotine saw profile."
                )

            # Available free boxes within this block
            free_boxes: List[FreeBox] = [FreeBox(0.0, 0.0, 0.0, ux, uy, uz)]
            placed_in_this_block: List[PlacedPart] = []
            still_unplaced: List[PartItem] = []

            for item in unplaced_items:
                permitted_orients = get_permitted_orientations(
                    item.length, item.width, item.height, item.orientation_mode
                )

                best_box_idx: Optional[int] = None
                best_orient: Optional[Tuple[float, float, float]] = None
                min_waste = float("inf")

                for b_idx, fbox in enumerate(free_boxes):
                    for orient in permitted_orients:
                        ox, oy, oz = orient
                        if fbox.can_fit(ox, oy, oz):
                            # Score: prioritize lower z, lower y, lower x, then tighter volume fit
                            waste = (fbox.z * 1000.0) + (fbox.y * 100.0) + (fbox.x * 10.0) + (fbox.volume - (ox * oy * oz))
                            if waste < min_waste:
                                min_waste = waste
                                best_box_idx = b_idx
                                best_orient = orient

                if best_box_idx is not None and best_orient is not None:
                    target_box = free_boxes.pop(best_box_idx)
                    ox, oy, oz = best_orient

                    # Placed coordinates at anchor corner of target_box
                    px = target_box.x
                    py = target_box.y
                    pz = target_box.z

                    placed = PlacedPart(
                        part_id=item.id,
                        sku=item.sku,
                        name=item.name,
                        grade=item.grade,
                        x=px,
                        y=py,
                        z=pz,
                        length=ox,
                        width=oy,
                        height=oz,
                        orientation_used=best_orient,
                        color_hex=item.color_hex or "#3b82f6"
                    )
                    placed_in_this_block.append(placed)

                    # Subdivide the remaining space of target_box with kerf
                    # 1. Right remnant (along X)
                    rx_pos = px + ox + kerf
                    rx_dim = target_box.dx - (ox + kerf)
                    if rx_dim >= SIXTEENTH_INCH:
                        free_boxes.append(FreeBox(rx_pos, py, pz, rx_dim, target_box.dy, target_box.dz))

                    # 2. Top remnant (along Y)
                    ry_pos = py + oy + kerf
                    ry_dim = target_box.dy - (oy + kerf)
                    if ry_dim >= SIXTEENTH_INCH:
                        free_boxes.append(FreeBox(px, ry_pos, pz, ox, ry_dim, target_box.dz))

                    # 3. Front remnant (along Z)
                    rz_pos = pz + oz + kerf
                    rz_dim = target_box.dz - (oz + kerf)
                    if rz_dim >= SIXTEENTH_INCH:
                        free_boxes.append(FreeBox(px, py, rz_pos, ox, oy, rz_dim))
                else:
                    still_unplaced.append(item)

            unplaced_items = still_unplaced

            if len(placed_in_this_block) == 0:
                if stock_type == "remnant":
                    continue
                else:
                    break

            # Extract remnants from remaining free boxes
            usable_remnants: List[RemnantOutput] = []
            rem_idx = 1
            for fbox in free_boxes:
                if fbox.volume >= MIN_REMNANT_VOLUME:
                    rem_code = f"REM-{target_grade}-WJ{block_index}-{rem_idx}"
                    usable_remnants.append(RemnantOutput(
                        id=str(uuid.uuid4())[:8],
                        code=rem_code,
                        x=fbox.x,
                        y=fbox.y,
                        z=fbox.z,
                        length=fbox.dx,
                        width=fbox.dy,
                        height=fbox.dz,
                        grade=target_grade,
                        volume=round(fbox.volume, 2),
                        usability_score=round(min(1.0, fbox.volume / (36.0 * 36.0 * 20.0)), 2),
                        retained=True,
                        storage_location=f"Bay W-{10 + rem_idx}"
                    ))
                    rem_idx += 1

            # Generate CNC Contour Cut Sequence
            cuts: List[CutStep] = []
            step_num = 1

            # Step 1: Perimeter Skin Trim
            cuts.append(CutStep(
                step_number=step_num,
                stage=1,
                cut_type=CutType.SKIN_TRIM,
                axis="Z",
                position_in=0.0,
                position_display="Perimeter (1 in)",
                kerf_in=kerf,
                target_piece_dims=usable_dims,
                produces_description_en="Perimeter skin trim — removes crust skin on all 6 faces for usable interior",
                produces_description_es="Desorillado perimetral — elimina la corteza en las 6 caras para el bloque útil [revisión]"
            ))
            step_num += 1

            # Steps 2..N: Contour cuts for each placed part
            for p in placed_in_this_block:
                cuts.append(CutStep(
                    step_number=step_num,
                    stage=4,
                    cut_type=CutType.CONTOUR,
                    axis="Z",
                    position_in=p.z,
                    position_display=f"({p.x:.1f}, {p.y:.1f}, {p.z:.1f})",
                    kerf_in=kerf,
                    target_piece_dims=(p.length, p.width, p.height),
                    produces_description_en=f"CNC Waterjet contour path: {p.sku} ({p.length}x{p.width}x{p.height} in) at ({p.x}, {p.y}, {p.z})",
                    produces_description_es=f"Corte de contorno CNC por chorro de agua: {p.sku} ({p.length}x{p.width}x{p.height} in) en ({p.x}, {p.y}, {p.z}) [revisión]",
                    target_part_id=p.part_id
                ))
                step_num += 1

            metrics = compute_block_metrics(
                nominal_dims=nominal_dims,
                usable_dims=usable_dims,
                placed_parts=placed_in_this_block,
                usable_remnants=usable_remnants,
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
                usable_remnants=usable_remnants,
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

            if unplaced_items and stock_pointer >= len(candidate_stocks) and block_index < 20:
                extra_bun = BunStock(
                    id=f"bun-extra-wj-{block_index}",
                    code=f"BUN-{target_grade}-EXT{block_index}",
                    grade=target_grade,
                    nominal_length=108.0,
                    nominal_width=82.0,
                    nominal_height=min(machine.max_cut_height + 2.0 * request.skin_trim_per_face, 40.0),
                    skin_trim=SkinTrimConfig(x=1.0, y=1.0, z=1.0)
                )
                candidate_stocks.append(("bun", extra_bun.id, (108.0, 82.0, extra_bun.nominal_height), extra_bun.usable_dims))

        total_gross = sum(b.gross_volume for b in blocks_output)
        total_usable = sum(b.usable_volume for b in blocks_output)
        total_parts_vol = sum(b.parts_volume for b in blocks_output)
        total_kerf = sum(b.kerf_loss_volume for b in blocks_output)
        total_remnant_vol = sum(sum(r.volume for r in b.usable_remnants) for b in blocks_output)
        total_scrap = sum(b.unrecoverable_scrap_volume for b in blocks_output)

        agg_gross_util = (total_parts_vol / total_gross * 100.0) if total_gross > 0 else 0.0
        agg_net_util = (total_parts_vol / total_usable * 100.0) if total_usable > 0 else 0.0

        all_cuts = [c for b in blocks_output for c in b.cuts]
        saw_time = estimate_saw_time_minutes(all_cuts, feed_rate_ipm=80.0)

        all_placed_items = [p for b in blocks_output for p in b.placed_parts]
        unplaced_summary_list = build_unplaced_summary(
            demanded_parts=instances,
            placed_parts=all_placed_items,
            candidate_stocks=candidate_stocks,
            machine=machine,
            target_grade=target_grade
        )

        return OptimizationResult(
            job_id=request.job_id,
            grade=target_grade,
            algorithm_id=self.info.id,
            algorithm_name=self.info.name,
            solution_type="heuristic solution",
            timestamp=datetime.now(),
            machine=machine,
            total_parts_demanded=len(instances),
            total_parts_placed=len(all_placed_items),
            unplaced_parts=unplaced_summary_list,
            unplaced_summary=unplaced_summary_list,
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
