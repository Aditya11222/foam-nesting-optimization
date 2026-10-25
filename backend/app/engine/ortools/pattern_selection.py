"""
OR-Tools Pattern Selection Strategy (ORT-PATTERN).
Simplified column-generation pattern selection over a fixed guillotine candidate pool,
minimizing block consumption and scrap while satisfying SKU demand.
"""

from typing import List, Tuple, Dict, Any, Optional
from datetime import datetime
from collections import Counter
import time
import math
import random
import copy
import uuid

from ...domain.unplaced_helper import build_unplaced_summary
from ...domain.models import (
    UnplacedPartSummary,
    OptimizationRequest,
    OptimizationResult,
    BlockLayout,
    PlacedPart,
    RemnantOutput,
    PartItem,
    MachineProfile,
    MachineCutType,
    BunStock,
    RemnantStock,
    SkinTrimConfig,
    AlgorithmInfo
)
from ...domain.orientation import get_permitted_orientations
from ...optimizer.strategies import (
    NestingStrategy,
    GradeMismatchError,
    prepare_candidate_stocks,
    FirstFitDecreasingStrategy,
)
from ...optimizer.core_packer import execute_packing
from ...optimizer.metrics import estimate_saw_time_minutes
from .common import is_ortools_available, get_cp_model, format_solver_status


class CandidatePattern:
    def __init__(
        self,
        pattern_id: str,
        stock_type: str,
        stock_id: str,
        nominal_dims: Tuple[float, float, float],
        usable_dims: Tuple[float, float, float],
        sku_counts: Dict[str, int],
        layout_template: BlockLayout
    ):
        self.pattern_id = pattern_id
        self.stock_type = stock_type
        self.stock_id = stock_id
        self.nominal_dims = nominal_dims
        self.usable_dims = usable_dims
        self.sku_counts = sku_counts
        self.layout_template = layout_template
        self.net_utilization_pct = layout_template.net_utilization_pct
        self.scrap_volume = layout_template.unrecoverable_scrap_volume
        self.parts_volume = layout_template.parts_volume


