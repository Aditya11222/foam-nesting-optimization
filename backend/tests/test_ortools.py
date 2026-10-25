"""
Tests for OR-Tools Integration into Tatras NestPro Engine (Additive-Only).
Covers:
- Grade segregation enforcement
- Dimensional feasibility & unplaceable part reporting
- Verification loop on volume-feasible but geometry-infeasible parts
- Remnant prioritization
- Seed reproducibility
- Graceful fallback when OR-Tools is unavailable
- Volume-reconciliation identity & validation
- Regression checks on legacy BFD/FFD/SA algorithms
"""

import pytest
from datetime import date
from app.domain.models import (
    OptimizationRequest,
    PartItem,
    MachineProfile,
    MachineCutType,
    BunStock,
    RemnantStock,
    SkinTrimConfig
)
from app.optimizer.registry import algorithm_registry
from app.optimizer.strategies import GradeMismatchError
from app.optimizer.validator import validate_optimization_result
import app.engine.ortools.block_assignment as ort_ba


@pytest.fixture
def machine():
    return MachineProfile(
        id="saw-g2",
        name="Guillotine Saw G2",
        cut_type=MachineCutType.GUILLOTINE,
        kerf=0.25,
        max_cut_height=48.0
    )


@pytest.fixture
def standard_bun():
    return BunStock(
        id="bun-hr40-1",
        code="BUN-HR40-001",
        grade="HR-40",
        nominal_length=108.0,
        nominal_width=82.0,
        nominal_height=40.0,
        skin_trim=SkinTrimConfig(x=1.0, y=1.0, z=1.0)
    )


def test_block_assignment_info_and_tag():
    """Verify algorithm is registered with OR-Tools tag and availability metadata."""
    strat = algorithm_registry.get("ortools_block_assignment")
    assert strat.info.id == "ortools_block_assignment"
    assert strat.info.name == "OR-Tools Block Assignment + Slicing Tree"
    assert strat.info.tag == "OR-Tools"
    assert strat.info.available is True
    assert strat.info.unavailable_reason is None


def test_block_assignment_grade_segregation(machine, standard_bun):
    """Enforces that parts with a mismatching foam grade raise GradeMismatchError."""
    strat = algorithm_registry.get("ortools_block_assignment")
    parts = [
        PartItem(id="p1", name="Part HR40", sku="SKU-1", grade="HR-40", length=20.0, width=15.0, height=8.0, quantity=2),
        PartItem(id="p2", name="Part VE50", sku="SKU-2", grade="VE-50", length=20.0, width=15.0, height=8.0, quantity=1),
    ]
    req = OptimizationRequest(
        job_id="job-mismatch",
        grade="HR-40",
        parts=parts,
        algorithm_id="ortools_block_assignment",
        seed=42
    )
    with pytest.raises(GradeMismatchError):
        strat.solve(req, [standard_bun], [], machine)


def test_block_assignment_oversized_unplaceable(machine, standard_bun):
    """Oversized parts exceeding usable dimensions must be reported in unplaced_parts, never dropped."""
    strat = algorithm_registry.get("ortools_block_assignment")
    parts = [
        PartItem(id="p1", name="Normal Part", sku="SKU-NORM", grade="HR-40", length=24.0, width=18.0, height=8.0, quantity=2),
        PartItem(id="p2", name="Giant Part", sku="SKU-GIANT", grade="HR-40", length=150.0, width=100.0, height=60.0, quantity=1),
    ]
    req = OptimizationRequest(
        job_id="job-oversized",
        grade="HR-40",
        parts=parts,
        algorithm_id="ortools_block_assignment",
        seed=42
    )
    res = strat.solve(req, [standard_bun], [], machine)
    assert res.total_parts_demanded == 3
    assert res.total_parts_placed == 2
    assert len(res.unplaced_parts) == 1
    assert res.unplaced_parts[0].sku == "SKU-GIANT"

    val = validate_optimization_result(res)
    assert any("exceeds usable block dimensions" in err for err in val.errors)
    assert val.volume_reconciliation["reconciliation_delta"] == 0.0


