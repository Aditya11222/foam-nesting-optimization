import type { CutStep, RemnantOutput } from '../types';
import { formatFraction16th } from './units';

export interface RawCut {
  axis: 'X' | 'Y' | 'Z';
  coord: number;
  kerf: number;
  piece_dims: [number, number, number];
  part_name?: string;
  remnant_info?: RemnantOutput;
}

export function generateOperatorCutSequence(
  nominalDims: [number, number, number],
  usableDims: [number, number, number],
  rawCuts: RawCut[],
  _remnants: RemnantOutput[],
  kerf: number
): CutStep[] {
  const steps: CutStep[] = [];
  let stepNum = 1;

  const [nx, ny, nz] = nominalDims;
  const [ux, uy, uz] = usableDims;

  // Step 1: Initial Skin Trim (if skin trim was applied)
  const trimX = (nx - ux) / 2.0;
  const trimY = (ny - uy) / 2.0;
  const trimZ = (nz - uz) / 2.0;

  if (trimX > 0 || trimY > 0 || trimZ > 0) {
    steps.push({
      step_number: stepNum,
      stage: 0,
      cut_type: 'skin_trim',
      axis: 'Z',
      position_in: trimZ,
      position_display: formatFraction16th(trimZ),
      kerf_in: kerf,
      target_piece_dims: [nx, ny, nz],
      produces_description_en: `Trim hard skin (~${formatFraction16th(trimZ)} per face) from all 6 faces of raw bun. Usable block: ${ux}" × ${uy}" × ${uz}".`,
      produces_description_es: `Retirar corteza (~${formatFraction16th(trimZ)} por cara) de las 6 caras del bloque. Bloque útil: ${ux}" × ${uy}" × ${uz}".`,
    });
    stepNum++;
  }

  // Sort cuts logically by Stage: Z cuts first (Stage 1), then X cuts (Stage 2), then Y cuts (Stage 3)
  const stageOrder: Record<string, number> = { Z: 1, X: 2, Y: 3 };
  const sortedRawCuts = [...rawCuts].sort((a, b) => {
    const sA = stageOrder[a.axis] || 9;
    const sB = stageOrder[b.axis] || 9;
    if (sA !== sB) return sA - sB;
    return a.coord - b.coord;
  });

  for (const c of sortedRawCuts) {
    const axis = c.axis;
    const coord = c.coord;
    const [tdx, tdy, tdz] = c.piece_dims;
    const cutK = c.kerf || kerf;
    const partName = c.part_name || '';
    const remnant = c.remnant_info;

    let stage = 1;
    let cutType: 'horizontal_slab' | 'vertical_rip' | 'crosscut' = 'horizontal_slab';
    let posDisp = formatFraction16th(coord);
    let descEn = '';
    let descEs = '';

    if (axis === 'Z') {
      stage = 1;
      cutType = 'horizontal_slab';
      descEn = `Horizontal slab cut at height ${posDisp} from table base. Feed lengthwise along X.`;
      descEs = `Corte horizontal (lámina) a ${posDisp} de altura desde la base. Alimentación en X.`;
    } else if (axis === 'X') {
      stage = 2;
      cutType = 'vertical_rip';
      descEn = `Vertical rip cut along length at fence setting ${posDisp}. Cut widthwise along Y.`;
      descEs = `Corte longitudinal (tira) con guía en ${posDisp}. Corte en ancho Y.`;
    } else {
      stage = 3;
      cutType = 'crosscut';
      descEn = `Crosscut perpendicular at ${posDisp}. Produces finished part ${partName || 'unit'}.`;
      descEs = `Corte transversal a ${posDisp}. Produce pieza terminada ${partName || 'unidad'}.`;
    }

    let remEn: string | undefined;
    let remEs: string | undefined;
    if (remnant) {
      remEn = `⚠ Keep offcut: Retain as usable remnant ${remnant.length}"×${remnant.width}"×${remnant.height}" — Tag & store in ${remnant.storage_location}.`;
      remEs = `⚠ Guardar remanente: Guardar como remanente ${remnant.length}"×${remnant.width}"×${remnant.height}" — Etiquetar y almacenar en ${remnant.storage_location}.`;
    }

    steps.push({
      step_number: stepNum,
      stage,
      cut_type: cutType,
      axis,
      position_in: Math.round(coord * 10000) / 10000,
      position_display: posDisp,
      kerf_in: Math.round(cutK * 10000) / 10000,
      target_piece_dims: [Math.round(tdx * 100) / 100, Math.round(tdy * 100) / 100, Math.round(tdz * 100) / 100],
      produces_description_en: descEn,
      produces_description_es: descEs,
      remnant_prompt_en: remEn,
      remnant_prompt_es: remEs,
    });
    stepNum++;
  }

  return steps;
}
