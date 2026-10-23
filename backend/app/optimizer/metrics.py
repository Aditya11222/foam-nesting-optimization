"""
Honest metrics and material utilization calculator.
Provides transparent volume breakdowns without claiming global optimality.
"""

from typing import List, Tuple
from ..domain.models import PlacedPart, RemnantOutput, CutStep


def compute_block_metrics(
    nominal_dims: Tuple[float, float, float],
    usable_dims: Tuple[float, float, float],
    placed_parts: List[PlacedPart],
    usable_remnants: List[RemnantOutput],
    cuts: List[CutStep],
    kerf: float
) -> dict:
    """
    Computes transparent volume breakdown and utilization percentages for a block layout.
    """
    nx, ny, nz = nominal_dims
    ux, uy, uz = usable_dims
    gross_vol = nx * ny * nz
    usable_vol = ux * uy * uz
    skin_trim_loss = max(0.0, gross_vol - usable_vol)

    parts_vol = sum(p.volume for p in placed_parts)
    remnants_vol = sum(r.volume for r in usable_remnants)

    # Calculate kerf loss from actual cut planes
    kerf_vol = 0.0
    for cut in cuts:
        if cut.cut_type == "skin_trim":
            continue
        # Approximate cut area from target piece dimensions
        tdx, tdy, tdz = cut.target_piece_dims
        if cut.axis == "Z":
            cut_area = tdx * tdy
        elif cut.axis == "X":
            cut_area = tdy * tdz
        else:  # Y
            cut_area = tdx * tdz
        kerf_vol += cut_area * cut.kerf_in

    # Clamp kerf volume to realistic maximum (cannot exceed usable_vol - parts_vol)
    max_available_loss = max(0.0, usable_vol - parts_vol - remnants_vol)
    kerf_vol = min(kerf_vol, max_available_loss)

    unrecoverable_scrap = max(0.0, usable_vol - parts_vol - remnants_vol - kerf_vol)

    gross_util = (parts_vol / gross_vol * 100.0) if gross_vol > 0 else 0.0
    net_util = (parts_vol / usable_vol * 100.0) if usable_vol > 0 else 0.0
    recovery_util = ((parts_vol + remnants_vol) / gross_vol * 100.0) if gross_vol > 0 else 0.0

    return {
        "gross_volume": round(gross_vol, 2),
        "usable_volume": round(usable_vol, 2),
        "skin_trim_loss_volume": round(skin_trim_loss, 2),
        "parts_volume": round(parts_vol, 2),
        "usable_remnants_volume": round(remnants_vol, 2),
        "kerf_loss_volume": round(kerf_vol, 2),
        "unrecoverable_scrap_volume": round(unrecoverable_scrap, 2),
        "gross_utilization_pct": round(gross_util, 1),
        "net_utilization_pct": round(net_util, 1),
        "material_recovery_pct": round(recovery_util, 1),
    }


def estimate_saw_time_minutes(cuts: List[CutStep], feed_rate_ipm: float = 60.0) -> float:
    """
    Estimates saw operating time in minutes:
    - Slicing travel time = cut length / feed rate (default 60 inches per minute)
    - Handling / alignment time per cut = 0.5 minutes (30 seconds)
    """
    total_travel_inches = 0.0
    for cut in cuts:
        tdx, tdy, tdz = cut.target_piece_dims
        if cut.axis == "Z":
            total_travel_inches += max(tdx, tdy)
        elif cut.axis == "X":
            total_travel_inches += max(tdy, tdz)
        else:
            total_travel_inches += max(tdx, tdz)

    cutting_time = total_travel_inches / max(10.0, feed_rate_ipm)
    handling_time = len(cuts) * 0.5
    return round(cutting_time + handling_time, 1)
