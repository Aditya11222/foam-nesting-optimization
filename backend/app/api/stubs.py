"""
Stub interfaces for future capabilities (out of scope for MVP).
Included for architectural completeness as specified in the proposal.
"""

from typing import Dict, Any, List
from datetime import date
from pydantic import BaseModel


class SyteLineSyncStatus(BaseModel):
    connected: bool = False
    message: str = "SyteLine integration is out of scope for the demo. Stub interface provided."
    endpoints: List[str] = [
        "POST /syteline/import/orders",
        "POST /syteline/import/inventory",
        "POST /syteline/export/usage-scrap"
    ]


class MLRemnantScoreResponse(BaseModel):
    remnant_id: str
    predicted_reusability: float
    model_version: str = "LightGBM-stub-v0.1"
    message: str = "ML-based remnant usability scoring is out of scope for the demo. Rule-based scoring active."


def stub_syteline_import_order(order_id: str) -> Dict[str, Any]:
    return {
        "status": "stub",
        "order_id": order_id,
        "message": "Real ERP connection is disabled in demo mode. Use synthetic sample jobs."
    }


def stub_ml_score_remnant(length: float, width: float, height: float, grade: str) -> MLRemnantScoreResponse:
    # Baseline volumetric ratio
    vol = length * width * height
    score = min(0.95, max(0.1, vol / (40.0 * 40.0 * 20.0)))
    return MLRemnantScoreResponse(
        remnant_id="rem-stub",
        predicted_reusability=round(score, 2)
    )
