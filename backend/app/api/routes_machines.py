"""
Routes for Machine Profiles and Saw capabilities.
"""

from fastapi import APIRouter, HTTPException, Depends
from typing import List
from ..domain.models import MachineProfile
from ..repositories.base import InventoryRepository
from ..repositories.json_repo import JsonInventoryRepository

router = APIRouter(prefix="/api/machines", tags=["Machine Profiles"])

_repo = JsonInventoryRepository()


def get_repo() -> InventoryRepository:
    return _repo


@router.get("", response_model=List[MachineProfile])
def list_machines(repo: InventoryRepository = Depends(get_repo)):
    """Retrieve all registered saws and cutting machine profiles."""
    return repo.list_machines()


@router.get("/{machine_id}", response_model=MachineProfile)
def get_machine(machine_id: str, repo: InventoryRepository = Depends(get_repo)):
    """Retrieve details for a specific saw profile."""
    mach = repo.get_machine(machine_id)
    if not mach:
        raise HTTPException(status_code=404, detail=f"Machine '{machine_id}' not found.")
    return mach
