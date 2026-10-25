import pytest
from app.domain.models import OptimizationRequest, BlockInput, PartItem, MachineProfile, MachineCutType, BunStock
from app.optimizer.registry import algorithm_registry
from app.repositories.json_repo import JsonInventoryRepository


@pytest.fixture
def repo():
    return JsonInventoryRepository()


def test_user_setup_exact_154_parts_placed(repo):
    """
    User Observed Bug Regression Test:
    Setup: grade HR-40, block 108x82x40 in (usable 106x80x38), qty 6 blocks,
    trim 1 in, kerf 0.125 in, machine Saw Station 2, OR-Tools Block Assignment.
    Must place all 154 parts with 0 unplaced parts.
    """
    machine = repo.get_machine("saw-g2")
    buns = repo.list_buns("HR-40")
    remnants = repo.list_remnants("HR-40")

    parts = [
        PartItem(id="part-1", sku="Cushion A", name="Sofa Seat Cushion A", length=24.0, width=24.0, height=6.0, quantity=40, grade="HR-40", orientation_mode="rise-locked"),
        PartItem(id="part-2", sku="Bolster B", name="Cylindrical Core Bolster B", length=36.0, width=8.0, height=8.0, quantity=24, grade="HR-40", orientation_mode="free-in-plane"),
        PartItem(id="part-3", sku="Cube C", name="Modular Corner Cube C", length=12.0, width=12.0, height=12.0, quantity=60, grade="HR-40", orientation_mode="any"),
        PartItem(id="part-4", sku="Pad D", name="Support Base Pad D", length=48.0, width=20.0, height=4.0, quantity=18, grade="HR-40", orientation_mode="rise-locked"),
        PartItem(id="part-5", sku="Wedge E", name="Inclined Back Wedge E", length=30.0, width=16.0, height=10.0, quantity=12, grade="HR-40", orientation_mode="rise-locked")
    ]

    blocks = [
        BlockInput(id="bun-1", nominal_length=108.0, nominal_width=82.0, nominal_height=40.0, grade="HR-40", quantity=6)
    ]

    req = OptimizationRequest(
        job_id="JOB-REGRESSION-154",
        customer="Acme Bedding",
        grade="HR-40",
        machine_id="saw-g2",
        skin_trim_per_face=1.0,
        kerf=0.125,
        parts=parts,
        available_blocks=blocks,
        algorithm_id="ortools_block_assignment",
        time_budget_seconds=10.0,
        seed=42
    )

    strat = algorithm_registry.get("ortools_block_assignment")
    res = strat.solve(req, buns, remnants, machine)

    assert res.total_parts_demanded == 154
    assert res.total_parts_placed == 154
    assert len(res.unplaced_parts) == 0
    assert len(res.unplaced_summary) == 0
    assert res.blocks_used_count <= 6


def test_unplaced_reason_exceeds_usable_dimensions(repo):
    """Crafted example for EXCEEDS_USABLE_DIMENSIONS: Part exceeds usable block size in all orientations."""
    machine = repo.get_machine("saw-g2")
    buns = repo.list_buns("HR-40")
    remnants = repo.list_remnants("HR-40")

    parts = [
        PartItem(id="p-giant", sku="Giant-Part", name="Giant Part 120in", length=120.0, width=40.0, height=20.0, quantity=2, grade="HR-40")
    ]
    blocks = [
        BlockInput(id="bun-1", nominal_length=108.0, nominal_width=82.0, nominal_height=40.0, grade="HR-40", quantity=1)
    ]

    req = OptimizationRequest(
        job_id="JOB-EXCEED-DIMS",
        grade="HR-40",
        machine_id="saw-g2",
        skin_trim_per_face=1.0,
        kerf=0.125,
        parts=parts,
        available_blocks=blocks,
        algorithm_id="ortools_block_assignment"
    )

    strat = algorithm_registry.get("ortools_block_assignment")
    res = strat.solve(req, buns, remnants, machine)

    assert len(res.unplaced_parts) == 1
    unp = res.unplaced_parts[0]
    assert unp.sku == "Giant-Part"
    assert unp.requested_qty == 2
    assert unp.placed_qty == 0
    assert unp.unplaced_qty == 2
    assert unp.reason_code == "EXCEEDS_USABLE_DIMENSIONS"
    assert "length by 14" in unp.message or "exceeds" in unp.message.lower()


