"""
Abstract repository interfaces.
Designed so PostgreSQL / SQLAlchemy can be swapped in later without modifying domain or API code.
"""

from abc import ABC, abstractmethod
from typing import List, Optional
from ..domain.models import FoamGrade, MachineProfile, BunStock, RemnantStock, OptimizationResult


class InventoryRepository(ABC):
    @abstractmethod
    def list_grades(self) -> List[FoamGrade]:
        pass

    @abstractmethod
    def get_grade(self, code: str) -> Optional[FoamGrade]:
        pass

    @abstractmethod
    def list_machines(self) -> List[MachineProfile]:
        pass

    @abstractmethod
    def get_machine(self, machine_id: str) -> Optional[MachineProfile]:
        pass

    @abstractmethod
    def list_buns(self, grade: Optional[str] = None) -> List[BunStock]:
        pass

    @abstractmethod
    def list_remnants(self, grade: Optional[str] = None) -> List[RemnantStock]:
        pass

    @abstractmethod
    def add_remnant(self, remnant: RemnantStock) -> RemnantStock:
        pass


class JobRepository(ABC):
    @abstractmethod
    def save_result(self, result: OptimizationResult) -> None:
        pass

    @abstractmethod
    def get_result(self, job_id: str) -> Optional[OptimizationResult]:
        pass

    @abstractmethod
    def list_results(self) -> List[OptimizationResult]:
        pass
