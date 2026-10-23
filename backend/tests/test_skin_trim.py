import pytest
from app.domain.models import BunStock, SkinTrimConfig


def test_usable_dims_calculation():
    bun = BunStock(
        id="test-bun",
        code="BUN-TEST",
        grade="HR-40",
        nominal_length=108.0,
        nominal_width=82.0,
        nominal_height=40.0,
        skin_trim=SkinTrimConfig(x=1.0, y=1.0, z=1.0)
    )
    # usable = nominal - 2 * trim per axis
    # L = 108 - 2 = 106, W = 82 - 2 = 80, H = 40 - 2 = 38
    ux, uy, uz = bun.usable_dims
    assert ux == 106.0
    assert uy == 80.0
    assert uz == 38.0
    assert bun.usable_volume == 106.0 * 80.0 * 38.0


def test_reject_block_when_usable_dim_le_zero():
    # If skin trim is too large relative to nominal dimension
    bun = BunStock(
        id="small-bun",
        code="BUN-TOO-SMALL",
        grade="HR-40",
        nominal_length=2.0,
        nominal_width=10.0,
        nominal_height=10.0,
        skin_trim=SkinTrimConfig(x=1.5, y=1.0, z=1.0)  # usable_x = 2.0 - 3.0 = -1.0 <= 0
    )
    with pytest.raises(ValueError, match="Block usable dimension <= 0"):
        _ = bun.usable_dims
