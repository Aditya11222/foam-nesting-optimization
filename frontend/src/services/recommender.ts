/**
 * Tatras NestPro Recommendation Engine
 * Provides rule-based and data-driven recommendations for:
 * 1. Saw Machine Profile (hard constraints, objective scoring, tie-breaking, transparent reasons)
 * 2. Optimization Priority Objective (cost composition, cut volume)
 * 3. Stock Sufficiency and Block Validation (usable interior, 1/16" grid, machine height warnings)
 */

import type {
  MachineProfile,
  BlockInput,
  PartItem,
  OptimizationObjective,
  MachineRecommendationResult,
  ObjectiveRecommendationResult,
  StockSufficiencyResult,
  MachineEvaluation,
  OptimizationResult,
  StrategyRecommendationResult,
  Screen1ValidationResult,
} from '../types';

export const DEFAULT_GRADE_COSTS: Record<string, number> = {
  'HR-40': 4.50,
  'HR-30': 3.80,
  'VE-50': 6.20,
  'CM-28': 2.90,
  'FT-35': 3.40,
};

/**
 * Validates whether a numeric dimension snaps exactly to 1/16" (0.0625").
 */
export function isSixteenthInch(val: number): boolean {
  if (val <= 0 || isNaN(val)) return false;
  const sixteenths = val * 16;
  return Math.abs(sixteenths - Math.round(sixteenths)) < 1e-4;
}

/**
 * Computes live usable interior dimensions (nominal - 2 * skinTrim).
 */
export function computeUsableDimensions(
  nominalLength: number,
  nominalWidth: number,
  nominalHeight: number,
  skinTrim: number
): { length: number; width: number; height: number; isValid: boolean; error?: string } {
  const length = Number((nominalLength - 2 * skinTrim).toFixed(4));
  const width = Number((nominalWidth - 2 * skinTrim).toFixed(4));
  const height = Number((nominalHeight - 2 * skinTrim).toFixed(4));

  if (length <= 0 || width <= 0 || height <= 0) {
    return {
      length,
      width,
      height,
      isValid: false,
      error: `Skin trim (${skinTrim}") exceeds nominal dimensions, resulting in non-positive usable space (${length}" × ${width}" × ${height}").`,
    };
  }

  return { length, width, height, isValid: true };
}

/**
 * Evaluates stock sufficiency by comparing demanded part volume (+ kerf allowance)
 * against available usable block volume.
 */
export function evaluateStockSufficiency(
  blocks: BlockInput[],
  parts: PartItem[],
  skinTrim: number
): StockSufficiencyResult {
  const totalRequiredPartVolume = parts.reduce(
    (sum, p) => sum + p.length * p.width * p.height * Math.max(1, p.quantity),
    0
  );

  // Kerf allowance estimation (~10% volume loss during rectilinear/guillotine slicing)
  const kerfAllowanceVolume = totalRequiredPartVolume * 0.10;
  const totalVolumeNeeded = totalRequiredPartVolume + kerfAllowanceVolume;

  // Compute total usable volume across all available blocks
  let totalUsableBlockVolume = 0;
  let singleAvgBlockUsableVol = 0;
  let availableBlocksCount = 0;

  blocks.forEach((b) => {
    const qty = Math.max(1, b.quantity);
    availableBlocksCount += qty;
    const usableL = Math.max(0, b.nominal_length - 2 * skinTrim);
    const usableW = Math.max(0, b.nominal_width - 2 * skinTrim);
    const usableH = Math.max(0, b.nominal_height - 2 * skinTrim);
    const blockVol = usableL * usableW * usableH;
    totalUsableBlockVolume += blockVol * qty;
    if (blockVol > singleAvgBlockUsableVol) {
      singleAvgBlockUsableVol = blockVol;
    }
  });

  const estimatedMinBlocksNeeded = singleAvgBlockUsableVol > 0
    ? Math.max(1, Math.ceil(totalVolumeNeeded / singleAvgBlockUsableVol))
    : 1;

  const isSufficient = availableBlocksCount >= estimatedMinBlocksNeeded;

  let warningMessage: string | undefined;
  if (!isSufficient) {
    const neededCuFt = (totalVolumeNeeded / 1728).toFixed(1);
    const availableCuFt = (totalUsableBlockVolume / 1728).toFixed(1);
    warningMessage = `Estimated minimum blocks needed: ${estimatedMinBlocksNeeded}, available: ${availableBlocksCount}. Demanded volume with kerf allowance (${neededCuFt} cu ft) exceeds usable stock (${availableCuFt} cu ft). Consider adding more blocks.`;
  }

  return {
    totalRequiredPartVolume,
    totalUsableBlockVolume,
    kerfAllowanceVolume,
    estimatedMinBlocksNeeded,
    availableBlocksCount,
    isSufficient,
    warningMessage,
  };
}

