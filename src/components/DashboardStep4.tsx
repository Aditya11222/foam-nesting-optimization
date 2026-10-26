import React, { useState, useMemo } from 'react';
import {
  Scissors,
  Printer,
  Archive,
  Download,
  BarChart3,
  Sliders,
  ChevronDown,
  ChevronUp,
  Table2,
  RotateCcw,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  Legend,
} from 'recharts';
import type { OptimizationResult } from '../types';
import {
  COLORS,
  DATA_PALETTE,
  DEFAULT_COST_ASSUMPTIONS,
  type CostAssumptions,
} from '../tokens';
import { OperatorStationView } from './OperatorStationView';
import { PrintableCutSheet } from './PrintableCutSheet';
import { RemnantInventoryView } from './RemnantInventoryView';
import { useCountUp } from './HelperComponents';

interface DashboardStep4Props {
  currentResult: OptimizationResult;
  comparisonResults: OptimizationResult[];
  isStale?: boolean;
  onGoToCutSteps: () => void;
  onExportCSV: (assumptions: CostAssumptions) => void;
}

interface VarianceRow {
  id: string;
  label: string;
  unit: string;
  planned: number;
  actual: number;
}

const CHART_TOOLTIP_STYLE: React.CSSProperties = {
  backgroundColor: COLORS.surface,
  border: `1px solid ${COLORS.borderHairline}`,
  borderRadius: '10px',
  boxShadow: '0 4px 14px rgba(60, 40, 20, 0.08)',
  color: COLORS.ink,
  fontSize: '12px',
  fontFamily: '"IBM Plex Mono", monospace',
};

