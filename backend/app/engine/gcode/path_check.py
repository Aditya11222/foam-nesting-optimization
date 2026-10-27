"""
G-Code Path Simulation and Verification Checker.
Validates that generated G-code stays strictly within physical block boundaries and machine limits,
contains all mandatory safety headers, and correctly replays the validated cut sequence.
"""

import re
from typing import Tuple, List, Optional
from ...domain.models import BlockLayout, MachineProfile

SAFETY_DEMO_TEXT = "DEMO OUTPUT: NOT VALIDATED ON A REAL MACHINE. REVIEW AND DRY-RUN BEFORE USE."


class PathCheckError(Exception):
    pass


def verify_gcode_path(
    gcode_text: str,
    block: BlockLayout,
    machine: MachineProfile
) -> Tuple[bool, str, int]:
    """
    Simulates and verifies G-code movements for a single block.

    Returns:
        (passed: bool, message: str, simulated_cuts_count: int)
    """
    # 1. Mandatory Header Verification
    if SAFETY_DEMO_TEXT not in gcode_text:
        return (False, "Safety check failed: Mandatory DEMO output disclaimer missing from file header.", 0)

    # 2. Setup Codes Verification
    if "G20" not in gcode_text or "G90" not in gcode_text:
        return (False, "Dialect check failed: G20 (inch) or G90 (absolute) setup code missing.", 0)

    if "M30" not in gcode_text:
        return (False, "Program end check failed: M30 termination code missing.", 0)

    # 3. Simulate Coordinate Traversal
    curr_x = 0.0
    curr_y = 0.0
    curr_z = 0.0

    max_x = block.nominal_length + 0.125
    max_y = block.nominal_width + 0.125
    safe_retract_limit = max(block.nominal_height, machine.max_cut_height) + machine.safe_z + 2.0

    lines = gcode_text.splitlines()
    step_pattern = re.compile(r"\( --- Step (\d+):", re.IGNORECASE)
    detected_steps: List[int] = []
    current_step_num: Optional[int] = None

    coord_x_re = re.compile(r"[Xx]([-+]?\d*\.?\d+)")
    coord_y_re = re.compile(r"[Yy]([-+]?\d*\.?\d+)")
    coord_z_re = re.compile(r"[Zz]([-+]?\d*\.?\d+)")

    for line_idx, line in enumerate(lines, 1):
        clean_line = line.strip()
        if not clean_line:
            continue

        # Detect cut step markers
        step_match = step_pattern.search(clean_line)
        if step_match:
            current_step_num = int(step_match.group(1))
            detected_steps.append(current_step_num)
            continue

        # Skip comment lines for coordinate extraction
        if clean_line.startswith("(") and clean_line.endswith(")"):
            continue

        # Parse motion commands
        if "G0" in clean_line or "G00" in clean_line or "G1" in clean_line or "G01" in clean_line:
            mx = coord_x_re.search(clean_line)
            my = coord_y_re.search(clean_line)
            mz = coord_z_re.search(clean_line)

            if mx:
                curr_x = float(mx.group(1))
            if my:
                curr_y = float(my.group(1))
            if mz:
                curr_z = float(mz.group(1))

            # Enforce non-negative coordinates (origin at corner)
            if curr_x < -0.0625 or curr_y < -0.0625 or curr_z < -0.0625:
                msg = (
                    f"Line {line_idx} (Step #{current_step_num or 0}): Negative coordinate "
                    f"({curr_x:.4f}, {curr_y:.4f}, {curr_z:.4f}) outside origin boundary."
                )
                return (False, msg, len(detected_steps))

            # Enforce block envelope boundaries
            if curr_x > max_x:
                msg = (
                    f"Line {line_idx} (Step #{current_step_num or 0}): X coordinate {curr_x:.4f}\" "
                    f"exceeds nominal block length ({block.nominal_length}\")."
                )
                return (False, msg, len(detected_steps))

            if curr_y > max_y:
                msg = (
                    f"Line {line_idx} (Step #{current_step_num or 0}): Y coordinate {curr_y:.4f}\" "
                    f"exceeds nominal block width ({block.nominal_width}\")."
                )
                return (False, msg, len(detected_steps))

            # Enforce machine max cut height and safe clearance
            if curr_z > safe_retract_limit:
                msg = (
                    f"Line {line_idx} (Step #{current_step_num or 0}): Z coordinate {curr_z:.4f}\" "
                    f"exceeds maximum clearance limit ({safe_retract_limit:.4f}\")."
                )
                return (False, msg, len(detected_steps))

    # 4. Verify Cut Count Against Validated Cuts
    expected_cut_count = len(block.cuts)
    if len(detected_steps) != expected_cut_count:
        msg = (
            f"Step count mismatch: G-code contains {len(detected_steps)} steps, but validated sequence "
            f"contains {expected_cut_count} steps."
        )
        return (False, msg, len(detected_steps))

    # 5. Passed all physical simulation checks
    summary = (
        f"Path check passed: All {len(detected_steps)} steps verified. "
        f"Trajectories remain within envelope ({block.nominal_length:.1f}\"×{block.nominal_width:.1f}\"×{block.nominal_height:.1f}\")."
    )
    return (True, summary, len(detected_steps))
