"""
Units and snapping module for foam cutting optimization.

Units: inches.
All dimensions snap to 1/16 inch (0.0625 in).
Invalid, negative, non-positive or sub-1/16" dimensions are rejected with clear errors.
"""

from typing import Union
import math

SIXTEENTH_INCH = 0.0625  # 1/16 in


def snap_to_16th(val: Union[int, float], field_name: str = "Dimension") -> float:
    """
    Snap a dimension value in inches to the nearest 1/16 inch (0.0625").
    Rejects values <= 0, NaN, Inf, or values smaller than 1/16 inch.
    """
    if val is None or not isinstance(val, (int, float)):
        raise ValueError(f"{field_name} must be a numeric value in inches.")
    if math.isnan(val) or math.isinf(val):
        raise ValueError(f"{field_name} must be a finite number.")
    if val <= 0:
        raise ValueError(f"{field_name} must be strictly greater than 0 inches (got {val}).")
    
    # Snap to nearest 1/16
    snapped = round(float(val) * 16.0) / 16.0
    
    if snapped < SIXTEENTH_INCH:
        raise ValueError(
            f"{field_name} must be at least 1/16 in (0.0625 in), got {val} which snapped to {snapped}."
        )
    return snapped


def format_fraction_16th(val: float) -> str:
    """
    Format a snapped float as a human-friendly mixed fraction string for saw operators.
    Example: 12.125 -> '12 1/8"', 24.0 -> '24"', 0.0625 -> '1/16"'.
    """
    snapped = round(float(val) * 16.0) / 16.0
    whole = int(snapped)
    sixteenths = int(round((snapped - whole) * 16))
    
    if sixteenths == 0:
        return f'{whole}"'
    
    # Simplify fraction
    # gcd of sixteenths and 16
    gcd = math.gcd(sixteenths, 16)
    num = sixteenths // gcd
    den = 16 // gcd
    
    if whole == 0:
        return f'{num}/{den}"'
    return f'{whole} {num}/{den}"'