/**
 * Evaluates and recommends the best Saw Machine Profile based on hard constraints,
 * user objective, tie-breaking, and transparent reasons.
 */
export function recommendMachine(
  machines: MachineProfile[],
  blocks: BlockInput[],
  parts: PartItem[],
  skinTrim: number,
  objective: OptimizationObjective,
  selectedGrade: string
): MachineRecommendationResult {
  if (!machines || machines.length === 0) {
    return {
      recommendedMachine: null,
      evaluations: {},
      reasonSummary: 'No machines registered in the machine profile fleet.',
      rejectedReasons: {},
      hasNoEligible: true,
      failureMessage: 'No cutting machines available in configuration.',
    };
  }

  // Calculate maximum block usable dimensions
  let maxUsableHeight = 0;
  let maxUsableLength = 0;
  let maxUsableWidth = 0;

  blocks.forEach((b) => {
    const uH = Math.max(0, b.nominal_height - 2 * skinTrim);
    const uL = Math.max(0, b.nominal_length - 2 * skinTrim);
    const uW = Math.max(0, b.nominal_width - 2 * skinTrim);
    if (uH > maxUsableHeight) maxUsableHeight = uH;
    if (uL > maxUsableLength) maxUsableLength = uL;
    if (uW > maxUsableWidth) maxUsableWidth = uW;
  });

  // Calculate parts metrics
  const totalPartsVol = parts.reduce(
    (sum, p) => sum + p.length * p.width * p.height * Math.max(1, p.quantity),
    0
  );

  let estLinearCutInches = 0;
  parts.forEach((p) => {
    estLinearCutInches += (p.length + p.width + p.height) * 2.0 * Math.max(1, p.quantity);
  });

  const foamCostCuFt = DEFAULT_GRADE_COSTS[selectedGrade] || 4.50;

  const evaluations: Record<string, MachineEvaluation> = {};
  const rejectedReasons: Record<string, string> = {};
  const eligibleMachines: MachineProfile[] = [];

  // 1. Hard Constraints Filtering
  for (const m of machines) {
    // Height filter: Usable block height must fit within machine throat clearance
    if (m.max_cut_height < maxUsableHeight - 0.001) {
      const reason = `Throat clearance (${m.max_cut_height}") is smaller than block usable height (${maxUsableHeight.toFixed(1)}").`;
      rejectedReasons[m.id] = reason;
      evaluations[m.id] = {
        machine: m,
        isEligible: false,
        rejectReason: reason,
        score: -1,
        metrics: {
          estimatedSawTimeMin: 0,
          estimatedCostDollars: 0,
          estimatedYieldPct: 0,
          kerf: m.kerf,
          feedRate: m.feed_rate_ipm || 100,
        },
      };
      continue;
    }

    // Part dimensions fit within usable bounds
    let partsFit = true;
    for (const p of parts) {
      const minPartDim = Math.min(p.length, p.width, p.height);
      const maxPartDim = Math.max(p.length, p.width, p.height);
      if (minPartDim > m.max_cut_height) {
        partsFit = false;
        break;
      }
      if (maxPartDim > Math.max(maxUsableLength, maxUsableWidth, maxUsableHeight)) {
        partsFit = false;
        break;
      }
    }

    if (!partsFit) {
      const reason = `Demanded part dimensions exceed machine cutting envelope.`;
      rejectedReasons[m.id] = reason;
      evaluations[m.id] = {
        machine: m,
        isEligible: false,
        rejectReason: reason,
        score: -1,
        metrics: {
          estimatedSawTimeMin: 0,
          estimatedCostDollars: 0,
          estimatedYieldPct: 0,
          kerf: m.kerf,
          feedRate: m.feed_rate_ipm || 100,
        },
      };
      continue;
    }

    // Performance and cost metrics for eligible machine
    const feedRate = m.feed_rate_ipm || 100.0;
    const hourlyRate = m.hourly_rate || 60.0;
    const kerf = m.kerf || 0.125;

    const sawTimeMin = Number(Math.max(2.0, estLinearCutInches / Math.max(10.0, feedRate)).toFixed(1));
    const sawHours = sawTimeMin / 60.0;

    // Capacity limit check if defined
    if (m.available_hours_limit != null && sawHours > m.available_hours_limit) {
      const reason = `Saw time (${sawHours.toFixed(2)}h) exceeds machine capacity limit (${m.available_hours_limit}h).`;
      rejectedReasons[m.id] = reason;
      evaluations[m.id] = {
        machine: m,
        isEligible: false,
        rejectReason: reason,
        score: -1,
        metrics: {
          estimatedSawTimeMin: sawTimeMin,
          estimatedCostDollars: 0,
          estimatedYieldPct: 0,
          kerf,
          feedRate,
        },
      };
      continue;
    }

    // Material yield and kerf loss estimation
    const estKerfVol = estLinearCutInches * kerf * 20.0;
    const estGrossVol = Math.max(totalPartsVol + estKerfVol + 25000.0, 1.0);
    const estYieldPct = Number(
      Math.min(98.0, Math.max(35.0, (totalPartsVol / estGrossVol) * 100.0)).toFixed(1)
    );

    // Total cost estimation
    const matCost = (estGrossVol / 1728.0) * foamCostCuFt;
    const sawCost = sawHours * hourlyRate;
    const totalCost = Number((matCost + sawCost).toFixed(2));

    evaluations[m.id] = {
      machine: m,
      isEligible: true,
      score: 0, // Will be computed in ranking
      metrics: {
        estimatedSawTimeMin: sawTimeMin,
        estimatedCostDollars: totalCost,
        estimatedYieldPct: estYieldPct,
        kerf,
        feedRate,
      },
    };
    eligibleMachines.push(m);
  }

  // If no machines strictly eligible, handle diagnostic failure
  if (eligibleMachines.length === 0) {
    const failureMessage = `No cutting machines meet the required throat clearance of ${maxUsableHeight.toFixed(1)}" or envelope constraints. Reduce block height or trim allowance to proceed.`;
    return {
      recommendedMachine: null,
      evaluations,
      reasonSummary: failureMessage,
      rejectedReasons,
      hasNoEligible: true,
      failureMessage,
    };
  }

  // 2. Score eligible machines based on objective
  const minCost = Math.min(...eligibleMachines.map((m) => evaluations[m.id].metrics.estimatedCostDollars));
  const maxCost = Math.max(...eligibleMachines.map((m) => evaluations[m.id].metrics.estimatedCostDollars)) || 1;
  const minTime = Math.min(...eligibleMachines.map((m) => evaluations[m.id].metrics.estimatedSawTimeMin));
  const maxTime = Math.max(...eligibleMachines.map((m) => evaluations[m.id].metrics.estimatedSawTimeMin)) || 1;

  eligibleMachines.forEach((m) => {
    const evalData = evaluations[m.id];
    let score = 0;

    switch (objective) {
      case 'maximize_yield':
        // Lower kerf = higher score; yield % directly
        score = evalData.metrics.estimatedYieldPct - evalData.metrics.kerf * 100;
        break;

      case 'minimize_time':
        // Lower saw time = higher score
        score = 1000 - evalData.metrics.estimatedSawTimeMin;
        break;

      case 'minimize_cost':
        // Lower cost = higher score
        score = 10000 - evalData.metrics.estimatedCostDollars;
        break;

      case 'balanced':
      default: {
        // Multi-factor normalized score: 40% yield, 35% cost, 25% time
        const normYield = evalData.metrics.estimatedYieldPct / 100.0;
        const normCost = 1 - (evalData.metrics.estimatedCostDollars - minCost) / Math.max(1, maxCost - minCost);
        const normTime = 1 - (evalData.metrics.estimatedSawTimeMin - minTime) / Math.max(1, maxTime - minTime);
        score = 0.40 * normYield + 0.35 * normCost + 0.25 * normTime;
        break;
      }
    }
    evalData.score = score;
  });

  // 3. Sort with Tie-Breaking: Score -> Kerf (lower) -> Automation (CNC > rotating > manual)
  const automationWeight: Record<string, number> = { CNC: 3, rotating: 2, manual: 1 };

  eligibleMachines.sort((a, b) => {
    const diff = evaluations[b.id].score - evaluations[a.id].score;
    if (Math.abs(diff) > 0.001) return diff;

    // Tie-break 1: Lower kerf
    if (Math.abs(a.kerf - b.kerf) > 0.0001) {
      return a.kerf - b.kerf;
    }

    // Tie-break 2: Higher automation
    const autoA = automationWeight[a.automation] || 0;
    const autoB = automationWeight[b.automation] || 0;
    return autoB - autoA;
  });

  const chosen = eligibleMachines[0];
  const chosenMetrics = evaluations[chosen.id].metrics;

  // Add non-chosen eligible machines to "Why not others" with computed trade-off comparisons
  eligibleMachines.slice(1).forEach((m) => {
    const mMetrics = evaluations[m.id].metrics;
    if (objective === 'minimize_time') {
      rejectedReasons[m.id] = `${m.name}: Slower cut speed (${mMetrics.feedRate} IPM vs ${chosenMetrics.feedRate} IPM) resulting in ${mMetrics.estimatedSawTimeMin} min cut time.`;
    } else if (objective === 'minimize_cost') {
      rejectedReasons[m.id] = `${m.name}: Higher estimated production cost ($${mMetrics.estimatedCostDollars.toFixed(2)} vs $${chosenMetrics.estimatedCostDollars.toFixed(2)}).`;
    } else if (objective === 'maximize_yield') {
      rejectedReasons[m.id] = `${m.name}: Higher blade kerf (${mMetrics.kerf}" vs ${chosenMetrics.kerf}") causing greater material offcut loss.`;
    } else {
      if (m.cut_type === 'free' && chosen.cut_type === 'guillotine') {
        rejectedReasons[m.id] = `${m.name}: Higher operating cost ($${m.hourly_rate}/hr vs $${chosen.hourly_rate}/hr) with no yield advantage for orthogonal rectangular parts.`;
      } else {
        rejectedReasons[m.id] = `${m.name}: Ranked lower under balanced objective (estimated $${mMetrics.estimatedCostDollars.toFixed(2)}, ${mMetrics.estimatedSawTimeMin} min).`;
      }
    }
  });

  // 4. Generate transparent 1-3 line explanation string
  let reasonSummary = '';
  const eligibleCount = eligibleMachines.length;
  const skuCount = parts.length;

  if (objective === 'minimize_time') {
    reasonSummary = `${chosen.name}: Usable block height ${maxUsableHeight.toFixed(1)}" is within its ${chosen.max_cut_height}" limit; fastest estimated saw time (${chosenMetrics.estimatedSawTimeMin} min at ${chosenMetrics.feedRate} IPM) across ${eligibleCount} eligible machines.`;
  } else if (objective === 'maximize_yield') {
    reasonSummary = `${chosen.name}: Highest estimated yield (${chosenMetrics.estimatedYieldPct}% with ${chosenMetrics.kerf}" kerf); usable block height ${maxUsableHeight.toFixed(1)}" is within its ${chosen.max_cut_height}" throat limit.`;
  } else if (objective === 'minimize_cost') {
    reasonSummary = `${chosen.name}: Lowest total production cost ($${chosenMetrics.estimatedCostDollars.toFixed(2)} at $${chosen.hourly_rate}/hr); satisfies all envelope constraints for ${skuCount} part types.`;
  } else {
    reasonSummary = `${chosen.name}: Block height ${maxUsableHeight.toFixed(1)}" is within its ${chosen.max_cut_height}" limit; all ${skuCount} part types are straight-cut rectangles; best balanced score for cost ($${chosenMetrics.estimatedCostDollars.toFixed(2)}) and time (${chosenMetrics.estimatedSawTimeMin} min) among ${eligibleCount} eligible saws.`;
  }

  return {
    recommendedMachine: chosen,
    evaluations,
    reasonSummary,
    rejectedReasons,
    hasNoEligible: false,
  };
}

