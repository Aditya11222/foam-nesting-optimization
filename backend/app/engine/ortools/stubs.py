"""
Future OR-Tools Capabilities Roadmap (Interface Stubs Only).
PLANNED / COMING NEXT - NO SOLVER IMPLEMENTATION.
See docs/ORTOOLS_ROADMAP.md for architectural specifications and timelines.
"""

from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field


class CompletedCutRecord(BaseModel):
    cut_id: str
    axis: str
    position_in: float
    completed_timestamp: str


class RushOrderReplanningRequest(BaseModel):
    """
    STUB: Planned for Phase 2.
    Warm-starts CP-SAT solver with existing cut tree and freezes already-executed cuts.
    """
    job_id: str
    incoming_rush_parts: List[Dict[str, Any]]
    active_block_layouts: List[Dict[str, Any]]
    completed_cuts: List[CompletedCutRecord] = []
    preserve_in_progress_blocks: bool = True
    status: str = Field(default="PLANNED", description="Status: Planned feature")


class RemnantAgingScoreWeight(BaseModel):
    storage_cost_weight: float = 0.4
    aspect_ratio_usability_weight: float = 0.3
    holding_days_weight: float = 0.3


class RemnantSelectionPlanRequest(BaseModel):
    """
    STUB: Planned for Phase 2.
    Multi-objective CP-SAT remnant selector incorporating physical aging curves and holding cost.
    """
    job_id: str
    target_grade: str
    demanded_volume: float
    weights: RemnantAgingScoreWeight = RemnantAgingScoreWeight()
    status: str = Field(default="PLANNED", description="Status: Planned feature")


class MultiJobMachineScheduleRequest(BaseModel):
    """
    STUB: Planned for Phase 3.
    Global disjunctive scheduling across multiple cutting stations with setup times and blade changes.
    """
    batch_job_ids: List[str]
    target_horizon_hours: float = 40.0
    sequence_dependent_setup_minutes: float = 15.0
    status: str = Field(default="PLANNED", description="Status: Planned feature")
