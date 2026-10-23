"""
In-memory and JSON file repository implementation.
Loads synthetic sample data from disk and provides CRUD operations in memory.
"""

import json
from pathlib import Path
from typing import List, Optional, Dict
from datetime import datetime, date

from .base import InventoryRepository, JobRepository
from ..domain.models import FoamGrade, MachineProfile, BunStock, RemnantStock, OptimizationResult, SkinTrimConfig


class JsonInventoryRepository(InventoryRepository):
    def __init__(self, data_dir: Optional[Path] = None):
        if data_dir is None:
            data_dir = Path(__file__).resolve().parent.parent.parent / "data"
        self.data_dir = data_dir
        self._grades: Dict[str, FoamGrade] = {}
        self._machines: Dict[str, MachineProfile] = {}
        self._buns: List[BunStock] = []
        self._remnants: List[RemnantStock] = []
        self._load_data()

    def _load_data(self):
        # Load grades
        grades_file = self.data_dir / "grades.json"
        if grades_file.exists():
            with open(grades_file, "r", encoding="utf-8") as f:
                raw = json.load(f)
                for item in raw:
                    grade = FoamGrade(**item)
                    self._grades[grade.code] = grade

        # Load machines
        machines_file = self.data_dir / "machines.json"
        if machines_file.exists():
            with open(machines_file, "r", encoding="utf-8") as f:
                raw = json.load(f)
                for item in raw:
                    mach = MachineProfile(**item)
                    self._machines[mach.id] = mach

        # Load inventory (buns & remnants)
        inventory_file = self.data_dir / "inventory.json"
        if inventory_file.exists():
            with open(inventory_file, "r", encoding="utf-8") as f:
                raw = json.load(f)
                for item in raw.get("buns", []):
                    trim = SkinTrimConfig(**item.get("skin_trim", {"x": 1.0, "y": 1.0, "z": 1.0}))
                    bun = BunStock(
                        id=item["id"],
                        code=item["code"],
                        grade=item["grade"],
                        nominal_length=item["nominal_length"],
                        nominal_width=item["nominal_width"],
                        nominal_height=item["nominal_height"],
                        skin_trim=trim,
                        cost=item.get("cost", 0.0),
                    )
                    self._buns.append(bun)

                for item in raw.get("remnants", []):
                    rem = RemnantStock(
                        id=item["id"],
                        code=item["code"],
                        grade=item["grade"],
                        length=item["length"],
                        width=item["width"],
                        height=item["height"],
                        cut_date=date.fromisoformat(item["cut_date"]),
                        storage_location=item.get("storage_location", "Bay R-01"),
                        usability_score=item.get("usability_score", 0.75),
                    )
                    self._remnants.append(rem)

    def list_grades(self) -> List[FoamGrade]:
        return list(self._grades.values())

    def get_grade(self, code: str) -> Optional[FoamGrade]:
        return self._grades.get(code)

    def list_machines(self) -> List[MachineProfile]:
        return list(self._machines.values())

    def get_machine(self, machine_id: str) -> Optional[MachineProfile]:
        return self._machines.get(machine_id)

    def list_buns(self, grade: Optional[str] = None) -> List[BunStock]:
        if grade:
            return [b for b in self._buns if b.grade == grade]
        return list(self._buns)

    def list_remnants(self, grade: Optional[str] = None) -> List[RemnantStock]:
        if grade:
            return [r for r in self._remnants if r.grade == grade]
        return list(self._remnants)

    def add_remnant(self, remnant: RemnantStock) -> RemnantStock:
        self._remnants.append(remnant)
        return remnant


class InMemoryJobRepository(JobRepository):
    def __init__(self):
        self._results: Dict[str, OptimizationResult] = {}

    def save_result(self, result: OptimizationResult) -> None:
        self._results[result.job_id] = result

    def get_result(self, job_id: str) -> Optional[OptimizationResult]:
        return self._results.get(job_id)

    def list_results(self) -> List[OptimizationResult]:
        return list(self._results.values())