/**
 * Recommends the Optimization Priority Objective based on material cost ratio,
 * foam grade value, and cut count.
 */
export function recommendObjective(
  _blocks: BlockInput[],
  parts: PartItem[],
  _skinTrim: number,
  selectedGrade: string,
  selectedMachine?: MachineProfile
): ObjectiveRecommendationResult {
  const foamCostCuFt = DEFAULT_GRADE_COSTS[selectedGrade] || 4.50;
  const hourlyRate = selectedMachine?.hourly_rate || 60.0;
  const feedRate = selectedMachine?.feed_rate_ipm || 100.0;

  const totalPartsVol = parts.reduce(
    (sum, p) => sum + p.length * p.width * p.height * Math.max(1, p.quantity),
    0
  );

  let estLinearCutInches = 0;
  let estimatedTotalCuts = 0;
  parts.forEach((p) => {
    const qty = Math.max(1, p.quantity);
    estLinearCutInches += (p.length + p.width + p.height) * 2.0 * qty;
    estimatedTotalCuts += qty * 3; // Estimated cuts: slice, rip, crosscut
  });

  const rawMaterialCost = (Math.max(totalPartsVol, 1) / 1728.0) * foamCostCuFt;
  const sawTimeMin = Math.max(2.0, estLinearCutInches / Math.max(10.0, feedRate));
  const estimatedSawCost = (sawTimeMin / 60.0) * hourlyRate;
  const totalCost = rawMaterialCost + estimatedSawCost;
  const materialCostRatio = totalCost > 0 ? rawMaterialCost / totalCost : 0.5;

  let recommendedObjective: OptimizationObjective = 'balanced';
  let reason = '';

  if (materialCostRatio >= 0.70 || selectedGrade === 'VE-50' || selectedGrade === 'HR-40') {
    recommendedObjective = 'maximize_yield';
    const matPct = Math.round(materialCostRatio * 100);
    reason = `Maximize yield: Job uses premium ${selectedGrade} foam where raw material accounts for ${matPct}% of estimated production cost.`;
  } else if (estimatedTotalCuts >= 150 && estimatedSawCost > 0.45 * totalCost) {
    recommendedObjective = 'minimize_time';
    reason = `Minimize saw time: High cutting volume (~${estimatedTotalCuts} cuts) where saw labor dominates the production schedule.`;
  } else if (selectedGrade === 'CM-28' && materialCostRatio < 0.55) {
    recommendedObjective = 'minimize_cost';
    reason = `Minimize cost: Standard packaging grade CM-28 with balanced focus on saw operating rate ($${hourlyRate}/hr).`;
  } else {
    recommendedObjective = 'balanced';
    const matPct = Math.round(materialCostRatio * 100);
    reason = `Balanced: Material cost (${matPct}%) and saw machine time are evenly weighted for this batch.`;
  }

  return {
    recommendedObjective,
    reason,
    metrics: {
      materialCostRatio,
      estimatedTotalCuts,
      rawMaterialCost,
      estimatedSawCost,
    },
  };
}

