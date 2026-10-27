"""
Unit and integration tests for G-code generation, dialect formatting, physical bounds checking,
and safety disclaimer enforcement.
"""

import pytest
from datetime import datetime, timezone

from app.domain.models import (
    OptimizationRequest,
    OptimizationResult,
    BlockLayout,
    PlacedPart,
    CutStep,
    CutType,
    MachineProfile,
    MachineCutType,
    MachineAutomation,
    RemnantOutput,
    ValidationResult
)
from app.engine.gcode import (
    generate_block_gcode,
    generate_job_gcode,
    verify_gcode_path,
    GCodeGenerationError,
    get_dialect
)
from app.engine.gcode.path_check import SAFETY_DEMO_TEXT


@pytest.fixture
def cnc_guillotine_machine() -> MachineProfile:
    return MachineProfile(
        id="saw-g2",
        name="Saw Station 2 — Vertical Slicer",
        cut_type=MachineCutType.GUILLOTINE,
        max_cut_height=52.0,
        kerf=0.125,
        automation=MachineAutomation.ROTATING,
        preferred_direction="Z",
        hourly_rate=50.0,
        feed_rate_ipm=90.0,
        rapid_rate_ipm=300.0,
        safe_z=2.0,
        origin="block_corner_front_left_bottom",
        gcode_supported=True,
        gcode_dialect="generic_rs274",
        units="inches",
        support_level="fully_supported"
    )


@pytest.fixture
def manual_guillotine_machine() -> MachineProfile:
    return MachineProfile(
        id="saw-vert-man",
        name="Vertical Band Saw (Manual)",
        cut_type=MachineCutType.GUILLOTINE,
        max_cut_height=40.0,
        kerf=0.125,
        automation=MachineAutomation.MANUAL,
        preferred_direction="Z",
        hourly_rate=40.0,
        feed_rate_ipm=50.0,
        rapid_rate_ipm=0.0,
        safe_z=0.0,
        origin="block_corner_front_left_bottom",
        gcode_supported=False,
        gcode_dialect="generic_rs274",
        units="inches",
        support_level="basic_heuristic"
    )


@pytest.fixture
def waterjet_machine() -> MachineProfile:
    return MachineProfile(
        id="saw-wj",
        name="Saw Station 3 — Waterjet Profiler (CNC Contour)",
        cut_type=MachineCutType.FREE,
        max_cut_height=36.0,
        kerf=0.0625,
        automation=MachineAutomation.CNC,
        preferred_direction="X",
        hourly_rate=95.0,
        feed_rate_ipm=45.0,
        rapid_rate_ipm=250.0,
        safe_z=1.5,
        origin="block_corner_front_left_bottom",
        gcode_supported=True,
        gcode_dialect="generic_rs274",
        units="inches",
        support_level="fully_supported"
    )


@pytest.fixture
def sample_block() -> BlockLayout:
    cuts = [
        CutStep(
            step_number=1,
            stage=0,
            cut_type=CutType.SKIN_TRIM,
            axis="Z",
            position_in=1.0,
            position_display='1"',
            kerf_in=0.125,
            target_piece_dims=(108.0, 82.0, 40.0),
            produces_description_en="Trim hard skin from raw bun faces.",
            produces_description_es="Retirar corteza de las caras del bloque."
        ),
        CutStep(
            step_number=2,
            stage=1,
            cut_type=CutType.HORIZONTAL_SLAB,
            axis="Z",
            position_in=6.0,
            position_display='6"',
            kerf_in=0.125,
            target_piece_dims=(106.0, 80.0, 6.0),
            produces_description_en="Horizontal slab cut at height 6.00 in.",
            produces_description_es="Corte horizontal a 6.00 in de altura."
        ),
        CutStep(
            step_number=3,
            stage=2,
            cut_type=CutType.VERTICAL_RIP,
            axis="X",
            position_in=24.0,
            position_display='24"',
            kerf_in=0.125,
            target_piece_dims=(24.0, 80.0, 6.0),
            produces_description_en="Vertical rip cut along length.",
            produces_description_es="Corte longitudinal."
        ),
        CutStep(
            step_number=4,
            stage=3,
            cut_type=CutType.CROSSCUT,
            axis="Y",
            position_in=24.0,
            position_display='24"',
            kerf_in=0.125,
            target_piece_dims=(24.0, 24.0, 6.0),
            produces_description_en="Crosscut producing Cushion A finished piece.",
            produces_description_es="Corte transversal terminado Cushion A."
        )
    ]

    parts = [
        PlacedPart(
            part_id="p-1",
            sku="Cushion A",
            name="Sofa Cushion A",
            grade="HR-40",
            x=0.0,
            y=0.0,
            z=0.0,
            length=24.0,
            width=24.0,
            height=6.0,
            orientation_used=(24.0, 24.0, 6.0),
            color_hex="#ef4444"
        )
    ]

    remnants = [
        RemnantOutput(
            id="rem-1",
            code="REM-HR40-01",
            x=24.0,
            y=24.0,
            z=0.0,
            length=30.0,
            width=40.0,
            height=20.0,
            grade="HR-40",
            volume=24000.0,
            usability_score=0.85,
            retained=True,
            storage_location="Bay R-12"
        )
    ]

    return BlockLayout(
        block_index=1,
        stock_id="bun-hr40-01",
        stock_type="bun",
        grade="HR-40",
        nominal_length=108.0,
        nominal_width=82.0,
        nominal_height=40.0,
        usable_length=106.0,
        usable_width=80.0,
        usable_height=38.0,
        skin_trim_loss_volume=29248.0,
        placed_parts=parts,
        usable_remnants=remnants,
        cuts=cuts,
        gross_volume=354240.0,
        usable_volume=322240.0,
        parts_volume=3456.0,
        kerf_loss_volume=1200.0,
        unrecoverable_scrap_volume=293584.0,
        gross_utilization_pct=1.0,
        net_utilization_pct=1.1,
        material_recovery_pct=7.8
    )


