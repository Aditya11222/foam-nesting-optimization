"""
Deterministic G-Code Generator for 3D Foam Nesting & Cutting Optimization.
Reads a validated OptimizationResult and BlockLayout and produces demo-grade RS-274 G-code
with mandatory safety disclaimers, physical boundary checks, and path simulation.
"""

from typing import List, Optional, Tuple, Dict, Any
from datetime import datetime, timezone
import math

from ...domain.models import (
    OptimizationResult,
    BlockLayout,
    MachineProfile,
    CutStep,
    CutType,
    GCodeFilePayload,
    GCodeExportResponse
)
from .dialects import get_dialect, GCodeDialect
from .path_check import verify_gcode_path, SAFETY_DEMO_TEXT


class GCodeGenerationError(Exception):
    """Raised when G-code generation fails or boundary constraints are violated."""
    pass


def _format_date_compact(dt: Optional[datetime] = None) -> str:
    if dt is None:
        dt = datetime.now(timezone.utc)
    return dt.strftime("%Y%m%d")


def _format_timestamp_iso(dt: Optional[datetime] = None) -> str:
    if dt is None:
        dt = datetime.now(timezone.utc)
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def generate_block_gcode(
    job_id: str,
    job_name: str,
    customer_ref: Optional[str],
    grade: str,
    algorithm_name: str,
    block: BlockLayout,
    machine: MachineProfile,
    total_blocks_count: int = 1,
    timestamp: Optional[datetime] = None
) -> GCodeFilePayload:
    """
    Generates a deterministic .nc file for a single foam block.
    """
    # 1. Machine G-Code Capability Gate
    if not machine.gcode_supported:
        raise GCodeGenerationError(
            f"Machine '{machine.name}' ({machine.id}) is configured as manual or non-automated. "
            f"G-code generation is only supported for CNC/automated machinery."
        )

    # 2. Throat Height & Envelope Safety Check
    if block.nominal_height > (machine.max_cut_height + 0.0625):
        raise GCodeGenerationError(
            f"Block height ({block.nominal_height}\") exceeds machine throat clearance limit "
            f"({machine.max_cut_height}\") on '{machine.name}'."
        )

    dialect: GCodeDialect = get_dialect(machine.gcode_dialect)
    feed = machine.feed_rate_ipm or 100.0
    rapid_feed = machine.rapid_rate_ipm or 300.0
    safe_z_val = round((block.nominal_height + (machine.safe_z or 2.0)) * 16.0) / 16.0

    date_str = _format_date_compact(timestamp)
    time_iso = _format_timestamp_iso(timestamp)
    safe_job_id = "".join(c if c.isalnum() or c in "-_" else "_" for c in job_id)
    safe_machine_id = "".join(c if c.isalnum() or c in "-_" else "_" for c in machine.id)
    filename = f"foam-nesting_{safe_job_id}_{safe_machine_id}_block{block.block_index}_{date_str}.nc"

    # Skin trim per face
    trim_x = max(0.0, (block.nominal_length - block.usable_length) / 2.0)
    trim_y = max(0.0, (block.nominal_width - block.usable_width) / 2.0)
    trim_z = max(0.0, (block.nominal_height - block.usable_height) / 2.0)

    lines: List[str] = []
    total_cut_length_in = 0.0

    def add_line(text: str = ""):
        lines.append(text)

    # --- Header Comments ---
    add_line("(======================================================================)")
    add_line("( TATRAS NESTPRO — FOAM NESTING & CUTTING OPTIMIZATION                 )")
    add_line(f"( {SAFETY_DEMO_TEXT}                        )")
    add_line("( NOT PROVEN SAFE FOR PRODUCTION OPERATIONS.                           )")
    add_line("(======================================================================)")
    add_line(f"( Project: Tatras NestPro Foam Nesting Optimization )")
    add_line(f"( Job ID: {job_id} )")
    add_line(f"( Job Name: {job_name} )")
    if customer_ref and customer_ref.strip():
        add_line(f"( Customer Reference: {customer_ref.strip()} )")
    add_line(f"( Foam Grade: {grade} )")
    add_line(f"( Machine: {machine.name} [{machine.id}] )")
    add_line(f"( Dialect: {dialect.id} ({dialect.name}) )")
    add_line(f"( Units: {machine.units.upper()} (All coordinates snapped to 1/16\" precision) )")
    add_line(f"( Cutting Feed Rate: {feed:.1f} IPM | Rapid Rate: {rapid_feed:.1f} IPM )")
    add_line(f"( Blade/Beam Kerf: {dialect.format_coord(machine.kerf)}\" )")
    add_line(f"( Block: Block {block.block_index} of {total_blocks_count} (Stock ID: {block.stock_id}) )")
    add_line(
        f"( Nominal Stock Dims: {dialect.format_coord(block.nominal_length)}\" x "
        f"{dialect.format_coord(block.nominal_width)}\" x {dialect.format_coord(block.nominal_height)}\" )"
    )
    add_line(
        f"( Usable Interior Dims: {dialect.format_coord(block.usable_length)}\" x "
        f"{dialect.format_coord(block.usable_width)}\" x {dialect.format_coord(block.usable_height)}\" )"
    )
    add_line(
        f"( Skin Trim: {dialect.format_coord(trim_x)}\" (X), "
        f"{dialect.format_coord(trim_y)}\" (Y), {dialect.format_coord(trim_z)}\" (Z) per face )"
    )
    add_line(f"( Algorithm: {algorithm_name} )")
    add_line(f"( Work Coordinate Origin: Block front-left-bottom corner (X0 Y0 Z0) )")
    add_line(f"( Generated: {time_iso} )")
    add_line("(======================================================================)")
    add_line()

    # --- Setup Codes ---
    add_line("( --- Program Setup --- )")
    add_line(f"{dialect.units_code} (Programming in inches)")
    add_line(f"{dialect.distance_mode} (Absolute distance mode)")
    add_line(f"{dialect.plane_select} (XY circular/plane selection)")
    add_line(f"{dialect.feed_mode} (Feedrate mode: units per minute)")
    add_line(dialect.rapid(z=safe_z_val) + " (Rapid to safe clearance height)")
    add_line(dialect.rapid(x=0.0, y=0.0) + " (Rapid to block origin)")
    add_line()

    # Build mapping for parts by ID
    parts_map = {p.part_id: p for p in block.placed_parts}

    # --- Cut Sequence ---
    for step in block.cuts:
        step_num = step.step_number
        cut_type = step.cut_type

        add_line(f"( --- Step {step_num}: Stage {step.stage} — {step.produces_description_en} --- )")

        if cut_type == CutType.SKIN_TRIM:
            # Perimeter skin trim pass
            add_line(f"( Action: Trim crust skin ~{dialect.format_coord(trim_z)}\" from raw stock faces )")
            add_line(
                f"( Usable Interior: {dialect.format_coord(block.usable_length)}\" x "
                f"{dialect.format_coord(block.usable_width)}\" x {dialect.format_coord(block.usable_height)}\" )"
            )
            add_line(dialect.rapid(z=safe_z_val))
            add_line(dialect.rapid(x=0.0, y=trim_y))
            # Feed down to cut plane
            target_z = max(0.0625, trim_z)
            add_line(dialect.linear(z=target_z, f=feed))
            add_line(dialect.linear(x=block.nominal_length, f=feed))
            total_cut_length_in += block.nominal_length
            add_line(dialect.rapid(z=safe_z_val))

        elif cut_type == CutType.HORIZONTAL_SLAB:
            # Z axis horizontal slice
            cut_z = round((trim_z + step.position_in) * 16.0) / 16.0
            if cut_z > block.nominal_height:
                raise GCodeGenerationError(
                    f"Step {step_num}: Cut Z={cut_z:.4f}\" exceeds block height {block.nominal_height:.4f}\"."
                )
            add_line(f"( Action: Horizontal slab cut at height {dialect.format_coord(cut_z)}\" from base )")
            add_line(dialect.rapid(z=safe_z_val))
            add_line(dialect.rapid(x=0.0, y=trim_y))
            add_line(dialect.linear(z=cut_z, f=feed))
            add_line(dialect.linear(x=block.nominal_length, f=feed))
            total_cut_length_in += block.nominal_length
            add_line(dialect.rapid(z=safe_z_val))

        elif cut_type == CutType.VERTICAL_RIP:
            # X axis vertical slice along length / fence setting
            cut_x = round((trim_x + step.position_in) * 16.0) / 16.0
            if cut_x > block.nominal_length:
                raise GCodeGenerationError(
                    f"Step {step_num}: Cut X={cut_x:.4f}\" exceeds block length {block.nominal_length:.4f}\"."
                )
            add_line(f"( Action: Vertical rip cut along length at X={dialect.format_coord(cut_x)}\" )")
            add_line(dialect.rapid(z=safe_z_val))
            add_line(dialect.rapid(x=cut_x, y=0.0))
            add_line(dialect.linear(z=0.0, f=feed))
            add_line(dialect.linear(y=block.nominal_width, f=feed))
            total_cut_length_in += block.nominal_width
            add_line(dialect.rapid(z=safe_z_val))

        elif cut_type == CutType.CROSSCUT:
            # Y axis crosscut across width
            cut_y = round((trim_y + step.position_in) * 16.0) / 16.0
            if cut_y > block.nominal_width:
                raise GCodeGenerationError(
                    f"Step {step_num}: Cut Y={cut_y:.4f}\" exceeds block width {block.nominal_width:.4f}\"."
                )
            add_line(f"( Action: Crosscut perpendicular at Y={dialect.format_coord(cut_y)}\" )")
            add_line(dialect.rapid(z=safe_z_val))
            add_line(dialect.rapid(x=0.0, y=cut_y))
            add_line(dialect.linear(z=0.0, f=feed))
            add_line(dialect.linear(x=block.nominal_length, f=feed))
            total_cut_length_in += block.nominal_length
            add_line(dialect.rapid(z=safe_z_val))

        elif cut_type == CutType.CONTOUR:
            # 2D/3D Contour toolpath loop for Waterjet / Wire / Router
            target_part = parts_map.get(step.target_part_id) if step.target_part_id else None
            half_kerf = machine.kerf / 2.0

            if target_part:
                px = round((trim_x + target_part.x - half_kerf) * 16.0) / 16.0
                py = round((trim_y + target_part.y - half_kerf) * 16.0) / 16.0
                pz = round((trim_z + target_part.z) * 16.0) / 16.0
                pl = round((target_part.length + machine.kerf) * 16.0) / 16.0
                pw = round((target_part.width + machine.kerf) * 16.0) / 16.0
                part_name = f"{target_part.sku} ({target_part.length}x{target_part.width}x{target_part.height}\")"
            else:
                tdx, tdy, tdz = step.target_piece_dims
                px = round((trim_x + step.position_in - half_kerf) * 16.0) / 16.0
                py = round(trim_y * 16.0) / 16.0
                pz = round(trim_z * 16.0) / 16.0
                pl = round((tdx + machine.kerf) * 16.0) / 16.0
                pw = round((tdy + machine.kerf) * 16.0) / 16.0
                part_name = f"Contour item ({tdx}x{tdy}\")"

            # Check bounds
            x0 = max(0.0, px)
            y0 = max(0.0, py)
            x1 = min(block.nominal_length, px + pl)
            y1 = min(block.nominal_width, py + pw)

            add_line(f"( Action: Contour cut for {part_name} with toolpath kerf offset )")
            add_line(dialect.rapid(z=safe_z_val))
            add_line(dialect.rapid(x=x0, y=y0))
            add_line(dialect.linear(z=pz, f=feed))
            add_line(dialect.linear(x=x1, y=y0, f=feed))
            add_line(dialect.linear(x=x1, y=y1, f=feed))
            add_line(dialect.linear(x=x0, y=y1, f=feed))
            add_line(dialect.linear(x=x0, y=y0, f=feed))
            perimeter = 2.0 * (pl + pw)
            total_cut_length_in += perimeter
            add_line(dialect.rapid(z=safe_z_val))

        # Remnant offcut retention comment marker
        if step.remnant_prompt_en:
            add_line(f"( {step.remnant_prompt_en} )")

        add_line()

    # Offcut Remnants Accounting Markers
    if block.usable_remnants:
        add_line("( --- Keep-Offcut Usable Remnants --- )")
        for r in block.usable_remnants:
            add_line(
                f"( REMNANT: {r.length:.1f}x{r.width:.1f}x{r.height:.1f} in, "
                f"Grade {r.grade}, Code {r.code}, Store Bay {r.storage_location} placeholder )"
            )
        add_line()

    # --- Program Footer ---
    est_cutting_minutes = round((total_cut_length_in / max(1.0, feed)), 2)
    est_total_minutes = round(est_cutting_minutes * 1.25, 2)  # includes 25% rapid travel allowance

    add_line("( --- Program Termination --- )")
    add_line(dialect.rapid(z=safe_z_val) + " (Retract to safe Z clearance)")
    add_line(dialect.rapid(x=0.0, y=0.0) + " (Return to table work origin)")
    add_line(f"{dialect.program_end} (Program termination and reset)")
    add_line()
    add_line(f"( SUMMARY ESTIMATE: Total Programmed Cuts: {len(block.cuts)} )")
    add_line(f"( SUMMARY ESTIMATE: Total Linear Cut Length: {total_cut_length_in:.1f} inches )")
    add_line(f"( SUMMARY ESTIMATE: Estimated Feed Time: {est_cutting_minutes:.1f} min (estimate) )")
    add_line(f"( SUMMARY ESTIMATE: Estimated Total Cycle Time: {est_total_minutes:.1f} min (estimate) )")

    gcode_content = "\n".join(lines) + "\n"

    # Run path verification checker on generated output
    passed, check_msg, verified_cuts = verify_gcode_path(gcode_content, block, machine)
    if not passed:
        raise GCodeGenerationError(f"G-code verification failed for block {block.block_index}: {check_msg}")

    return GCodeFilePayload(
        block_index=block.block_index,
        stock_id=block.stock_id,
        filename=filename,
        content=gcode_content,
        line_count=len(lines),
        cut_count=len(block.cuts),
        estimated_cut_length_in=round(total_cut_length_in, 2),
        estimated_time_minutes=est_total_minutes,
        path_check_passed=passed,
        path_check_message=check_msg
    )


