import pytest
from app.domain.models import OptimizationRequest, PartItem, MachineProfile
from app.optimizer.guillotine import optimize_guillotine_job, GradeMismatchError


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

    with pytest.raises(GradeMismatchError, match="Cross-grade mixing is strictly prohibited"):
        optimize_guillotine_job(request=request, available_buns=[], available_remnants=[], machine=machine)
