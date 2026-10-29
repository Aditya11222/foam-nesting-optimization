import hashlib
import json
from typing import Optional, Dict, Any, List, Tuple
from collections import OrderedDict

from ..domain.models import (
    OptimizationRequest,
    OptimizationResult,
    BunStock,
    RemnantStock,
    MachineProfile,
)


class SolverCache:
    """
    In-memory LRU cache for deterministic 3D nesting optimization solves.
    Caches results keyed by canonical hash of:
    (parts, stock buns, remnants, machine profile, algorithm, seed, kerf, skin_trim, time_budget).
    """

    def __init__(self, max_size: int = 128):
        self.max_size = max_size
        self._cache: OrderedDict[str, OptimizationResult] = OrderedDict()

    def _compute_key(
        self,
        request: OptimizationRequest,
        buns: List[BunStock],
        remnants: List[RemnantStock],
        machine: MachineProfile,
    ) -> str:
        parts_data = sorted(
            [
                (
                    p.sku,
                    round(float(p.length), 3),
                    round(float(p.width), 3),
                    round(float(p.height), 3),
                    int(p.quantity),
                    str(p.orientation_mode),
                )
                for p in request.parts
            ],
            key=lambda x: (x[0], x[1], x[2], x[3]),
        )

        buns_data = sorted(
            [
                (
                    b.id,
                    str(b.grade),
                    round(float(getattr(b, "nominal_length", getattr(b, "length", 0.0))), 3),
                    round(float(getattr(b, "nominal_width", getattr(b, "width", 0.0))), 3),
                    round(float(getattr(b, "nominal_height", getattr(b, "height", 0.0))), 3),
                )
                for b in buns
            ]
        )

        remnants_data = sorted(
            [
                (
                    r.id,
                    str(r.grade),
                    round(float(r.length), 3),
                    round(float(r.width), 3),
                    round(float(r.height), 3),
                )
                for r in remnants
            ]
        )

        payload_dict = {
            "grade": request.grade.upper(),
            "algo": request.algorithm_id,
            "machine": machine.id,
            "kerf": request.kerf or getattr(machine, "kerf", 0.125),
            "skin_trim": request.skin_trim_per_face,
            "seed": request.seed,
            "time_budget": request.time_budget_seconds,
            "parts": parts_data,
            "buns": buns_data,
            "remnants": remnants_data,
        }
        raw_bytes = json.dumps(payload_dict, sort_keys=True).encode("utf-8")
        return hashlib.sha256(raw_bytes).hexdigest()

    def get(
        self,
        request: OptimizationRequest,
        buns: List[BunStock],
        remnants: List[RemnantStock],
        machine: MachineProfile,
    ) -> Optional[OptimizationResult]:
        key = self._compute_key(request, buns, remnants, machine)
        if key in self._cache:
            self._cache.move_to_end(key)
            cached = self._cache[key]
            res = cached.model_copy(deep=True)
            res.job_id = request.job_id
            res.cached = True
            return res
        return None

    def put(
        self,
        request: OptimizationRequest,
        buns: List[BunStock],
        remnants: List[RemnantStock],
        machine: MachineProfile,
        result: OptimizationResult,
    ) -> None:
        key = self._compute_key(request, buns, remnants, machine)
        if key in self._cache:
            self._cache.move_to_end(key)
        self._cache[key] = result.model_copy(deep=True)
        if len(self._cache) > self.max_size:
            self._cache.popitem(last=False)

    def clear(self) -> None:
        self._cache.clear()


solver_cache = SolverCache()