export const DashboardStep4: React.FC<DashboardStep4Props> = ({
  currentResult,
  comparisonResults,
  isStale = false,
  onExportCSV,
}) => {
  const [activeTab, setActiveTab] = useState<
    'operator' | 'variance' | 'print' | 'remnants'
  >('operator');

  // Collapsible Cost Assumptions State
  const [showCostPanel, setShowCostPanel] = useState<boolean>(false);
  const [costAssumptions, setCostAssumptions] = useState<CostAssumptions>(
    DEFAULT_COST_ASSUMPTIONS
  );

  // Editable Planned vs Actual Variance State (demo: not saved)
  const initialVarianceRows = useMemo<VarianceRow[]>(() => {
    const skuCounts: Record<string, { name: string; count: number }> = {};
    for (const b of currentResult.blocks) {
      for (const p of b.placed_parts) {
        if (!skuCounts[p.sku]) {
          skuCounts[p.sku] = { name: p.name, count: 0 };
        }
        skuCounts[p.sku].count += 1;
      }
    }
    const skuRows: VarianceRow[] = Object.entries(skuCounts).map(
      ([sku, info]) => ({
        id: `sku-${sku}`,
        label: `${sku} — ${info.name}`,
        unit: 'pcs',
        planned: info.count,
        actual: info.count,
      })
    );
    return [
      ...skuRows,
      {
        id: 'total-cuts',
        label: 'Total Saw Blade Passes',
        unit: 'cuts',
        planned: currentResult.total_cuts_count,
        actual: currentResult.total_cuts_count,
      },
      {
        id: 'saw-minutes',
        label: 'Saw Station Cycle Time',
        unit: 'min',
        planned: currentResult.estimated_saw_time_minutes,
        actual: currentResult.estimated_saw_time_minutes,
      },
    ];
  }, [currentResult]);

  const [varianceOverrides, setVarianceOverrides] = useState<
    Record<string, number>
  >({});

  // Reconciled Volume & Cost Calculations
  const metrics = useMemo(() => {
    const grossCuIn = currentResult.total_gross_volume || 0;
    const usableCuIn = currentResult.total_usable_volume || 0;
    const partsCuIn = currentResult.total_parts_volume || 0;
    const remCuIn = currentResult.total_remnant_volume || 0;
    const kerfCuIn = currentResult.total_kerf_volume || 0;
    const scrapCuIn = currentResult.total_unrecoverable_scrap_volume || 0;
    const trimCuIn = Math.max(0, grossCuIn - usableCuIn);

    const grossCuFt = grossCuIn / 1728;
    const partsCuFt = partsCuIn / 1728;
    const remCuFt = remCuIn / 1728;
    const kerfCuFt = kerfCuIn / 1728;
    const scrapCuFt = scrapCuIn / 1728;
    const trimCuFt = trimCuIn / 1728;

    const gradeRate =
      costAssumptions.gradeCostPerCuFt[currentResult.grade] ?? 4.85;

    const rawMaterialCost = grossCuFt * gradeRate;
    const sawHours =
      (currentResult.total_cuts_count * costAssumptions.secondsPerCut) / 3600;
    const sawLaborCost = sawHours * costAssumptions.sawHourlyRate;
    const remnantCredit =
      remCuFt * gradeRate * (costAssumptions.remnantReuseCreditPct / 100);
    const totalNetCost = Math.max(
      0,
      rawMaterialCost + sawLaborCost - remnantCredit
    );

    const totalPartsPlaced = Math.max(1, currentResult.total_parts_placed);
    const costPerPart = totalNetCost / totalPartsPlaced;

    // Shop Baseline comparison (estimated, demo assumptions)
    const baselineYieldRatio = Math.max(
      0.2,
      costAssumptions.baselineYieldPct / 100
    );
    const baselineGrossCuFt = partsCuFt / baselineYieldRatio;
    const baselineScrapCuFt = Math.max(
      0.1,
      baselineGrossCuFt - partsCuFt - trimCuFt * 0.9
    );
    const baselineTotalCost =
      baselineGrossCuFt * gradeRate + sawLaborCost * 1.15;

    const wasteReducedCuFt = Math.max(0, baselineScrapCuFt - scrapCuFt);
    const wasteReducedPct =
      baselineScrapCuFt > 0
        ? (wasteReducedCuFt / baselineScrapCuFt) * 100
        : 0;
    const costSavings = Math.max(0, baselineTotalCost - totalNetCost);

    const totalRemnantsCount = currentResult.blocks.reduce(
      (acc, b) => acc + b.usable_remnants.length,
      0
    );

    return {
      grossCuFt,
      partsCuFt,
      remCuFt,
      kerfCuFt,
      scrapCuFt,
      trimCuFt,
      gradeRate,
      rawMaterialCost,
      sawLaborCost,
      remnantCredit,
      totalNetCost,
      costPerPart,
      baselineGrossCuFt,
      baselineScrapCuFt,
      baselineTotalCost,
      wasteReducedCuFt,
      wasteReducedPct,
      costSavings,
      totalRemnantsCount,
      sawTimeMin: Number(
        ((currentResult.total_cuts_count * costAssumptions.secondsPerCut) / 60).toFixed(1)
      ),
    };
  }, [currentResult, costAssumptions]);

  // Animated KPI Numerals (useCountUp returns formatted string)
  const animWasteReducedPct = useCountUp(metrics.wasteReducedPct, 1, 600);
  const animTotalCost = useCountUp(metrics.totalNetCost, 0, 600);
  const animNetYield = useCountUp(currentResult.net_utilization_pct, 1, 600);
  const animScrapCuFt = useCountUp(metrics.scrapCuFt, 1, 600);

  // Chart 1: Volume Breakdown (cu ft)
  const volumeChartData = useMemo(
    () => [
      {
        name: 'Placed Parts',
        volumeCuFt: Number(metrics.partsCuFt.toFixed(2)),
        fill: DATA_PALETTE[0],
      },
      {
        name: 'Retained Remnants',
        volumeCuFt: Number(metrics.remCuFt.toFixed(2)),
        fill: DATA_PALETTE[2],
      },
      {
        name: 'Skin Trim Crust',
        volumeCuFt: Number(metrics.trimCuFt.toFixed(2)),
        fill: DATA_PALETTE[3],
      },
      {
        name: 'Blade Kerf Dust',
        volumeCuFt: Number(metrics.kerfCuFt.toFixed(2)),
        fill: DATA_PALETTE[4],
      },
      {
        name: 'Unrecoverable Scrap',
        volumeCuFt: Number(metrics.scrapCuFt.toFixed(2)),
        fill: DATA_PALETTE[1],
      },
    ],
    [metrics]
  );

  // Chart 2: Algorithm Comparison (Yield %)
  const algoComparisonChartData = useMemo(() => {
    const source =
      comparisonResults.length > 0 ? comparisonResults : [currentResult];
    return source.map((r) => ({
      name: r.algorithm_name
        .replace(' Heuristic', '')
        .replace(' (CP-SAT)', ''),
      netYield: Number(r.net_utilization_pct.toFixed(1)),
      grossYield: Number(r.gross_utilization_pct.toFixed(1)),
      isBest: !!r.is_best,
    }));
  }, [comparisonResults, currentResult]);

  // Chart 3: Baseline vs Optimized (cu ft & $)
  const baselineChartData = useMemo(
    () => [
      {
        metric: 'Gross Foam (cu ft)',
        Baseline: Number(metrics.baselineGrossCuFt.toFixed(1)),
        Optimized: Number(metrics.grossCuFt.toFixed(1)),
      },
      {
        metric: 'Scrap Loss (cu ft)',
        Baseline: Number(metrics.baselineScrapCuFt.toFixed(1)),
        Optimized: Number(metrics.scrapCuFt.toFixed(1)),
      },
      {
        metric: 'Job Cost ($ × 10)',
        Baseline: Number((metrics.baselineTotalCost / 10).toFixed(1)),
        Optimized: Number((metrics.totalNetCost / 10).toFixed(1)),
      },
    ],
    [metrics]
  );

  // Chart 4: Per-Block Utilization (%)
  const perBlockChartData = useMemo(
    () =>
      currentResult.blocks.map((b) => {
        const blockRemVol = b.usable_remnants.reduce(
          (acc, r) => acc + r.volume,
          0
        );
        const remPct =
          b.usable_volume > 0
            ? Number(((blockRemVol / b.usable_volume) * 100).toFixed(1))
            : 0;
        return {
          block: `Bun #${b.block_index}`,
          partsYield: Number(b.net_utilization_pct.toFixed(1)),
          remnantYield: remPct,
        };
      }),
    [currentResult]
  );

  // Chart 5: Cost Breakdown ($)
  const costBreakdownChartData = useMemo(
    () => [
      {
        category: 'Raw Foam Material',
        amount: Number(metrics.rawMaterialCost.toFixed(2)),
        fill: DATA_PALETTE[0],
      },
      {
        category: 'Saw Station Labor',
        amount: Number(metrics.sawLaborCost.toFixed(2)),
        fill: DATA_PALETTE[3],
      },
      {
        category: 'Remnant Reuse Credit',
        amount: Number(metrics.remnantCredit.toFixed(2)),
        fill: DATA_PALETTE[2],
      },
      {
        category: 'Net Estimated Cost',
        amount: Number(metrics.totalNetCost.toFixed(2)),
        fill: DATA_PALETTE[1],
      },
    ],
    [metrics]
  );

  const handleGradeCostChange = (grade: string, val: number) => {
    if (Number.isNaN(val) || val < 0) return;
    setCostAssumptions((prev) => ({
      ...prev,
      gradeCostPerCuFt: {
        ...prev.gradeCostPerCuFt,
        [grade]: val,
      },
    }));
  };

  return (
    <div className="space-y-6">
      {/* SECTION HEADER & COST ASSUMPTIONS BAR */}
      <div className="bg-surface rounded-card border border-hairline shadow-card overflow-hidden">
        <div className="px-5 py-4 border-b border-hairline flex flex-col lg:flex-row lg:items-center justify-between gap-4 no-print">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-control bg-cocoa text-surface flex items-center justify-center shrink-0">
              <BarChart3 className="w-4 h-4 stroke-[1.5]" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-[16px] leading-[24px] font-semibold text-ink">
                  4. Results, Cost Reconciliation &amp; Shop-Floor Execution
                </h2>
                <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-raised text-secondary border border-hairline">
                  Estimated, demo assumptions
                </span>
                <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-cocoa-tint text-cocoa border border-cocoa/25">
                  Heuristic solution: {currentResult.algorithm_name}
                </span>
              </div>
              <p className="text-[12px] text-secondary mt-0.5">
                All volume figures reconcile to 100% of gross bun input ({metrics.grossCuFt.toFixed(1)} cu ft across {currentResult.blocks_used_count} buns).
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setShowCostPanel((prev) => !prev)}
              className="btn-secondary h-10 px-3.5 rounded-control text-[13px] font-medium inline-flex items-center gap-2 cursor-pointer"
            >
              <Sliders className="w-3.5 h-3.5 stroke-[1.5] text-cocoa" />
              <span>Cost Assumptions</span>
              {showCostPanel ? (
                <ChevronUp className="w-3.5 h-3.5 stroke-[1.5]" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 stroke-[1.5]" />
              )}
            </button>

            <button
              type="button"
              disabled={isStale || !currentResult.validation?.is_valid}
              onClick={() => onExportCSV(costAssumptions)}
              title={
                isStale
                  ? 'Inputs were modified — re-run optimization before exporting CSV'
                  : 'Export UTF-8 CSV manifest (summary, parts, cuts, remnants, comparison, baseline)'
              }
              className="btn-primary h-10 px-4 rounded-control text-[13px] font-medium inline-flex items-center gap-2 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
            >
              <Download className="w-4 h-4 stroke-[1.5]" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Collapsible Editable Cost-Inputs Panel */}
        {showCostPanel && (
          <div className="px-5 py-4 bg-raised/75 border-b border-hairline space-y-3 no-print">
            <div className="flex items-center justify-between">
              <span className="text-[11.5px] leading-[16px] font-semibold uppercase tracking-[0.06em] text-secondary">
                Editable Cost &amp; Baseline Demo Assumptions (Updates KPIs &amp; Charts Live)
              </span>
              <button
                type="button"
                onClick={() => setCostAssumptions(DEFAULT_COST_ASSUMPTIONS)}
                className="inline-flex items-center gap-1 text-[12px] font-medium text-cocoa hover:underline cursor-pointer"
              >
                <RotateCcw className="w-3 h-3 stroke-[1.5]" />
                <span>Reset demo defaults</span>
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-4">
              {Object.entries(costAssumptions.gradeCostPerCuFt)
                .slice(0, 3)
                .map(([gradeKey, costVal]) => (
                  <div key={gradeKey}>
                    <label className="block text-[11.5px] leading-[16px] font-semibold uppercase tracking-[0.06em] text-secondary mb-1.5">
                      {gradeKey} ($/cu ft)
                    </label>
                    <div className="relative flex items-center">
                      <input
                        type="number"
                        step="0.25"
                        min="1"
                        value={costVal}
                        onChange={(e) =>
                          handleGradeCostChange(
                            gradeKey,
                            parseFloat(e.target.value)
                          )
                        }
                        className="w-full h-10 pl-3 pr-9 rounded-control bg-surface border border-strong text-[13px] font-mono text-ink"
                      />
                      <span className="absolute right-2.5 text-[11px] font-mono text-muted pointer-events-none">
                        $/ft³
                      </span>
                    </div>
                  </div>
                ))}

              <div>
                <label className="block text-[11.5px] leading-[16px] font-semibold uppercase tracking-[0.06em] text-secondary mb-1.5">
                  Saw Rate ($/hr)
                </label>
                <div className="relative flex items-center">
                  <input
                    type="number"
                    step="1"
                    min="10"
                    value={costAssumptions.sawHourlyRate}
                    onChange={(e) =>
                      setCostAssumptions((p) => ({
                        ...p,
                        sawHourlyRate: Math.max(
                          0,
                          parseFloat(e.target.value) || 0
                        ),
                      }))
                    }
                    className="w-full h-10 pl-3 pr-9 rounded-control bg-surface border border-strong text-[13px] font-mono text-ink"
                  />
                  <span className="absolute right-2.5 text-[11px] font-mono text-muted pointer-events-none">
                    $/hr
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-[11.5px] leading-[16px] font-semibold uppercase tracking-[0.06em] text-secondary mb-1.5">
                  Cycle / Cut (s)
                </label>
                <div className="relative flex items-center">
                  <input
                    type="number"
                    step="1"
                    min="2"
                    value={costAssumptions.secondsPerCut}
                    onChange={(e) =>
                      setCostAssumptions((p) => ({
                        ...p,
                        secondsPerCut: Math.max(
                          1,
                          parseFloat(e.target.value) || 1
                        ),
                      }))
                    }
                    className="w-full h-10 pl-3 pr-8 rounded-control bg-surface border border-strong text-[13px] font-mono text-ink"
                  />
                  <span className="absolute right-2.5 text-[11px] font-mono text-muted pointer-events-none">
                    sec
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-[11.5px] leading-[16px] font-semibold uppercase tracking-[0.06em] text-secondary mb-1.5">
                  Remnant Credit
                </label>
                <div className="relative flex items-center">
                  <input
                    type="number"
                    step="5"
                    min="0"
                    max="100"
                    value={costAssumptions.remnantReuseCreditPct}
                    onChange={(e) =>
                      setCostAssumptions((p) => ({
                        ...p,
                        remnantReuseCreditPct: Math.min(
                          100,
                          Math.max(0, parseFloat(e.target.value) || 0)
                        ),
                      }))
                    }
                    className="w-full h-10 pl-3 pr-7 rounded-control bg-surface border border-strong text-[13px] font-mono text-ink"
                  />
                  <span className="absolute right-2.5 text-[11px] font-mono text-muted pointer-events-none">
                    %
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-[11.5px] leading-[16px] font-semibold uppercase tracking-[0.06em] text-secondary mb-1.5">
                  Shop Baseline Yield
                </label>
                <div className="relative flex items-center">
                  <input
                    type="number"
                    step="1"
                    min="30"
                    max="95"
                    value={costAssumptions.baselineYieldPct}
                    onChange={(e) =>
                      setCostAssumptions((p) => ({
                        ...p,
                        baselineYieldPct: Math.min(
                          95,
                          Math.max(25, parseFloat(e.target.value) || 60)
                        ),
                      }))
                    }
                    className="w-full h-10 pl-3 pr-7 rounded-control bg-surface border border-strong text-[13px] font-mono text-ink"
                  />
                  <span className="absolute right-2.5 text-[11px] font-mono text-muted pointer-events-none">
                    %
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 9 KPI CARDS: 1 HERO KPI + 8 SUPPORTING KPIS */}
        <div className="p-5 grid grid-cols-1 lg:grid-cols-12 gap-4 border-b border-hairline">
          {/* Hero KPI Card (4 cols on desktop): Waste Reduced vs Baseline */}
          <div className="lg:col-span-4 p-5 rounded-card bg-raised/70 border border-hairline flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11.5px] leading-[16px] font-semibold uppercase tracking-[0.06em] text-secondary">
                Waste Reduced vs. Shop Baseline
              </span>
              <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-terracotta-tint text-terracotta border border-terracotta/30">
                -{metrics.wasteReducedCuFt.toFixed(1)} cu ft scrap
              </span>
            </div>

            <div className="my-2 flex items-baseline gap-3">
              <span className="font-display text-[40px] leading-[44px] font-normal text-ink tabular-nums">
                {animWasteReducedPct}%
              </span>
              <span className="text-[13px] text-secondary font-mono">
                (${metrics.costSavings.toFixed(0)} est. savings)
              </span>
            </div>

            <div className="pt-2 border-t border-hairline flex items-center justify-between text-[11.5px] text-secondary">
              <span>Baseline Yield: {costAssumptions.baselineYieldPct}%</span>
              <span className="font-mono text-muted">
                Estimated, demo assumptions
              </span>
            </div>
          </div>

          {/* 8 Supporting KPIs Grid (8 cols on desktop, 2x4 grid) */}
          <div className="lg:col-span-8 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* 2. Estimated Total Cost */}
            <div className="p-3.5 rounded-control bg-surface border border-hairline flex flex-col justify-between">
              <span className="text-[11.5px] leading-[16px] font-semibold uppercase tracking-[0.06em] text-secondary">
                Est. Total Cost
              </span>
              <div className="font-display text-[24px] leading-[32px] text-ink tabular-nums mt-1">
                ${animTotalCost}
              </div>
              <span className="text-[11px] font-mono text-muted mt-1">
                After ${metrics.remnantCredit.toFixed(0)} remnant credit
              </span>
            </div>

            {/* 3. Net Usable Yield */}
            <div className="p-3.5 rounded-control bg-surface border border-hairline flex flex-col justify-between">
              <span className="text-[11.5px] leading-[16px] font-semibold uppercase tracking-[0.06em] text-secondary">
                Net Usable Yield
              </span>
              <div className="font-display text-[24px] leading-[32px] text-cocoa tabular-nums mt-1">
                {animNetYield}%
              </div>
              <span className="text-[11px] font-mono text-muted mt-1">
                Gross Bun: {currentResult.gross_utilization_pct}%
              </span>
            </div>

            {/* 4. Scrap Volume */}
            <div className="p-3.5 rounded-control bg-surface border border-hairline flex flex-col justify-between">
              <span className="text-[11.5px] leading-[16px] font-semibold uppercase tracking-[0.06em] text-secondary">
                Scrap Volume
              </span>
              <div className="font-display text-[24px] leading-[32px] text-ink tabular-nums mt-1">
                {animScrapCuFt}
                <span className="text-[13px] font-mono text-secondary ml-1">
                  cu ft
                </span>
              </div>
              <span className="text-[11px] font-mono text-muted mt-1">
                {Math.round(currentResult.total_unrecoverable_scrap_volume).toLocaleString()} in³ unrecoverable
              </span>
            </div>

            {/* 5. Blocks Used */}
            <div className="p-3.5 rounded-control bg-surface border border-hairline flex flex-col justify-between">
              <span className="text-[11.5px] leading-[16px] font-semibold uppercase tracking-[0.06em] text-secondary">
                Blocks Used
              </span>
              <div className="font-display text-[24px] leading-[32px] text-ink tabular-nums mt-1">
                {currentResult.blocks_used_count}
                <span className="text-[13px] font-mono text-secondary ml-1">
                  buns
                </span>
              </div>
              <span className="text-[11px] font-mono text-muted mt-1">
                Grade {currentResult.grade} ({metrics.grossCuFt.toFixed(1)} ft³)
              </span>
            </div>

            {/* 6. Total Cuts */}
            <div className="p-3.5 rounded-control bg-surface border border-hairline flex flex-col justify-between">
              <span className="text-[11.5px] leading-[16px] font-semibold uppercase tracking-[0.06em] text-secondary">
                Total Cuts
              </span>
              <div className="font-display text-[24px] leading-[32px] text-ink tabular-nums mt-1">
                {currentResult.total_cuts_count}
              </div>
              <span className="text-[11px] font-mono text-muted mt-1">
                Kerf loss: {metrics.kerfCuFt.toFixed(2)} cu ft
              </span>
            </div>

            {/* 7. Estimated Saw Time */}
            <div className="p-3.5 rounded-control bg-surface border border-hairline flex flex-col justify-between">
              <span className="text-[11.5px] leading-[16px] font-semibold uppercase tracking-[0.06em] text-secondary">
                Est. Saw Time
              </span>
              <div className="font-display text-[24px] leading-[32px] text-ink tabular-nums mt-1">
                {metrics.sawTimeMin}
                <span className="text-[13px] font-mono text-secondary ml-1">
                  min
                </span>
              </div>
              <span className="text-[11px] font-mono text-muted mt-1">
                @{costAssumptions.secondsPerCut}s per pass
              </span>
            </div>

            {/* 8. Remnants Retained */}
            <div className="p-3.5 rounded-control bg-surface border border-hairline flex flex-col justify-between">
              <span className="text-[11.5px] leading-[16px] font-semibold uppercase tracking-[0.06em] text-secondary">
                Remnants Retained
              </span>
              <div className="font-display text-[24px] leading-[32px] text-sage tabular-nums mt-1">
                {metrics.remCuFt.toFixed(1)}
                <span className="text-[13px] font-mono text-secondary ml-1">
                  cu ft
                </span>
              </div>
              <span className="text-[11px] font-mono text-muted mt-1">
                {metrics.totalRemnantsCount} salvageable offcuts
              </span>
            </div>

            {/* 9. Cost per Part */}
            <div className="p-3.5 rounded-control bg-surface border border-hairline flex flex-col justify-between">
              <span className="text-[11.5px] leading-[16px] font-semibold uppercase tracking-[0.06em] text-secondary">
                Cost per Part
              </span>
              <div className="font-display text-[24px] leading-[32px] text-ink tabular-nums mt-1">
                ${metrics.costPerPart.toFixed(2)}
              </div>
              <span className="text-[11px] font-mono text-muted mt-1">
                Across {currentResult.total_parts_placed} placed parts
              </span>
            </div>
          </div>
        </div>

        {/* 5 RECHARTS ANALYTICS VISUALIZATIONS */}
        <div
          className="p-5 grid grid-cols-1 lg:grid-cols-12 gap-4 bg-canvas/40 border-b border-hairline no-print"
          aria-label="Optimization Analytics Charts"
        >
          {/* Chart 1: Volume Breakdown (4 cols) */}
          <div className="lg:col-span-4 p-4 rounded-card bg-surface border border-hairline flex flex-col">
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-hairline">
              <h3 className="text-[14px] font-semibold text-ink">
                Volume Breakdown (cu ft)
              </h3>
              <span className="text-[11px] font-mono text-muted">
                Total: {metrics.grossCuFt.toFixed(1)} ft³
              </span>
            </div>
            <div className="h-56 w-full" role="img" aria-label="Bar chart of volume breakdown in cubic feet">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={volumeChartData}
                  layout="vertical"
                  margin={{ top: 4, right: 16, left: 20, bottom: 4 }}
                >
                  <CartesianGrid
                    stroke={COLORS.chartGrid}
                    strokeDasharray="3 3"
                    horizontal={false}
                  />
                  <XAxis
                    type="number"
                    tick={{
                      fill: COLORS.textSecondary,
                      fontSize: 12,
                      fontFamily: '"IBM Plex Mono", monospace',
                    }}
                    axisLine={{ stroke: COLORS.borderHairline }}
                    tickLine={false}
                    unit=" ft³"
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={118}
                    tick={{
                      fill: COLORS.ink,
                      fontSize: 11.5,
                      fontFamily: '"Instrument Sans", sans-serif',
                    }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={CHART_TOOLTIP_STYLE}
                    formatter={(val: any) => [`${val} cu ft`, 'Volume']}
                  />
                  <Bar dataKey="volumeCuFt" radius={[0, 4, 4, 0]} barSize={18}>
                    {volumeChartData.map((entry, idx) => (
                      <Cell key={`vol-${idx}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 2: Algorithm Comparison (4 cols) */}
          <div className="lg:col-span-4 p-4 rounded-card bg-surface border border-hairline flex flex-col">
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-hairline">
              <h3 className="text-[14px] font-semibold text-ink">
                Algorithm Yield Comparison (%)
              </h3>
              <span className="text-[11px] font-mono text-muted">
                Heuristic benchmark
              </span>
            </div>
            <div className="h-56 w-full" role="img" aria-label="Bar chart comparing algorithm net and gross yield percentages">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={algoComparisonChartData}
                  margin={{ top: 8, right: 12, left: -12, bottom: 4 }}
                >
                  <CartesianGrid
                    stroke={COLORS.chartGrid}
                    strokeDasharray="3 3"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="name"
                    tick={{
                      fill: COLORS.textSecondary,
                      fontSize: 11,
                      fontFamily: '"Instrument Sans", sans-serif',
                    }}
                    axisLine={{ stroke: COLORS.borderHairline }}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={{
                      fill: COLORS.textSecondary,
                      fontSize: 12,
                      fontFamily: '"IBM Plex Mono", monospace',
                    }}
                    axisLine={false}
                    tickLine={false}
                    unit="%"
                  />
                  <Tooltip
                    contentStyle={CHART_TOOLTIP_STYLE}
                    formatter={(val: any, name: any) => [
                      `${val}%`,
                      name === 'netYield' ? 'Net Usable Yield' : 'Gross Yield',
                    ]}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: '11px', paddingTop: '4px' }}
                  />
                  <Bar
                    dataKey="netYield"
                    name="Net Yield (%)"
                    fill={DATA_PALETTE[0]}
                    radius={[4, 4, 0, 0]}
                    barSize={20}
                  />
                  <Bar
                    dataKey="grossYield"
                    name="Gross Yield (%)"
                    fill={DATA_PALETTE[2]}
                    radius={[4, 4, 0, 0]}
                    barSize={20}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 3: Baseline vs Optimized (4 cols) */}
          <div className="lg:col-span-4 p-4 rounded-card bg-surface border border-hairline flex flex-col">
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-hairline">
              <h3 className="text-[14px] font-semibold text-ink">
                Shop Baseline vs. Optimized
              </h3>
              <span className="text-[11px] font-mono text-muted">
                Est. demo assumptions
              </span>
            </div>
            <div className="h-56 w-full" role="img" aria-label="Grouped bar chart comparing baseline and optimized material and cost">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={baselineChartData}
                  margin={{ top: 8, right: 12, left: -12, bottom: 4 }}
                >
                  <CartesianGrid
                    stroke={COLORS.chartGrid}
                    strokeDasharray="3 3"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="metric"
                    tick={{
                      fill: COLORS.textSecondary,
                      fontSize: 11,
                      fontFamily: '"Instrument Sans", sans-serif',
                    }}
                    axisLine={{ stroke: COLORS.borderHairline }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{
                      fill: COLORS.textSecondary,
                      fontSize: 12,
                      fontFamily: '"IBM Plex Mono", monospace',
                    }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                  <Legend
                    wrapperStyle={{ fontSize: '11px', paddingTop: '4px' }}
                  />
                  <Bar
                    dataKey="Baseline"
                    name="Shop Baseline"
                    fill={DATA_PALETTE[3]}
                    radius={[4, 4, 0, 0]}
                    barSize={22}
                  />
                  <Bar
                    dataKey="Optimized"
                    name="Optimized Heuristic"
                    fill={DATA_PALETTE[0]}
                    radius={[4, 4, 0, 0]}
                    barSize={22}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 4: Per-Block Utilization (%) (6 cols) */}
          <div className="lg:col-span-6 p-4 rounded-card bg-surface border border-hairline flex flex-col">
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-hairline">
              <h3 className="text-[14px] font-semibold text-ink">
                Per-Bun Interior Utilization (%)
              </h3>
              <span className="text-[11px] font-mono text-muted">
                Parts Yield + Salvageable Remnants
              </span>
            </div>
            <div className="h-52 w-full" role="img" aria-label="Bar chart of utilization percentage for each foam bun">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={perBlockChartData}
                  margin={{ top: 8, right: 16, left: -10, bottom: 4 }}
                >
                  <CartesianGrid
                    stroke={COLORS.chartGrid}
                    strokeDasharray="3 3"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="block"
                    tick={{
                      fill: COLORS.ink,
                      fontSize: 12,
                      fontFamily: '"IBM Plex Mono", monospace',
                    }}
                    axisLine={{ stroke: COLORS.borderHairline }}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={{
                      fill: COLORS.textSecondary,
                      fontSize: 12,
                      fontFamily: '"IBM Plex Mono", monospace',
                    }}
                    axisLine={false}
                    tickLine={false}
                    unit="%"
                  />
                  <Tooltip
                    contentStyle={CHART_TOOLTIP_STYLE}
                    formatter={(val: any, name: any) => [
                      `${val}%`,
                      name === 'partsYield' ? 'Placed Parts %' : 'Retained Remnant %',
                    ]}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: '11px', paddingTop: '4px' }}
                  />
                  <Bar
                    dataKey="partsYield"
                    name="Placed Parts (%)"
                    stackId="util"
                    fill={DATA_PALETTE[0]}
                    radius={[0, 0, 0, 0]}
                    barSize={32}
                  />
                  <Bar
                    dataKey="remnantYield"
                    name="Salvageable Remnant (%)"
                    stackId="util"
                    fill={DATA_PALETTE[2]}
                    radius={[4, 4, 0, 0]}
                    barSize={32}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 5: Cost Breakdown ($) (6 cols) */}
          <div className="lg:col-span-6 p-4 rounded-card bg-surface border border-hairline flex flex-col">
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-hairline">
              <h3 className="text-[14px] font-semibold text-ink">
                Estimated Job Cost Breakdown (USD)
              </h3>
              <span className="text-[11px] font-mono text-muted">
                Grade {currentResult.grade} @ ${metrics.gradeRate.toFixed(2)}/ft³ (demo assumptions)
              </span>
            </div>
            <div className="h-52 w-full" role="img" aria-label="Bar chart of estimated cost breakdown in US dollars">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={costBreakdownChartData}
                  margin={{ top: 8, right: 16, left: 0, bottom: 4 }}
                >
                  <CartesianGrid
                    stroke={COLORS.chartGrid}
                    strokeDasharray="3 3"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="category"
                    tick={{
                      fill: COLORS.textSecondary,
                      fontSize: 11.5,
                      fontFamily: '"Instrument Sans", sans-serif',
                    }}
                    axisLine={{ stroke: COLORS.borderHairline }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{
                      fill: COLORS.textSecondary,
                      fontSize: 12,
                      fontFamily: '"IBM Plex Mono", monospace',
                    }}
                    axisLine={false}
                    tickLine={false}
                    unit="$"
                  />
                  <Tooltip
                    contentStyle={CHART_TOOLTIP_STYLE}
                    formatter={(val: any) => [`$${Number(val).toFixed(2)}`, 'Estimated USD']}
                  />
                  <Bar dataKey="amount" radius={[4, 4, 0, 0]} barSize={34}>
                    {costBreakdownChartData.map((entry, idx) => (
                      <Cell key={`cost-${idx}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* EXECUTION TABS HEADER */}
        <div className="px-5 py-3.5 bg-raised/60 border-b border-hairline flex flex-col sm:flex-row sm:items-center justify-between gap-3 no-print">
          <div className="inline-flex flex-wrap rounded-control bg-raised p-1 border border-hairline gap-1">
            <button
              type="button"
              onClick={() => setActiveTab('operator')}
              className={`inline-flex items-center gap-2 h-9 px-3.5 rounded-control text-[13px] font-medium transition cursor-pointer ${
                activeTab === 'operator'
                  ? 'bg-surface text-ink font-semibold shadow-2xs border border-hairline'
                  : 'text-secondary hover:text-ink'
              }`}
            >
              <Scissors className="w-3.5 h-3.5 stroke-[1.5]" />
              <span>Saw Operator Station</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('variance')}
              className={`inline-flex items-center gap-2 h-9 px-3.5 rounded-control text-[13px] font-medium transition cursor-pointer ${
                activeTab === 'variance'
                  ? 'bg-surface text-ink font-semibold shadow-2xs border border-hairline'
                  : 'text-secondary hover:text-ink'
              }`}
            >
              <Table2 className="w-3.5 h-3.5 stroke-[1.5]" />
              <span>Planned vs. Actual</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('print')}
              className={`inline-flex items-center gap-2 h-9 px-3.5 rounded-control text-[13px] font-medium transition cursor-pointer ${
                activeTab === 'print'
                  ? 'bg-surface text-ink font-semibold shadow-2xs border border-hairline'
                  : 'text-secondary hover:text-ink'
              }`}
            >
              <Printer className="w-3.5 h-3.5 stroke-[1.5]" />
              <span>Printable Traveler</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('remnants')}
              className={`inline-flex items-center gap-2 h-9 px-3.5 rounded-control text-[13px] font-medium transition cursor-pointer ${
                activeTab === 'remnants'
                  ? 'bg-surface text-ink font-semibold shadow-2xs border border-hairline'
                  : 'text-secondary hover:text-ink'
              }`}
            >
              <Archive className="w-3.5 h-3.5 stroke-[1.5]" />
              <span>Remnants &amp; Aging</span>
            </button>
          </div>

          <span className="text-[12px] text-secondary font-mono">
            Station: <strong className="text-ink">{currentResult.machine.name}</strong>
          </span>
        </div>

        {/* EXECUTION TAB BODY */}
        <div className="p-5">
          {activeTab === 'operator' && (
            <OperatorStationView result={currentResult} />
          )}

          {activeTab === 'variance' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-raised p-4 rounded-control border border-hairline">
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-[14px] font-semibold text-ink">
                      Shop-Floor Planned vs. Actual Execution Log
                    </h4>
                    <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-status-warning-bg text-status-warning border border-status-warning/30">
                      demo: not saved
                    </span>
                  </div>
                  <p className="text-[12px] text-secondary mt-0.5">
                    Record actual good yield and saw cycle metrics after cutting to audit variance against the heuristic plan.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setVarianceOverrides({})}
                  className="btn-secondary h-9 px-3 rounded-control text-[12px] font-medium inline-flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
                >
                  <RotateCcw className="w-3.5 h-3.5 stroke-[1.5]" />
                  <span>Reset Actuals</span>
                </button>
              </div>

              <div className="overflow-x-auto border border-hairline rounded-card bg-surface">
                <table className="w-full text-left border-collapse text-[13px] leading-[20px]">
                  <thead>
                    <tr className="bg-raised border-b border-hairline text-secondary h-10">
                      <th className="px-4 text-[11.5px] uppercase tracking-[0.06em] font-semibold">
                        Part SKU / Operational Metric
                      </th>
                      <th className="px-4 text-right text-[11.5px] uppercase tracking-[0.06em] font-semibold">
                        Unit
                      </th>
                      <th className="px-4 text-right text-[11.5px] uppercase tracking-[0.06em] font-semibold">
                        Planned
                      </th>
                      <th className="px-4 text-right text-[11.5px] uppercase tracking-[0.06em] font-semibold w-44">
                        Actual Recorded
                      </th>
                      <th className="px-4 text-right text-[11.5px] uppercase tracking-[0.06em] font-semibold">
                        Variance (Δ)
                      </th>
                      <th className="px-4 text-right text-[11.5px] uppercase tracking-[0.06em] font-semibold">
                        Variance (%)
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline">
                    {initialVarianceRows.map((row) => {
                      const actualVal =
                        varianceOverrides[row.id] !== undefined
                          ? varianceOverrides[row.id]
                          : row.actual;
                      const delta = Number((actualVal - row.planned).toFixed(1));
                      const deltaPct =
                        row.planned > 0
                          ? Number(((delta / row.planned) * 100).toFixed(1))
                          : 0;

                      return (
                        <tr
                          key={row.id}
                          className="h-11 hover:bg-row-hover transition-colors"
                        >
                          <td className="px-4 font-medium text-ink">
                            {row.label}
                          </td>
                          <td className="px-4 text-right font-mono text-secondary">
                            {row.unit}
                          </td>
                          <td className="px-4 text-right font-mono font-semibold text-ink tabular-nums">
                            {row.planned}
                          </td>
                          <td className="px-4 text-right">
                            <div className="inline-flex items-center justify-end relative w-32">
                              <input
                                type="number"
                                step={row.unit === 'min' ? '0.5' : '1'}
                                min="0"
                                value={actualVal}
                                onChange={(e) => {
                                  const v = parseFloat(e.target.value);
                                  if (!Number.isNaN(v) && v >= 0) {
                                    setVarianceOverrides((p) => ({
                                      ...p,
                                      [row.id]: v,
                                    }));
                                  }
                                }}
                                aria-label={`Actual value for ${row.label}`}
                                className="w-full h-9 pl-2.5 pr-10 text-right rounded-control bg-surface border border-strong font-mono text-[13px] text-ink tabular-nums"
                              />
                              <span className="absolute right-2.5 text-[11px] font-mono text-muted pointer-events-none">
                                {row.unit}
                              </span>
                            </div>
                          </td>
                          <td
                            className={`px-4 text-right font-mono font-semibold tabular-nums ${
                              delta === 0
                                ? 'text-secondary'
                                : delta > 0
                                ? 'text-status-warning'
                                : 'text-status-error'
                            }`}
                          >
                            {delta > 0 ? `+${delta}` : delta} {row.unit}
                          </td>
                          <td
                            className={`px-4 text-right font-mono tabular-nums ${
                              deltaPct === 0
                                ? 'text-muted'
                                : deltaPct > 0
                                ? 'text-status-warning font-medium'
                                : 'text-status-error font-medium'
                            }`}
                          >
                            {deltaPct > 0 ? `+${deltaPct}%` : `${deltaPct}%`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'print' && (
            <PrintableCutSheet result={currentResult} />
          )}

          {activeTab === 'remnants' && (
            <RemnantInventoryView result={currentResult} />
          )}
        </div>
      </div>
    </div>
  );
};
