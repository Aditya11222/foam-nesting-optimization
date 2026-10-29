import React from 'react';
import {
  TrendingUp,
  Award,
  Clock,
  Package,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react';
import type { OptimizationResult } from '../types';

interface ExecutiveSummaryCardProps {
  currentResult: OptimizationResult | null;
  totalAvailableBlocks: number;
  onGoToStep4: () => void;
}

const CU_FT_IN_CU_IN = 1728.0;

const DEFAULT_COST_BY_GRADE: Record<string, number> = {
  'HR-40': 4.50,
  'HR-30': 3.80,
  'VE-50': 6.20,
};

export const ExecutiveSummaryCard: React.FC<ExecutiveSummaryCardProps> = ({
  currentResult,
  totalAvailableBlocks,
  onGoToStep4,
}) => {

  // Financial and KPI calculations matching DashboardStep4
  const metrics = React.useMemo(() => {
    if (!currentResult) return null;

    const grade = currentResult.grade || 'HR-40';
    const uCost = DEFAULT_COST_BY_GRADE[grade] ?? 4.50;
    const sawRatePerHour = 65.0; // standard saw rate
    const remnantCreditPct = 40.0; // 40% scrap recovery

    const gCuFt = currentResult.total_gross_volume / CU_FT_IN_CU_IN;
    const pCuFt = currentResult.total_parts_volume / CU_FT_IN_CU_IN;
    const rCuFt = currentResult.total_remnant_volume / CU_FT_IN_CU_IN;
    const sCuFt = currentResult.total_unrecoverable_scrap_volume / CU_FT_IN_CU_IN;

    const sHours = currentResult.estimated_saw_time_minutes / 60.0;
    const matCost = gCuFt * uCost;
    const sawCost = sHours * sawRatePerHour;
    const remCredit = rCuFt * uCost * (remnantCreditPct / 100.0);
    const netCost = Math.max(0, matCost + sawCost - remCredit);

    // Baseline calculation (41.2% manual single-orientation yield)
    const sampleBlock = currentResult.blocks[0];
    const singleBunUsableCuIn = sampleBlock
      ? sampleBlock.usable_length * sampleBlock.usable_width * sampleBlock.usable_height
      : 300000.0;
    const naiveUsablePerBun = singleBunUsableCuIn * 0.412;
    const bBlocks = Math.max(
      currentResult.blocks_used_count + 1,
      Math.ceil(currentResult.total_parts_volume / Math.max(1, naiveUsablePerBun))
    );
    const bunGrossCuIn = sampleBlock ? sampleBlock.gross_volume : 354240.0;
    const bGrossCuFt = (bBlocks * bunGrossCuIn) / CU_FT_IN_CU_IN;
    const bScrapCuFt = Math.max(0, bGrossCuFt - pCuFt);
    const bSawHours = sHours * 1.45;
    const bTotalCost = bGrossCuFt * uCost + bSawHours * sawRatePerHour;

    const savedCost = Math.max(0, bTotalCost - netCost);
    const savedPct = bTotalCost > 0 ? (savedCost / bTotalCost) * 100.0 : 0.0;
    const wasteRedCuFt = Math.max(0, bScrapCuFt - sCuFt);
    const wasteRedPct = bScrapCuFt > 0 ? (wasteRedCuFt / bScrapCuFt) * 100.0 : 0.0;

    return {
      netJobCost: netCost,
      materialCost: matCost,
      sawCost: sawCost,
      remnantCredit: remCredit,
      savedCostTotal: savedCost,
      savedCostPct: savedPct,
      wasteReducedCuFt: wasteRedCuFt,
      wasteReducedPct: wasteRedPct,
      scrapCuFt: sCuFt,
    };
  }, [currentResult]);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col h-full min-h-[580px] lg:h-[640px] overflow-hidden">
      {/* Card Header */}
      <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-2.5">
          <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200">
            <TrendingUp className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900 leading-tight">Optimization Executive Summary</h2>
            <span className="text-[10px] text-slate-500 font-medium">ROI, Financials & Yield Analysis</span>
          </div>
        </div>
        {currentResult && (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200">
            {currentResult.grade}
          </span>
        )}
      </div>

      {/* Card Body */}
      <div className="p-5 flex-1 flex flex-col space-y-3.5 overflow-y-auto">
        {currentResult && metrics ? (
          <>
            {/* KPI 1: Waste Reduction */}
            <div className="p-3.5 bg-gradient-to-br from-emerald-50/90 to-teal-50/50 border border-emerald-200 rounded-xl relative overflow-hidden shadow-2xs">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-bold text-emerald-900 uppercase tracking-wide">
                  Waste Reduction
                </span>
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100/90 px-1.5 py-0.5 rounded border border-emerald-200">
                  +{metrics.wasteReducedPct.toFixed(1)}% vs Manual
                </span>
              </div>
              <div className="flex items-baseline space-x-2">
                <span className="text-2xl font-black text-emerald-900">
                  {metrics.wasteReducedPct.toFixed(1)}%
                </span>
                <span className="text-xs text-emerald-700 font-medium">
                  ({metrics.wasteReducedCuFt.toFixed(1)} ft³ saved)
                </span>
              </div>
              <div className="text-[10px] text-emerald-600 mt-1">
                Unrecoverable scrap reduced to {metrics.scrapCuFt.toFixed(1)} ft³ across all nested buns.
              </div>
            </div>

            {/* KPI 2: Total Cost */}
            <div className="p-3.5 bg-gradient-to-br from-blue-50/90 to-indigo-50/50 border border-blue-200 rounded-xl shadow-2xs">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-bold text-blue-900 uppercase tracking-wide">
                  Net Batch Cost
                </span>
                <span className="text-[10px] font-bold text-blue-700 bg-blue-100/90 px-1.5 py-0.5 rounded border border-blue-200">
                  Save ${metrics.savedCostTotal.toFixed(0)} ({metrics.savedCostPct.toFixed(0)}%)
                </span>
              </div>
              <div className="flex items-baseline space-x-2">
                <span className="text-2xl font-black text-slate-900">
                  ${metrics.netJobCost.toFixed(2)}
                </span>
                <span className="text-xs text-slate-500 font-medium">
                  (${(metrics.netJobCost / (currentResult.total_parts_placed || 1)).toFixed(2)}/part)
                </span>
              </div>
              {/* Cost Breakdown Subtext */}
              <div className="mt-1.5 text-[10px] text-slate-500 grid grid-cols-3 gap-1 pt-1 border-t border-blue-100">
                <div>
                  Mat: <strong>${metrics.materialCost.toFixed(0)}</strong>
                </div>
                <div>
                  Saw: <strong>${metrics.sawCost.toFixed(0)}</strong>
                </div>
                <div>
                  Credit: <strong className="text-emerald-600">-${metrics.remnantCredit.toFixed(0)}</strong>
                </div>
              </div>
            </div>

            {/* KPI 3: Nesting Yield */}
            <div className="p-3.5 bg-gradient-to-br from-slate-50 to-indigo-50/30 border border-slate-200 rounded-xl shadow-2xs">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wide">
                  Nesting Yield
                </span>
                <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200">
                  +{(currentResult.net_utilization_pct - 41.2).toFixed(1)}% vs manual
                </span>
              </div>
              <div className="flex items-baseline space-x-2">
                <span className="text-2xl font-black text-blue-700">
                  {currentResult.net_utilization_pct.toFixed(1)}%
                </span>
                <span className="text-xs text-slate-500 font-medium">
                  ({currentResult.gross_utilization_pct.toFixed(1)}% Gross)
                </span>
              </div>

              {/* Multi-segment Yield Bar */}
              <div className="w-full bg-slate-200 h-2 rounded-full mt-2 overflow-hidden flex">
                <div
                  className="bg-blue-600 h-full"
                  style={{ width: `${Math.min(100, currentResult.net_utilization_pct)}%` }}
                  title={`Parts: ${currentResult.net_utilization_pct.toFixed(1)}%`}
                />
                <div
                  className="bg-emerald-500 h-full"
                  style={{
                    width: `${Math.min(
                      100 - currentResult.net_utilization_pct,
                      (currentResult.total_remnant_volume / (currentResult.total_usable_volume || 1)) * 100
                    )}%`,
                  }}
                  title="Remnants"
                />
              </div>
            </div>

            {/* Secondary Operational Metrics Grid */}
            <div className="grid grid-cols-3 gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-center text-xs">
              <div>
                <span className="block text-[10px] text-slate-400 font-medium">Runtime</span>
                <span className="font-extrabold text-slate-800 flex items-center justify-center space-x-0.5">
                  <Clock className="w-3 h-3 text-slate-400" />
                  <span>{(currentResult.runtime_ms / 1000).toFixed(2)}s</span>
                  {currentResult.cached && (
                    <span className="ml-1 text-[9px] bg-emerald-100 text-emerald-800 font-medium px-1 rounded border border-emerald-200">Cached</span>
                  )}
                </span>
              </div>

              <div>
                <span className="block text-[10px] text-slate-400 font-medium">Buns Used</span>
                <span className="font-extrabold text-slate-800 flex items-center justify-center space-x-0.5">
                  <Package className="w-3 h-3 text-slate-400" />
                  <span>
                    {currentResult.blocks_used_count} of {totalAvailableBlocks}
                  </span>
                </span>
              </div>

              <div>
                <span className="block text-[10px] text-slate-400 font-medium">Unplaced</span>
                {currentResult.unplaced_parts && currentResult.unplaced_parts.length > 0 ? (
                  <span className="font-extrabold text-amber-700 flex items-center justify-center space-x-0.5">
                    <AlertTriangle className="w-3 h-3 text-amber-600" />
                    <span>{currentResult.unplaced_parts.length} parts</span>
                  </span>
                ) : (
                  <span className="font-extrabold text-emerald-600 flex items-center justify-center space-x-0.5">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    <span>0 (100% Fit)</span>
                  </span>
                )}
              </div>
            </div>

            {/* Link to Full Step 4 Detailed Analytics */}
            <div className="pt-2">
              <button
                type="button"
                onClick={onGoToStep4}
                className="w-full flex items-center justify-center space-x-2 py-2.5 px-4 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs transition shadow-2xs cursor-pointer"
              >
                <span>View Full Analytics Manifest (Step 4)</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </>
        ) : (
          <div className="h-full min-h-[300px] flex flex-col items-center justify-center p-6 text-center text-slate-400">
            <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 mb-3 border border-slate-200">
              <Award className="w-6 h-6 stroke-[1.5]" />
            </div>
            <h3 className="text-sm font-bold text-slate-700">Executive Summary Idle</h3>
            <p className="text-xs text-slate-400 max-w-xs mt-1">
              Optimization results, financial savings, and waste reduction KPIs will appear here automatically.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