def test_unplaced_reason_exceeds_machine_max_cut_height(repo):
    """Crafted example for EXCEEDS_MACHINE_MAX_CUT_HEIGHT: Part height exceeds machine throat clearance."""
    low_throat_machine = MachineProfile(
        id="saw-low",
        name="Low Throat Saw",
        cut_type=MachineCutType.GUILLOTINE,
        kerf=0.125,
        max_cut_length=120.0,
        max_cut_width=100.0,
        max_cut_height=20.0,
        hourly_rate=50.0,
        feed_rate_ipm=100.0
    )

    parts_tall = [
        PartItem(id="p-tall", sku="Tall-Foam", name="Tall Foam 25in", length=30.0, width=20.0, height=25.0, quantity=2, grade="HR-40", orientation_mode="rise-locked")
    ]
    blocks_short = [
        BlockInput(id="bun-s1", nominal_length=108.0, nominal_width=82.0, nominal_height=20.0, grade="HR-40", quantity=2)
    ]

    req_tall = OptimizationRequest(
        job_id="JOB-EXCEED-HEIGHT",
        grade="HR-40",
        machine_id="saw-low",
        skin_trim_per_face=1.0,
        kerf=0.125,
        parts=parts_tall,
        available_blocks=blocks_short,
        algorithm_id="first_fit_decreasing"
    )

    strat = algorithm_registry.get("first_fit_decreasing")
    res_tall = strat.solve(req_tall, [], [], low_throat_machine)

    assert len(res_tall.unplaced_parts) == 1
    unp = res_tall.unplaced_parts[0]
    assert unp.sku == "Tall-Foam"
    assert unp.reason_code == "EXCEEDS_MACHINE_MAX_CUT_HEIGHT"
    assert "20.0" in unp.message


def test_unplaced_reason_insufficient_block_quantity(repo):
    """Crafted example for INSUFFICIENT_BLOCK_QUANTITY: Volume exceeds all provided blocks up to max capacity."""
    machine = repo.get_machine("saw-g1")

    parts = [
        PartItem(id="p-bulk", sku="Bulk-Cushion", name="Bulk Cushion", length=48.0, width=24.0, height=10.0, quantity=500, grade="HR-40")
    ]
    blocks = [
        BlockInput(id="bun-1", nominal_length=108.0, nominal_width=82.0, nominal_height=40.0, grade="HR-40", quantity=1)
    ]

    req = OptimizationRequest(
        job_id="JOB-INSUFFICIENT-QTY",
        grade="HR-40",
        machine_id="saw-g1",
        skin_trim_per_face=1.0,
        kerf=0.125,
        parts=parts,
        available_blocks=blocks,
        algorithm_id="first_fit_decreasing"
    )

    strat = algorithm_registry.get("first_fit_decreasing")
    res = strat.solve(req, [], [], machine)

    assert len(res.unplaced_parts) == 1
    unp = res.unplaced_parts[0]
    assert unp.sku == "Bulk-Cushion"
    assert unp.requested_qty == 500
    assert unp.unplaced_qty > 0
    assert unp.reason_code == "INSUFFICIENT_BLOCK_QUANTITY"
    assert "additional block(s) needed" in unp.message


def test_unplaced_deduplication_and_quantity_reconciliation(repo):
    """
    Verify that unplaced_parts never contains duplicate SKUs,
    and unplaced_qty exactly equals requested_qty - placed_qty.
    """
    machine = repo.get_machine("saw-g2")

    parts = [
        PartItem(id="p-1", sku="Part-A", name="Part A", length=30.0, width=20.0, height=10.0, quantity=30, grade="HR-40"),
        PartItem(id="p-2", sku="Part-B", name="Part B", length=40.0, width=30.0, height=12.0, quantity=25, grade="HR-40"),
        PartItem(id="p-3", sku="Part-Giant", name="Part Giant", length=130.0, width=30.0, height=12.0, quantity=5, grade="HR-40")
    ]
    blocks = [
        BlockInput(id="bun-1", nominal_length=108.0, nominal_width=82.0, nominal_height=40.0, grade="HR-40", quantity=1)
    ]

    req = OptimizationRequest(
        job_id="JOB-DEDUP-TEST",
        grade="HR-40",
        machine_id="saw-g2",
        skin_trim_per_face=1.0,
        kerf=0.125,
        parts=parts,
        available_blocks=blocks,
        algorithm_id="best_fit_decreasing"
    )

    strat = algorithm_registry.get("best_fit_decreasing")
    res = strat.solve(req, [], [], machine)

    skus = [unp.sku for unp in res.unplaced_parts]
    assert len(skus) == len(set(skus)), "unplaced_parts must NEVER contain duplicate SKUs"

    for unp in res.unplaced_parts:
        assert unp.unplaced_qty == unp.requested_qty - unp.placed_qty
        assert unp.quantity == unp.unplaced_qty
