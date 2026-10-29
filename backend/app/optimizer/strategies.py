"""
Nesting strategy implementations:
1. Best-Fit Decreasing (baseline, fast)
2. First-Fit Decreasing (alternative split rule preserving large remnants)
3. Simulated Annealing (metaheuristic over part sequencing & orientations)
"""

from abc import ABC, abstractmethod
from typing import List, Tuple, Dict, Any, Optional
import time
import math
import random
from datetime import datetime

from ..domain.models import (
    OptimizationRequest,
    OptimizationResult,
    AlgorithmInfo,
    PartItem,
    BunStock,
    RemnantStock,
    MachineProfile,
    SkinTrimConfig
)
from ..domain.orientation import get_permitted_orientations
from .core_packer import execute_packing


class GradeMismatchError(ValueError):
    pass


def prepare_candidate_stocks(
    request: OptimizationRequest,
    available_buns: List[BunStock],
    available_remnants: List[RemnantStock],
    target_grade: str
) -> List[Tuple[str, str, Tuple[float, float, float], Tuple[float, float, float]]]:
    """Prepares candidate stock tuples: (stock_type, stock_id, nominal_dims, usable_dims)."""
    candidate_stocks: List[Tuple[str, str, Tuple[float, float, float], Tuple[float, float, float]]] = []

    # 1. Custom blocks provided in request
    if request.available_blocks:
        for b_in in request.available_blocks:
            if b_in.grade == target_grade:
                for q in range(b_in.quantity):
                    bun_id = b_in.id or f"bun-cust-{len(candidate_stocks)+1}"
                    trim = SkinTrimConfig(
                        x=request.skin_trim_per_face,
                        y=request.skin_trim_per_face,
                        z=request.skin_trim_per_face
                    )
                    nominal = (b_in.nominal_length, b_in.nominal_width, b_in.nominal_height)
                    ux = max(1.0, b_in.nominal_length - 2.0 * trim.x)
                    uy = max(1.0, b_in.nominal_width - 2.0 * trim.y)
                    uz = max(1.0, b_in.nominal_height - 2.0 * trim.z)
                    candidate_stocks.append(("bun", bun_id, nominal, (ux, uy, uz)))
        if candidate_stocks:
            return candidate_stocks

    # 2. Existing inventory
    matching_remnants = [r for r in available_remnants if r.grade == target_grade]
    matching_buns = [b for b in available_buns if b.grade == target_grade]

    if request.prefer_remnants_first:
        for rem in matching_remnants:
            dims = (rem.length, rem.width, rem.height)
            candidate_stocks.append(("remnant", rem.id, dims, dims))

    for bun in matching_buns:
        nominal = (bun.nominal_length, bun.nominal_width, bun.nominal_height)
        usable = bun.usable_dims
        candidate_stocks.append(("bun", bun.id, nominal, usable))

    # 3. Default bun fallback
    if not candidate_stocks:
        default_bun = BunStock(
            id=f"bun-auto-1",
            code=f"BUN-{target_grade}-AUTO",
            grade=target_grade,
            nominal_length=108.0,
            nominal_width=82.0,
            nominal_height=40.0,
            skin_trim=SkinTrimConfig(
                x=request.skin_trim_per_face,
                y=request.skin_trim_per_face,
                z=request.skin_trim_per_face
            )
        )
        candidate_stocks.append(("bun", default_bun.id, (108.0, 82.0, 40.0), default_bun.usable_dims))

    return candidate_stocks


class NestingStrategy(ABC):
    @property
    @abstractmethod
    def info(self) -> AlgorithmInfo:
        pass

    @abstractmethod
    def solve(
        self,
        request: OptimizationRequest,
        available_buns: List[BunStock],
        available_remnants: List[RemnantStock],
        machine: MachineProfile
    ) -> OptimizationResult:
        pass


