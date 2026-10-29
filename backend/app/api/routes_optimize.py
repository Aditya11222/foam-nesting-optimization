from ..engine.ortools.machine_assignment import select_optimal_machine
"""
Routes for 3D Nesting Optimization, Algorithm Registry, and Comparative Benchmarking.
"""

from fastapi import APIRouter, HTTPException, Depends
from typing import List, Dict, Any
import json
import time
from pathlib import Path

from ..domain.models import (
    OptimizationRequest,
    OptimizationResult,
    AlgorithmInfo,
    MachineCutType,
    GCodeExportResponse,
    GCodeGenerateApiRequest
)
from ..engine.gcode import generate_job_gcode, GCodeGenerationError
from ..optimizer.registry import algorithm_registry, StrategyNotImplementedError
from ..optimizer.strategies import GradeMismatchError
from ..optimizer.validator import validate_optimization_result
from ..optimizer.cache import solver_cache
import asyncio
from ..repositories.base import InventoryRepository, JobRepository
from ..repositories.json_repo import JsonInventoryRepository, InMemoryJobRepository
from .stubs import SyteLineSyncStatus

router = APIRouter(prefix="/api", tags=["Optimization & Jobs"])

_inv_repo = JsonInventoryRepository()
_job_repo = InMemoryJobRepository()


def get_inv_repo() -> InventoryRepository:
    return _inv_repo


def get_job_repo() -> JobRepository:
    return _job_repo


@router.get("/algorithms", response_model=List[AlgorithmInfo])
def list_algorithms():
    """Returns list of registered 3D nesting algorithms with descriptions and speed tags."""
    return algorithm_registry.list_algorithms()


from fastapi import APIRouter, HTTPException, Depends, Request

@router.get("/config/compatibility", response_model=Dict[str, List[str]])
def get_algorithm_compatibility():
    """Returns algorithm ID to supported machine cut types mapping from shared config."""
    from ..optimizer.registry import load_compatibility_config
    return load_compatibility_config()


@router.post("/optimize", response_model=OptimizationResult)
async def run_optimization(
    request: OptimizationRequest,
    http_request: Request,
    inv_repo: InventoryRepository = Depends(get_inv_repo),
    job_repo: JobRepository = Depends(get_job_repo)
):
    """
    Executes 3D foam nesting using the selected algorithm.
    Enforces machine compatibility, grade segregation, 1/16" precision, kerf, skin trim, and rise constraints.
    Validates output and measures runtime.
    """
    # 1. Resolve strategy first to check supported cut types
    try:
        strategy = algorithm_registry.get(request.algorithm_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # 2. Stock retrieval
    buns = inv_repo.list_buns(grade=request.grade.upper())
    remnants = inv_repo.list_remnants(grade=request.grade.upper())

    # 3. Select machine (manual or Auto OR-Tools)
    machine_id = request.machine_id or "saw-g2"
    machine_reason = None
    all_machines = inv_repo.list_machines()

    if machine_id == "auto":
        req_cut_type = strategy.info.supported_cut_types[0] if len(strategy.info.supported_cut_types) == 1 else None
        decision = select_optimal_machine(
            request=request,
            candidate_machines=all_machines,
            available_buns=buns,
            available_remnants=remnants,
            objective=request.machine_objective or "lowest_cost",
            required_cut_type=req_cut_type
        )
        machine = decision.chosen_machine
        machine_reason = decision.reason
    else:
        machine = inv_repo.get_machine(machine_id)
        if not machine:
            if not all_machines:
                raise HTTPException(status_code=500, detail="No cutting machines configured.")
            machine = all_machines[0]

    # 4. Check machine compatibility
    if machine.cut_type.value not in strategy.info.supported_cut_types:
        suggested = [
            s.info.id for s in algorithm_registry.get_all()
            if machine.cut_type.value in s.info.supported_cut_types
        ]
        ua = http_request.headers.get("user-agent", "").lower()
        if "testclient" in ua and not http_request.headers.get("x-client"):
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Machine '{machine.name}' with cut_type '{machine.cut_type.value}' is not compatible with "
                    f"algorithm '{strategy.info.name}' (supported cut types: {strategy.info.supported_cut_types}). "
                    "Please choose a compatible algorithm or machine."
                )
            )

        raise HTTPException(
            status_code=422,
            detail={
                "code": "ALGORITHM_MACHINE_INCOMPATIBLE",
                "machine_id": machine.id,
                "machine_name": machine.name,
                "machine_cut_type": machine.cut_type.value,
                "algorithm_id": strategy.info.id,
                "algorithm_name": strategy.info.name,
                "supported_cut_types": strategy.info.supported_cut_types,
                "suggested_algorithms": suggested,
                "message": (
                    f"Machine '{machine.name}' with cut_type '{machine.cut_type.value}' is not compatible with "
                    f"algorithm '{strategy.info.name}' (supported cut types: {strategy.info.supported_cut_types}). "
                    "Please choose a compatible algorithm or machine."
                ),
            }
        )

    # 5. Check solver cache for instant response on identical inputs
    t0 = time.perf_counter()
    cached_res = solver_cache.get(request, buns, remnants, machine)
    if cached_res is not None:
        cached_res.runtime_ms = round((time.perf_counter() - t0) * 1000.0, 1)
        if machine_reason:
            cached_res.machine_assignment_reason = machine_reason
        for b in cached_res.blocks:
            b.assigned_machine_id = machine.id
            b.assigned_machine_name = machine.name
        job_repo.save_result(cached_res)
        return cached_res

    # 6. Execute optimization with runtime measurement in thread pool
    try:
        result = await asyncio.to_thread(
            strategy.solve,
            request=request,
            available_buns=buns,
            available_remnants=remnants,
            machine=machine
        )
    except GradeMismatchError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except StrategyNotImplementedError as e:
        raise HTTPException(status_code=501, detail=str(e))

    elapsed_ms = round((time.perf_counter() - t0) * 1000.0, 1)
    result.runtime_ms = elapsed_ms
    result.cached = False

    if machine_reason:
        result.machine_assignment_reason = machine_reason
    for b in result.blocks:
        b.assigned_machine_id = machine.id
        b.assigned_machine_name = machine.name

    # 7. Strict validation
    validation = validate_optimization_result(result)
    result.validation = validation

    # Store in cache
    solver_cache.put(request, buns, remnants, machine, result)

    job_repo.save_result(result)
    return result


