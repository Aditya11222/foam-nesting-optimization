"""
Routes for Buns, Remnants, and Remnant Aging Analysis.
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from typing import List, Optional
from datetime import date
from ..domain.models import BunStock, RemnantStock
from ..domain.remnant_aging import compute_effective_remnant_dims, RemnantAgingStatus
from ..repositories.base import InventoryRepository
from ..repositories.json_repo import JsonInventoryRepository

router = APIRouter(prefix="/api/inventory", tags=["Inventory & Remnants"])

_repo = JsonInventoryRepository()


def get_repo() -> InventoryRepository:
    return _repo


@router.get("/buns", response_model=List[BunStock])
def list_buns(grade: Optional[str] = None, repo: InventoryRepository = Depends(get_repo)):
    """List raw buns in inventory, optionally filtered by foam grade."""
    return repo.list_buns(grade=grade.upper() if grade else None)


@router.get("/remnants", response_model=List[RemnantStock])
def list_remnants(grade: Optional[str] = None, repo: InventoryRepository = Depends(get_repo)):
    """List stored remnants, optionally filtered by foam grade."""
    return repo.list_remnants(grade=grade.upper() if grade else None)


@router.get("/remnants/aging", response_model=List[RemnantAgingStatus])
def list_remnants_with_aging(
    grade: Optional[str] = None,
    eval_date: Optional[date] = None,
    threshold_days: int = Query(default=3, ge=1, le=30),
    repo: InventoryRepository = Depends(get_repo)
):
    """
    Evaluates remnant inventory for time-dependent oxidation degradation.
    Remnants older than `threshold_days` (default 2-3 days) lose 1" per face (dims - 2*1").
    """
    if eval_date is None:
        eval_date = date.today()

    remnants = repo.list_remnants(grade=grade.upper() if grade else None)
    results = [
        compute_effective_remnant_dims(
            remnant=r,
            evaluation_date=eval_date,
            degradation_days_threshold=threshold_days
        )
        for r in remnants
    ]
    return results


@router.post("/remnants", response_model=RemnantStock)
def add_remnant(remnant: RemnantStock, repo: InventoryRepository = Depends(get_repo)):
    """Record a newly retained remnant into inventory."""
    return repo.add_remnant(remnant)
