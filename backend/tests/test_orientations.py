import pytest
from app.domain.models import OrientationMode
from app.domain.orientation import get_permitted_orientations


def test_rise_locked_preserves_height():
    # Part 24 x 18 x 6 with rise-locked: height must remain 6 (Z)
    orients = get_permitted_orientations(24.0, 18.0, 6.0, OrientationMode.RISE_LOCKED)
    assert len(orients) == 2
    assert (24.0, 18.0, 6.0) in orients
    assert (18.0, 24.0, 6.0) in orients
    # Z coordinate is strictly 6.0 in all orientations
    for o in orients:
        assert o[2] == 6.0


def test_duplicate_collapsing_cube():
    # Cube 12 x 12 x 12 under ANY orientation should collapse to exactly 1 orientation
    orients_any = get_permitted_orientations(12.0, 12.0, 12.0, OrientationMode.ANY)
    assert len(orients_any) == 1
    assert orients_any[0] == (12.0, 12.0, 12.0)


def test_duplicate_collapsing_square_section():
    # Square cross section 24 x 24 x 6
    # Under rise-locked: height 6 is fixed, length == width (24 == 24) -> collapses to 1 orientation
    orients_locked = get_permitted_orientations(24.0, 24.0, 6.0, OrientationMode.RISE_LOCKED)
    assert len(orients_locked) == 1
    assert orients_locked[0] == (24.0, 24.0, 6.0)

    # Under ANY: 3 unique permutations (24, 24, 6), (24, 6, 24), (6, 24, 24)
    orients_any = get_permitted_orientations(24.0, 24.0, 6.0, OrientationMode.ANY)
    assert len(orients_any) == 3


def test_any_mode_distinct_dimensions():
    # Distinct dimensions 30 x 16 x 10 has 6 permutations
    orients = get_permitted_orientations(30.0, 16.0, 10.0, OrientationMode.ANY)
    assert len(orients) == 6
