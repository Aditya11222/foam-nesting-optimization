export interface CostCategoryItem {
  key: string;
  category: string;
  categoryEs: string;
  baseline: number;
  optimized: number;
  baselineRounded: number;
  optimizedRounded: number;
  baselineDisplay: string;
  optimizedDisplay: string;
  delta: number;
  deltaPct: number;
  deltaDisplay: string;
  deltaDisplayEs: string;
  deltaStatus: 'improvement' | 'worse' | 'neutral';
  isCredit?: boolean;
  isOfWhich?: boolean;
  isTotal?: boolean;
  baselineRatio: number;
  optimizedRatio: number;
  baselineNote?: string;
  baselineNoteEs?: string;
}

export interface CostReconciliationReport {
  categories: CostCategoryItem[];
  componentRows: CostCategoryItem[];
  totalRow: CostCategoryItem;
  netSavingTotal: number;
  netSavingPct: number;
  savingsChipText: string;
  savingsChipTextEs: string;
  baselineNetCost: number;
  optimizedNetCost: number;
  baselineReconciled: boolean;
  optimizedReconciled: boolean;
  isFullyReconciled: boolean;
  reconciliationError?: string;
  optimizedCalculationLine: string;
  optimizedCalculationLineEs: string;
  baselineCalculationLine: string;
  baselineCalculationLineEs: string;
  bunReductionText: string;
  bunReductionTextEs: string;
  hasRemnantCredit: boolean;
  disclaimerText: string;
  disclaimerTextEs: string;
  unplacedNote?: string;
  unplacedNoteEs?: string;
  maxChartValue: number;
  axisTicks: number[];
}

/**
 * Formats a dollar amount with comma thousand separators and no cents for clean chart display.
 * Uses true minus sign '−' for negative currency ("−$496", "−$1,000").
 */
export function formatCurrencyShort(amount: number): string {
  const rounded = Math.round(amount);
  if (rounded === 0) return '$0';
  const abs = Math.abs(rounded);
  const formattedAbs = `$${abs.toLocaleString()}`;
  return rounded < 0 ? `−${formattedAbs}` : formattedAbs;
}

/**
 * Helper to compute per-row delta chips and status.
 */
function computeDeltaInfo(
  baseline: number,
  optimized: number,
  isCredit = false
): {
  delta: number;
  deltaPct: number;
  deltaDisplay: string;
  deltaDisplayEs: string;
  status: 'improvement' | 'worse' | 'neutral';
} {
  if (isCredit) {
    const diff = optimized - baseline;
    if (diff > 0.5) {
      const chip = `+${formatCurrencyShort(diff)} credit`;
      const chipEs = `+${formatCurrencyShort(diff)} crédito [revisión]`;
      return { delta: diff, deltaPct: 100, deltaDisplay: chip, deltaDisplayEs: chipEs, status: 'improvement' };
    } else if (diff < -0.5) {
      const chip = `${formatCurrencyShort(diff)} credit`;
      const chipEs = `${formatCurrencyShort(diff)} crédito [revisión]`;
      return { delta: diff, deltaPct: 100, deltaDisplay: chip, deltaDisplayEs: chipEs, status: 'worse' };
    }
    return { delta: 0, deltaPct: 0, deltaDisplay: 'No difference', deltaDisplayEs: 'Sin diferencia [revisión]', status: 'neutral' };
  }

  const diff = optimized - baseline;
  if (Math.abs(diff) < 0.5) {
    return { delta: 0, deltaPct: 0, deltaDisplay: 'No difference', deltaDisplayEs: 'Sin diferencia [revisión]', status: 'neutral' };
  }

  const pct = baseline > 0 ? (Math.abs(diff) / baseline) * 100 : 0;
  if (diff < 0) {
    const chip = `−${formatCurrencyShort(Math.abs(diff))}, −${pct.toFixed(0)}% lower`;
    const chipEs = `−${formatCurrencyShort(Math.abs(diff))}, −${pct.toFixed(0)}% menor [revisión]`;
    return { delta: diff, deltaPct: pct, deltaDisplay: chip, deltaDisplayEs: chipEs, status: 'improvement' };
  } else {
    const chip = `+${formatCurrencyShort(diff)}, +${pct.toFixed(0)}% higher`;
    const chipEs = `+${formatCurrencyShort(diff)}, +${pct.toFixed(0)}% mayor [revisión]`;
    return { delta: diff, deltaPct: pct, deltaDisplay: chip, deltaDisplayEs: chipEs, status: 'worse' };
  }
}