def generate_job_gcode(
    result: OptimizationResult,
    machine: Optional[MachineProfile] = None,
    job_name: Optional[str] = None,
    customer_ref: Optional[str] = None,
    allow_unplaced_export: bool = False,
    timestamp: Optional[datetime] = None
) -> GCodeExportResponse:
    """
    Generates G-code files and metadata for all blocks in an OptimizationResult.
    """
    target_machine = machine or result.machine
    if not target_machine.gcode_supported:
        raise GCodeGenerationError(
            f"Machine '{target_machine.name}' is manual and does not support G-code export."
        )

    # Check unplaced parts condition
    if len(result.unplaced_parts) > 0 and not allow_unplaced_export:
        raise GCodeGenerationError(
            f"Job has {len(result.unplaced_parts)} unplaced parts. "
            f"Confirmation required to export placed parts only."
        )

    files: List[GCodeFilePayload] = []
    total_cuts = 0
    all_passed = True
    job_display_name = job_name or f"Job #{result.job_id}"

    for blk in result.blocks:
        payload = generate_block_gcode(
            job_id=result.job_id,
            job_name=job_display_name,
            customer_ref=customer_ref,
            grade=result.grade,
            algorithm_name=result.algorithm_name,
            block=blk,
            machine=target_machine,
            total_blocks_count=len(result.blocks),
            timestamp=timestamp
        )
        files.append(payload)
        total_cuts += payload.cut_count
        if not payload.path_check_passed:
            all_passed = False

    return GCodeExportResponse(
        job_id=result.job_id,
        machine_id=target_machine.id,
        machine_name=target_machine.name,
        dialect=target_machine.gcode_dialect,
        warning_banner=SAFETY_DEMO_TEXT,
        files=files,
        total_cuts=total_cuts,
        all_passed=all_passed,
        timestamp=_format_timestamp_iso(timestamp)
    )
