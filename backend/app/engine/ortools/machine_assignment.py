"""
OR-Tools Machine Auto-Assignment Module.
CP-SAT selects the optimal cutting machine profile for a job or block
based on throat height feasibility, cut-type support, capacity limits,
and a configurable objective (lowest_cost, best_yield, lowest_time).
"""

from typing import List, Tuple, Dict, Any, Optional
import math
from pydantic import BaseModel

from ...domain.models import (
    OptimizationRequest,
    MachineProfile,
    MachineCutType,
    BunStock,
    RemnantStock,
    PartItem
)
from .common import is_ortools_available, get_cp_model


class MachineAssignmentDecision(BaseModel):
    chosen_machine: MachineProfile
    objective_used: str
    reason: str
    estimated_yield_pct: float
    estimated_time_minutes: float
    estimated_cost_dollars: float


def select_optimal_machine(
    request: OptimizationRequest,
    candidate_machines: List[MachineProfile],
    available_buns: List[BunStock],
    available_remnants: List[RemnantStock],
    objective: Optional[str] = "lowest_cost",
    required_cut_type: Optional[str] = None
) -> MachineAssignmentDecision:
    """
    Evaluates candidate machines using CP-SAT optimization to select the best machine
    conforming to cut-type, throat height, and capacity constraints.
    """
    if not candidate_machines:
        raise ValueError("No candidate machines available for assignment.")

    target_grade = request.grade
    objective = objective or getattr(request, "machine_objective", "lowest_cost") or "lowest_cost"

    # Raw / usable block height requirements
    # Standard bun height is 40.0"
    max_block_height = 40.0
    for bun in available_buns:
        if bun.nominal_height > max_block_height:
            max_block_height = bun.nominal_height

    # 1. Compatibility and Height Filtering
    eligible_machines: List[MachineProfile] = []
    ineligible_reasons: Dict[str, str] = {}

    for m in candidate_machines:
        # Cut-type check
        if required_cut_type and m.cut_type.value != required_cut_type:
            ineligible_reasons[m.id] = f"Cut type '{m.cut_type.value}' does not support required '{required_cut_type}'"
            continue

        # Max cut height throat clearance check
        # Bun nominal height (or usable height) must not exceed machine max_cut_height
        if m.max_cut_height < max_block_height - 2.0:  # Allow 2" skin trim clearance
            ineligible_reasons[m.id] = f"Throat clearance ({m.max_cut_height} in) is smaller than block height ({max_block_height} in)"
            continue

        eligible_machines.append(m)

    if not eligible_machines:
        # Fall back to first machine with warning
        fallback_m = candidate_machines[0]
        return MachineAssignmentDecision(
            chosen_machine=fallback_m,
            objective_used=objective,
            reason=f"Fallback to {fallback_m.name}: no machines strictly satisfied throat clearance and cut type.",
            estimated_yield_pct=75.0,
            estimated_time_minutes=20.0,
            estimated_cost_dollars=150.0
        )

    # 2. Metric estimations per eligible machine
    # Demanded parts metrics
    total_parts_vol = sum(p.volume * p.quantity for p in request.parts)
    # Estimate total cut surface area / perimeter based on part dimensions
    est_linear_cut_inches = 0.0
    for p in request.parts:
        # Perimeter of slices: (L + W + H) * 2 * quantity
        est_linear_cut_inches += (p.length + p.width + p.height) * 2.0 * p.quantity

    unit_cost_by_grade = {"HR-40": 4.50, "HR-30": 3.80, "VE-50": 6.20}
    foam_cost_cuft = unit_cost_by_grade.get(target_grade.upper(), 4.50)

    machine_metrics: Dict[str, Dict[str, float]] = {}

    for m in eligible_machines:
        feed_rate = getattr(m, "feed_rate_ipm", 100.0) or 100.0
        hourly_rate = getattr(m, "hourly_rate", 65.0) or 65.0
        kerf = getattr(m, "kerf", 0.125) or 0.125

        # Saw time (minutes)
        saw_time_min = round(max(2.0, est_linear_cut_inches / max(10.0, feed_rate)), 1)
        saw_hours = saw_time_min / 60.0

        # Capacity filter if available_hours_limit is defined
        cap_hours = getattr(m, "available_hours_limit", None)
        if cap_hours is not None and saw_hours > cap_hours:
            ineligible_reasons[m.id] = f"Saw time ({saw_hours:.2f}h) exceeds available capacity ({cap_hours}h)"
            continue

        # Kerf material loss volume estimate (cu inches)
        est_kerf_vol = est_linear_cut_inches * kerf * 20.0  # approximate cut depth 20"
        est_gross_vol = max(total_parts_vol + est_kerf_vol + 30000.0, 1.0)
        est_yield_pct = min(98.0, max(40.0, round((total_parts_vol / est_gross_vol) * 100.0, 1)))

        # Costs
        mat_cost = (est_gross_vol / 1728.0) * foam_cost_cuft
        saw_cost = saw_hours * hourly_rate
        total_job_cost = round(mat_cost + saw_cost, 2)

        machine_metrics[m.id] = {
            "saw_time_min": saw_time_min,
            "yield_pct": est_yield_pct,
            "cost_dollars": total_job_cost,
            "kerf": kerf,
            "feed_rate": feed_rate,
            "hourly_rate": hourly_rate
        }

    valid_machines = [m for m in eligible_machines if m.id in machine_metrics]
    if not valid_machines:
        valid_machines = eligible_machines

    # 3. CP-SAT Integer Programming Selection
    if is_ortools_available() and len(valid_machines) > 1:
        cp_mod = get_cp_model()
        model = cp_mod.CpModel()

        # Binary decision variable for each machine: m_var[i] = 1 if machine i chosen
        m_vars = [model.NewBoolVar(f"select_m_{i}") for i in range(len(valid_machines))]

        # Exactly one machine selected
        model.Add(sum(m_vars) == 1)

        # Objective formulation
        if objective == "best_yield":
            # Maximize yield pct -> minimize negative yield scaled by 100
            yield_coeffs = [-int(machine_metrics[m.id]["yield_pct"] * 100) for m in valid_machines]
            model.Minimize(sum(yield_coeffs[i] * m_vars[i] for i in range(len(valid_machines))))
        elif objective == "lowest_time":
            # Minimize saw time minutes scaled by 100
            time_coeffs = [int(machine_metrics[m.id]["saw_time_min"] * 100) for m in valid_machines]
            model.Minimize(sum(time_coeffs[i] * m_vars[i] for i in range(len(valid_machines))))
        else:  # lowest_cost
            # Minimize total dollars scaled by 100
            cost_coeffs = [int(machine_metrics[m.id]["cost_dollars"] * 100) for m in valid_machines]
            model.Minimize(sum(cost_coeffs[i] * m_vars[i] for i in range(len(valid_machines))))

        solver = cp_mod.CpSolver()
        solver.parameters.num_search_workers = 1
        solver.parameters.random_seed = request.seed
        status = solver.Solve(model)

        if status in (cp_mod.OPTIMAL, cp_mod.FEASIBLE):
            chosen_idx = next(i for i in range(len(valid_machines)) if solver.Value(m_vars[i]) == 1)
            chosen = valid_machines[chosen_idx]
        else:
            chosen = valid_machines[0]
    else:
        # Deterministic ranking heuristic if OR-Tools is uninstalled or 1 machine
        if objective == "best_yield":
            chosen = max(valid_machines, key=lambda m: machine_metrics[m.id]["yield_pct"])
        elif objective == "lowest_time":
            chosen = min(valid_machines, key=lambda m: machine_metrics[m.id]["saw_time_min"])
        else:
            chosen = min(valid_machines, key=lambda m: machine_metrics[m.id]["cost_dollars"])

    # 4. Generate transparent reason string
    m_data = machine_metrics[chosen.id]
    if objective == "best_yield":
        reason = (
            f"Assigned to {chosen.name} via Auto (OR-Tools): highest estimated yield "
            f"({m_data['yield_pct']}% with {m_data['kerf']} in blade kerf) and {chosen.max_cut_height} in throat clearance."
        )
    elif objective == "lowest_time":
        reason = (
            f"Assigned to {chosen.name} via Auto (OR-Tools): fastest estimated saw time "
            f"({m_data['saw_time_min']} min at {m_data['feed_rate']} IPM) with {chosen.max_cut_height} in throat clearance."
        )
    else:
        reason = (
            f"Assigned to {chosen.name} via Auto (OR-Tools): lowest estimated total cost "
            f"(${m_data['cost_dollars']:.2f} at ${m_data['hourly_rate']:.0f}/hr) with {chosen.max_cut_height} in throat clearance."
        )

    return MachineAssignmentDecision(
        chosen_machine=chosen,
        objective_used=objective,
        reason=reason,
        estimated_yield_pct=m_data["yield_pct"],
        estimated_time_minutes=m_data["saw_time_min"],
        estimated_cost_dollars=m_data["cost_dollars"]
    )
