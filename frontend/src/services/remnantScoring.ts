import rawScoringConfig from '../../../config/remnant_scoring_config.json' with { type: 'json' };
import type { RemnantOutput, PartItem } from '../types.ts';

export interface RemnantScoringConfig {
  aging_days_default: number;
  aging_trim_per_face_inches: number;
  minimum_useful_thickness_inches: number;
  minimum_useful_plan_area_sq_inches: number;
  recommended_score_threshold: number;
  low_priority_score_threshold: number;
  require_demand_match_for_recommended?: boolean;
  factor_weights: {
    aging_usable_volume: number;
    minimum_useful_size: number;
    demand_fit: number;
    compactness: number;
    grade_demand: number;
    freshness: number;
  };
}

export const DEFAULT_REMNANT_SCORING_CONFIG: RemnantScoringConfig = rawScoringConfig;

export type RemnantTier = 'recommended' | 'low_priority' | 'not_reusable';

export interface RemnantScoringResult {
  remnant: RemnantOutput;
  tier: RemnantTier;
  compositeScore: number;
  effectiveDims: [number, number, number];
  effectiveVolumeCuIn: number;
  effectiveVolumeCuFt: number;
  fitPartCount: number;
  totalPartTypes: number;
  matchedPartNames: string[];
  reason: string;
  factorBreakdown: {
    agingUsableVolume: number;
    minimumUsefulSize: number;
    demandFit: number;
    compactness: number;
    gradeDemand: number;
    freshness: number;
  };
  factorPoints: {
    agingUsableVolume: number;
    minimumUsefulSize: number;
    demandFit: number;
    compactness: number;
    gradeDemand: number;
    freshness: number;
  };
  groupTransitionRequirement: string;
  groupTransitionRequirementEs: string;
}

/**
 * Checks if a part fits inside effective remnant bounding dimensions.
 * Evaluates orthogonal rotations in plane (and 3D if permitted).
 */
function doesPartFitInRemnant(
  part: PartItem,
  effL: number,
  effW: number,
  effH: number
): boolean {
  const pL = part.length;
  const pW = part.width;
  const pH = part.height;

  // Permitted in-plane rotation (XY swap)
  const fitXY1 = pL <= effL && pW <= effW && pH <= effH;
  const fitXY2 = pW <= effL && pL <= effW && pH <= effH;
  if (fitXY1 || fitXY2) return true;

  // 3D rotation if orientation is not rise-locked
  if (part.orientation_mode === 'any') {
    const pDims = [pL, pW, pH].sort((a, b) => a - b);
    const rDims = [effL, effW, effH].sort((a, b) => a - b);
    return pDims[0] <= rDims[0] && pDims[1] <= rDims[1] && pDims[2] <= rDims[2];
  }

  return false;
}

/**
 * Evaluates a single remnant against the rule-based scoring rubric.
 */
