"""
Remnant aging module.
Polyurethane foam remnants oxidize and discolor on shop floor racks.
After 2-3 days, a remnant loses an additional ~1 inch per face (dims - 2 * 1 in per axis).
"""

from typing import Tuple, Dict, Any
from datetime import date
from pydantic import BaseModel, Field
from .models import RemnantStock
from .units import snap_to_16th


class RemnantAgingStatus(BaseModel):
    remnant_id: str
    code: str
    grade: str
    cut_date: date
    evaluation_date: date
    age_days: int
    is_degraded: bool
    degradation_days_threshold: int
    original_dims: Tuple[float, float, float]
    effective_dims: Tuple[float, float, float]
    original_volume: float
    effective_volume: float
    volume_loss_pct: float
    usability_score: float
    storage_location: str
    recommendation_en: str
    recommendation_es: str


def compute_effective_remnant_dims(
    remnant: RemnantStock,
    evaluation_date: date,
    degradation_days_threshold: int = 3,
    degradation_trim_per_face: float = 1.0,
) -> RemnantAgingStatus:
    """
    Computes effective usable dimensions of a foam remnant after accounting for oxidation aging.
    Rule: After ~2-3 days, effective usable dims = nominal dims - 2 * 1 in per axis.
    """
    age_days = (evaluation_date - remnant.cut_date).days
    if age_days < 0:
        age_days = 0

    orig_l, orig_w, orig_h = remnant.length, remnant.width, remnant.height
    orig_vol = orig_l * orig_w * orig_h

    if age_days >= degradation_days_threshold:
        is_degraded = True
        eff_l = max(0.0, orig_l - 2.0 * degradation_trim_per_face)
        eff_w = max(0.0, orig_w - 2.0 * degradation_trim_per_face)
        eff_h = max(0.0, orig_h - 2.0 * degradation_trim_per_face)
        if eff_l > 0:
            eff_l = snap_to_16th(eff_l, "effective_length")
        if eff_w > 0:
            eff_w = snap_to_16th(eff_w, "effective_width")
        if eff_h > 0:
            eff_h = snap_to_16th(eff_h, "effective_height")
        
        eff_vol = eff_l * eff_w * eff_h
        vol_loss_pct = ((orig_vol - eff_vol) / orig_vol * 100.0) if orig_vol > 0 else 0.0
        # Usability decays with age and volume loss
        score = max(0.1, round(remnant.usability_score * (eff_vol / orig_vol if orig_vol > 0 else 0), 2))
        rec_en = f"Aged {age_days}d (>={degradation_days_threshold}d): Oxidized skin trim (-2\"/axis) applied. Prioritize for cutting."
        rec_es = f"Envejecido {age_days}d (>={degradation_days_threshold}d): Corteza oxidada aplicada (-2\"/eje). Priorizar para corte."
    else:
        is_degraded = False
        eff_l, eff_w, eff_h = orig_l, orig_w, orig_h
        eff_vol = orig_vol
        vol_loss_pct = 0.0
        score = remnant.usability_score
        days_left = degradation_days_threshold - age_days
        rec_en = f"Fresh remnant ({age_days}d old). {days_left}d before oxidation skin trim takes effect."
        rec_es = f"Remanente fresco ({age_days}d). {days_left}d antes de requerir recorte por oxidación."

    return RemnantAgingStatus(
        remnant_id=remnant.id,
        code=remnant.code,
        grade=remnant.grade,
        cut_date=remnant.cut_date,
        evaluation_date=evaluation_date,
        age_days=age_days,
        is_degraded=is_degraded,
        degradation_days_threshold=degradation_days_threshold,
        original_dims=(orig_l, orig_w, orig_h),
        effective_dims=(eff_l, eff_w, eff_h),
        original_volume=orig_vol,
        effective_volume=eff_vol,
        volume_loss_pct=round(vol_loss_pct, 1),
        usability_score=score,
        storage_location=remnant.storage_location,
        recommendation_en=rec_en,
        recommendation_es=rec_es,
    )
