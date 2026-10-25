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
    MachineCutType
)
from ..optimizer.registry import algorithm_registry, StrategyNotImplementedError
from ..optimizer.strategies import GradeMismatchError
from ..optimizer.validator import validate_optimization_result
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


@router.post("/optimize", response_model=OptimizationResult)
def run_optimization(
    request: OptimizationRequest,
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
        raise HTTPException(
            status_code=400,
            detail=(
                f"Machine '{machine.name}' with cut_type '{machine.cut_type.value}' is not compatible with "
                f"algorithm '{strategy.info.name}' (supported cut types: {strategy.info.supported_cut_types}). "
                "Please choose a compatible algorithm or machine."
            )
        )

    # 5. Execute optimization with runtime measurement
    t0 = time.perf_counter()
    try:
        result = strategy.solve(
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

    if machine_reason:
        result.machine_assignment_reason = machine_reason
    for b in result.blocks:
        b.assigned_machine_id = machine.id
        b.assigned_machine_name = machine.name

    # 6. Strict validation
    validation = validate_optimization_result(result)
    result.validation = validation

    job_repo.save_result(result)
    return result


@router.post("/optimize/compare", response_model=List[OptimizationResult])
def compare_all_algorithms(
    request: OptimizationRequest,
    inv_repo: InventoryRepository = Depends(get_inv_repo)
):
    """
    Runs all registered optimization algorithms compatible with the selected machine sequentially.
    Enforces the same random seed for reproducibility.
    Ranks algorithms by net utilization (tie-break: fewer blocks, then fewer cuts).
    Marks the best heuristic with is_best=True.
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

    # Filter strategies compatible with selected machine
    strategies = [
        s for s in algorithm_registry.get_all()
        if machine.cut_type.value in s.info.supported_cut_types
    ]

    if not strategies:
        raise HTTPException(
            status_code=400,
            detail=f"No algorithms found compatible with machine '{machine.name}' ({machine.cut_type.value})."
        )

    results: List[OptimizationResult] = []

    for strat in strategies:
        strat_request = request.model_copy(update={
            "algorithm_id": strat.info.id,
            # Cap SA time to 3s in compare mode for responsive user experience
            "time_budget_seconds": min(3.0, request.time_budget_seconds)
        })

        t0 = time.perf_counter()
        try:
            res = strat.solve(
                request=strat_request,
                available_buns=buns,
                available_remnants=remnants,
                machine=machine
            )
            res.runtime_ms = round((time.perf_counter() - t0) * 1000.0, 1)
            if machine_reason:
                res.machine_assignment_reason = machine_reason
            for b in res.blocks:
                b.assigned_machine_id = machine.id
                b.assigned_machine_name = machine.name
            res.validation = validate_optimization_result(res)
            results.append(res)
        except Exception as e:
            # If an algorithm fails, skip or log
            pass

    if not results:
        raise HTTPException(status_code=500, detail="Failed to run comparative algorithms.")

    # Sort to determine best:
    # 1. Highest net utilization
    # 2. Fewer blocks used
    # 3. Fewer cuts count
    # 4. Lower runtime
    sorted_indices = sorted(
        range(len(results)),
        key=lambda i: (
            results[i].net_utilization_pct,
            -results[i].blocks_used_count,
            -results[i].total_cuts_count,
            -results[i].runtime_ms
        ),
        reverse=True
    )

    best_idx = sorted_indices[0]
    for idx, r in enumerate(results):
        r.is_best = (idx == best_idx)

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