class BestFitDecreasingStrategy(NestingStrategy):
    @property
    def info(self) -> AlgorithmInfo:
        return AlgorithmInfo(
            id="best_fit_decreasing",
            name="Best-Fit Decreasing (BFD)",
            description="Sorts parts by volume and places into the tightest-fitting free leaf space with orthogonal slicing.",
            speed_tag="Fast (~10–30 ms)"
        )

    def solve(
        self,
        request: OptimizationRequest,
        available_buns: List[BunStock],
        available_remnants: List[RemnantStock],
        machine: MachineProfile
    ) -> OptimizationResult:
        target_grade = request.grade
        for p in request.parts:
            if p.grade != target_grade:
                raise GradeMismatchError(f"Part {p.sku} has grade '{p.grade}' but job is for grade '{target_grade}'.")

        # Kerf override if specified
        if request.kerf is not None and request.kerf > 0:
            machine = machine.model_copy(update={"kerf": request.kerf})

        # Expand instances
        instances: List[PartItem] = []
        for p in request.parts:
            for _ in range(p.quantity):
                instances.append(p)

        # Sort: volume descending, tie-break max dimension
        instances.sort(key=lambda item: (item.volume, max(item.length, item.width, item.height)), reverse=True)

        candidate_stocks = prepare_candidate_stocks(request, available_buns, available_remnants, target_grade)

        return execute_packing(
            items_to_place=instances,
            candidate_stocks=candidate_stocks,
            machine=machine,
            target_grade=target_grade,
            job_id=request.job_id,
            leaf_selection="best_fit",
            split_policy="standard_zxy",
            algorithm_id=self.info.id,
            algorithm_name=self.info.name
        )


class FirstFitDecreasingStrategy(NestingStrategy):
    @property
    def info(self) -> AlgorithmInfo:
        return AlgorithmInfo(
            id="first_fit_decreasing",
            name="First-Fit Decreasing (FFD)",
            description="Sorts parts by longest dimension and uses a Min-Residual axis split rule to preserve large reusable remnants.",
            speed_tag="Fast (~10–25 ms)"
        )

    def solve(
        self,
        request: OptimizationRequest,
        available_buns: List[BunStock],
        available_remnants: List[RemnantStock],
        machine: MachineProfile
    ) -> OptimizationResult:
        target_grade = request.grade
        for p in request.parts:
            if p.grade != target_grade:
                raise GradeMismatchError(f"Part {p.sku} has grade '{p.grade}' but job is for grade '{target_grade}'.")

        if request.kerf is not None and request.kerf > 0:
            machine = machine.model_copy(update={"kerf": request.kerf})

        instances: List[PartItem] = []
        for p in request.parts:
            for _ in range(p.quantity):
                instances.append(p)

        # Sort: max dimension descending, then volume descending
        instances.sort(key=lambda item: (max(item.length, item.width, item.height), item.volume), reverse=True)

        candidate_stocks = prepare_candidate_stocks(request, available_buns, available_remnants, target_grade)

        return execute_packing(
            items_to_place=instances,
            candidate_stocks=candidate_stocks,
            machine=machine,
            target_grade=target_grade,
            job_id=request.job_id,
            leaf_selection="first_fit",
            split_policy="min_residual",
            algorithm_id=self.info.id,
            algorithm_name=self.info.name
        )