def test_block_assignment_volume_vs_geometry_verify_loop(machine, standard_bun):
    """
    Key test: 4 parts of 60x50x20. Total volume = 240,000 cu in.
    Usable bun volume = 322,240 cu in.
    By volume, CP-SAT could assign all 4 to 1 bun.
    However, 3D guillotine geometry cannot place 4 in 1 bun.
    The verification loop must detect this, add cardinality cuts, re-solve, and succeed.
    """
    strat = algorithm_registry.get("ortools_block_assignment")
    parts = [
        PartItem(id="p1", name="Bulky Block", sku="SKU-BULK", grade="HR-40", length=60.0, width=50.0, height=20.0, quantity=4),
    ]
    req = OptimizationRequest(
        job_id="job-verify-loop",
        grade="HR-40",
        parts=parts,
        algorithm_id="ortools_block_assignment",
        seed=42,
        time_budget_seconds=10.0
    )
    res = strat.solve(req, [standard_bun], [], machine)
    assert res.total_parts_placed == 4
    assert res.verify_iterations >= 2, f"Expected verify loop iterations >= 2, got {res.verify_iterations}"
    assert res.blocks_used_count >= 2
    assert "OPTIMAL (for volume-based allocation model, not proven optimal for 3D layout)" in res.solver_status

    val = validate_optimization_result(res)
    assert val.is_valid is True
    assert len(val.errors) == 0
    assert val.volume_reconciliation["reconciliation_delta"] == 0.0


def test_block_assignment_remnant_prioritization(machine, standard_bun):
    """Verify that same-grade remnants are prioritized before new full buns."""
    strat = algorithm_registry.get("ortools_block_assignment")
    remnant = RemnantStock(
        id="rem-hr40-1",
        code="REM-HR40-001",
        grade="HR-40",
        length=50.0,
        width=40.0,
        height=20.0,
        cut_date=date(2026, 3, 1)
    )
    # A small part that easily fits inside the remnant
    parts = [
        PartItem(id="p1", name="Small Part", sku="SKU-SMALL", grade="HR-40", length=20.0, width=15.0, height=8.0, quantity=2),
    ]
    req = OptimizationRequest(
        job_id="job-remnant",
        grade="HR-40",
        parts=parts,
        algorithm_id="ortools_block_assignment",
        seed=42
    )
    res = strat.solve(req, [standard_bun], [remnant], machine)
    assert res.blocks_used_count == 1
    # Check that the block used is the remnant
    assert res.blocks[0].stock_id == "rem-hr40-1"
    assert res.blocks[0].stock_type == "remnant"


def test_block_assignment_seed_reproducibility(machine, standard_bun):
    """Running identical inputs with the same seed produces identical results."""
    strat = algorithm_registry.get("ortools_block_assignment")
    parts = [
        PartItem(id="p1", name="Part A", sku="SKU-A", grade="HR-40", length=24.0, width=18.0, height=8.0, quantity=3),
        PartItem(id="p2", name="Part B", sku="SKU-B", grade="HR-40", length=30.0, width=20.0, height=10.0, quantity=2),
    ]
    req1 = OptimizationRequest(job_id="job-rep-1", grade="HR-40", parts=parts, algorithm_id="ortools_block_assignment", seed=42)
    req2 = OptimizationRequest(job_id="job-rep-2", grade="HR-40", parts=parts, algorithm_id="ortools_block_assignment", seed=42)

    res1 = strat.solve(req1, [standard_bun], [], machine)
    res2 = strat.solve(req2, [standard_bun], [], machine)

    assert res1.blocks_used_count == res2.blocks_used_count
    assert res1.total_parts_placed == res2.total_parts_placed
    assert res1.net_utilization_pct == res2.net_utilization_pct
    assert res1.total_cuts_count == res2.total_cuts_count