def test_gcode_header_warning_always_present(cnc_guillotine_machine, sample_block):
    payload = generate_block_gcode(
        job_id="JOB-4821",
        job_name="Sample job #4821",
        customer_ref="Acme Upholstery",
        grade="HR-40",
        algorithm_name="3D OR-Tools Block Assignment Solver",
        block=sample_block,
        machine=cnc_guillotine_machine
    )
    assert SAFETY_DEMO_TEXT in payload.content
    assert "DEMO OUTPUT: NOT VALIDATED ON A REAL MACHINE" in payload.content
    assert "REVIEW AND DRY-RUN BEFORE USE" in payload.content
    assert payload.path_check_passed is True


def test_gcode_deterministic_output(cnc_guillotine_machine, sample_block):
    fixed_time = datetime(2026, 10, 27, 10, 0, 0, tzinfo=timezone.utc)
    out1 = generate_block_gcode(
        job_id="JOB-4821",
        job_name="Sample job #4821",
        customer_ref="Acme",
        grade="HR-40",
        algorithm_name="Test Algo",
        block=sample_block,
        machine=cnc_guillotine_machine,
        timestamp=fixed_time
    )
    out2 = generate_block_gcode(
        job_id="JOB-4821",
        job_name="Sample job #4821",
        customer_ref="Acme",
        grade="HR-40",
        algorithm_name="Test Algo",
        block=sample_block,
        machine=cnc_guillotine_machine,
        timestamp=fixed_time
    )
    assert out1.content == out2.content
    assert out1.filename == out2.filename
    assert out1.cut_count == 4
    assert out1.estimated_cut_length_in == out2.estimated_cut_length_in


def test_gcode_setup_and_program_end(cnc_guillotine_machine, sample_block):
    payload = generate_block_gcode(
        job_id="JOB-4821",
        job_name="Sample job #4821",
        customer_ref=None,
        grade="HR-40",
        algorithm_name="Test",
        block=sample_block,
        machine=cnc_guillotine_machine
    )
    content = payload.content
    assert "G20" in content   # Inches
    assert "G90" in content   # Absolute distance
    assert "G17" in content   # Plane selection
    assert "G94" in content   # Feed rate mode
    assert "M30" in content   # Program termination
    assert "REMNANT: 30.0x40.0x20.0 in" in content


def test_gcode_coordinates_within_bounds(cnc_guillotine_machine, sample_block):
    payload = generate_block_gcode(
        job_id="JOB-4821",
        job_name="Sample job",
        customer_ref=None,
        grade="HR-40",
        algorithm_name="Test",
        block=sample_block,
        machine=cnc_guillotine_machine
    )
    assert payload.path_check_passed is True
    # Verify cut count matches exactly
    assert payload.cut_count == len(sample_block.cuts)


def test_gcode_manual_machine_rejected(manual_guillotine_machine, sample_block):
    with pytest.raises(GCodeGenerationError) as exc_info:
        generate_block_gcode(
            job_id="JOB-4821",
            job_name="Sample job",
            customer_ref=None,
            grade="HR-40",
            algorithm_name="Test",
            block=sample_block,
            machine=manual_guillotine_machine
        )
    assert "manual or non-automated" in str(exc_info.value)