class SimulatedAnnealingStrategy(NestingStrategy):
    @property
    def info(self) -> AlgorithmInfo:
        return AlgorithmInfo(
            id="simulated_annealing",
            name="Simulated Annealing (SA)",
            description="Stochastic local search over part orders and orientations seeded by BFD with fixed seed and time budget.",
            speed_tag="Iterative (~1–10 s)"
        )

    def solve(
        self,
        request: OptimizationRequest,
        available_buns: List[BunStock],
        available_remnants: List[RemnantStock],
        machine: MachineProfile
    ) -> OptimizationResult:
        target_grade = request.grade
        for p in request.parts:
            if p.grade != target_grade:
                raise GradeMismatchError(f"Part {p.sku} has grade '{p.grade}' but job is for grade '{target_grade}'.")

        if request.kerf is not None and request.kerf > 0:
            machine = machine.model_copy(update={"kerf": request.kerf})

        # Base instances seeded from BFD
        base_instances: List[PartItem] = []
        for p in request.parts:
            for _ in range(p.quantity):
                base_instances.append(p)
        base_instances.sort(key=lambda item: (item.volume, max(item.length, item.width, item.height)), reverse=True)

        candidate_stocks = prepare_candidate_stocks(request, available_buns, available_remnants, target_grade)

        # Objective evaluation function
        def evaluate(
            seq: List[PartItem],
            preferred_orients: Optional[Dict[str, Tuple[float, float, float]]] = None
        ) -> Tuple[float, OptimizationResult]:
            res = execute_packing(
                items_to_place=seq,
                candidate_stocks=candidate_stocks,
                machine=machine,
                target_grade=target_grade,
                job_id=request.job_id,
                leaf_selection="best_fit",
                split_policy="standard_zxy",
                preferred_orientations=preferred_orients,
                algorithm_id=self.info.id,
                algorithm_name=self.info.name
            )
            # Score: prioritize net utilization, penalize blocks, total cuts, and unplaced parts
            unplaced_penalty = len(res.unplaced_parts) * 500.0
            score = (
                res.net_utilization_pct * 2.0
                - (res.blocks_used_count * 25.0)
                - (res.total_cuts_count * 0.15)
                - unplaced_penalty
            )
            return score, res

        # Fixed seed for 100% deterministic reproducibility
        seed = request.seed if request.seed is not None else 42
        rng = random.Random(seed)

        start_time = time.perf_counter()
        time_budget = min(15.0, max(0.5, request.time_budget_seconds))

        current_seq = list(base_instances)
        current_orients: Dict[str, Tuple[float, float, float]] = {}
        current_score, current_result = evaluate(current_seq, current_orients)

        best_score = current_score
        best_result = current_result
        best_seq = list(current_seq)
        best_orients = dict(current_orients)

        # Annealing parameters
        T = 20.0
        alpha = 0.96
        iteration = 0
        max_iterations = 300

        n = len(current_seq)
        if n > 1:
            no_improvement_count = 0
            while (time.perf_counter() - start_time < time_budget) and iteration < max_iterations:
                iteration += 1
                # Perturbation move
                candidate_seq = list(current_seq)
                candidate_orients = dict(current_orients)

                move_type = rng.choice(["swap", "shift", "orient"])
                if move_type == "swap":
                    i, j = rng.sample(range(n), 2)
                    candidate_seq[i], candidate_seq[j] = candidate_seq[j], candidate_seq[i]
                elif move_type == "shift":
                    i, j = rng.sample(range(n), 2)
                    item = candidate_seq.pop(i)
                    candidate_seq.insert(j, item)
                elif move_type == "orient":
                    idx = rng.randint(0, n - 1)
                    item = candidate_seq[idx]
                    allowed = get_permitted_orientations(
                        item.length, item.width, item.height, item.orientation_mode
                    )
                    if len(allowed) > 1:
                        chosen = rng.choice(allowed)
                        candidate_orients[item.id] = chosen

                cand_score, cand_result = evaluate(candidate_seq, candidate_orients)
                delta = cand_score - current_score

                # Acceptance probability
                accept = False
                if delta >= 0:
                    accept = True
                else:
                    try:
                        p = math.exp(delta / max(0.01, T))
                        if rng.random() < p:
                            accept = True
                    except OverflowError:
                        accept = False

                if accept:
                    current_seq = candidate_seq
                    current_orients = candidate_orients
                    current_score = cand_score
                    current_result = cand_result

                    if cand_score > best_score:
                        best_score = cand_score
                        best_result = cand_result
                        best_seq = list(candidate_seq)
                        best_orients = dict(candidate_orients)
                        no_improvement_count = 0
                    else:
                        no_improvement_count += 1
                else:
                    no_improvement_count += 1

                # Cool temperature
                if iteration % 5 == 0:
                    T *= alpha

                # Sliding window plateau detection: early stop when cooled and score plateaued
                if (T < 1.0 or iteration > 60) and no_improvement_count >= 30:
                    break

        # Ensure final result metadata is accurate
        best_result.algorithm_id = self.info.id
        best_result.algorithm_name = self.info.name
        return best_result