def test_block_assignment_missing_ortools_fallback(monkeypatch, machine, standard_bun):
    """Simulate missing OR-Tools package and verify graceful fallback to FFD."""
    monkeypatch.setattr(ort_ba, "is_ortools_available", lambda: False)

    strat = algorithm_registry.get("ortools_block_assignment")
    parts = [
        PartItem(id="p1", name="Part A", sku="SKU-A", grade="HR-40", length=24.0, width=18.0, height=8.0, quantity=2),
    ]
    req = OptimizationRequest(job_id="job-fallback", grade="HR-40", parts=parts, algorithm_id="ortools_block_assignment", seed=42)
    res = strat.solve(req, [standard_bun], [], machine)

    assert res.fallback_used is True
    assert "FALLBACK" in res.solver_status
    assert res.total_parts_placed == 2
    val = validate_optimization_result(res)
    assert val.is_valid is True


def test_regression_existing_algorithms_untouched(machine, standard_bun):
    """Ensure pre-existing BFD, FFD, and SA behave identically without regression."""
    parts = [
        PartItem(id="p1", name="Part A", sku="SKU-A", grade="HR-40", length=24.0, width=18.0, height=8.0, quantity=4),
        PartItem(id="p2", name="Part B", sku="SKU-B", grade="HR-40", length=30.0, width=20.0, height=10.0, quantity=2),
    ]
    req = OptimizationRequest(job_id="job-regress", grade="HR-40", parts=parts, seed=42)

    for alg_id in ["best_fit_decreasing", "first_fit_decreasing", "simulated_annealing"]:
        strat = algorithm_registry.get(alg_id)
        res = strat.solve(req, [standard_bun], [], machine)
        assert res.total_parts_placed == 6
        val = validate_optimization_result(res)
        assert val.is_valid is True
        assert val.volume_reconciliation["reconciliation_delta"] == 0.0


# ==============================================================================
# Pattern Selection (ORT-PATTERN) Tests
# ==============================================================================

def test_pattern_selection_info_and_tag():
    """Verify Pattern Selection is registered with tag 'OR-Tools' and availability metadata."""
    strat = algorithm_registry.get("ortools_pattern_selection")
    assert strat.info.id == "ortools_pattern_selection"
    assert strat.info.name == "OR-Tools Pattern Selection (candidate patterns)"
    assert strat.info.tag == "OR-Tools"
    assert strat.info.available is True
    assert strat.info.unavailable_reason is None


def test_pattern_selection_exact_demand(machine, standard_bun):
    """Verify that demand is covered exactly when allow_overproduction is False."""
    strat = algorithm_registry.get("ortools_pattern_selection")
    parts = [
        PartItem(id="p1", name="Cushion A", sku="SKU-A", grade="HR-40", length=24.0, width=18.0, height=8.0, quantity=5),
        PartItem(id="p2", name="Backrest B", sku="SKU-B", grade="HR-40", length=30.0, width=20.0, height=10.0, quantity=3),
    ]
    req = OptimizationRequest(
        job_id="job-pat-exact",
        grade="HR-40",
        parts=parts,
        algorithm_id="ortools_pattern_selection",
        allow_overproduction=False,
        seed=42
    )
    res = strat.solve(req, [standard_bun], [], machine)
    assert res.total_parts_demanded == 8
    assert res.total_parts_placed == 8
    assert len(res.unplaced_parts) == 0

    placed_skus = [p.sku for b in res.blocks for p in b.placed_parts]
    assert placed_skus.count("SKU-A") == 5
    assert placed_skus.count("SKU-B") == 3

    val = validate_optimization_result(res)
    assert val.is_valid is True
    assert len(val.errors) == 0
    assert val.volume_reconciliation["reconciliation_delta"] == 0.0