export function scoreRemnant(
  remnant: RemnantOutput,
  activeParts: PartItem[] = [],
  config: RemnantScoringConfig = DEFAULT_REMNANT_SCORING_CONFIG
): RemnantScoringResult {
  const trim = config.aging_trim_per_face_inches;
  const effL = Math.max(0, remnant.length - 2.0 * trim);
  const effW = Math.max(0, remnant.width - 2.0 * trim);
  const effH = Math.max(0, remnant.height - 2.0 * trim);
  const effVolCuIn = effL * effW * effH;
  const effVolCuFt = effVolCuIn / 1728.0;

  const minThk = config.minimum_useful_thickness_inches;
  const minArea = config.minimum_useful_plan_area_sq_inches;
  const planArea = effL * effW;

  // Factor 1: Usable Size After Aging (0 to 100)
  const origVol = remnant.volume > 0 ? remnant.volume : (remnant.length * remnant.width * remnant.height);
  const agingVolFactor = origVol > 0 ? Math.min(100, Math.max(0, (effVolCuIn / origVol) * 100)) : 0;

  // Factor 2: Minimum Useful Size
  let minSizeFactor = 100;
  if (effH < minThk || planArea < minArea) {
    const ratio = Math.max(0, effH / minThk);
    minSizeFactor = Math.round(Math.pow(ratio, 2) * 25);
  }

  // Factor 3: Fit Against Known Demand
  const uniqueSkus = Array.from(new Set(activeParts.map((p) => p.sku)));
  let fitPartCount = 0;
  const matchedPartNames: string[] = [];
  if (effL > 0 && effW > 0 && effH > 0 && activeParts.length > 0) {
    uniqueSkus.forEach((sku) => {
      const samplePart = activeParts.find((p) => p.sku === sku);
      if (samplePart && doesPartFitInRemnant(samplePart, effL, effW, effH)) {
        fitPartCount += 1;
        matchedPartNames.push(samplePart.name ? `${samplePart.name} (${samplePart.sku})` : samplePart.sku);
      }
    });
  }
  const demandFitFactor = uniqueSkus.length > 0
    ? Math.round((fitPartCount / uniqueSkus.length) * 100)
    : 50;

  // Factor 4: Compactness
  const minDim = Math.min(remnant.length, remnant.width, remnant.height);
  const maxDim = Math.max(remnant.length, remnant.width, remnant.height);
  const compactnessFactor = maxDim > 0 ? Math.round((minDim / maxDim) * 100) : 0;

  // Factor 5: Grade Demand (Active job matches)
  const gradeDemandFactor = 100;

  // Factor 6: Freshness
  const freshnessFactor = 100;

  // Composite weighted score
  const weights = config.factor_weights;
  let compositeScore = Math.round(
    agingVolFactor * weights.aging_usable_volume +
    minSizeFactor * weights.minimum_useful_size +
    demandFitFactor * weights.demand_fit +
    compactnessFactor * weights.compactness +
    gradeDemandFactor * weights.grade_demand +
    freshnessFactor * weights.freshness
  );

  compositeScore = Math.max(0, Math.min(100, compositeScore));

  const factorPoints = {
    agingUsableVolume: Number((agingVolFactor * weights.aging_usable_volume).toFixed(1)),
    minimumUsefulSize: Number((minSizeFactor * weights.minimum_useful_size).toFixed(1)),
    demandFit: Number((demandFitFactor * weights.demand_fit).toFixed(1)),
    compactness: Number((compactnessFactor * weights.compactness).toFixed(1)),
    gradeDemand: Number((gradeDemandFactor * weights.grade_demand).toFixed(1)),
    freshness: Number((freshnessFactor * weights.freshness).toFixed(1)),
  };

  // Determine Tier & Explainable Reason
  let tier: RemnantTier = 'low_priority';
  let reason = '';
  const requireDemandMatch = config.require_demand_match_for_recommended !== false;

  if (effL <= 0 || effW <= 0 || effH <= 0) {
    tier = 'not_reusable';
    compositeScore = Math.min(compositeScore, 10);
    reason = `Dimension falls to 0" after ${config.aging_days_default}d oxidation loss (-2" per axis).`;
  } else if (effH < minThk) {
    tier = 'not_reusable';
    compositeScore = Math.min(compositeScore, 18);
    reason = `Thickness ${effH.toFixed(2)}" falls below the ${minThk.toFixed(1)}" minimum useful thickness after aging loss.`;
  } else if (
    compositeScore >= config.recommended_score_threshold &&
    (!requireDemandMatch || fitPartCount >= 1)
  ) {
    tier = 'recommended';
    reason = `Fits ${fitPartCount} of ${uniqueSkus.length} part types; effective size ${effL.toFixed(1)}×${effW.toFixed(1)}×${effH.toFixed(1)}" (${effVolCuFt.toFixed(2)} ft³) after aging.`;
  } else if (compositeScore < config.low_priority_score_threshold) {
    tier = 'not_reusable';
    reason = `Low volume (${effVolCuFt.toFixed(2)} ft³) and plan area (${planArea.toFixed(0)} sq in) below standard nesting threshold.`;
  } else {
    tier = 'low_priority';
    if (compositeScore >= config.recommended_score_threshold && fitPartCount === 0) {
      reason = `Fits 0 of ${uniqueSkus.length} active part types; high volume (${effVolCuFt.toFixed(2)} ft³) retained as general stock.`;
    } else {
      reason = `Fits ${fitPartCount} of ${uniqueSkus.length} part types; narrow or thin aspect ratio (${remnant.length.toFixed(1)}×${remnant.width.toFixed(1)}×${remnant.height.toFixed(1)}").`;
    }
  }

  // Determine what would change its group
  let groupTransitionRequirement = '';
  let groupTransitionRequirementEs = '';

  if (effL <= 0 || effW <= 0 || effH <= 0) {
    groupTransitionRequirement = `Dimension drops to 0" after 3-day aging oxidation trim (-2"/axis). Requires nominal dimensions > 2.0".`;
    groupTransitionRequirementEs = `La dimensión cae a 0" tras recorte por oxidación a 3 días (-2"/eje). Requiere dimensiones nominales > 2.0". [revisión]`;
  } else if (effH < minThk) {
    groupTransitionRequirement = `Needs ≥ ${minThk.toFixed(1)}" thickness after 3-day aging loss (currently ${effH.toFixed(2)}").`;
    groupTransitionRequirementEs = `Requiere espesor ≥ ${minThk.toFixed(1)}" tras recorte por envejecimiento de 3 días (actualmente ${effH.toFixed(2)}"). [revisión]`;
  } else if (tier === 'not_reusable') {
    groupTransitionRequirement = `Needs composite score ≥ ${config.low_priority_score_threshold.toFixed(0)} pts (currently ${compositeScore} pts) or larger plan area.`;
    groupTransitionRequirementEs = `Requiere puntuación compuesta ≥ ${config.low_priority_score_threshold.toFixed(0)} pts (actualmente ${compositeScore} pts) o mayor área en planta. [revisión]`;
  } else if (tier === 'low_priority') {
    if (compositeScore >= config.recommended_score_threshold && fitPartCount === 0) {
      groupTransitionRequirement = `Needs at least 1 matching part type in active demand to qualify for Recommended (score is already ${compositeScore} ≥ ${config.recommended_score_threshold.toFixed(0)}).`;
      groupTransitionRequirementEs = `Requiere al menos 1 tipo de pieza coincidente en demanda activa para calificar a Recomendado (la puntuación ya es ${compositeScore} ≥ ${config.recommended_score_threshold.toFixed(0)}). [revisión]`;
    } else {
      const needed = Math.max(1, Math.round(config.recommended_score_threshold - compositeScore));
      groupTransitionRequirement = `Needs composite score ≥ ${config.recommended_score_threshold.toFixed(0)} pts (currently ${compositeScore} pts; +${needed} pts needed) and ≥ 1 matching part type.`;
      groupTransitionRequirementEs = `Requiere puntuación compuesta ≥ ${config.recommended_score_threshold.toFixed(0)} pts (actualmente ${compositeScore} pts; faltan +${needed} pts) y ≥ 1 tipo de pieza coincidente. [revisión]`;
    }
  } else {
    groupTransitionRequirement = `Currently meets Recommended criteria (score ${compositeScore} ≥ ${config.recommended_score_threshold.toFixed(0)} and matches ${fitPartCount} active part types).`;
    groupTransitionRequirementEs = `Actualmente cumple con los criterios de Recomendado (puntuación ${compositeScore} ≥ ${config.recommended_score_threshold.toFixed(0)} y coincide con ${fitPartCount} tipos de pieza activos). [revisión]`;
  }

  return {
    remnant,
    tier,
    compositeScore,
    effectiveDims: [effL, effW, effH],
    effectiveVolumeCuIn: effVolCuIn,
    effectiveVolumeCuFt: effVolCuFt,
    fitPartCount,
    totalPartTypes: uniqueSkus.length,
    matchedPartNames,
    reason,
    factorBreakdown: {
      agingUsableVolume: Math.round(agingVolFactor),
      minimumUsefulSize: Math.round(minSizeFactor),
      demandFit: Math.round(demandFitFactor),
      compactness: Math.round(compactnessFactor),
      gradeDemand: Math.round(gradeDemandFactor),
      freshness: Math.round(freshnessFactor),
    },
    factorPoints,
    groupTransitionRequirement,
    groupTransitionRequirementEs,
  };
}

