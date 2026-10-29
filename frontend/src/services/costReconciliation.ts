export interface CostCategoryItem {
  category: string;
  categoryEs: string;
  baseline: number;
  optimized: number;
  baselineDisplay: string;
  optimizedDisplay: string;
  delta: number;
  deltaDisplay: string;
  isCredit?: boolean;
}

export interface CostReconciliationReport {
  categories: CostCategoryItem[];
  netSavingTotal: number;
  netSavingPct: number;
  savingsChipText: string;
  baselineNetCost: number;
  optimizedNetCost: number;
  baselineReconciled: boolean;
  optimizedReconciled: boolean;
  isFullyReconciled: boolean;
  reconciliationError?: string;
  bunReductionText: string;
  hasRemnantCredit: boolean;
  disclaimerText: string;
}

/**
 * Formats a dollar amount with comma thousand separators and no cents for clean chart display.
 */
export function formatCurrencyShort(amount: number): string {
  const rounded = Math.round(amount);
  const sign = rounded < 0 ? '-' : '';
  const abs = Math.abs(rounded);
  return `${sign}$${abs.toLocaleString()}`;
}

/**
 * Computes cost component comparison and verifies strict mathematical reconciliation:
 * Foam Cost + Saw Cost - Remnant Credit = Net Cost (to the cent).
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
  optimizedBlocksCount: number
): CostReconciliationReport {
  // 1. Baseline Cost Components
  const bFoamCost = baselineGrossCuFt * unitCost;
  const bScrapCost = baselineScrapCuFt * unitCost;
  const bSawCost = baselineSawHours * sawRatePerHour;
  const bRemnantCredit = 0.0;
  const bNetCost = baselineTotalCost;

  // 2. Optimized Cost Components
  const oFoamCost = optMaterialCost;
  const oScrapCost = optScrapCuFt * unitCost;
  const oSawCost = optSawCost;
  const oRemnantCredit = optRemnantCredit;
  const oNetCost = optNetJobCost;

  // 3. Strict Reconciliation Assertion: Foam + Saw - RemnantCredit == NetCost (to the cent)
  const bReconcileDelta = Math.abs(bFoamCost + bSawCost - bRemnantCredit - bNetCost);
  const oReconcileDelta = Math.abs(oFoamCost + oSawCost - oRemnantCredit - oNetCost);
  const baselineReconciled = bReconcileDelta <= 0.02; // allow minor floating point rounding
  const optimizedReconciled = oReconcileDelta <= 0.02;
  const isFullyReconciled = baselineReconciled && optimizedReconciled;

  let reconciliationError: string | undefined = undefined;
  if (!isFullyReconciled) {
    reconciliationError = `Reconciliation delta detected: Baseline discrepancy $${bReconcileDelta.toFixed(
      2
    )}, Optimized discrepancy $${oReconcileDelta.toFixed(2)}. Foam + Saw - Credit must equal Net Cost.`;
  }

  // 4. Savings Calculations
  const netSavingTotal = Math.max(0, bNetCost - oNetCost);
  const netSavingPct = bNetCost > 0 ? (netSavingTotal / bNetCost) * 100.0 : 0.0;
  const savingsChipText = `Net saving $${Math.round(netSavingTotal).toLocaleString()} (${netSavingPct.toFixed(1)}%)`;

  // 5. Build Categories List (USD only)
  const hasRemnantCredit = bRemnantCredit > 0 || oRemnantCredit > 0;

  const categories: CostCategoryItem[] = [
    {
      category: 'Foam Cost',
      categoryEs: 'Costo Espuma',
      baseline: Math.round(bFoamCost),
      optimized: Math.round(oFoamCost),
      baselineDisplay: formatCurrencyShort(bFoamCost),
      optimizedDisplay: formatCurrencyShort(oFoamCost),
      delta: Math.round(oFoamCost - bFoamCost),
      deltaDisplay: formatCurrencyShort(oFoamCost - bFoamCost),
    },
    {
      category: 'Scrap Cost',
      categoryEs: 'Costo Desperdicio',
      baseline: Math.round(bScrapCost),
      optimized: Math.round(oScrapCost),
      baselineDisplay: formatCurrencyShort(bScrapCost),
      optimizedDisplay: formatCurrencyShort(oScrapCost),
      delta: Math.round(oScrapCost - bScrapCost),
      deltaDisplay: formatCurrencyShort(oScrapCost - bScrapCost),
    },
    {
      category: 'Saw Time',
      categoryEs: 'Tiempo Sierra',
      baseline: Math.round(bSawCost),
      optimized: Math.round(oSawCost),
      baselineDisplay: formatCurrencyShort(bSawCost),
      optimizedDisplay: formatCurrencyShort(oSawCost),
      delta: Math.round(oSawCost - bSawCost),
      deltaDisplay: formatCurrencyShort(oSawCost - bSawCost),
    },
  ];

  // Include Remnant Credit only if non-zero
  if (hasRemnantCredit) {
    categories.push({
      category: 'Remnant Credit',
      categoryEs: 'Crédito Remanente',
      baseline: -Math.round(bRemnantCredit),
      optimized: -Math.round(oRemnantCredit),
      baselineDisplay: bRemnantCredit > 0 ? `-${formatCurrencyShort(bRemnantCredit)}` : '$0',
      optimizedDisplay: oRemnantCredit > 0 ? `-${formatCurrencyShort(oRemnantCredit)}` : '$0',
      delta: -Math.round(oRemnantCredit - bRemnantCredit),
      deltaDisplay: `-${formatCurrencyShort(oRemnantCredit)}`,
      isCredit: true,
    });
  }

  // Net Total Cost Category
  categories.push({
    category: 'Net Cost',
    categoryEs: 'Costo Neto',
    baseline: Math.round(bNetCost),
    optimized: Math.round(oNetCost),
    baselineDisplay: formatCurrencyShort(bNetCost),
    optimizedDisplay: formatCurrencyShort(oNetCost),
    delta: Math.round(oNetCost - bNetCost),
    deltaDisplay: formatCurrencyShort(oNetCost - bNetCost),
  });

  // 6. Data-Driven Bun Text Footnote
  const bunReductionText = `Optimized layout uses ${optimizedBlocksCount} buns vs ${baselineBlocks} in the baseline`;
  const disclaimerText = 'Estimated, demo assumptions. Baseline is simulated.';

  return {
    categories,
    netSavingTotal,
    netSavingPct,
    savingsChipText,
    baselineNetCost: bNetCost,
    optimizedNetCost: oNetCost,
    baselineReconciled,
    optimizedReconciled,
    isFullyReconciled,
    reconciliationError,
    bunReductionText,
    hasRemnantCredit,
    disclaimerText,
  };
}