/**
 * Formats a clean constraint check report for a manually chosen machine.
 */
export function evaluateManualMachine(
  machine: MachineProfile,
  blocks: BlockInput[],
  parts: PartItem[],
  skinTrim: number
): { isPass: boolean; checks: Array<{ label: string; passed: boolean; message: string }> } {
  let maxUsableHeight = 0;
  blocks.forEach((b) => {
    const uH = Math.max(0, b.nominal_height - 2 * skinTrim);
    if (uH > maxUsableHeight) maxUsableHeight = uH;
  });

  const checks = [
    {
      label: 'Throat Height Clearance',
      passed: machine.max_cut_height >= maxUsableHeight - 0.001,
      message:
        machine.max_cut_height >= maxUsableHeight - 0.001
          ? `Pass: Machine max height ${machine.max_cut_height}" accommodates block usable height ${maxUsableHeight.toFixed(1)}".`
          : `Fail: Machine throat clearance ${machine.max_cut_height}" is smaller than block usable height ${maxUsableHeight.toFixed(1)}".`,
    },
    {
      label: 'Cut Type Support',
      passed: true,
      message:
        machine.cut_type === 'guillotine'
          ? 'Pass: Straight rectilinear guillotine slicing supported.'
          : 'Pass: Free 3D contour / wire cutting supported.',
    },
    {
      label: 'Part Envelope Clearance',
      passed: parts.every(
        (p) => Math.min(p.length, p.width, p.height) <= machine.max_cut_height
      ),
      message: parts.every(
        (p) => Math.min(p.length, p.width, p.height) <= machine.max_cut_height
      )
        ? 'Pass: Part minimum dimension fits machine cut envelope.'
        : 'Warning: Some demanded parts exceed machine cut throat envelope.',
    },
    {
      label: 'Engine Support Level',
      passed: true,
      message:
        machine.support_level === 'fully_supported'
          ? 'Fully supported with production kinematics.'
          : 'Basic heuristic profile with standard cut sequencing.',
    },
  ];

  const isPass = checks.every((c) => c.passed);
  return { isPass, checks };
}