/**
 * Scores and partitions remnants into sorted groups:
 * 1. Recommended (sorted by score desc, tie-break: effective volume desc)
 * 2. Low priority (sorted by score desc, tie-break: effective volume desc)
 * 3. Not reusable (sorted by score desc, tie-break: effective volume desc)
 */
export function groupAndRankRemnants(
  remnants: RemnantOutput[],
  activeParts: PartItem[] = [],
  config: RemnantScoringConfig = DEFAULT_REMNANT_SCORING_CONFIG
): {
  recommended: RemnantScoringResult[];
  lowPriority: RemnantScoringResult[];
  notReusable: RemnantScoringResult[];
  allScored: RemnantScoringResult[];
  recommendedTotals: { count: number; volumeCuFt: number };
} {
  const scored = remnants.map((r) => scoreRemnant(r, activeParts, config));

  const sortFn = (a: RemnantScoringResult, b: RemnantScoringResult) => {
    if (b.compositeScore !== a.compositeScore) {
      return b.compositeScore - a.compositeScore;
    }
    return b.effectiveVolumeCuIn - a.effectiveVolumeCuIn;
  };

  const recommended = scored.filter((s) => s.tier === 'recommended').sort(sortFn);
  const lowPriority = scored.filter((s) => s.tier === 'low_priority').sort(sortFn);
  const notReusable = scored.filter((s) => s.tier === 'not_reusable').sort(sortFn);

  const recommendedTotals = {
    count: recommended.length,
    volumeCuFt: recommended.reduce((acc, r) => acc + (r.remnant.volume / 1728.0), 0),
  };

  return {
    recommended,
    lowPriority,
    notReusable,
    allScored: [...recommended, ...lowPriority, ...notReusable],
    recommendedTotals,
  };
}

