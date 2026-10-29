from collections import Counter
"""
OR-Tools Block Assignment Strategy (ORT-ASSIGN).
CP-SAT allocates demanded parts to available raw blocks and remnants by volume and orientation feasibility,
verified iteratively by the custom 3D guillotine slicing tree engine with no-good cuts.
"""

from typing import List, Tuple, Dict, Any, Optional
from datetime import datetime
import time
import math

from ...domain.unplaced_helper import build_unplaced_summary
from ...domain.models import (
    UnplacedPartSummary,
    OptimizationRequest,
    OptimizationResult,
    BlockLayout,
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
from .common import is_ortools_available, get_cp_model, format_solver_status


class OrtBlockAssignmentStrategy(NestingStrategy):
    @property
    def info(self) -> AlgorithmInfo:
        avail = is_ortools_available()
        return AlgorithmInfo(
            id="ortools_block_assignment",
            name="OR-Tools Block Assignment + Slicing Tree",
            description="CP-SAT multi-block assignment optimizing bin allocation and remnant prioritization, verified by orthogonal slicing tree.",
            speed_tag="Balanced (~0.5–2.5 s)",
            tag="OR-Tools",
            supported_cut_types=["guillotine"],
            available=avail,
            unavailable_reason=None if avail else "ortools package not installed in runtime environment"
        )

    def solve(
        self,
        request: OptimizationRequest,
        available_buns: List[BunStock],
        available_remnants: List[RemnantStock],
        machine: MachineProfile
    ) -> OptimizationResult:
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

        # 3. Expand demanded instances
        instances: List[PartItem] = []
        for p in request.parts:
            for _ in range(p.quantity):
                instances.append(p)

        if not instances:
            # Handle empty request
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
                verify_iterations=0,
                fallback_used=False
            )

        # 4. Prepare candidate stocks
        candidate_stocks = prepare_candidate_stocks(request, available_buns, available_remnants, target_grade)

        # Filter out blocks exceeding machine max cut height
        candidate_stocks = [
            cs for cs in candidate_stocks if cs[3][2] <= machine.max_cut_height
        ]

        # Ensure we have enough upper bound candidate blocks
        total_parts_vol = sum(p.volume for p in instances)
        std_bun_vol = 106.0 * 80.0 * 38.0  # ~322,240 cu in usable
        needed_buns_est = math.ceil(total_parts_vol / (std_bun_vol * 0.40)) + 3
        while len(candidate_stocks) < max(len(available_remnants) + 5, needed_buns_est):
            idx = len(candidate_stocks) + 1
            extra_bun = BunStock(
                id=f"bun-extra-ort-{idx}",
                code=f"BUN-{target_grade}-EXT{idx}",
                grade=target_grade,
                nominal_length=108.0,
                nominal_width=82.0,
                nominal_height=40.0,
                skin_trim=SkinTrimConfig(x=1.0, y=1.0, z=1.0)
            )
            candidate_stocks.append(("bun", extra_bun.id, (108.0, 82.0, 40.0), extra_bun.usable_dims))

        # 5. Build CP-SAT Allocation Model
        cp_mod = get_cp_model()
        model = cp_mod.CpModel()

        num_parts = len(instances)
        num_blocks = len(candidate_stocks)

        # Variables:
        # x[p, b] = 1 if part instance p is assigned to block b
        x = {}
        for p_idx in range(num_parts):
            for b_idx in range(num_blocks):
                x[p_idx, b_idx] = model.NewBoolVar(f"x_p{p_idx}_b{b_idx}")

        # y[b] = 1 if block b is opened/used
        y = {}
        for b_idx in range(num_blocks):
            y[b_idx] = model.NewBoolVar(f"y_b{b_idx}")

        # u[p] = 1 if part p is unplaceable
        u = {}
        for p_idx in range(num_parts):
            u[p_idx] = model.NewBoolVar(f"u_p{p_idx}")

        # Dimension feasibility filter & hard exclusion
        for p_idx, p in enumerate(instances):
            orients = get_permitted_orientations(p.length, p.width, p.height, p.orientation_mode)
            for b_idx, (_, _, _, usable_dims) in enumerate(candidate_stocks):
                ux, uy, uz = usable_dims
                can_fit_dim = any(
                    ox <= ux + 1e-4 and oy <= uy + 1e-4 and oz <= uz + 1e-4
                    for (ox, oy, oz) in orients
                )
                if not can_fit_dim:
                    model.Add(x[p_idx, b_idx] == 0)

        # Assignment constraint: each part instance assigned to at most one block, or marked unplaceable
        for p_idx in range(num_parts):
            model.Add(sum(x[p_idx, b_idx] for b_idx in range(num_blocks)) + u[p_idx] == 1)

        # Linking constraint: part assigned only if block is opened
        for p_idx in range(num_parts):
            for b_idx in range(num_blocks):
                model.Add(x[p_idx, b_idx] <= y[b_idx])

        # Volume upper bound with kerf allowance per block
        KERF_ALLOWANCE = 1.05  # 5% kerf allowance
        for b_idx, (_, _, _, usable_dims) in enumerate(candidate_stocks):
            ux, uy, uz = usable_dims
            usable_vol = int(ux * uy * uz)
            part_scaled_vols = [int(p.volume * KERF_ALLOWANCE) for p in instances]
            model.Add(
                sum(part_scaled_vols[p_idx] * x[p_idx, b_idx] for p_idx in range(num_parts))
                <= usable_vol * y[b_idx]
            )

        # Objective Function
        # Minimize block usage, heavily prioritize remnants (lower cost), heavily penalize unplaced parts
        obj_terms = []
        for b_idx, (st_type, _, _, _) in enumerate(candidate_stocks):
            weight = 30000 if st_type == "remnant" else 100000
            obj_terms.append(weight * y[b_idx])

        # Penalize unplaced items
        for p_idx, p in enumerate(instances):
            obj_terms.append(5000000 * u[p_idx])

        # Maximize packed volume (negative reward) to minimize fragmentation
        for p_idx, p in enumerate(instances):
            for b_idx in range(num_blocks):
                obj_terms.append(-int(p.volume) * x[p_idx, b_idx])

        model.Minimize(sum(obj_terms))

        # 6. Verification Loop with No-Good Cuts
        MAX_ITERATIONS = 5
        time_limit = min(request.time_budget_seconds, 10.0)
        start_solve_time = time.perf_counter()

        import os
        workers = min(4, max(1, os.cpu_count() or 2))
        solver = cp_mod.CpSolver()
        solver.parameters.num_search_workers = workers
        solver.parameters.relative_gap_limit = 0.02
        solver.parameters.random_seed = request.seed

        verified_blocks: List[BlockLayout] = []
        unplaced_final: List[PartItem] = []
        iteration_count = 0
        final_status_code = cp_mod.UNKNOWN
        fallback_used = False

        for iteration in range(1, MAX_ITERATIONS + 1):
            elapsed = time.perf_counter() - start_solve_time
            remaining_time = time_limit - elapsed
            if remaining_time <= 0.15:
                # Strictly respect overall time budget
                break
            solver.parameters.max_time_in_seconds = max(0.5, min(2.5, remaining_time))

            iteration_count = iteration
            status = solver.Solve(model)
            final_status_code = status

            if status not in (cp_mod.OPTIMAL, cp_mod.FEASIBLE):
                break

            opened_blocks = [b_idx for b_idx in range(num_blocks) if solver.Value(y[b_idx]) == 1]
            needs_re_solve = False

            current_iter_blocks: List[BlockLayout] = []
            current_iter_unplaced: List[PartItem] = [
                instances[p_idx] for p_idx in range(num_parts) if solver.Value(u[p_idx]) == 1
            ]

            for b_idx in opened_blocks:
                assigned_indices = [p_idx for p_idx in range(num_parts) if solver.Value(x[p_idx, b_idx]) == 1]
                if not assigned_indices:
                    continue

                assigned_items = [instances[p_idx] for p_idx in assigned_indices]
                # Test physical 3D guillotine packing on this single block
                stock = candidate_stocks[b_idx]
                single_result = execute_packing(
                    items_to_place=assigned_items,
                    candidate_stocks=[stock],
                    machine=machine,
                    target_grade=target_grade,
                    job_id=request.job_id,
                    leaf_selection="first_fit",
                    split_policy="min_residual",
                    algorithm_id=self.info.id,
                    algorithm_name=self.info.name
                )

                if len(single_result.unplaced_parts) == 0 and len(single_result.blocks) == 1:
                    # Verified!
                    current_iter_blocks.append(single_result.blocks[0])
                else:
                    # Physical geometric or guillotine failure for this assigned set!
                    needs_re_solve = True
                    # Cardinality cut: tighter bound based on how many actually fit
                    max_fitted = len(single_result.blocks[0].placed_parts) if single_result.blocks else (len(assigned_indices) - 1)
                    cut_bound = min(max_fitted, len(assigned_indices) - 1)
                    model.Add(sum(x[p_idx, b_idx] for p_idx in assigned_indices) <= cut_bound)

                    # Propagate cut across identical/smaller candidate stocks to break symmetry
                    stock_vol = stock[3][0] * stock[3][1] * stock[3][2]
                    for b_other_idx, (_, _, _, o_dims) in enumerate(candidate_stocks):
                        if b_other_idx != b_idx and (o_dims[0] * o_dims[1] * o_dims[2]) <= stock_vol + 1e-3:
                            model.Add(sum(x[p_idx, b_other_idx] for p_idx in assigned_indices) <= cut_bound)

            if not needs_re_solve:
                # 100% verified!
                verified_blocks = current_iter_blocks
                unplaced_final = current_iter_unplaced
                break
            else:
                # Update best known partial result
                if len(current_iter_blocks) > len(verified_blocks):
                    verified_blocks = current_iter_blocks

        solver_elapsed = time.perf_counter() - start_solve_time

        # 7. Fallback path if verification loop did not place all parts or timed out
        placed_counts = Counter(p.sku for b in verified_blocks for p in b.placed_parts)
        fallback_parts: List[PartItem] = []
        for p in request.parts:
            placed_for_sku = placed_counts.get(p.sku, 0)
            unplaced_for_sku = max(0, p.quantity - placed_for_sku)
            if unplaced_for_sku > 0:
                fallback_parts.append(p.model_copy(update={"quantity": unplaced_for_sku}))

        if len(fallback_parts) > 0 and len(verified_blocks) == 0:
            # Full fallback to First-Fit Decreasing
            fallback_strat = FirstFitDecreasingStrategy()
            fb_res = fallback_strat.solve(request, available_buns, available_remnants, machine)
            fb_res.algorithm_id = self.info.id
            fb_res.algorithm_name = self.info.name
            fb_res.fallback_used = True
            fb_res.solver_status = format_solver_status(final_status_code, cp_mod) + " (fallback used)"
            fb_res.verify_iterations = iteration_count
            fb_res.solver_time_ms = round(solver_elapsed * 1000.0, 1)
            
            all_placed = [p for b in fb_res.blocks for p in b.placed_parts]
            unplaced_sum = build_unplaced_summary(
                demanded_parts=request.parts,
                placed_parts=all_placed,
                candidate_stocks=candidate_stocks,
                machine=machine,
                target_grade=target_grade,
                timed_out=(final_status_code == cp_mod.UNKNOWN)
            )
            fb_res.unplaced_parts = unplaced_sum
            fb_res.unplaced_summary = unplaced_sum
            fb_res.total_parts_demanded = len(instances)
            fb_res.total_parts_placed = len(all_placed)
            return fb_res
        elif len(fallback_parts) > 0:
            # Partial fallback for remaining parts
            fallback_used = True
            fallback_req = request.model_copy(update={"parts": fallback_parts})
            fallback_strat = FirstFitDecreasingStrategy()
            fb_res = fallback_strat.solve(fallback_req, available_buns, available_remnants, machine)
            # Re-index fallback blocks
            b_offset = len(verified_blocks)
            for fb_b in fb_res.blocks:
                fb_b.block_index += b_offset
                verified_blocks.append(fb_b)

        # 8. Re-index and assemble final OptimizationResult
        for i, b in enumerate(verified_blocks, 1):
            b.block_index = i

        all_placed = [p for b in verified_blocks for p in b.placed_parts]
        total_parts_placed_count = len(all_placed)

        unplaced_final_summary = build_unplaced_summary(
            demanded_parts=request.parts,
            placed_parts=all_placed,
            candidate_stocks=candidate_stocks,
            machine=machine,
            target_grade=target_grade,
            timed_out=(final_status_code == cp_mod.UNKNOWN)
        )

        total_gross = sum(b.gross_volume for b in verified_blocks)
        total_usable = sum(b.usable_volume for b in verified_blocks)
        total_parts_vol = sum(b.parts_volume for b in verified_blocks)
        total_kerf = sum(b.kerf_loss_volume for b in verified_blocks)
        total_remnant_vol = sum(sum(r.volume for r in b.usable_remnants) for b in verified_blocks)
        total_scrap = sum(b.unrecoverable_scrap_volume for b in verified_blocks)

        agg_gross_util = (total_parts_vol / total_gross * 100.0) if total_gross > 0 else 0.0
        agg_net_util = (total_parts_vol / total_usable * 100.0) if total_usable > 0 else 0.0

        all_cuts = [c for b in verified_blocks for c in b.cuts]
        from ...optimizer.metrics import estimate_saw_time_minutes
        saw_time = estimate_saw_time_minutes(all_cuts, feed_rate_ipm=100.0)

        status_str = format_solver_status(final_status_code, cp_mod)
        if fallback_used:
            status_str += " (fallback used)"

        return OptimizationResult(
            job_id=request.job_id,
            grade=target_grade,
            algorithm_id=self.info.id,
            algorithm_name=self.info.name,
            solution_type="heuristic solution",
            timestamp=datetime.now(),
            machine=machine,
            total_parts_demanded=len(instances),
            total_parts_placed=total_parts_placed_count,
            unplaced_parts=unplaced_final_summary,
            unplaced_summary=unplaced_final_summary,
            blocks_used_count=len(verified_blocks),
            blocks=verified_blocks,
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
            verify_iterations=iteration_count,
            fallback_used=fallback_used
        )
