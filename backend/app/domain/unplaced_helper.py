"""
Helper module for diagnosing unplaced parts and building deduplicated, grouped summaries.
"""

from typing import List, Dict, Tuple, Optional, Any
import math
from collections import Counter

from .models import PartItem, UnplacedPartSummary, PlacedPart, MachineProfile
from .orientation import get_permitted_orientations


def build_unplaced_summary(
    demanded_parts: List[PartItem],
    placed_parts: List[PlacedPart],
    candidate_stocks: List[Tuple[str, str, Tuple[float, float, float], Tuple[float, float, float]]],
    machine: Optional[MachineProfile] = None,
    target_grade: str = "HR-40",
    timed_out: bool = False,
    known_reasons: Optional[Dict[str, str]] = None
) -> List[UnplacedPartSummary]:
    """
    Groups unplaced instances by SKU and assigns a specific, accurate reason code
    along with actionable suggested fixes. Never produces duplicate entries for the same SKU.
    """
    # Count placed parts by SKU
    placed_counts = Counter(p.sku for p in placed_parts)

    # Determine max usable dimensions across all matching candidate stocks
    max_ux = 0.0
    max_uy = 0.0
    max_uz = 0.0
    matching_stock_count = 0
    total_usable_stock_volume = 0.0

    for st_type, st_id, nom_dims, usable_dims in candidate_stocks:
        ux, uy, uz = usable_dims
        max_ux = max(max_ux, ux)
        max_uy = max(max_uy, uy)
        max_uz = max(max_uz, uz)
        matching_stock_count += 1
        total_usable_stock_volume += (ux * uy * uz)

    single_block_vol = (max_ux * max_uy * max_uz) if (max_ux > 0 and max_uy > 0 and max_uz > 0) else (106.0 * 80.0 * 38.0)

    summary_list: List[UnplacedPartSummary] = []
    seen_skus = set()

    for p in demanded_parts:
        if p.sku in seen_skus:
            continue
        seen_skus.add(p.sku)

        requested_qty = p.quantity
        placed_qty = placed_counts.get(p.sku, 0)
        unplaced_qty = max(0, requested_qty - placed_qty)

        if unplaced_qty <= 0:
            continue

        orients = get_permitted_orientations(p.length, p.width, p.height, p.orientation_mode)

        # 1. Check NO_MATCHING_GRADE_STOCK
        if matching_stock_count == 0 or (p.grade != target_grade and matching_stock_count == 0):
            reason_code = "NO_MATCHING_GRADE_STOCK"
            message = f"No available block stock in inventory matching foam grade '{p.grade}'."
            suggested_action = f"Add stock blocks or remnants with grade '{p.grade}' to inventory."

        # 2. Check EXCEEDS_MACHINE_MAX_CUT_HEIGHT
        elif machine is not None and (
            (any(uz > machine.max_cut_height for _, _, _, (_, _, uz) in candidate_stocks))
            or (all(oz > machine.max_cut_height for _, _, oz in orients))
        ):
            reason_code = "EXCEEDS_MACHINE_MAX_CUT_HEIGHT"
            min_oz = min(oz for _, _, oz in orients)
            limit = machine.max_cut_height
            message = f"Part or required block height exceeds machine max cut height limit of {limit}\"."
            suggested_action = f"Choose a machine with max cut height of at least {min_oz}\" (e.g. Saw Station 1 or 2)."

        # 3. Check EXCEEDS_USABLE_DIMENSIONS
        elif not any(
            any(
                ox <= ux + 1e-4 and oy <= uy + 1e-4 and oz <= uz + 1e-4
                for ox, oy, oz in orients
            )
            for _, _, _, (ux, uy, uz) in candidate_stocks
        ):
            reason_code = "EXCEEDS_USABLE_DIMENSIONS"
            # Identify dimension and delta
            min_exceed_delta = float("inf")
            dim_name = "dimension"
            for ox, oy, oz in orients:
                dx = max(0.0, ox - max_ux)
                dy = max(0.0, oy - max_uy)
                dz = max(0.0, oz - max_uz)
                tot_exceed = dx + dy + dz
                if tot_exceed < min_exceed_delta:
                    min_exceed_delta = tot_exceed
                    if dx > 0:
                        dim_name = f"length by {round(dx, 2)}\""
                    elif dy > 0:
                        dim_name = f"width by {round(dy, 2)}\""
                    elif dz > 0:
                        dim_name = f"height by {round(dz, 2)}\""
            message = f"No permitted orientation fits inside usable block ({max_ux}\"x{max_uy}\"x{max_uz}\"), exceeds {dim_name}."
            suggested_action = f"Resize part dimensions or load larger stock blocks."

        # 4. Check SOLVER_TIMEOUT
        elif timed_out:
            reason_code = "SOLVER_TIMEOUT"
            message = "Optimization time budget exhausted before complete 3D layout could be found."
            suggested_action = "Increase the time budget in optimization settings or run a faster heuristic (e.g. FFD)."

        # 5. Check INSUFFICIENT_BLOCK_QUANTITY
        else:
            total_demanded_vol = sum(d.volume * d.quantity for d in demanded_parts)
            if total_demanded_vol > total_usable_stock_volume:
                shortfall_vol = total_demanded_vol - total_usable_stock_volume
                blocks_needed = math.ceil(shortfall_vol / (single_block_vol * 0.70))
                reason_code = "INSUFFICIENT_BLOCK_QUANTITY"
                message = f"Insufficient stock blocks to fulfill total order volume ({blocks_needed} additional block(s) needed)."
                suggested_action = f"Add {blocks_needed} more {p.grade} block(s) to stock."
            else:
                # 6. GEOMETRY_INFEASIBLE_AFTER_VERIFY
                reason_code = "GEOMETRY_INFEASIBLE_AFTER_VERIFY"
                message = "Volume fits within stock capacity, but physical 3D orthogonal guillotine cuts could not pack this item."
                suggested_action = "Add 1 additional block or allow flexible orientation (free-in-plane / any)."

        if known_reasons and p.sku in known_reasons:
            reason_code = known_reasons[p.sku]

        summary_list.append(
            UnplacedPartSummary(
                id=p.id,
                sku=p.sku,
                name=p.name,
                grade=p.grade,
                length=p.length,
                width=p.width,
                height=p.height,
                quantity=unplaced_qty,
                orientation_mode=p.orientation_mode,
                color_hex=p.color_hex,
                requested_qty=requested_qty,
                placed_qty=placed_qty,
                unplaced_qty=unplaced_qty,
                reason_code=reason_code,
                message=message,
                suggested_action=suggested_action
            )
        )

    return summary_list
