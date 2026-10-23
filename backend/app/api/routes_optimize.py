"""
Routes for 3D Nesting Optimization and Job Execution.
"""

from fastapi import APIRouter, HTTPException, Depends
from typing import List, Dict, Any
import json
from pathlib import Path

from ..domain.models import OptimizationRequest, OptimizationResult, MachineCutType
from ..optimizer.guillotine import optimize_guillotine_job, GradeMismatchError
from ..optimizer.registry import StrategyNotImplementedError
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


@router.post("/optimize", response_model=OptimizationResult)
def run_optimization(
    request: OptimizationRequest,
    inv_repo: InventoryRepository = Depends(get_inv_repo),
    job_repo: JobRepository = Depends(get_job_repo)
):
    """
    Executes 3D foam nesting and guillotine cut plan generation.
    Enforces grade segregation, 1/16" snapping, skin trim, kerf, and rise constraints.
    Returns a machine-valid heuristic solution.
    """
    # 1. Select machine
    machine_id = request.machine_id or "saw-g2"
    machine = inv_repo.get_machine(machine_id)
    if not machine:
        # Fallback to first guillotine saw
        saws = [m for m in inv_repo.list_machines() if m.cut_type == MachineCutType.GUILLOTINE]
        if not saws:
            raise HTTPException(status_code=500, detail="No guillotine saws configured.")
        machine = saws[0]

    # 2. Check machine cut type
    if machine.cut_type == MachineCutType.FREE:
        raise HTTPException(
            status_code=501,
            detail=(
                f"Machine '{machine.name}' requires free/contour cutting (waterjet/CNC). "
                "Non-guillotine nesting is registered but not implemented in the MVP. "
                "Please select a guillotine saw profile."
            )
        )

    # 3. Retrieve stock for grade
    buns = inv_repo.list_buns(grade=request.grade.upper())
    remnants = inv_repo.list_remnants(grade=request.grade.upper())

    try:
        result = optimize_guillotine_job(
            request=request,
            available_buns=buns,
            available_remnants=remnants,
            machine=machine
        )
        job_repo.save_result(result)
        return result
    except GradeMismatchError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except StrategyNotImplementedError as e:
        raise HTTPException(status_code=501, detail=str(e))


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
