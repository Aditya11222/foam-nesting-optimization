"""
Routes for Foam Grades catalogue.
"""

from fastapi import APIRouter, HTTPException, Depends
from typing import List
from ..domain.models import FoamGrade
from ..repositories.base import InventoryRepository
from ..repositories.json_repo import JsonInventoryRepository

router = APIRouter(prefix="/api/grades", tags=["Foam Grades"])

_repo = JsonInventoryRepository()


def get_repo() -> InventoryRepository:
    return _repo


@router.get("", response_model=List[FoamGrade])
def list_grades(repo: InventoryRepository = Depends(get_repo)):
    """Retrieve all available polyurethane foam grades."""
    return repo.list_grades()


@router.get("/{code}", response_model=FoamGrade)
def get_grade(code: str, repo: InventoryRepository = Depends(get_repo)):
    """Retrieve details for a specific foam grade."""
    grade = repo.get_grade(code.upper())
    if not grade:
        raise HTTPException(status_code=404, detail=f"Foam grade '{code}' not found.")
    return grade
