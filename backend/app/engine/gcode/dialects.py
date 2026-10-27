"""
G-Code Dialect Definitions and Formatter Registry.
Supports generic RS-274/ISO standard, easily extendable to machine-specific controllers.
"""

from typing import Dict, Any, List
from dataclasses import dataclass, field


@dataclass
class GCodeDialect:
    id: str
    name: str
    description: str
    units_code: str = "G20"             # G20 = inches, G21 = mm
    distance_mode: str = "G90"          # G90 = absolute, G91 = incremental
    plane_select: str = "G17"           # G17 = XY plane
    feed_mode: str = "G94"              # G94 = units per min
    work_coord: str = "G54"             # Standard G54 work coordinate
    rapid_cmd: str = "G00"
    linear_cmd: str = "G01"
    program_end: str = "M30"
    comment_open: str = "("
    comment_close: str = ")"
    coord_decimals: int = 4

    def format_coord(self, val: float) -> str:
        """Formats coordinate to fixed 4-decimal places (snapped to 1/16 in increments)."""
        return f"{val:.{self.coord_decimals}f}"

    def comment(self, text: str) -> str:
        """Encapsulates text in dialect-safe comment syntax."""
        safe_text = text.replace("(", "[").replace(")", "]")
        return f"{self.comment_open} {safe_text} {self.comment_close}"

    def rapid(self, x: float = None, y: float = None, z: float = None) -> str:
        parts = [self.rapid_cmd]
        if x is not None:
            parts.append(f"X{self.format_coord(x)}")
        if y is not None:
            parts.append(f"Y{self.format_coord(y)}")
        if z is not None:
            parts.append(f"Z{self.format_coord(z)}")
        return " ".join(parts)

    def linear(self, x: float = None, y: float = None, z: float = None, f: float = None) -> str:
        parts = [self.linear_cmd]
        if x is not None:
            parts.append(f"X{self.format_coord(x)}")
        if y is not None:
            parts.append(f"Y{self.format_coord(y)}")
        if z is not None:
            parts.append(f"Z{self.format_coord(z)}")
        if f is not None:
            parts.append(f"F{f:.1f}")
        return " ".join(parts)


DIALECTS: Dict[str, GCodeDialect] = {
    "generic_rs274": GCodeDialect(
        id="generic_rs274",
        name="RS-274 / ISO Generic",
        description="Standard EIA RS-274D / ISO 6983 G-code supported by Fanuc, Haas, LinuxCNC, and GRBL"
    )
}


def get_dialect(dialect_id: str = "generic_rs274") -> GCodeDialect:
    """Retrieves dialect configuration, defaulting to generic RS-274."""
    return DIALECTS.get(dialect_id, DIALECTS["generic_rs274"])