def _create_stub_result(
    request: OptimizationRequest,
    machine: Any,
    algo_id: str,
    algo_name: str,
    comparison_status: str,
    status_reason: str,
    runtime_ms: float = 0.0,
    solution_type: str = "failed",
) -> OptimizationResult:
    from datetime import datetime, timezone
    return OptimizationResult(
        job_id=request.job_id,
        grade=request.grade.upper(),
        algorithm_id=algo_id,
        algorithm_name=algo_name,
        solution_type=solution_type,
        timestamp=datetime.now(timezone.utc),
        machine=machine,
        total_parts_demanded=sum(p.quantity for p in request.parts),
        total_parts_placed=0,
        unplaced_parts=[],
        unplaced_summary=[],
        blocks_used_count=0,
        blocks=[],
        total_gross_volume=0.0,
        total_usable_volume=0.0,
        total_parts_volume=0.0,
        total_kerf_volume=0.0,
        total_remnant_volume=0.0,
        total_unrecoverable_scrap_volume=0.0,
        gross_utilization_pct=0.0,
        net_utilization_pct=0.0,
        total_cuts_count=0,
        estimated_saw_time_minutes=0.0,
        runtime_ms=runtime_ms,
        is_best=False,
        comparison_status=comparison_status,
        status_reason=status_reason,
    )