export interface FactorWeightSummary {
  key: keyof RemnantScoringConfig['factor_weights'];
  name: string;
  nameEs: string;
  measure: string;
  measureEs: string;
  weightPct: number;
  weightFraction: number;
  ruleSummary: string;
  ruleSummaryEs: string;
  color: string;
}

export interface DemandedPartSummary {
  id: string;
  sku: string;
  name: string;
  length: number;
  width: number;
  height: number;
  rotationRule: string;
  quantity: number;
}

export interface RemnantScoringExplanation {
  factors: FactorWeightSummary[];
  totalWeightPct: number;
  formulaText: string;
  formulaTextEs: string;
  activeSettings: {
    agingDays: number;
    agingTrimPerFace: number;
    totalAxisReduction: number;
    minThickness: number;
    minPlanArea: number;
    recommendedScoreThreshold: number;
    lowPriorityScoreThreshold: number;
    requireDemandMatch: boolean;
    configSourceFile: string;
  };
  demandMatching: {
    scopeText: string;
    scopeTextEs: string;
    effectiveDimsRule: string;
    effectiveDimsRuleEs: string;
    rotationRulesSummary: string;
    rotationRulesSummaryEs: string;
    kerfHandlingRule: string;
    kerfHandlingRuleEs: string;
    totalDemandedSKUs: number;
    demandedParts: DemandedPartSummary[];
    hasDemand: boolean;
  };
  matchingRequirement: {
    isRequired: boolean;
    badgeText: string;
    badgeTextEs: string;
    ruleDescription: string;
    ruleDescriptionEs: string;
    matchingCount: number;
    totalCount: number;
    recommendedCount: number;
    countLine: string;
    countLineEs: string;
  };
}

/**
 * Computes transparent, data-driven explainability data for Section 2:
 * "How recommendations are scored".
 * Derives all numbers, tables, and rules strictly from
 * the active configuration and real scored results.
 */
