"""
Saw-Operator Cut Sequencer.
Converts the 3D Guillotine Slicing Tree into an ordered, step-by-step physical cutting sequence
with dimensions in 1/16" format, saw axis/fence instructions, and bilingual EN/ES descriptions.
"""

from typing import List, Tuple, Optional
from ..domain.models import CutStep, CutType, PlacedPart, RemnantOutput
from ..domain.units import format_fraction_16th, snap_to_16th


def generate_operator_cut_sequence(
    nominal_dims: Tuple[float, float, float],
    usable_dims: Tuple[float, float, float],
    raw_cuts: List[dict],
    remnants: List[RemnantOutput],
    kerf: float
) -> List[CutStep]:
    """
    Produces an ordered list of CutStep instructions for shop floor touchscreen display.
    Stages:
      Stage 0: Skin Trim (perimeter removal)
      Stage 1: Primary Horizontal Slices (Z)
      Stage 2: Secondary Rip Cuts (X)
      Stage 3: Crosscuts (Y)
    """
    steps: List[CutStep] = []
    step_num = 1
    nx, ny, nz = nominal_dims
    ux, uy, uz = usable_dims

    # Step 1: Initial Skin Trim (if skin trim was applied)
    trim_x = (nx - ux) / 2.0
    trim_y = (ny - uy) / 2.0
    trim_z = (nz - uz) / 2.0

    if trim_x > 0 or trim_y > 0 or trim_z > 0:
        step = CutStep(
            step_number=step_num,
            stage=0,
            cut_type=CutType.SKIN_TRIM,
            axis="Z",
            position_in=trim_z,
            position_display=format_fraction_16th(trim_z),
            kerf_in=kerf,
            target_piece_dims=(nx, ny, nz),
            produces_description_en=(
                f"Trim hard skin (~{format_fraction_16th(trim_z)} per face) from all 6 faces of raw bun. "
                f"Usable block: {ux}\" × {uy}\" × {uz}\"."
            ),
            produces_description_es=(
                f"Retirar corteza (~{format_fraction_16th(trim_z)} por cara) de las 6 caras del bloque. "
                f"Bloque útil: {ux}\" × {uy}\" × {uz}\"."
            ),
            remnant_prompt_en=None,
            remnant_prompt_es=None
        )
        steps.append(step)
        step_num += 1

    # Sort cuts logically by Stage: Z cuts first (Stage 1), then X cuts (Stage 2), then Y cuts (Stage 3)
    stage_order = {"Z": 1, "X": 2, "Y": 3}
    sorted_raw_cuts = sorted(raw_cuts, key=lambda c: (stage_order.get(c.get("axis", "Z"), 9), c.get("coord", 0.0)))

    for c in sorted_raw_cuts:
        axis = c.get("axis", "Z")
        coord = c.get("coord", 0.0)
        tdx, tdy, tdz = c.get("piece_dims", usable_dims)
        cut_k = c.get("kerf", kerf)
        part_name = c.get("part_name", "")
        remnant_candidate = c.get("remnant_info", None)

        if axis == "Z":
            stage = 1
            cut_type = CutType.HORIZONTAL_SLAB
            pos_disp = format_fraction_16th(coord)
            desc_en = f"Horizontal slab cut at height {pos_disp} from table base. Feed lengthwise along X."
            desc_es = f"Corte horizontal (lámina) a {pos_disp} de altura desde la base. Alimentación en X."
        elif axis == "X":
            stage = 2
            cut_type = CutType.VERTICAL_RIP
            pos_disp = format_fraction_16th(coord)
            desc_en = f"Vertical rip cut along length at fence setting {pos_disp}. Cut widthwise along Y."
            desc_es = f"Corte longitudinal (tira) con guía en {pos_disp}. Corte en ancho Y."
        else:  # Y
            stage = 3
            cut_type = CutType.CROSSCUT
            pos_disp = format_fraction_16th(coord)
            desc_en = f"Crosscut perpendicular at {pos_disp}. Produces finished part {part_name or 'unit'}."
            desc_es = f"Corte transversal a {pos_disp}. Produce pieza terminada {part_name or 'unidad'}."

        rem_en = None
        rem_es = None
        if remnant_candidate:
            rx, ry, rz = remnant_candidate.length, remnant_candidate.width, remnant_candidate.height
            loc = remnant_candidate.storage_location
            rem_en = f"⚠ Keep offcut: Retain as usable remnant {rx}\"×{ry}\"×{rz}\" — Tag & store in {loc}."
            rem_es = f"⚠ Guardar remanente: Guardar como remanente {rx}\"×{ry}\"×{rz}\" — Etiquetar y almacenar en {loc}."

        step = CutStep(
            step_number=step_num,
            stage=stage,
            cut_type=cut_type,
            axis=axis,
            position_in=round(coord, 4),
            position_display=pos_disp,
            kerf_in=round(cut_k, 4),
            target_piece_dims=(round(tdx, 2), round(tdy, 2), round(tdz, 2)),
            produces_description_en=desc_en,
            produces_description_es=desc_es,
            remnant_prompt_en=rem_en,
            remnant_prompt_es=rem_es
        )
        steps.append(step)
        step_num += 1

    return steps