class OrtPatternSelectionStrategy(NestingStrategy):
    @property
    def info(self) -> AlgorithmInfo:
        avail = is_ortools_available()
        return AlgorithmInfo(
            id="ortools_pattern_selection",
            name="OR-Tools Pattern Selection (candidate patterns)",
            description="Fixed-pool pattern selection using CP-SAT to select guillotine cutting patterns covering SKU demand while minimizing block consumption and scrap.",
            speed_tag="Fast (~0.2–1.0 s)",
            tag="OR-Tools",
            supported_cut_types=["guillotine"],
            available=avail,
            unavailable_reason=None if avail else "ortools package not installed in runtime environment"
        )

    def _generate_candidate_pool(
        self,
        request: OptimizationRequest,
        candidate_stocks: List[Tuple[str, str, Tuple[float, float, float], Tuple[float, float, float]]],
        machine: MachineProfile,
        max_pool_size: int = 300
    ) -> List[CandidatePattern]:
        """
        Generates a de-duplicated, capped pool of valid guillotine cutting patterns
        for available stock types using varied orderings, single-SKU fills, and split rules.
        """
        raw_patterns: List[CandidatePattern] = []
        target_grade = request.grade
        parts = request.parts

        # Standard bun stock tuple (first bun found or fallback)
        bun_stocks = [s for s in candidate_stocks if s[0] == "bun"]
        remnant_stocks = [s for s in candidate_stocks if s[0] == "remnant"]
        representative_stocks = (bun_stocks[:2] if bun_stocks else []) + remnant_stocks

        # Instances for full packings
        all_instances: List[PartItem] = []
        for p in parts:
            for _ in range(p.quantity):
                all_instances.append(p)

        pat_counter = 0

        for stock in representative_stocks:
            stock_type, stock_id, nom_dims, u_dims = stock

            # 1. Full packing heuristics (BFD, FFD, min-residual)
            configs = [
                ("best_fit", "standard_zxy"),
                ("first_fit", "standard_zxy"),
                ("best_fit", "min_residual"),
                ("first_fit", "min_residual"),
            ]
            for leaf_sel, split_pol in configs:
                res = execute_packing(
                    items_to_place=all_instances,
                    candidate_stocks=[stock],
                    machine=machine,
                    target_grade=target_grade,
                    job_id=f"gen-{pat_counter}",
                    leaf_selection=leaf_sel,
                    split_policy=split_pol
                )
                if res.blocks and len(res.blocks[0].placed_parts) > 0:
                    pat_counter += 1
                    b = res.blocks[0]
                    sku_cnt = dict(Counter(p.sku for p in b.placed_parts))
                    raw_patterns.append(CandidatePattern(
                        pattern_id=f"pat-{pat_counter}",
                        stock_type=stock_type,
                        stock_id=stock_id,
                        nominal_dims=nom_dims,
                        usable_dims=u_dims,
                        sku_counts=sku_cnt,
                        layout_template=b
                    ))

            # 2. Homogeneous Single-SKU Patterns (1..demanded_qty)
            # Guarantees integer demand can always be covered without shortages
            for p in parts:
                step = 1 if p.quantity <= 10 else max(1, p.quantity // 8)
                for q in range(1, p.quantity + 1, step):
                    sub_items = [p] * q
                    res = execute_packing(
                        items_to_place=sub_items,
                        candidate_stocks=[stock],
                        machine=machine,
                        target_grade=target_grade,
                        job_id=f"gen-single-{pat_counter}",
                        leaf_selection="first_fit",
                        split_policy="min_residual"
                    )
                    if res.blocks and len(res.blocks[0].placed_parts) > 0:
                        pat_counter += 1
                        b = res.blocks[0]
                        sku_cnt = dict(Counter(pt.sku for pt in b.placed_parts))
                        raw_patterns.append(CandidatePattern(
                            pattern_id=f"pat-{pat_counter}",
                            stock_type=stock_type,
                            stock_id=stock_id,
                            nominal_dims=nom_dims,
                            usable_dims=u_dims,
                            sku_counts=sku_cnt,
                            layout_template=b
                        ))

            # 3. Seeded randomized permutations of demanded parts
            rng = random.Random(request.seed)
            for perm_idx in range(15):
                shuffled = list(all_instances)
                rng.shuffle(shuffled)
                res = execute_packing(
                    items_to_place=shuffled,
                    candidate_stocks=[stock],
                    machine=machine,
                    target_grade=target_grade,
                    job_id=f"gen-rnd-{pat_counter}",
                    leaf_selection="best_fit" if perm_idx % 2 == 0 else "first_fit",
                    split_policy="min_residual" if perm_idx % 3 == 0 else "standard_zxy"
                )
                if res.blocks and len(res.blocks[0].placed_parts) > 0:
                    pat_counter += 1
                    b = res.blocks[0]
                    sku_cnt = dict(Counter(pt.sku for pt in b.placed_parts))
                    raw_patterns.append(CandidatePattern(
                        pattern_id=f"pat-{pat_counter}",
                        stock_type=stock_type,
                        stock_id=stock_id,
                        nominal_dims=nom_dims,
                        usable_dims=u_dims,
                        sku_counts=sku_cnt,
                        layout_template=b
                    ))

        # De-duplicate patterns:
        # Key: (stock_type, tuple(sorted(sku_counts.items())))
        # If identical part counts exist on the same stock type, keep the one with higher net utilization
        unique_map: Dict[Tuple[str, Tuple[Tuple[str, int], ...]], CandidatePattern] = {}
        for pat in raw_patterns:
            key = (pat.stock_type, tuple(sorted(pat.sku_counts.items())))
            if key not in unique_map:
                unique_map[key] = pat
            else:
                if pat.net_utilization_pct > unique_map[key].net_utilization_pct:
                    unique_map[key] = pat

        deduped = list(unique_map.values())

        # Sort by net utilization descending and cap
        deduped.sort(key=lambda p: (p.net_utilization_pct, -p.scrap_volume), reverse=True)
        return deduped[:max_pool_size]

    def solve(
        self,
        request: OptimizationRequest,
        available_buns: List[BunStock],
        available_remnants: List[RemnantStock],
        machine: MachineProfile
    ) -> OptimizationResult:
        t0 = time.perf_counter()

        # 1. Fallback guard if OR-Tools is not installed
        if not is_ortools_available():
            fallback_strat = FirstFitDecreasingStrategy()
            res = fallback_strat.solve(request, available_buns, available_remnants, machine)
            res.algorithm_id = self.info.id
            res.algorithm_name = self.info.name
            res.fallback_used = True
            res.solver_status = "FALLBACK (OR-Tools package not installed)"
            return res

        # 2. Grade segregation check
        target_grade = request.grade
        for p in request.parts:
            if p.grade != target_grade:
                raise GradeMismatchError(f"Part {p.sku} has grade '{p.grade}' but job is for grade '{target_grade}'.")

        if not request.parts:
            return OptimizationResult(
                job_id=request.job_id,
                grade=target_grade,
                algorithm_id=self.info.id,
                algorithm_name=self.info.name,
                solution_type="heuristic solution",
                timestamp=datetime.now(),
                machine=machine,
                total_parts_demanded=0,
                total_parts_placed=0,
                unplaced_parts=[],
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
                solver_status="OPTIMAL (trivial empty job)",
                verify_iterations=1,
                fallback_used=False
            )

        # 3. Stock Preparation
        candidate_stocks = prepare_candidate_stocks(request, available_buns, available_remnants, target_grade)
        candidate_stocks = [cs for cs in candidate_stocks if cs[3][2] <= machine.max_cut_height]

        # 4. Generate candidate pattern pool
        patterns = self._generate_candidate_pool(
            request=request,
            candidate_stocks=candidate_stocks,
            machine=machine,
            max_pool_size=300
        )

        if not patterns:
            # Fallback if no patterns could be generated
            fallback_strat = FirstFitDecreasingStrategy()
            res = fallback_strat.solve(request, available_buns, available_remnants, machine)
            res.algorithm_id = self.info.id
            res.algorithm_name = self.info.name
            res.fallback_used = True
            res.solver_status = "FALLBACK (empty candidate pattern pool)"
            return res

        # 5. Formulate CP-SAT Pattern Selection Model
        cp_mod = get_cp_model()
        model = cp_mod.CpModel()

        demands = {p.sku: p.quantity for p in request.parts}
        skus = list(demands.keys())
        num_patterns = len(patterns)

        # Integer variable z[k]: number of times pattern k is run
        z = {}
        for k, pat in enumerate(patterns):
            if pat.stock_type == "remnant":
                z[k] = model.NewIntVar(0, 1, f"z_pat_{k}")
            else:
                z[k] = model.NewIntVar(0, 50, f"z_pat_{k}")

        # Remnant uniqueness constraint: at most 1 pattern run per remnant stock
        remnant_groups: Dict[str, List[int]] = {}
        for k, pat in enumerate(patterns):
            if pat.stock_type == "remnant":
                remnant_groups.setdefault(pat.stock_id, []).append(k)
        for rem_id, pat_indices in remnant_groups.items():
            model.Add(sum(z[k] for k in pat_indices) <= 1)

        # Demand coverage constraints per SKU
        s = {}  # unmet demand slack
        o = {}  # overproduction slack
        allow_overprod = getattr(request, "allow_overproduction", False)

        for sku in skus:
            s[sku] = model.NewIntVar(0, demands[sku], f"slack_{sku}")
            pat_terms = [z[k] * patterns[k].sku_counts.get(sku, 0) for k in range(num_patterns)]

            if allow_overprod:
                o[sku] = model.NewIntVar(0, 100, f"over_{sku}")
                model.Add(sum(pat_terms) - o[sku] + s[sku] == demands[sku])
            else:
                model.Add(sum(pat_terms) + s[sku] == demands[sku])

        # Objective Function
        # Minimize blocks used, prioritizing remnants, tie-breaker on scrap volume
        obj_terms = []
        for k, pat in enumerate(patterns):
            weight = 30000 if pat.stock_type == "remnant" else 100000
            obj_terms.append(weight * z[k])
            obj_terms.append(int(pat.scrap_volume) * z[k])

        # Heavily penalize unmet demand
        for sku in skus:
            obj_terms.append(10000000 * s[sku])

        # Lightly penalize overproduction if allowed
        if allow_overprod:
            for sku in skus:
                obj_terms.append(5000 * o[sku])

        model.Minimize(sum(obj_terms))

        # 6. Solve Model
        solver = cp_mod.CpSolver()
        solver.parameters.max_time_in_seconds = min(request.time_budget_seconds, 10.0)
        solver.parameters.num_search_workers = 1
        solver.parameters.random_seed = request.seed

        solve_start = time.perf_counter()
        status = solver.Solve(model)
        solver_elapsed = time.perf_counter() - solve_start

        if status not in (cp_mod.OPTIMAL, cp_mod.FEASIBLE):
            fallback_strat = FirstFitDecreasingStrategy()
            res = fallback_strat.solve(request, available_buns, available_remnants, machine)
            res.algorithm_id = self.info.id
            res.algorithm_name = self.info.name
            res.fallback_used = True
            res.solver_status = format_solver_status(status, cp_mod) + " (fallback used)"
            res.solver_time_ms = round(solver_elapsed * 1000.0, 1)
            return res

        # 7. Convert chosen patterns into validated BlockLayouts
        chosen_blocks: List[BlockLayout] = []
        block_idx_counter = 1

        for k, pat in enumerate(patterns):
            run_count = solver.Value(z[k])
            if run_count <= 0:
                continue

            for run_num in range(run_count):
                template = pat.layout_template
                # Deep copy template and re-index
                new_block = template.model_copy(deep=True)
                new_block.block_index = block_idx_counter
                block_idx_counter += 1

                # Re-assign unique IDs for parts and cuts to ensure 3D scene integrity
                for p_idx, p in enumerate(new_block.placed_parts):
                    p.part_id = f"p_{new_block.block_index}_{p_idx}_{uuid.uuid4().hex[:6]}"

                # Cut steps are preserved as valid sequential cuts for this block

                chosen_blocks.append(new_block)

        # Detect any unplaced parts
        all_placed = [p for b in chosen_blocks for p in b.placed_parts]
        unplaced_summary_items = build_unplaced_summary(
            demanded_parts=request.parts,
            placed_parts=all_placed,
            candidate_stocks=candidate_stocks,
            machine=machine,
            target_grade=target_grade
        )

        # 8. Compute aggregated metrics
        total_gross = sum(b.gross_volume for b in chosen_blocks)
        total_usable = sum(b.usable_volume for b in chosen_blocks)
        total_parts_vol = sum(b.parts_volume for b in chosen_blocks)
        total_kerf = sum(b.kerf_loss_volume for b in chosen_blocks)
        total_remnant_vol = sum(sum(r.volume for r in b.usable_remnants) for b in chosen_blocks)
        total_scrap = sum(b.unrecoverable_scrap_volume for b in chosen_blocks)

        agg_gross_util = (total_parts_vol / total_gross * 100.0) if total_gross > 0 else 0.0
        agg_net_util = (total_parts_vol / total_usable * 100.0) if total_usable > 0 else 0.0

        all_cuts = [c for b in chosen_blocks for c in b.cuts]
        saw_time = estimate_saw_time_minutes(all_cuts, feed_rate_ipm=100.0)

        total_demanded = sum(p.quantity for p in request.parts)
        total_placed = sum(len(b.placed_parts) for b in chosen_blocks)

        status_str = format_solver_status(status, cp_mod)

        return OptimizationResult(
            job_id=request.job_id,
            grade=target_grade,
            algorithm_id=self.info.id,
            algorithm_name=self.info.name,
            solution_type="heuristic solution",
            timestamp=datetime.now(),
            machine=machine,
            total_parts_demanded=total_demanded,
            total_parts_placed=total_placed,
            unplaced_parts=unplaced_summary_items,
            unplaced_summary=unplaced_summary_items,
            blocks_used_count=len(chosen_blocks),
            blocks=chosen_blocks,
            total_gross_volume=round(total_gross, 2),
            total_usable_volume=round(total_usable, 2),
            total_parts_volume=round(total_parts_vol, 2),
            total_kerf_volume=round(total_kerf, 2),
            total_remnant_volume=round(total_remnant_vol, 2),
            total_unrecoverable_scrap_volume=round(total_scrap, 2),
            gross_utilization_pct=round(agg_gross_util, 1),
            net_utilization_pct=round(agg_net_util, 1),
            total_cuts_count=len(all_cuts),
            estimated_saw_time_minutes=saw_time,
            solver_status=status_str,
            solver_time_ms=round(solver_elapsed * 1000.0, 1),
            verify_iterations=1,
            fallback_used=False
        )