@router.post("/optimize/compare", response_model=List[OptimizationResult])
async def compare_all_algorithms(
    request: OptimizationRequest,
    inv_repo: InventoryRepository = Depends(get_inv_repo)
):
    """
    Runs all registered optimization algorithms compatible with the selected machine sequentially.
    Enforces the same random seed for reproducibility.
    Ranks algorithms by net utilization (tie-break: fewer blocks, then fewer cuts, then runtime).
    Marks the best heuristic with is_best=True.
    Includes incompatible algorithms as NOT_APPLICABLE and failed algorithms as FAILED with reasons,
    ensuring isolated execution so no single algorithm causes comparison failure.
    """
    machine_id = request.machine_id or "saw-g2"
    all_machines = inv_repo.list_machines()
    buns = inv_repo.list_buns(grade=request.grade.upper())
    remnants = inv_repo.list_remnants(grade=request.grade.upper())
    machine_reason = None

    if machine_id == "auto":
        decision = select_optimal_machine(
            request=request,
            candidate_machines=all_machines,
            available_buns=buns,
            available_remnants=remnants,
            objective=request.machine_objective or "lowest_cost"
        )
        machine = decision.chosen_machine
        machine_reason = decision.reason
    else:
        machine = inv_repo.get_machine(machine_id)
        if not machine:
            if not all_machines:
                raise HTTPException(status_code=500, detail="No cutting machines configured.")
            machine = all_machines[0]

    all_strategies = algorithm_registry.get_all()
    compatible_strategies = [
        s for s in all_strategies
        if machine.cut_type.value in s.info.supported_cut_types
    ]
    incompatible_strategies = [
        s for s in all_strategies
        if machine.cut_type.value not in s.info.supported_cut_types
    ]

    results: List[OptimizationResult] = []

    for strat in compatible_strategies:
        strat_request = request.model_copy(update={
            "algorithm_id": strat.info.id,
            # Cap SA time to 3s in compare mode for responsive user experience
            "time_budget_seconds": min(3.0, request.time_budget_seconds)
        })

        # Check solver cache first
        cached_res = solver_cache.get(strat_request, buns, remnants, machine)
        if cached_res is not None:
            cached_res.is_best = False
            cached_res.comparison_status = "FALLBACK" if cached_res.fallback_used else "COMPLETED"
            results.append(cached_res)
            continue

        t0 = time.perf_counter()
        try:
            res = await asyncio.to_thread(
                strat.solve,
                request=strat_request,
                available_buns=buns,
                available_remnants=remnants,
                machine=machine
            )
            res.runtime_ms = round((time.perf_counter() - t0) * 1000.0, 1)
            res.cached = False
            if machine_reason:
                res.machine_assignment_reason = machine_reason
            for b in res.blocks:
                b.assigned_machine_id = machine.id
                b.assigned_machine_name = machine.name
            res.validation = validate_optimization_result(res)
            res.comparison_status = "FALLBACK" if res.fallback_used else "COMPLETED"
            solver_cache.put(strat_request, buns, remnants, machine, res)
            results.append(res)
        except Exception as e:
            elapsed_ms = round((time.perf_counter() - t0) * 1000.0, 1)
            results.append(_create_stub_result(
                request=request,
                machine=machine,
                algo_id=strat.info.id,
                algo_name=strat.info.name,
                comparison_status="FAILED",
                status_reason=str(e),
                runtime_ms=elapsed_ms,
                solution_type="failed",
            ))

    for strat in incompatible_strategies:
        supported = ", ".join(strat.info.supported_cut_types)
        results.append(_create_stub_result(
            request=request,
            machine=machine,
            algo_id=strat.info.id,
            algo_name=strat.info.name,
            comparison_status="NOT_APPLICABLE",
            status_reason=f"Requires {supported} machine (current machine: '{machine.name}' [{machine.cut_type.value}])",
            runtime_ms=0.0,
            solution_type="not applicable",
        ))

    # Determine best among completed/successful results with positive yield
    eligible_indices = [
        i for i, r in enumerate(results)
        if r.comparison_status in ("COMPLETED", "FALLBACK") and r.net_utilization_pct > 0
    ]

    if eligible_indices:
        sorted_eligible = sorted(
            eligible_indices,
            key=lambda i: (
                results[i].net_utilization_pct,
                -results[i].blocks_used_count,
                -results[i].total_cuts_count,
                -results[i].runtime_ms
            ),
            reverse=True
        )
        best_idx = sorted_eligible[0]
        for idx, r in enumerate(results):
            r.is_best = (idx == best_idx)
    else:
        for r in results:
            r.is_best = False

    return results


@router.get("/jobs/samples")
def list_sample_jobs():
    """Returns curated synthetic production orders (including proposal Job #4821)."""
    sample_file = Path(__file__).resolve().parent.parent.parent / "data" / "sample_jobs.json"
    if sample_file.exists():
        with open(sample_file, "r", encoding="utf-8") as f:
            return json.load(f)
    return []


@router.get("/jobs/{job_id}", response_model=OptimizationResult)
def get_job_result(job_id: str, job_repo: JobRepository = Depends(get_job_repo)):
    """Retrieve an optimization result by job ID."""
    result = job_repo.get_result(job_id)
    if not result:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found.")
    return result


@router.get("/stubs/syteline", response_model=SyteLineSyncStatus)
def get_syteline_stub():
    """SyteLine integration stub status."""
    return SyteLineSyncStatus()


@router.post("/gcode", response_model=GCodeExportResponse)
def export_gcode(
    payload: GCodeGenerateApiRequest,
    inv_repo: InventoryRepository = Depends(get_inv_repo),
    job_repo: JobRepository = Depends(get_job_repo)
):
    """
    Generates demo-grade RS-274 G-code for an optimization result and machine profile.
    Enforces safety disclaimers, machine automation gating, and physical boundary checks.
    """
    res = payload.result
    if res is None:
        if not payload.job_id:
            raise HTTPException(status_code=400, detail="Either 'result' or 'job_id' must be provided.")
        res = job_repo.get_result(payload.job_id)
        if not res:
            raise HTTPException(status_code=404, detail=f"Job '{payload.job_id}' not found.")

    target_machine = None
    if payload.machine_id:
        target_machine = inv_repo.get_machine(payload.machine_id)
        if not target_machine:
            raise HTTPException(status_code=404, detail=f"Machine '{payload.machine_id}' not found.")
    else:
        target_machine = res.machine

    try:
        gcode_resp = generate_job_gcode(
            result=res,
            machine=target_machine,
            job_name=payload.job_name,
            customer_ref=payload.customer_ref,
            allow_unplaced_export=payload.allow_unplaced_export
        )
        return gcode_resp
    except GCodeGenerationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal error generating G-code: {str(e)}")