export const ALGORITHM_DISPLAY_NAMES: Record<string, string> = {
  ortools_block_assignment: 'OR-Tools Block Assignment + Slicing',
  ortools_pattern_selection: 'OR-Tools Pattern Selection (Fixed Pool)',
  best_fit_decreasing: 'Best-Fit Decreasing (BFD)',
  first_fit_decreasing: 'First-Fit Decreasing (FFD)',
  simulated_annealing: 'Simulated Annealing (SA)',
  free_nesting_heuristic: '3D Free Contour Nesting',
};

/**
 * Rule-based Optimization Strategy Recommender
 * Evaluates problem features (SKUs, total pieces, blocks, machine cut type, objective)
 * to produce an initial rule-based strategy recommendation.
 */
export function recommendStrategy(
  blocks: BlockInput[],
  parts: PartItem[],
  selectedMachine: MachineProfile | undefined,
  objective: OptimizationObjective
): { ruleStrategyId: string; ruleStrategyName: string; ruleReason: string } {
  const totalPieces = parts.reduce((sum, p) => sum + Math.max(1, p.quantity), 0);
  const totalBlocks = blocks.reduce((sum, b) => sum + Math.max(1, b.quantity), 0);
  const skuCount = parts.length;
  const isFreeCut = selectedMachine?.cut_type === 'free';

  let ruleStrategyId = 'best_fit_decreasing';
  let ruleReason = '';

  if (isFreeCut) {
    ruleStrategyId = 'free_nesting_heuristic';
    ruleReason = `${selectedMachine?.name || 'Waterjet/Contour'} requires 3D maximal-empty-box contour toolpaths with machine throat clearance.`;
  } else if (skuCount <= 3 && totalPieces >= 30) {
    ruleStrategyId = 'ortools_pattern_selection';
    ruleReason = `Repetitive demand with few SKUs (${skuCount} SKUs, ${totalPieces} pieces): Mathematical pattern selection maximizes cutting frequency efficiency.`;
  } else if (totalBlocks >= 2 && totalPieces >= 40) {
    ruleStrategyId = 'ortools_block_assignment';
    ruleReason = `${skuCount} part types, ${totalPieces} pieces across ${totalBlocks} blocks on guillotine saw: CP-SAT block assignment with slicing tree balances multi-block load.`;
  } else if (objective === 'maximize_yield' && totalPieces <= 90) {
    ruleStrategyId = 'simulated_annealing';
    ruleReason = `Yield-maximization priority with moderate demand volume: Metaheuristic neighborhood search explores alternative rotation trees within time budget.`;
  } else {
    ruleStrategyId = 'best_fit_decreasing';
    ruleReason = `${skuCount} SKUs, ${totalPieces} pieces on guillotine saw: Fast greedy volume packing for rapid interactive turnaround.`;
  }

  return {
    ruleStrategyId,
    ruleStrategyName: ALGORITHM_DISPLAY_NAMES[ruleStrategyId] || ruleStrategyId,
    ruleReason,
  };
}