def test_pattern_selection_pool_dedup_and_cap(machine, standard_bun):
    """Verify candidate pattern pool is de-duplicated and capped at max_pool_size."""
    strat = algorithm_registry.get("ortools_pattern_selection")
    parts = [
        PartItem(id="p1", name="Part A", sku="SKU-A", grade="HR-40", length=24.0, width=18.0, height=8.0, quantity=8),
        PartItem(id="p2", name="Part B", sku="SKU-B", grade="HR-40", length=30.0, width=20.0, height=10.0, quantity=4),
    ]
    req = OptimizationRequest(job_id="job-pool-test", grade="HR-40", parts=parts, seed=42)
    candidate_stocks = [("bun", standard_bun.id, (108.0, 82.0, 40.0), standard_bun.usable_dims)]
    pool = strat._generate_candidate_pool(req, candidate_stocks, machine, max_pool_size=50)

    assert len(pool) <= 50
    keys = [(p.stock_type, tuple(sorted(p.sku_counts.items()))) for p in pool]
    assert len(keys) == len(set(keys)), "Candidate patterns in pool must be unique"
    for p in pool:
        assert len(p.sku_counts) > 0
        assert p.layout_template is not None


def test_pattern_selection_remnant_prioritization(machine, standard_bun):
    """Verify pattern selection prioritizes remnant patterns over full buns."""
    strat = algorithm_registry.get("ortools_pattern_selection")
    remnant = RemnantStock(
        id="rem-hr40-pat",
        code="REM-HR40-002",
        grade="HR-40",
        length=50.0,
        width=40.0,
        height=20.0,
        cut_date=date(2026, 3, 1)
    )
    parts = [
        PartItem(id="p1", name="Small Part", sku="SKU-SMALL", grade="HR-40", length=20.0, width=15.0, height=8.0, quantity=2),
    ]
    req = OptimizationRequest(
        job_id="job-pat-remnant",
        grade="HR-40",
        parts=parts,
        algorithm_id="ortools_pattern_selection",
        seed=42
    )
    res = strat.solve(req, [standard_bun], [remnant], machine)
    assert res.blocks_used_count == 1
    assert res.blocks[0].stock_id == "rem-hr40-pat"
    assert res.blocks[0].stock_type == "remnant"


def test_pattern_selection_missing_ortools_fallback(monkeypatch, machine, standard_bun):
    """Simulate missing OR-Tools package for pattern selection and verify graceful fallback."""
    import app.engine.ortools.pattern_selection as ort_ps
    monkeypatch.setattr(ort_ps, "is_ortools_available", lambda: False)

    strat = algorithm_registry.get("ortools_pattern_selection")
    parts = [
        PartItem(id="p1", name="Part A", sku="SKU-A", grade="HR-40", length=24.0, width=18.0, height=8.0, quantity=2),
    ]
    req = OptimizationRequest(job_id="job-pat-fallback", grade="HR-40", parts=parts, algorithm_id="ortools_pattern_selection", seed=42)
    res = strat.solve(req, [standard_bun], [], machine)

    assert res.fallback_used is True
    assert "FALLBACK" in res.solver_status
    assert res.total_parts_placed == 2
    val = validate_optimization_result(res)
    assert val.is_valid is True


# ==============================================================================
# Machine Auto-Assignment Tests
# ==============================================================================

def test_machine_assignment_height_constraint(standard_bun):
    """A block taller than a machine's max cut height is never assigned to it."""
    from app.engine.ortools.machine_assignment import select_optimal_machine

    parts = [
        PartItem(id="p1", name="Cushion", sku="SKU-1", grade="HR-40", length=24.0, width=18.0, height=8.0, quantity=4)
    ]
    req = OptimizationRequest(job_id="job-m-height", grade="HR-40", parts=parts, seed=42)

    # Standard bun has 40.0" height. Machine with 36" clearance must be rejected.
    m_ineligible = MachineProfile(id="m_low", name="Low Throat Saw", max_cut_height=36.0, cut_type=MachineCutType.GUILLOTINE)
    m_eligible = MachineProfile(id="m_high", name="High Throat Saw", max_cut_height=48.0, cut_type=MachineCutType.GUILLOTINE)

    decision = select_optimal_machine(
        request=req,
        candidate_machines=[m_ineligible, m_eligible],
        available_buns=[standard_bun],
        available_remnants=[],
        objective="lowest_cost"
    )
    assert decision.chosen_machine.id == "m_high"
    assert "48.0 in throat clearance" in decision.reason


