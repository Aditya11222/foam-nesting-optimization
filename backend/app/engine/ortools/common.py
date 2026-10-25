"""
Common utilities, lazy-import guards, and CP-SAT solver status formatting for OR-Tools.
"""

from typing import Tuple, Any, Optional


def is_ortools_available() -> bool:
    """Checks whether Google OR-Tools is installed in the current environment."""
    try:
        from ortools.sat.python import cp_model  # noqa: F401
        return True
    except (ImportError, Exception):
        return False


def get_cp_model():
    """Lazily retrieves cp_model module or raises a clean descriptive error."""
    try:
        from ortools.sat.python import cp_model
        return cp_model
    except ImportError as e:
        raise RuntimeError(
            "Google OR-Tools is not installed in the runtime environment. "
            "Please install it via 'pip install ortools>=9.11.0' to enable CP-SAT optimization."
        ) from e


def format_solver_status(status_code: int, cp_mod) -> str:
    """
    Formulates honest, non-misleading status labels.
    Never shows unqualified 'optimal' for 3D foam packing.
    """
    if status_code == cp_mod.OPTIMAL:
        return "OPTIMAL (for volume-based allocation model, not proven optimal for 3D layout)"
    elif status_code == cp_mod.FEASIBLE:
        return "FEASIBLE"
    elif status_code == cp_mod.INFEASIBLE:
        return "INFEASIBLE"
    elif status_code == cp_mod.MODEL_INVALID:
        return "MODEL_INVALID"
    else:
        return "TIMEOUT / UNKNOWN"
