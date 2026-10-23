import pytest
from app.domain.models import (
    OptimizationRequest,
    PartItem,
    MachineProfile,
    MachineCutType,
    BunStock,
    SkinTrimConfig
)
from app.optimizer.guillotine import optimize_guillotine_job
from app.optimizer.registry import StrategyNotImplementedError


def test_free_waterjet_not_implemented():
    waterjet = MachineProfile(
        id="saw-wj",
        name="Waterjet Profiler",
        cut_type=MachineCutType.FREE,
        max_cut_height=36.0,
        kerf=0.0625
    )
    request = OptimizationRequest(
        job_id="JOB-WJ-TEST",
        grade="HR-40",
        parts=[
            PartItem(id="p1", sku="Cushion", name="Seat", grade="HR-40", length=24.0, width=24.0, height=6.0, quantity=1)
        ]
    )
    with pytest.raises(StrategyNotImplementedError, match="Non-guillotine free nesting is registered as a future capability and is not implemented"):
        optimize_guillotine_job(request, [], [], waterjet)


def test_guillotine_optimizer_proposal_job():
    guillotine = MachineProfile(
        id="saw-g2",
        name="Vertical Slicer",
        cut_type=MachineCutType.GUILLOTINE,
        max_cut_height=52.0,
        kerf=0.125
    )

    bun = BunStock(
        id="bun-1",
        code="BUN-HR40-101",
        grade="HR-40",
        nominal_length=108.0,
        nominal_width=82.0,
        nominal_height=40.0,
        skin_trim=SkinTrimConfig(x=1.0, y=1.0, z=1.0)
    )

    request = OptimizationRequest(
        job_id="JOB-4821",
        grade="HR-40",
        parts=[
            PartItem(id="p1", sku="Cushion A", name="Cushion A", grade="HR-40", length=24.0, width=24.0, height=6.0, quantity=4),
            PartItem(id="p2", sku="Cube C", name="Cube C", grade="HR-40", length=12.0, width=12.0, height=12.0, quantity=8),
        ]
    )

    result = optimize_guillotine_job(request, [bun], [], guillotine)

    # Must be explicitly labeled as heuristic solution
    assert result.solution_type == "heuristic solution"
    assert result.total_parts_placed == 12
    assert result.blocks_used_count >= 1
    assert result.gross_utilization_pct > 0.0
    assert result.net_utilization_pct > result.gross_utilization_pct
    assert len(result.blocks[0].cuts) > 0

    # Test operator cut sequence details
    cut1 = result.blocks[0].cuts[0]
    assert cut1.cut_type == "skin_trim"
    assert "Usable block" in cut1.produces_description_en
    assert "Bloque útil" in cut1.produces_description_es

    for cut in result.blocks[0].cuts:
        assert cut.position_display != ""
        assert cut.produces_description_en != ""
        assert cut.produces_description_es != ""