def test_gcode_throat_clearance_violation(cnc_guillotine_machine, sample_block):
    tall_machine = MachineProfile(
        id="saw-small-throat",
        name="Small Throat Guillotine",
        cut_type=MachineCutType.GUILLOTINE,
        max_cut_height=30.0,  # Block is 40.0" tall
        kerf=0.125,
        automation=MachineAutomation.CNC,
        feed_rate_ipm=90.0,
        gcode_supported=True
    )
    with pytest.raises(GCodeGenerationError) as exc_info:
        generate_block_gcode(
            job_id="JOB-4821",
            job_name="Sample job",
            customer_ref=None,
            grade="HR-40",
            algorithm_name="Test",
            block=sample_block,
            machine=tall_machine
        )
    assert "exceeds machine throat clearance limit" in str(exc_info.value)


def test_gcode_path_check_detects_tampered_coordinates(cnc_guillotine_machine, sample_block):
    payload = generate_block_gcode(
        job_id="JOB-4821",
        job_name="Sample job",
        customer_ref=None,
        grade="HR-40",
        algorithm_name="Test",
        block=sample_block,
        machine=cnc_guillotine_machine
    )
    # Valid output passes
    passed, msg, count = verify_gcode_path(payload.content, sample_block, cnc_guillotine_machine)
    assert passed is True

    # Tamper with coordinate to place it far beyond block bounds (X=999.0000)
    tampered_content = payload.content.replace("X108.0000", "X999.0000")
    passed_t, msg_t, _ = verify_gcode_path(tampered_content, sample_block, cnc_guillotine_machine)
    assert passed_t is False
    assert "exceeds nominal block length" in msg_t

    # Tamper by removing safety header
    no_header_content = payload.content.replace(SAFETY_DEMO_TEXT, "REMOVED")
    passed_nh, msg_nh, _ = verify_gcode_path(no_header_content, sample_block, cnc_guillotine_machine)
    assert passed_nh is False
    assert "Mandatory DEMO output disclaimer missing" in msg_nh

    # Tamper by removing M30
    no_m30_content = payload.content.replace("M30", "G04 P100")
    passed_nm, msg_nm, _ = verify_gcode_path(no_m30_content, sample_block, cnc_guillotine_machine)
    assert passed_nm is False
    assert "M30 termination code missing" in msg_nm


def test_gcode_contour_kerf_offset(waterjet_machine):
    # Contour cut on waterjet
    contour_step = CutStep(
        step_number=1,
        stage=4,
        cut_type=CutType.CONTOUR,
        axis="Z",
        position_in=0.0,
        position_display="(0,0,0)",
        kerf_in=0.0625,
        target_piece_dims=(20.0, 10.0, 4.0),
        produces_description_en="Contour test part",
        produces_description_es="Pieza contorno prueba",
        target_part_id="part-c1"
    )

    part = PlacedPart(
        part_id="part-c1",
        sku="Contour Part 1",
        name="Contour Part",
        grade="HR-40",
        x=5.0,
        y=5.0,
        z=0.0,
        length=20.0,
        width=10.0,
        height=4.0,
        orientation_used=(20.0, 10.0, 4.0),
        color_hex="#3b82f6"
    )

    block = BlockLayout(
        block_index=1,
        stock_id="bun-wj-01",
        stock_type="bun",
        grade="HR-40",
        nominal_length=60.0,
        nominal_width=60.0,
        nominal_height=30.0,
        usable_length=58.0,
        usable_width=58.0,
        usable_height=28.0,
        skin_trim_loss_volume=5000.0,
        placed_parts=[part],
        usable_remnants=[],
        cuts=[contour_step],
        gross_volume=108000.0,
        usable_volume=94080.0,
        parts_volume=800.0,
        kerf_loss_volume=100.0,
        unrecoverable_scrap_volume=93180.0,
        gross_utilization_pct=0.74,
        net_utilization_pct=0.85,
        material_recovery_pct=0.74
    )

    payload = generate_block_gcode(
        job_id="JOB-WJ-1",
        job_name="Waterjet Job",
        customer_ref=None,
        grade="HR-40",
        algorithm_name="3D Free Contour Nesting",
        block=block,
        machine=waterjet_machine
    )
    assert payload.path_check_passed is True
    # The toolpath should traverse a rectangle with tool kerf offset
    assert "Action: Contour cut for Contour Part 1" in payload.content
    assert payload.cut_count == 1