/**
 * Evidence-based Re-evaluation of Measured Benchmark Results.
 * Identifies the best measured result under the active objective and formats
 * transparent, honest reason strings.
 */
export function evaluateBestMeasuredStrategy(
  comparisonResults: OptimizationResult[],
  objective: OptimizationObjective,
  ruleStrategyId: string,
  ruleReason: string
): StrategyRecommendationResult {
  const ruleStrategyName = ALGORITHM_DISPLAY_NAMES[ruleStrategyId] || ruleStrategyId;
  const wordingDisclaimer = 'Best among the tested heuristics for this input and objective. Not proven optimal.';

  if (!comparisonResults || comparisonResults.length === 0) {
    return {
      ruleStrategyId,
      ruleStrategyName,
      ruleReason,
      finalStrategyId: ruleStrategyId,
      finalStrategyName: ruleStrategyName,
      isSwitchedFromRule: false,
      wordingDisclaimer,
    };
  }

  // Rank valid results by objective
  const validResults = comparisonResults.filter((r) => r.validation?.is_valid !== false);
  const candidatePool = validResults.length > 0 ? validResults : comparisonResults;

  const scored = candidatePool.map((res) => {
    let score = 0;
    const yieldPct = res.net_utilization_pct || 0;
    const cuts = res.total_cuts_count || 0;
    const blocksUsed = res.blocks_used_count || 1;
    const runtime = res.runtime_ms || 1;

    switch (objective) {
      case 'maximize_yield':
        score = yieldPct * 10000 - blocksUsed * 1000 - cuts * 10 - runtime * 0.01;
        break;
      case 'minimize_time':
        score = -(res.estimated_saw_time_minutes || cuts * 0.1) * 1000 + yieldPct * 10;
        break;
      case 'minimize_cost':
        score = yieldPct * 100 - blocksUsed * 200 - cuts * 2;
        break;
      case 'balanced':
      default:
        score = yieldPct * 50 - blocksUsed * 100 - cuts * 1;
        break;
    }

    return { res, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0].res;
  const finalStrategyId = best.algorithm_id;
  const finalStrategyName = ALGORITHM_DISPLAY_NAMES[finalStrategyId] || best.algorithm_name || finalStrategyId;

  const isSwitchedFromRule = finalStrategyId !== ruleStrategyId;

  // Compile comparison numbers for measured evidence
  const otherResults = candidatePool.filter((r) => r.algorithm_id !== finalStrategyId);
  const compSnippets = otherResults
    .slice(0, 2)
    .map((r) => `${r.net_utilization_pct.toFixed(1)}% (${ALGORITHM_DISPLAY_NAMES[r.algorithm_id]?.split(' ')[0] || r.algorithm_id})`)
    .join(' and ');

  const measuredEvidence = otherResults.length > 0
    ? `Net Yield ${best.net_utilization_pct.toFixed(1)}% vs ${compSnippets}; ${best.blocks_used_count} block(s) used; ${best.total_parts_placed} of ${best.total_parts_demanded} parts placed, validation passed.`
    : `Net Yield ${best.net_utilization_pct.toFixed(1)}%; ${best.blocks_used_count} block(s) used; all ${best.total_parts_placed} parts placed, validation passed.`;

  let switchedNotice: string | undefined;
  if (isSwitchedFromRule) {
    const ruleRes = comparisonResults.find((r) => r.algorithm_id === ruleStrategyId);
    if (ruleRes) {
      const diffYield = (best.net_utilization_pct - ruleRes.net_utilization_pct).toFixed(1);
      switchedNotice = `Auto-switched from initial rule pick (${ruleStrategyName}) to ${finalStrategyName}: Benchmark measured higher net yield (+${diffYield}%) under the ${objective.replace('_', ' ')} objective.`;
    } else {
      switchedNotice = `Auto-switched to ${finalStrategyName}: Selected as best measured heuristic in the comparative benchmark.`;
    }
  }

  let fallbackNotice: string | undefined;
  if (best.fallback_used) {
    fallbackNotice = 'Fallback heuristic was activated due to solver constraint bounds.';
  }

  const hasUnplacedParts = !!(best.unplaced_parts && best.unplaced_parts.length > 0);

  return {
    ruleStrategyId,
    ruleStrategyName,
    ruleReason,
    finalStrategyId,
    finalStrategyName,
    measuredEvidence,
    isSwitchedFromRule,
    switchedNotice,
    wordingDisclaimer,
    fallbackNotice,
    hasUnplacedParts,
  };
}

/**
 * Validates Screen 1 inputs before continuing to Screen 2.
 * Checks for:
 * - At least 1 block and 1 part
 * - Positive usable dimensions after skin trim deduction
 * - 1/16" precision grid alignment on all dimensions
 * - Machine throat clearance clearance (H_usable <= machine.max_cut_height)
 * - Positive part dimensions
 */
export function validateScreen1Inputs(
  blocks: BlockInput[],
  parts: PartItem[],
  skinTrim: number,
  selectedMachine: MachineProfile | undefined
): Screen1ValidationResult {
  const totalBlocks = blocks.reduce((sum, b) => sum + (b.quantity || 0), 0);
  if (blocks.length === 0 || totalBlocks <= 0) {
    return {
      isValid: false,
      errorMessage: 'Please configure at least one available foam block with quantity ≥ 1.',
      field: 'blocks',
    };
  }

  const totalParts = parts.reduce((sum, p) => sum + (p.quantity || 0), 0);
  if (parts.length === 0 || totalParts <= 0) {
    return {
      isValid: false,
      errorMessage: 'Please specify at least one required part with quantity ≥ 1.',
      field: 'parts',
    };
  }

  // Validate each block
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const usable = computeUsableDimensions(
      b.nominal_length,
      b.nominal_width,
      b.nominal_height,
      skinTrim
    );
    if (!usable.isValid || usable.length <= 0 || usable.width <= 0 || usable.height <= 0) {
      return {
        isValid: false,
        errorMessage: `Block #${i + 1} (${b.id || 'bun'}) usable interior is non-positive (${usable.length.toFixed(2)}" × ${usable.width.toFixed(2)}" × ${usable.height.toFixed(2)}"). Skin trim allowance (${skinTrim}") is too large for the block dimensions.`,
        field: 'blocks',
      };
    }

    if (!isSixteenthInch(b.nominal_length) || !isSixteenthInch(b.nominal_width) || !isSixteenthInch(b.nominal_height)) {
      return {
        isValid: false,
        errorMessage: `Block #${i + 1} (${b.id || 'bun'}) dimensions (${b.nominal_length}" × ${b.nominal_width}" × ${b.nominal_height}") must align to the 1/16" (0.0625") precision grid.`,
        field: 'blocks',
      };
    }

    if (selectedMachine && usable.height > selectedMachine.max_cut_height) {
      return {
        isValid: false,
        errorMessage: `Block #${i + 1} (${b.id || 'bun'}) usable height (${usable.height.toFixed(2)}") exceeds selected machine (${selectedMachine.name}) maximum throat clearance of ${selectedMachine.max_cut_height}". Lower block height or choose a machine with a larger throat clearance.`,
        field: 'machine',
      };
    }
  }

  // Validate each part
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (p.length <= 0 || p.width <= 0 || p.height <= 0) {
      return {
        isValid: false,
        errorMessage: `Part #${i + 1} (${p.sku || p.name}) has non-positive dimensions (${p.length}" × ${p.width}" × ${p.height}").`,
        field: 'parts',
      };
    }

    if (!isSixteenthInch(p.length) || !isSixteenthInch(p.width) || !isSixteenthInch(p.height)) {
      return {
        isValid: false,
        errorMessage: `Part #${i + 1} (${p.sku || p.name}) dimensions (${p.length}" × ${p.width}" × ${p.height}") must align to the 1/16" (0.0625") precision grid.`,
        field: 'parts',
      };
    }
  }

  return { isValid: true };
}

