import pytest
from app.optimizer.slicing_tree import SlicingNode


def test_kerf_accounting_on_split():
    # Initial box 100 x 50 x 30
    node = SlicingNode(0.0, 0.0, 0.0, 100.0, 50.0, 30.0)
    kerf = 0.125  # 1/8"

    # Split along Z at cut height 10.0"
    left, right = node.split("Z", 10.0, kerf)

    assert left.z == 0.0
    assert left.dz == 10.0

    # Right starts at cut + kerf = 10.125
    assert right.z == 10.125
    assert right.dz == 30.0 - 10.0 - kerf  # 19.875

    # Conservation: left + right + kerf == parent
    assert left.dz + right.dz + kerf == node.dz
