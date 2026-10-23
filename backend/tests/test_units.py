import pytest
from app.domain.units import snap_to_16th, format_fraction_16th, SIXTEENTH_INCH


def test_snap_to_16th_valid():
    assert snap_to_16th(12.0) == 12.0
    assert snap_to_16th(12.0625) == 12.0625
    assert snap_to_16th(12.125) == 12.125
    assert snap_to_16th(12.06) == 12.0625  # snaps to 1/16
    assert snap_to_16th(0.0625) == 0.0625


def test_snap_to_16th_rejects_non_positive():
    with pytest.raises(ValueError, match="strictly greater than 0"):
        snap_to_16th(0.0)

    with pytest.raises(ValueError, match="strictly greater than 0"):
        snap_to_16th(-5.5)


def test_snap_to_16th_rejects_sub_16th():
    with pytest.raises(ValueError, match="at least 1/16 in"):
        snap_to_16th(0.01)


def test_format_fraction_16th():
    assert format_fraction_16th(12.0) == '12"'
    assert format_fraction_16th(22.0) == '22"'
    assert format_fraction_16th(12.125) == '12 1/8"'
    assert format_fraction_16th(12.25) == '12 1/4"'
    assert format_fraction_16th(12.0625) == '12 1/16"'
    assert format_fraction_16th(0.125) == '1/8"'