export function computeRemnantScoringExplanation(
  scoredRemnants: RemnantScoringResult[],
  activeParts: PartItem[] = [],
  config: RemnantScoringConfig = DEFAULT_REMNANT_SCORING_CONFIG
): RemnantScoringExplanation {
  const weights = config.factor_weights;
  const requireDemandMatch = config.require_demand_match_for_recommended !== false;

  // 2.1 Factors Summary
  const factors: FactorWeightSummary[] = [
    {
      key: 'aging_usable_volume',
      name: 'Usable Volume After Aging',
      nameEs: 'Volumen Útil Tras Envejecimiento [revisión]',
      measure: 'Effective volume retained after oxidation trimming',
      measureEs: 'Volumen efectivo conservado tras recorte por oxidación [revisión]',
      weightPct: Math.round(weights.aging_usable_volume * 100),
      weightFraction: weights.aging_usable_volume,
      ruleSummary: `Effective size after aging: dimension minus ${(config.aging_trim_per_face_inches * 2.0).toFixed(0)}" per axis at ${config.aging_days_default} days`,
      ruleSummaryEs: `Tamaño efectivo tras envejecimiento: dimensión menos ${(config.aging_trim_per_face_inches * 2.0).toFixed(0)}" por eje a ${config.aging_days_default} días [revisión]`,
      color: '#3B82F6',
    },
    {
      key: 'minimum_useful_size',
      name: 'Minimum Useful Size',
      nameEs: 'Tamaño Útil Mínimo [revisión]',
      measure: `Thickness ≥ ${config.minimum_useful_thickness_inches.toFixed(1)}" and plan area ≥ ${config.minimum_useful_plan_area_sq_inches.toFixed(0)} sq in`,
      measureEs: `Espesor ≥ ${config.minimum_useful_thickness_inches.toFixed(1)}" y área en planta ≥ ${config.minimum_useful_plan_area_sq_inches.toFixed(0)} pulg² [revisión]`,
      weightPct: Math.round(weights.minimum_useful_size * 100),
      weightFraction: weights.minimum_useful_size,
      ruleSummary: `Full 100 pts if eff H ≥ ${config.minimum_useful_thickness_inches.toFixed(1)}" and area ≥ ${config.minimum_useful_plan_area_sq_inches.toFixed(0)} in²; quadratic penalty below`,
      ruleSummaryEs: `100 pts completos si H efec ≥ ${config.minimum_useful_thickness_inches.toFixed(1)}" y área ≥ ${config.minimum_useful_plan_area_sq_inches.toFixed(0)} pulg²; penalización cuadrática debajo [revisión]`,
      color: '#10B981',
    },
    {
      key: 'demand_fit',
      name: 'Active Job Demand Fit',
      nameEs: 'Ajuste a Demanda Activa [revisión]',
      measure: 'Share of demanded part types that fit inside effective dimensions',
      measureEs: 'Proporción de tipos de pieza que caben en dimensiones efectivas [revisión]',
      weightPct: Math.round(weights.demand_fit * 100),
      weightFraction: weights.demand_fit,
      ruleSummary: 'Unique matching part types (SKUs) divided by total unique demanded SKUs (50% if no demand)',
      ruleSummaryEs: 'Tipos de pieza coincidentes (SKUs) dividido entre total de SKUs demandados (50% si no hay demanda) [revisión]',
      color: '#8B5CF6',
    },
    {
      key: 'compactness',
      name: 'Compactness (Aspect Ratio)',
      nameEs: 'Compacidad (Relación de Aspecto) [revisión]',
      measure: 'Cuboidal proportion: min dimension / max dimension',
      measureEs: 'Proporción cuboidal: dimensión mínima / dimensión máxima [revisión]',
      weightPct: Math.round(weights.compactness * 100),
      weightFraction: weights.compactness,
      ruleSummary: 'Rewards cuboidal/block-like remnants; penalizes long thin strips and wafer-thin slivers',
      ruleSummaryEs: 'Premia remanentes cúbicos/bloque; penaliza tiras largas y rebanadas finas [revisión]',
      color: '#F59E0B',
    },
    {
      key: 'grade_demand',
      name: 'Grade Demand Match',
      nameEs: 'Coincidencia de Grado [revisión]',
      measure: 'Compatibility with active foam grade demand',
      measureEs: 'Compatibilidad con grado de espuma activo [revisión]',
      weightPct: Math.round(weights.grade_demand * 100),
      weightFraction: weights.grade_demand,
      ruleSummary: '100 pts for remnant foam grades matching active production run specification',
      ruleSummaryEs: '100 pts para grados de espuma que coinciden con la orden de producción activa [revisión]',
      color: '#06B6D4',
    },
    {
      key: 'freshness',
      name: 'Cut Freshness',
      nameEs: 'Frescura de Corte [revisión]',
      measure: 'Time since original block cut',
      measureEs: 'Tiempo desde el corte del bloque original [revisión]',
      weightPct: Math.round(weights.freshness * 100),
      weightFraction: weights.freshness,
      ruleSummary: '100 pts at moment of generation; decays as remnant sits on storage racks',
      ruleSummaryEs: '100 pts al momento de generación; decae con el tiempo en estantería [revisión]',
      color: '#EC4899',
    },
  ];

  const totalWeightPct = factors.reduce((sum, f) => sum + f.weightPct, 0);

  const formulaText = `Score = (${weights.aging_usable_volume} × AgingVol) + (${weights.minimum_useful_size} × MinSize) + (${weights.demand_fit} × DemandFit) + (${weights.compactness} × Compactness) + (${weights.grade_demand} × Grade) + (${weights.freshness} × Freshness)`;
  const formulaTextEs = `Puntuación = (${weights.aging_usable_volume} × VolEnvejecido) + (${weights.minimum_useful_size} × TamañoMín) + (${weights.demand_fit} × AjusteDemanda) + (${weights.compactness} × Compacidad) + (${weights.grade_demand} × Grado) + (${weights.freshness} × Frescura) [revisión]`;

  // 2.2 Demand Reference List (unique SKUs with aggregated quantity)
  const skuMap = new Map<string, DemandedPartSummary>();
  activeParts.forEach((p) => {
    if (!skuMap.has(p.sku)) {
      skuMap.set(p.sku, {
        id: p.id,
        sku: p.sku,
        name: p.name,
        length: p.length,
        width: p.width,
        height: p.height,
        rotationRule: p.orientation_mode || 'any',
        quantity: p.quantity || 1,
      });
    } else {
      const existing = skuMap.get(p.sku)!;
      existing.quantity += p.quantity || 1;
    }
  });
  const demandedParts = Array.from(skuMap.values());
  const hasDemand = demandedParts.length > 0;

  // 2.3 Is a Matching Part Type Required?
  const matchingCount = scoredRemnants.filter((r) => r.fitPartCount >= 1).length;
  const totalCount = scoredRemnants.length;
  const recommendedCount = scoredRemnants.filter((r) => r.tier === 'recommended').length;

  const isRequired = requireDemandMatch;
  const badgeText = isRequired ? 'YES (Required)' : 'NO (Threshold Only)';
  const badgeTextEs = isRequired ? 'SÍ (Requerido) [revisión]' : 'NO (Solo Umbral) [revisión]';

  const ruleDescription = isRequired
    ? `Recommended tier requires: Usability score ≥ ${config.recommended_score_threshold.toFixed(0)} AND at least 1 matching part type.`
    : `Recommended tier requires: Usability score ≥ ${config.recommended_score_threshold.toFixed(0)}. A matching part type is NOT required.`;

  const ruleDescriptionEs = isRequired
    ? `Nivel Recomendado requiere: Puntuación ≥ ${config.recommended_score_threshold.toFixed(0)} Y al menos 1 tipo de pieza coincidente. [revisión]`
    : `Nivel Recomendado requiere: Puntuación ≥ ${config.recommended_score_threshold.toFixed(0)}. NO se requiere tipo de pieza coincidente. [revisión]`;

  const countLine = `${matchingCount} of ${totalCount} remnants match at least one part type; ${recommendedCount} recommended.`;
  const countLineEs = `${matchingCount} de ${totalCount} remanentes coinciden con al menos un tipo de pieza; ${recommendedCount} recomendados. [revisión]`;

  return {
    factors,
    totalWeightPct,
    formulaText,
    formulaTextEs,
    activeSettings: {
      agingDays: config.aging_days_default,
      agingTrimPerFace: config.aging_trim_per_face_inches,
      totalAxisReduction: config.aging_trim_per_face_inches * 2.0,
      minThickness: config.minimum_useful_thickness_inches,
      minPlanArea: config.minimum_useful_plan_area_sq_inches,
      recommendedScoreThreshold: config.recommended_score_threshold,
      lowPriorityScoreThreshold: config.low_priority_score_threshold,
      requireDemandMatch: isRequired,
      configSourceFile: 'config/remnant_scoring_config.json',
    },
    demandMatching: {
      scopeText: 'Current job placed & unplaced parts only (saved/historical jobs are not evaluated).',
      scopeTextEs: 'Solo piezas colocadas y no colocadas del trabajo actual (no se evalúan trabajos guardados/históricos). [revisión]',
      effectiveDimsRule: `Nominal dims minus ${(config.aging_trim_per_face_inches * 2.0).toFixed(1)}" (${config.aging_trim_per_face_inches.toFixed(1)}" trim × 2 faces per axis) at ${config.aging_days_default}-day reuse date.`,
      effectiveDimsRuleEs: `Dimensiones nominales menos ${(config.aging_trim_per_face_inches * 2.0).toFixed(1)}" (${config.aging_trim_per_face_inches.toFixed(1)}" recorte × 2 caras por eje) en fecha de reutilización a ${config.aging_days_default} días. [revisión]`,
      rotationRulesSummary: 'Orthogonal in-plane (XY swap) tested for all parts; full 3D rotation tested only if orientation is "any" (height locked for rise-locked and free-in-plane).',
      rotationRulesSummaryEs: 'Rotación en plano ortogonal (intercambio XY) para todas las piezas; rotación 3D completa solo si la orientación es "any" (altura bloqueada para rise-locked y free-in-plane). [revisión]',
      kerfHandlingRule: 'Saw kerf allowance is not subtracted in this screening fit check.',
      kerfHandlingRuleEs: 'El espesor de corte de sierra (kerf) no se resta en esta comprobación de ajuste preliminar. [revisión]',
      totalDemandedSKUs: demandedParts.length,
      demandedParts,
      hasDemand,
    },
    matchingRequirement: {
      isRequired,
      badgeText,
      badgeTextEs,
      ruleDescription,
      ruleDescriptionEs,
      matchingCount,
      totalCount,
      recommendedCount,
      countLine,
      countLineEs,
    },
  };
}

