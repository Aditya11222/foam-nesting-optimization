import type { RemnantAgingStatus } from '../types';
import { snapTo16th } from './units';

export interface RemnantItem {
  id: string;
  code: string;
  grade: string;
  length: number;
  width: number;
  height: number;
  cut_date: string;
  storage_location: string;
  usability_score: number;
}

export function computeEffectiveRemnantDims(
  remnant: RemnantItem,
  evaluationDate: Date = new Date(),
  degradationDaysThreshold: number = 3,
  degradationTrimPerFace: number = 1.0
): RemnantAgingStatus {
  const cutDate = new Date(remnant.cut_date);
  const diffTime = evaluationDate.getTime() - cutDate.getTime();
  const ageDays = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));

  const origL = remnant.length;
  const origW = remnant.width;
  const origH = remnant.height;
  const origVol = origL * origW * origH;

  let isDegraded = false;
  let effL = origL;
  let effW = origW;
  let effH = origH;
  let effVol = origVol;
  let volLossPct = 0.0;
  let score = remnant.usability_score;
  let recEn = '';
  let recEs = '';

  if (ageDays >= degradationDaysThreshold) {
    isDegraded = true;
    effL = Math.max(0.0, origL - 2.0 * degradationTrimPerFace);
    effW = Math.max(0.0, origW - 2.0 * degradationTrimPerFace);
    effH = Math.max(0.0, origH - 2.0 * degradationTrimPerFace);

    if (effL > 0) effL = snapTo16th(effL, 'effective_length');
    if (effW > 0) effW = snapTo16th(effW, 'effective_width');
    if (effH > 0) effH = snapTo16th(effH, 'effective_height');

    effVol = effL * effW * effH;
    volLossPct = origVol > 0 ? ((origVol - effVol) / origVol) * 100 : 0;
    score = Math.max(0.1, Math.round(remnant.usability_score * (effVol / origVol) * 100) / 100);
    recEn = `Aged ${ageDays}d (>=${degradationDaysThreshold}d): Oxidized skin trim (-2"/axis) applied. Prioritize for cutting.`;
    recEs = `Envejecido ${ageDays}d (>=${degradationDaysThreshold}d): Corteza oxidada aplicada (-2"/eje). Priorizar para corte.`;
  } else {
    isDegraded = false;
    const daysLeft = degradationDaysThreshold - ageDays;
    recEn = `Fresh remnant (${ageDays}d old). ${daysLeft}d before oxidation skin trim takes effect.`;
    recEs = `Remanente fresco (${ageDays}d). ${daysLeft}d antes de requerir recorte por oxidación.`;
  }

  return {
    remnant_id: remnant.id,
    code: remnant.code,
    grade: remnant.grade,
    cut_date: remnant.cut_date,
    evaluation_date: evaluationDate.toISOString().split('T')[0],
    age_days: ageDays,
    is_degraded: isDegraded,
    degradation_days_threshold: degradationDaysThreshold,
    original_dims: [origL, origW, origH],
    effective_dims: [effL, effW, effH],
    original_volume: origVol,
    effective_volume: effVol,
    volume_loss_pct: Math.round(volLossPct * 10) / 10,
    usability_score: score,
    storage_location: remnant.storage_location,
    recommendation_en: recEn,
    recommendation_es: recEs,
  };
}
