import pytest
from app.domain.models import OptimizationRequest, PartItem, MachineProfile, BlockInput
from app.optimizer.registry import algorithm_registry
from app.optimizer.strategies import GradeMismatchError


def test_grade_mismatch_rejected():
    machine = MachineProfile(id="saw-1", name="Test Guillotine", max_cut_height=48.0, kerf=0.125)
    
    # Request is for HR-40, but contains a part marked HR-30
    request = OptimizationRequest(
        job_id="JOB-ERR-1",
        grade="HR-40",
        parts=[
            PartItem(id="p1", sku="Cushion-HR40", name="Seat Cushion", grade="HR-40", length=24.0, width=24.0, height=6.0, quantity=1),
            PartItem(id="p2", sku="Bolster-HR30", name="Back Bolster", grade="HR-30", length=30.0, width=8.0, height=8.0, quantity=1),
        ]
    )

    strategy = algorithm_registry.get("best_fit_decreasing")
    with pytest.raises(GradeMismatchError, match="Cross-grade mixing is strictly prohibited|has grade"):
        strategy.solve(request=request, available_buns=[], available_remnants=[], machine=machine)


def test_synchronized_grade_execution():
    """Verifies that when grade is switched to VE-50 or HR-30, all synchronized blocks and parts nest successfully."""
    machine = MachineProfile(id="saw-1", name="Test Guillotine", max_cut_height=48.0, kerf=0.125)

    for target_grade in ["HR-30", "VE-50"]:
        # Simulate synchronized form: all blocks and parts set to target_grade
        blocks = [
            BlockInput(id=f"b-{target_grade}", nominal_length=108.0, nominal_width=82.0, nominal_height=40.0, grade=target_grade, quantity=2)
        ]
        parts = [
            PartItem(id="p1", sku="Seat", name="Seat", grade=target_grade, length=24.0, width=24.0, height=6.0, quantity=4),
            PartItem(id="p2", sku="Back", name="Back", grade=target_grade, length=30.0, width=12.0, height=8.0, quantity=2)
        ]
        request = OptimizationRequest(
            job_id=f"JOB-SYNC-{target_grade}",
            grade=target_grade,
            available_blocks=blocks,
            parts=parts
        )

        for algo_id in ["best_fit_decreasing", "first_fit_decreasing"]:
            strat = algorithm_registry.get(algo_id)
            result = strat.solve(request=request, available_buns=[], available_remnants=[], machine=machine)
            assert result.grade == target_grade
            assert result.total_parts_placed == 6
            assert all(b.grade == target_grade for b in result.blocks)
            assert all(p.grade == target_grade for b in result.blocks for p in b.placed_parts)