def test_machine_assignment_distinct_objectives(standard_bun):
    """Each objective selector (best_yield, lowest_time, lowest_cost) changes the choice on a crafted example."""
    from app.engine.ortools.machine_assignment import select_optimal_machine

    parts = [
        PartItem(id="p1", name="Cushion", sku="SKU-1", grade="HR-40", length=24.0, width=18.0, height=8.0, quantity=10)
    ]
    req = OptimizationRequest(job_id="job-m-objs", grade="HR-40", parts=parts, seed=42)

    m_yield = MachineProfile(id="m_yield", name="Yield Champion", kerf=0.04, feed_rate_ipm=60.0, hourly_rate=120.0, max_cut_height=48.0)
    m_speed = MachineProfile(id="m_speed", name="Speed Demon", kerf=0.25, feed_rate_ipm=300.0, hourly_rate=80.0, max_cut_height=48.0)
    m_cost = MachineProfile(id="m_cost", name="Budget Saver", kerf=0.20, feed_rate_ipm=80.0, hourly_rate=20.0, max_cut_height=48.0)
    candidates = [m_yield, m_speed, m_cost]

    dec_yield = select_optimal_machine(req, candidates, [standard_bun], [], objective="best_yield")
    assert dec_yield.chosen_machine.id == "m_yield"
    assert "highest estimated yield" in dec_yield.reason

    dec_time = select_optimal_machine(req, candidates, [standard_bun], [], objective="lowest_time")
    assert dec_time.chosen_machine.id == "m_speed"
    assert "fastest estimated saw time" in dec_time.reason

    dec_cost = select_optimal_machine(req, candidates, [standard_bun], [], objective="lowest_cost")
    assert dec_cost.chosen_machine.id == "m_cost"
    assert "lowest estimated total cost" in dec_cost.reason


def test_machine_assignment_capacity_limit(standard_bun):
    """A machine exceeding its available hours limit is bypassed for a capable machine."""
    from app.engine.ortools.machine_assignment import select_optimal_machine

    # Large job requiring significant cutting time
    parts = [
        PartItem(id="p1", name="Cushion", sku="SKU-1", grade="HR-40", length=24.0, width=18.0, height=8.0, quantity=50)
    ]
    req = OptimizationRequest(job_id="job-m-cap", grade="HR-40", parts=parts, seed=42)

    # Fast machine but with only 0.01 hours capacity available
    m_constrained = MachineProfile(id="m_fast_busy", name="Busy Saw", feed_rate_ipm=200.0, available_hours_limit=0.01, max_cut_height=48.0)
    m_available = MachineProfile(id="m_available", name="Available Saw", feed_rate_ipm=100.0, available_hours_limit=10.0, max_cut_height=48.0)

    decision = select_optimal_machine(req, [m_constrained, m_available], [standard_bun], [], objective="lowest_time")
    assert decision.chosen_machine.id == "m_available"


def test_machine_assignment_api_auto_endpoint():
    """POST /api/optimize with machine_id='auto' assigns compatible machine and sets metadata."""
    from fastapi.testclient import TestClient
    from app.main import app

    client = TestClient(app)
    payload = {
        "job_id": "AUTO-API-TEST",
        "grade": "HR-40",
        "machine_id": "auto",
        "machine_objective": "lowest_cost",
        "algorithm_id": "ortools_block_assignment",
        "parts": [
            {"id": "p1", "name": "Part A", "sku": "SKU-A", "grade": "HR-40", "length": 24.0, "width": 18.0, "height": 8.0, "quantity": 2}
        ]
    }
    res = client.post("/api/optimize", json=payload)
    assert res.status_code == 200
    data = res.json()

    assert data["machine"]["id"] in ["saw-g1", "saw-g2"]
    assert data["machine_assignment_reason"] is not None
    assert "Auto (OR-Tools)" in data["machine_assignment_reason"]
    for b in data["blocks"]:
        assert b["assigned_machine_id"] == data["machine"]["id"]