/**
 * Computes cost component comparison and verifies strict mathematical reconciliation:
 * Foam Cost + Saw Cost - Remnant Credit = Net Cost (to the cent).
 *
 * Excludes Scrap Cost from the summation because scrap is already an "of-which"
 * component within total gross foam material cost.
 */
export function computeCostReconciliation(
  unitCost: number,
  sawRatePerHour: number,
  baselineGrossCuFt: number,
  baselineScrapCuFt: number,
  baselineBlocks: number,
  baselineSawHours: number,
  baselineTotalCost: number,
  optScrapCuFt: number,
  optMaterialCost: number,
  optSawCost: number,
  optRemnantCredit: number,
  optNetJobCost: number,
  optimizedBlocksCount: number,
  totalPartsPlaced?: number,
  totalPartsDemanded?: number
): CostReconciliationReport {
  // 1. Baseline Cost Components (raw unrounded)
  const bFoamCost = baselineGrossCuFt * unitCost;
  const bScrapCost = baselineScrapCuFt * unitCost;
  const bSawCost = baselineSawHours * sawRatePerHour;
  const bRemnantCredit = 0.0;
  const bNetCost = baselineTotalCost;

  // 2. Optimized Cost Components (raw unrounded)
  const oFoamCost = optMaterialCost;
  const oScrapCost = optScrapCuFt * unitCost;
  const oSawCost = optSawCost;
  const oRemnantCredit = optRemnantCredit;
  const oNetCost = optNetJobCost;

  // 3. Strict Reconciliation Assertion: Foam + Saw - RemnantCredit == NetCost (to the cent)
  const bReconcileDelta = Math.abs(bFoamCost + bSawCost - bRemnantCredit - bNetCost);
  const oReconcileDelta = Math.abs(oFoamCost + oSawCost - oRemnantCredit - oNetCost);
  const baselineReconciled = bReconcileDelta <= 0.02;
  const optimizedReconciled = oReconcileDelta <= 0.02;
  const isFullyReconciled = baselineReconciled && optimizedReconciled;

  let reconciliationError: string | undefined = undefined;
  if (!isFullyReconciled) {
    reconciliationError = `Totals do not reconcile: Reconciliation delta detected: Baseline discrepancy $${bReconcileDelta.toFixed(
      2
    )}, Optimized discrepancy $${oReconcileDelta.toFixed(2)}. Foam + Saw - Credit must equal Net Cost.`;
  }

  // 4. Savings Calculations
  const netSavingTotal = Math.max(0, bNetCost - oNetCost);
  const netSavingPct = bNetCost > 0 ? (netSavingTotal / bNetCost) * 100.0 : 0.0;
  const savingsChipText = `Net saving $${Math.round(netSavingTotal).toLocaleString()} (${netSavingPct.toFixed(1)}%)`;
  const savingsChipTextEs = `Ahorro neto $${Math.round(netSavingTotal).toLocaleString()} (${netSavingPct.toFixed(1)}%) [revisión]`;

  // 5. Display Rounding Consistency
  // Ensure displayed addends sum exactly to displayed total
  const bFoamR = Math.round(bFoamCost);
  const bScrapR = Math.round(bScrapCost);
  const bSawR = Math.round(bSawCost);
  const bCreditR = Math.round(bRemnantCredit);
  const bNetR = bFoamR + bSawR - bCreditR; // guaranteed exact display sum

  const oFoamR = Math.round(oFoamCost);
  const oScrapR = Math.round(oScrapCost);
  const oSawR = Math.round(oSawCost);
  const oCreditR = Math.round(oRemnantCredit);
  const oNetR = oFoamR + oSawR - oCreditR; // guaranteed exact display sum

  // 6. Max Value & Ticks for Chart Scaling
  const maxRaw = Math.max(bFoamR, oFoamR, bNetR, oNetR, 1000);
  const step = maxRaw > 10000 ? 2500 : maxRaw > 5000 ? 1000 : maxRaw > 2000 ? 500 : 250;
  const maxChartValue = Math.ceil(maxRaw / step) * step;
  const axisTicks: number[] = [];
  for (let t = 0; t <= maxChartValue; t += step) {
    axisTicks.push(t);
  }

  const calcRatio = (val: number) => {
    if (val <= 0) return 0;
    // ensure small values (e.g. $184 saw) have a minimum visible width of 2.5%
    return Math.max(0.025, Math.min(1.0, val / maxChartValue));
  };

  // 7. Component Rows (Order: Foam, Scrap of-which, Saw, Remnant Credit)
  const foamDelta = computeDeltaInfo(bFoamCost, oFoamCost);
  const scrapDelta = computeDeltaInfo(bScrapCost, oScrapCost);
  const sawDelta = computeDeltaInfo(bSawCost, oSawCost);
  const creditDelta = computeDeltaInfo(bRemnantCredit, oRemnantCredit, true);
  const netDelta = computeDeltaInfo(bNetCost, oNetCost);

  const foamRow: CostCategoryItem = {
    key: 'foam_cost',
    category: 'Foam Cost',
    categoryEs: 'Costo Espuma [revisión]',
    baseline: bFoamCost,
    optimized: oFoamCost,
    baselineRounded: bFoamR,
    optimizedRounded: oFoamR,
    baselineDisplay: formatCurrencyShort(bFoamR),
    optimizedDisplay: formatCurrencyShort(oFoamR),
    delta: foamDelta.delta,
    deltaPct: foamDelta.deltaPct,
    deltaDisplay: foamDelta.deltaDisplay,
    deltaDisplayEs: foamDelta.deltaDisplayEs,
    deltaStatus: foamDelta.status,
    baselineRatio: calcRatio(bFoamR),
    optimizedRatio: calcRatio(oFoamR),
  };

  const scrapRow: CostCategoryItem = {
    key: 'scrap_cost',
    category: 'Scrap cost (included in foam cost)',
    categoryEs: 'Costo desperdicio (incluido en costo de espuma) [revisión]',
    baseline: bScrapCost,
    optimized: oScrapCost,
    baselineRounded: bScrapR,
    optimizedRounded: oScrapR,
    baselineDisplay: formatCurrencyShort(bScrapR),
    optimizedDisplay: formatCurrencyShort(oScrapR),
    delta: scrapDelta.delta,
    deltaPct: scrapDelta.deltaPct,
    deltaDisplay: scrapDelta.deltaDisplay,
    deltaDisplayEs: scrapDelta.deltaDisplayEs,
    deltaStatus: scrapDelta.status,
    isOfWhich: true,
    baselineRatio: calcRatio(bScrapR),
    optimizedRatio: calcRatio(oScrapR),
  };

  const sawRow: CostCategoryItem = {
    key: 'saw_cost',
    category: 'Saw Time Cost',
    categoryEs: 'Costo Tiempo de Sierra [revisión]',
    baseline: bSawCost,
    optimized: oSawCost,
    baselineRounded: bSawR,
    optimizedRounded: oSawR,
    baselineDisplay: formatCurrencyShort(bSawR),
    optimizedDisplay: formatCurrencyShort(oSawR),
    delta: sawDelta.delta,
    deltaPct: sawDelta.deltaPct,
    deltaDisplay: sawDelta.deltaDisplay,
    deltaDisplayEs: sawDelta.deltaDisplayEs,
    deltaStatus: sawDelta.status,
    baselineRatio: calcRatio(bSawR),
    optimizedRatio: calcRatio(oSawR),
  };

  const creditRow: CostCategoryItem = {
    key: 'remnant_credit',
    category: 'Remnant Credit',
    categoryEs: 'Crédito por Remanente [revisión]',
    baseline: bRemnantCredit,
    optimized: oRemnantCredit,
    baselineRounded: bCreditR,
    optimizedRounded: oCreditR,
    baselineDisplay: '$0',
    optimizedDisplay: oCreditR > 0 ? formatCurrencyShort(-oCreditR) : '$0',
    delta: creditDelta.delta,
    deltaPct: creditDelta.deltaPct,
    deltaDisplay: creditDelta.deltaDisplay,
    deltaDisplayEs: creditDelta.deltaDisplayEs,
    deltaStatus: creditDelta.status,
    isCredit: true,
    baselineNote: 'Baseline recovers no remnants',
    baselineNoteEs: 'La línea base no recupera remanentes [revisión]',
    baselineRatio: 0,
    optimizedRatio: calcRatio(oCreditR),
  };

  const totalRow: CostCategoryItem = {
    key: 'net_cost',
    category: 'Net Cost',
    categoryEs: 'Costo Neto [revisión]',
    baseline: bNetCost,
    optimized: oNetCost,
    baselineRounded: bNetR,
    optimizedRounded: oNetR,
    baselineDisplay: formatCurrencyShort(bNetR),
    optimizedDisplay: formatCurrencyShort(oNetR),
    delta: netDelta.delta,
    deltaPct: netDelta.deltaPct,
    deltaDisplay: netDelta.deltaDisplay,
    deltaDisplayEs: netDelta.deltaDisplayEs,
    deltaStatus: netDelta.status,
    isTotal: true,
    baselineRatio: calcRatio(bNetR),
    optimizedRatio: calcRatio(oNetR),
  };

  const hasRemnantCredit = oRemnantCredit > 0 || bRemnantCredit > 0;
  const componentRows = [foamRow, scrapRow, sawRow];
  const allRows = [foamRow, scrapRow, sawRow];
  if (hasRemnantCredit) {
    componentRows.push(creditRow);
    allRows.push(creditRow);
  }
  allRows.push(totalRow);

  // 8. Reconciliation Text Formulas
  const optimizedCalculationLine = `Foam ${formatCurrencyShort(oFoamR)} + Saw ${formatCurrencyShort(
    oSawR
  )} − Credit ${formatCurrencyShort(oCreditR)} = Net ${formatCurrencyShort(oNetR)} (optimized)`;
  const optimizedCalculationLineEs = `Espuma ${formatCurrencyShort(oFoamR)} + Sierra ${formatCurrencyShort(
    oSawR
  )} − Crédito ${formatCurrencyShort(oCreditR)} = Neto ${formatCurrencyShort(oNetR)} (optimizado) [revisión]`;

  const baselineCalculationLine = `Foam ${formatCurrencyShort(bFoamR)} + Saw ${formatCurrencyShort(
    bSawR
  )} − Credit $0 = Net ${formatCurrencyShort(bNetR)} (baseline)`;
  const baselineCalculationLineEs = `Espuma ${formatCurrencyShort(bFoamR)} + Sierra ${formatCurrencyShort(
    bSawR
  )} − Crédito $0 = Neto ${formatCurrencyShort(bNetR)} (línea base) [revisión]`;

  // 9. Footnotes and Disclaimers
  const bunReductionText = `Optimized layout uses ${optimizedBlocksCount} buns vs ${baselineBlocks} in the baseline`;
  const bunReductionTextEs = `El diseño optimizado utiliza ${optimizedBlocksCount} bloques vs ${baselineBlocks} en la línea base [revisión]`;
  const disclaimerText = 'Estimated, demo assumptions. Baseline is a simulated naive layout.';
  const disclaimerTextEs = 'Estimado, supuestos de demostración. La línea base es un diseño simulado ingenuo. [revisión]';

  let unplacedNote: string | undefined = undefined;
  let unplacedNoteEs: string | undefined = undefined;
  if (
    totalPartsPlaced !== undefined &&
    totalPartsDemanded !== undefined &&
    totalPartsPlaced < totalPartsDemanded
  ) {
    unplacedNote = `${totalPartsPlaced} of ${totalPartsDemanded} parts placed — cost applies to placed pieces.`;
    unplacedNoteEs = `${totalPartsPlaced} de ${totalPartsDemanded} piezas colocadas — el costo aplica a piezas colocadas. [revisión]`;
  }

  return {
    categories: allRows,
    componentRows,
    totalRow,
    netSavingTotal,
    netSavingPct,
    savingsChipText,
    savingsChipTextEs,
    baselineNetCost: bNetCost,
    optimizedNetCost: oNetCost,
    baselineReconciled,
    optimizedReconciled,
    isFullyReconciled,
    reconciliationError,
    optimizedCalculationLine,
    optimizedCalculationLineEs,
    baselineCalculationLine,
    baselineCalculationLineEs,
    bunReductionText,
    bunReductionTextEs,
    hasRemnantCredit: oRemnantCredit > 0 || bRemnantCredit > 0,
    disclaimerText,
    disclaimerTextEs,
    unplacedNote,
    unplacedNoteEs,
    maxChartValue,
    axisTicks,
  };
}
