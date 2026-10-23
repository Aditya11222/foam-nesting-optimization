"""
Permitted orientations calculator for foam parts.
Enforces foam rise direction constraints and collapses duplicate dimensions.
"""

from typing import List, Tuple
from itertools import permutations
from .models import OrientationMode


def get_permitted_orientations(
    length: float,
    width: float,
    height: float,
    mode: OrientationMode = OrientationMode.RISE_LOCKED
) -> List[Tuple[float, float, float]]:
    """
    Returns unique axis-aligned 3D bounding orientations (dx, dy, dz) allowed for a part.
    Duplicate orientations (e.g. for cubes or square sections) are collapsed.

    - RISE_LOCKED: Height remains aligned with Z (rise direction). Can rotate 0 or 90 deg in XY.
    - FREE_IN_PLANE: Rotate about vertical Z axis only (same as rise-locked).
    - ANY: Free 3D rotation across all 6 axis-aligned permutations.
    """
    candidates: List[Tuple[float, float, float]] = []

    if mode in (OrientationMode.RISE_LOCKED, OrientationMode.FREE_IN_PLANE):
        # Height is locked to Z
        candidates.append((length, width, height))
        candidates.append((width, length, height))
    elif mode == OrientationMode.ANY:
        # All 6 Cartesian permutations of (length, width, height)
        for p in permutations([length, width, height]):
            candidates.append((p[0], p[1], p[2]))
    else:
        candidates.append((length, width, height))

    # Collapse duplicates while preserving stable ordering
    unique: List[Tuple[float, float, float]] = []
    seen = set()
    for orient in candidates:
        # Round to 4 decimals to avoid tiny float diffs
        key = (round(orient[0], 4), round(orient[1], 4), round(orient[2], 4))
        if key not in seen:
            seen.add(key)
            unique.append(orient)

    return unique