/**
 * Computes disabled state, tooltips, and dynamic button labels for the Sticky Action Bar.
 */
export function computeStickyBarState(
  currentResult: OptimizationResult | null,
  isOptimizing: boolean,
  isStale: boolean,
  mode: 'step2' | 'step3' = 'step2'
): { isDisabled: boolean; tooltipMessage: string; primaryLabel: string; secondaryLabel: string } {
  let isDisabled = false;
  let tooltipMessage = '';

  if (isOptimizing) {
    isDisabled = true;
    tooltipMessage = 'Optimization solver is currently solving heuristics. Please wait...';
  } else if (isStale) {
    isDisabled = true;
    tooltipMessage = 'Inputs have been modified since the last solve. Re-run optimization to refresh results.';
  } else if (!currentResult) {
    isDisabled = true;
    tooltipMessage = 'No optimization result available yet. Run a strategy to compute a cutting plan.';
  } else if (currentResult.validation && !currentResult.validation.is_valid) {
    isDisabled = true;
    tooltipMessage = 'Current solution failed geometric validation. Please check part dimensions.';
  }

  const primaryLabel =
    mode === 'step3'
      ? 'Proceed to Results & Execution'
      : 'Generate 3D Cutting Plan & Visualization';
  const secondaryLabel = mode === 'step3' ? 'Back to algorithm' : 'Back to inputs';

  return { isDisabled, tooltipMessage, primaryLabel, secondaryLabel };
}



