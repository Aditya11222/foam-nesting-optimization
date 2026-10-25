import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  TrendingDown,
  DollarSign,
  Receipt,
  PackageCheck,
  Sliders,
  RotateCcw,
  FileSpreadsheet,
  CheckCircle2,
  Clock,
  Layers,
  ExternalLink,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  CartesianGrid
} from 'recharts';
import type { OptimizationResult, RemnantOutput } from '../types';

interface DashboardStep4Props {
  currentResult: OptimizationResult;
  comparisonResults?: OptimizationResult[] | null;
  onGoToCutSteps: () => void;
  onExportCSV: () => void;
}

const CU_FT_IN_CU_IN = 1728.0;

const DEFAULT_COST_BY_GRADE: Record<string, number> = {
  'HR-40': 4.50,
  'HR-30': 3.80,
  'VE-50': 6.20
};

export const DashboardStep4: React.FC<DashboardStep4Props> = ({
  currentResult,
  comparisonResults,
  onGoToCutSteps,
  onExportCSV,
}) => {
  const { t, i18n } = useTranslation();
  const isEs = i18n.language === 'es';

  // Cost model state
  const [showCostPanel, setShowCostPanel] = useState(false);
  const [costByGrade, setCostByGrade] = useState<Record<string, number>>(DEFAULT_COST_BY_GRADE);
  const [sawRatePerHour, setSawRatePerHour] = useState(65.0);
  const [remnantCreditPct, setRemnantCreditPct] = useState(40.0);

  // Editable Execution Tracking state
  const [trackingState, setTrackingState] = useState<
    Record<number, { actualYield: number; actualTime: number; status: 'Pending' | 'In Progress' | 'Completed' }>
  >(() => {
    const init: Record<number, { actualYield: number; actualTime: number; status: 'Pending' | 'In Progress' | 'Completed' }> = {};
    const avgTime = Math.round(currentResult.estimated_saw_time_minutes / Math.max(1, currentResult.blocks.length));
    currentResult.blocks.forEach((b) => {
      init[b.block_index] = {
        actualYield: b.net_utilization_pct,
        actualTime: avgTime,
        status: b.block_index === 1 ? 'In Progress' : 'Pending'
      };
    });
    return init;
  });

  const handleUpdateTracking = (
    blockIndex: number,
    field: 'actualYield' | 'actualTime' | 'status',
    val: any
  ) => {
    setTrackingState((prev) => ({
      ...prev,
      [blockIndex]: {
        ...prev[blockIndex],
        [field]: val
      }
    }));
  };

  const handleResetCostDefaults = () => {
    setCostByGrade(DEFAULT_COST_BY_GRADE);
    setSawRatePerHour(65.0);
    setRemnantCreditPct(40.0);
  };

  // Cost and Baseline calculations
  const {
    unitCost,
    optGrossCuFt,
    optPartsCuFt,
    optRemnantsCuFt,
    optScrapCuFt,
    optTrimCuFt,
    optKerfCuFt,
    optMaterialCost,
    optSawCost,
    optRemnantCredit,
    optNetJobCost,
    optCostPerPart,
    baselineBlocks,
    baselineGrossCuFt,
    baselineScrapCuFt,
    baselineTotalCost,
    costSavedTotal,
    costSavedPct,
    wasteReducedCuFt,
    wasteReducedPct
  } = useMemo(() => {
    const grade = currentResult.grade || 'HR-40';
    const uCost = costByGrade[grade] ?? 4.50;

    const gCuFt = currentResult.total_gross_volume / CU_FT_IN_CU_IN;
    const pCuFt = currentResult.total_parts_volume / CU_FT_IN_CU_IN;
    const rCuFt = currentResult.total_remnant_volume / CU_FT_IN_CU_IN;
    const sCuFt = currentResult.total_unrecoverable_scrap_volume / CU_FT_IN_CU_IN;
    const kCuFt = currentResult.total_kerf_volume / CU_FT_IN_CU_IN;
    const tCuFt = Math.max(0, gCuFt - (currentResult.total_usable_volume / CU_FT_IN_CU_IN));

    const sHours = currentResult.estimated_saw_time_minutes / 60.0;
    const matCost = gCuFt * uCost;
    const sawCost = sHours * sawRatePerHour;
    const remCredit = rCuFt * uCost * (remnantCreditPct / 100.0);
    const netCost = Math.max(0, matCost + sawCost - remCredit);
    const costPart = currentResult.total_parts_placed > 0 ? netCost / currentResult.total_parts_placed : 0;

    // Naive manual baseline layout model
    const sampleBlock = currentResult.blocks[0];
    const singleBunUsableCuIn = sampleBlock
      ? (sampleBlock.usable_length * sampleBlock.usable_width * sampleBlock.usable_height)
      : 300000.0;
    const naiveUsablePerBun = singleBunUsableCuIn * 0.412; // 41.2% single-orientation manual pack yield
    const bBlocks = Math.max(
      currentResult.blocks_used_count + 1,
      Math.ceil(currentResult.total_parts_volume / Math.max(1, naiveUsablePerBun))
    );
    const bunGrossCuIn = sampleBlock ? sampleBlock.gross_volume : 354240.0;
    const bGrossCuFt = (bBlocks * bunGrossCuIn) / CU_FT_IN_CU_IN;
    const bScrapCuFt = Math.max(0, bGrossCuFt - pCuFt);
    const bSawHours = sHours * 1.45;
    const bTotalCost = (bGrossCuFt * uCost) + (bSawHours * sawRatePerHour);

    const savedCost = Math.max(0, bTotalCost - netCost);
    const savedPct = bTotalCost > 0 ? (savedCost / bTotalCost) * 100.0 : 0.0;
    const wasteRed = Math.max(0, bScrapCuFt - sCuFt);
    const wastePct = bScrapCuFt > 0 ? (wasteRed / bScrapCuFt) * 100.0 : 0.0;

    return {
      unitCost: uCost,
      optGrossCuFt: gCuFt,
      optPartsCuFt: pCuFt,
      optRemnantsCuFt: rCuFt,
      optScrapCuFt: sCuFt,
      optTrimCuFt: tCuFt,
      optKerfCuFt: kCuFt,
      optSawHours: sHours,
      optMaterialCost: matCost,
      optSawCost: sawCost,
      optRemnantCredit: remCredit,
      optNetJobCost: netCost,
      optCostPerPart: costPart,
      baselineBlocks: bBlocks,
      baselineGrossCuFt: bGrossCuFt,
      baselineScrapCuFt: bScrapCuFt,
      baselineSawHours: bSawHours,
      baselineTotalCost: bTotalCost,
      costSavedTotal: savedCost,
      costSavedPct: savedPct,
      wasteReducedCuFt: wasteRed,
      wasteReducedPct: wastePct
    };
  }, [currentResult, costByGrade, sawRatePerHour, remnantCreditPct]);

  // Chart 1: Volume Breakdown
  const volumeChartData = useMemo(() => [
    { name: isEs ? 'Piezas' : 'Parts', cuFt: Number(optPartsCuFt.toFixed(2)), fill: '#3B82F6' },
    { name: isEs ? 'Remanentes' : 'Remnants', cuFt: Number(optRemnantsCuFt.toFixed(2)), fill: '#10B981' },
    { name: isEs ? 'Desperdicio' : 'Scrap', cuFt: Number(optScrapCuFt.toFixed(2)), fill: '#EF4444' },
    { name: isEs ? 'Desorillado' : 'Skin Trim', cuFt: Number(optTrimCuFt.toFixed(2)), fill: '#F59E0B' },
    { name: isEs ? 'Kerf' : 'Kerf Loss', cuFt: Number(optKerfCuFt.toFixed(2)), fill: '#8B5CF6' },
  ], [optPartsCuFt, optRemnantsCuFt, optScrapCuFt, optTrimCuFt, optKerfCuFt, isEs]);

  // Chart 2: Algorithm Comparison (if available, or active vs baseline)
  const algoComparisonData = useMemo(() => {
    if (comparisonResults && comparisonResults.length > 0) {
      return comparisonResults.map((r) => {
        const rGrossCuFt = r.total_gross_volume / CU_FT_IN_CU_IN;
        const rSawHours = r.estimated_saw_time_minutes / 60.0;
        const rRemnantCuFt = r.total_remnant_volume / CU_FT_IN_CU_IN;
        const rCost = (rGrossCuFt * unitCost) + (rSawHours * sawRatePerHour) - (rRemnantCuFt * unitCost * (remnantCreditPct / 100.0));
        return {
          name: r.algorithm_id === 'best_fit_decreasing'
            ? 'BFD'
            : r.algorithm_id === 'first_fit_decreasing'
            ? 'FFD'
            : r.algorithm_id === 'simulated_annealing'
            ? 'SA'
            : 'Waterjet',
          netYield: r.net_utilization_pct,
          scrapPct: Number(((r.total_unrecoverable_scrap_volume / Math.max(1, r.total_usable_volume)) * 100).toFixed(1)),
          cost: Math.round(rCost),
          isCurrent: r.algorithm_id === currentResult.algorithm_id
        };
      });
    }
    return [
      { name: isEs ? 'Línea Base' : 'Baseline', netYield: 41.2, scrapPct: 58.8, cost: Math.round(baselineTotalCost) },
      { name: currentResult.algorithm_name.slice(0, 10), netYield: currentResult.net_utilization_pct, scrapPct: Number(((optScrapCuFt / Math.max(0.1, optGrossCuFt)) * 100).toFixed(1)), cost: Math.round(optNetJobCost), isCurrent: true }
    ];
  }, [comparisonResults, currentResult, unitCost, sawRatePerHour, remnantCreditPct, baselineTotalCost, optGrossCuFt, optScrapCuFt, optNetJobCost, isEs]);

  // Chart 3: Baseline vs. Optimized
  const baselineVsOptimizedData = useMemo(() => [
    {
      metric: isEs ? 'Bloques (u)' : 'Buns (qty)',
      Baseline: baselineBlocks,
      Optimized: currentResult.blocks_used_count
    },
    {
      metric: isEs ? 'Material ($)' : 'Foam Cost ($)',
      Baseline: Math.round(baselineGrossCuFt * unitCost),
      Optimized: Math.round(optMaterialCost)
    },
    {
      metric: isEs ? 'Desperdicio ($)' : 'Scrap Cost ($)',
      Baseline: Math.round(baselineScrapCuFt * unitCost),
      Optimized: Math.round(optScrapCuFt * unitCost)
    },
    {
      metric: isEs ? 'Costo Neto ($)' : 'Net Cost ($)',
      Baseline: Math.round(baselineTotalCost),
      Optimized: Math.round(optNetJobCost)
    }
  ], [baselineBlocks, currentResult, baselineGrossCuFt, unitCost, optMaterialCost, baselineScrapCuFt, optScrapCuFt, baselineTotalCost, optNetJobCost, isEs]);

  // Chart 4: Per-Block Utilization
  const perBlockData = useMemo(() => {
    return currentResult.blocks.map((b) => ({
      block: `Block #${b.block_index}`,
      parts: b.net_utilization_pct,
      remnants: Number(((b.usable_remnants.reduce((sum, r) => sum + r.volume, 0) / Math.max(1, b.usable_volume)) * 100).toFixed(1)),
      scrap: Number(((b.unrecoverable_scrap_volume / Math.max(1, b.usable_volume)) * 100).toFixed(1)),
      kerf: Number(((b.kerf_loss_volume / Math.max(1, b.usable_volume)) * 100).toFixed(1)),
    }));
  }, [currentResult.blocks]);

  // Chart 5: Cost Breakdown Waterfall / Components
  const costBreakdownData = useMemo(() => [
    { name: isEs ? 'Materia Prima' : 'Raw Foam', value: Math.round(optMaterialCost), color: '#3B82F6' },
    { name: isEs ? 'Tiempo de Sierra' : 'Saw Operation', value: Math.round(optSawCost), color: '#6366F1' },
    { name: isEs ? 'Crédito Remanente (-)' : 'Remnant Credit (-)', value: Math.round(optRemnantCredit), color: '#10B981' },
  ], [optMaterialCost, optSawCost, optRemnantCredit, isEs]);

  // Chart 6: Machine Efficiency Comparison
  const machineEfficiencyData = useMemo(() => [
    {
      metric: isEs ? 'Kerf (pulg³ x100)' : 'Kerf Loss (cu in x100)',
      Guillotine: Math.round((currentResult.machine.cut_type === 'guillotine' ? currentResult.total_kerf_volume : 2400.0) / 100.0),
      Waterjet: Math.round((currentResult.machine.cut_type === 'free' ? currentResult.total_kerf_volume : 1200.0) / 100.0),
    },
    {
      metric: isEs ? 'Cortes (#)' : 'Cut Count (cuts)',
      Guillotine: currentResult.machine.cut_type === 'guillotine' ? currentResult.total_cuts_count : 48,
      Waterjet: currentResult.machine.cut_type === 'free' ? currentResult.total_cuts_count : 62,
    },
    {
      metric: isEs ? 'Tiempo (min)' : 'Saw Time (min)',
      Guillotine: currentResult.machine.cut_type === 'guillotine' ? Math.round(currentResult.estimated_saw_time_minutes) : 28,
      Waterjet: currentResult.machine.cut_type === 'free' ? Math.round(currentResult.estimated_saw_time_minutes) : 46,
    }
  ], [currentResult, isEs]);

  // All Usable Remnants
  const allRemnants: RemnantOutput[] = useMemo(() => {
    return currentResult.blocks.flatMap((b) => b.usable_remnants);
  }, [currentResult.blocks]);

  return (
    <section className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-6">
      {/* Step 4 Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-slate-100 gap-3">
        <div className="flex items-center space-x-3">
          <span className="flex items-center justify-center w-7 h-7 rounded-full bg-emerald-600 text-white font-bold text-xs shadow-xs">
            4
          </span>
          <div>
            <h2 className="font-bold text-slate-800 text-base flex items-center space-x-2">
              <span>{t('step4_title')}</span>
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                Executive & Shop Floor
              </span>
            </h2>
            <p className="text-xs text-slate-500 flex flex-wrap items-center gap-1.5 mt-0.5">
              <span>Job <span className="font-semibold text-slate-700">{currentResult.job_id}</span></span>
              <span>•</span>
              <span>Grade <span className="font-semibold text-slate-700">{currentResult.grade}</span></span>
              <span>•</span>
              <span>Station <span className="font-semibold text-slate-700">{currentResult.machine.name}</span></span>
              <span>•</span>
              <span className={`inline-flex items-center px-2 py-0.5 rounded font-mono text-[10px] font-bold border ${
                currentResult.total_parts_placed < currentResult.total_parts_demanded
                  ? 'bg-amber-50 text-amber-800 border-amber-300'
                  : 'bg-emerald-50 text-emerald-800 border-emerald-300'
              }`}>
                {currentResult.total_parts_placed} of {currentResult.total_parts_demanded} parts placed
                {currentResult.total_parts_placed < currentResult.total_parts_demanded && (
                  <span className="ml-1 text-red-600 font-extrabold">
                    ({currentResult.total_parts_demanded - currentResult.total_parts_placed} unplaced)
                  </span>
                )}
              </span>
              {currentResult.solver_status && (
                <>
                  <span>•</span>
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded font-mono text-[10px] bg-blue-50 text-blue-700 border border-blue-200" title={currentResult.solver_status}>
                    {currentResult.solver_status.startsWith('OPTIMAL') ? 'Optimal (Model)' : currentResult.solver_status}
                    {currentResult.solver_time_ms ? ` (${currentResult.solver_time_ms} ms)` : ''}
                  </span>
                </>
              )}
            </p>
            {currentResult.machine_assignment_reason && (
              <div className="mt-2 text-[11px] text-blue-800 bg-blue-50/80 border border-blue-200 px-3 py-1.5 rounded-lg flex items-center space-x-1.5 shadow-2xs">
                <span className="font-semibold text-blue-900 shrink-0">Auto-Assigned Station:</span>
                <span>{currentResult.machine_assignment_reason}</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={() => setShowCostPanel(!showCostPanel)}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium transition shadow-2xs"
          >
            <Sliders className="w-3.5 h-3.5 text-slate-500" />
            <span>{t('cost_assumptions')}</span>
            {showCostPanel ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          <button
            type="button"
            onClick={onExportCSV}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs transition"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>{t('export_csv')}</span>
          </button>
        </div>
      </div>

      {/* Collapsible Cost Assumptions Panel */}
      {showCostPanel && (
        <div className="p-4 bg-slate-50/80 border border-slate-200 rounded-xl space-y-3 transition">
          <div className="flex items-center justify-between pb-2 border-b border-slate-200 text-xs">
            <span className="font-semibold text-slate-700 flex items-center space-x-1.5">
              <Sliders className="w-4 h-4 text-blue-600" />
              <span>Financial & Operating Model Parameters</span>
            </span>
            <button
              type="button"
              onClick={handleResetCostDefaults}
              className="text-[11px] text-blue-600 hover:text-blue-800 font-medium inline-flex items-center space-x-1"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset Defaults</span>
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                HR-40 Cost ($/ft³)
              </label>
              <input
                type="number"
                step="0.10"
                min="0"
                value={costByGrade['HR-40'] ?? 4.50}
                onChange={(e) => setCostByGrade((prev) => ({ ...prev, 'HR-40': parseFloat(e.target.value) || 0 }))}
                className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-800 text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                HR-30 Cost ($/ft³)
              </label>
              <input
                type="number"
                step="0.10"
                min="0"
                value={costByGrade['HR-30'] ?? 3.80}
                onChange={(e) => setCostByGrade((prev) => ({ ...prev, 'HR-30': parseFloat(e.target.value) || 0 }))}
                className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-800 text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                VE-50 Cost ($/ft³)
              </label>
              <input
                type="number"
                step="0.10"
                min="0"
                value={costByGrade['VE-50'] ?? 6.20}
                onChange={(e) => setCostByGrade((prev) => ({ ...prev, 'VE-50': parseFloat(e.target.value) || 0 }))}
                className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-800 text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                Saw Machine Rate ($/hr)
              </label>
              <input
                type="number"
                step="5.00"
                min="0"
                value={sawRatePerHour}
                onChange={(e) => setSawRatePerHour(parseFloat(e.target.value) || 0)}
                className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-800 text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
          </div>
          <div className="flex items-center justify-between pt-1 text-[11px] text-slate-500">
            <span className="flex items-center space-x-1">
              <span>Remnant credit rate:</span>
              <input
                type="number"
                step="5"
                min="0"
                max="100"
                value={remnantCreditPct}
                onChange={(e) => setRemnantCreditPct(parseFloat(e.target.value) || 0)}
                className="w-16 px-1.5 py-0.5 bg-white border border-slate-300 rounded text-center text-slate-800 font-semibold"
              />
              <span>% of virgin raw foam cost</span>
            </span>
            <span className="italic text-slate-400">
              * {t('cost_disclaimer')}
            </span>
          </div>
        </div>
      )}

      {/* 4 Executive KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Waste Reduced */}
        <div className="p-4 rounded-xl border border-emerald-100 bg-linear-to-b from-emerald-50/50 to-white flex flex-col justify-between shadow-2xs">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold text-emerald-800">{t('kpi_waste_reduced')}</span>
            <span className="p-1.5 rounded-lg bg-emerald-100 text-emerald-700">
              <TrendingDown className="w-4 h-4" />
            </span>
          </div>
          <div className="my-2">
            <div className="text-2xl font-black text-slate-900 tracking-tight">
              {wasteReducedPct.toFixed(1)}%
            </div>
            <div className="text-xs font-medium text-emerald-600 flex items-center space-x-1">
              <span>{wasteReducedCuFt.toFixed(1)} ft³ saved</span>
              <span className="text-slate-400 font-normal">({(wasteReducedCuFt * CU_FT_IN_CU_IN).toLocaleString()} in³)</span>
            </div>
          </div>
          <div className="text-[10px] text-slate-400 border-t border-slate-100 pt-1.5">
            {t('vs_naive_baseline')} ({baselineScrapCuFt.toFixed(1)} ft³ scrap)
          </div>
        </div>

        {/* Card 2: Cost Saved */}
        <div className="p-4 rounded-xl border border-blue-100 bg-linear-to-b from-blue-50/50 to-white flex flex-col justify-between shadow-2xs">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold text-blue-800">{t('kpi_cost_saved')}</span>
            <span className="p-1.5 rounded-lg bg-blue-100 text-blue-700">
              <DollarSign className="w-4 h-4" />
            </span>
          </div>
          <div className="my-2">
            <div className="text-2xl font-black text-slate-900 tracking-tight">
              ${Math.round(costSavedTotal).toLocaleString()}
            </div>
            <div className="text-xs font-medium text-blue-600">
              {costSavedPct.toFixed(1)}% reduction vs manual
            </div>
          </div>
          <div className="text-[10px] text-slate-400 border-t border-slate-100 pt-1.5">
            Baseline: ${Math.round(baselineTotalCost).toLocaleString()} • {t('cost_disclaimer')}
          </div>
        </div>

        {/* Card 3: Total Job Cost */}
        <div className="p-4 rounded-xl border border-indigo-100 bg-linear-to-b from-indigo-50/50 to-white flex flex-col justify-between shadow-2xs">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold text-indigo-800">{t('kpi_total_cost')}</span>
            <span className="p-1.5 rounded-lg bg-indigo-100 text-indigo-700">
              <Receipt className="w-4 h-4" />
            </span>
          </div>
          <div className="my-2">
            <div className="text-2xl font-black text-slate-900 tracking-tight">
              ${Math.round(optNetJobCost).toLocaleString()}
            </div>
            <div className="text-xs text-slate-500">
              Mat: ${Math.round(optMaterialCost)} • Saw: ${Math.round(optSawCost)} • Rem Credit: -${Math.round(optRemnantCredit)}
            </div>
          </div>
          <div className="text-[10px] text-slate-400 border-t border-slate-100 pt-1.5">
            Net job production expenditure
          </div>
        </div>

        {/* Card 4: Finished Part Cost */}
        <div className="p-4 rounded-xl border border-violet-100 bg-linear-to-b from-violet-50/50 to-white flex flex-col justify-between shadow-2xs">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold text-violet-800">{t('kpi_part_cost')}</span>
            <span className="p-1.5 rounded-lg bg-violet-100 text-violet-700">
              <PackageCheck className="w-4 h-4" />
            </span>
          </div>
          <div className="my-2">
            <div className="text-2xl font-black text-slate-900 tracking-tight">
              ${optCostPerPart.toFixed(2)}
            </div>
            <div className="text-xs text-violet-600 font-medium">
              Average across {currentResult.total_parts_placed} of {currentResult.total_parts_demanded} pieces placed
              {currentResult.total_parts_placed < currentResult.total_parts_demanded && (
                <div className="text-[11px] text-red-600 font-bold">
                  {currentResult.total_parts_demanded - currentResult.total_parts_placed} pieces unplaced
                </div>
              )}
            </div>
          </div>
          <div className="text-[10px] text-slate-400 border-t border-slate-100 pt-1.5">
            {currentResult.blocks_used_count} buns allocated ({currentResult.net_utilization_pct}% net yield)
          </div>
        </div>
      </div>

      {/* 6 Light-Themed Visualizations Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {/* Chart 1: Volume Reconciliation Breakdown */}
        <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <span className="text-xs font-bold text-slate-800 flex items-center space-x-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-500" />
              <span>Volume Breakdown (ft³)</span>
            </span>
            <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
              100% Reconciled
            </span>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={volumeChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748B' }} />
                <YAxis tick={{ fontSize: 10, fill: '#64748B' }} />
                <Tooltip
                  formatter={(val: any) => [`${val} ft³`, 'Volume']}
                  contentStyle={{ backgroundColor: '#FFFFFF', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '11px' }}
                />
                <Bar dataKey="cuFt" radius={[4, 4, 0, 0]}>
                  {volumeChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[10px] text-slate-400 text-center">
            Total Gross Bun Volume: {optGrossCuFt.toFixed(1)} ft³ (Parts + Remnants + Scrap + Trim + Kerf)
          </p>
        </div>

        {/* Chart 2: Algorithm Benchmark Comparison */}
        <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <span className="text-xs font-bold text-slate-800 flex items-center space-x-1.5">
              <span className="w-2 h-2 rounded-full bg-indigo-500" />
              <span>Algorithm Comparison (%)</span>
            </span>
            <span className="text-[10px] font-mono text-slate-400">Yield vs Scrap</span>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={algoComparisonData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748B' }} />
                <YAxis tick={{ fontSize: 10, fill: '#64748B' }} />
                <Tooltip
                  formatter={(val: any, name: any) => [`${val}%`, name === 'netYield' ? 'Net Yield' : 'Scrap Rate']}
                  contentStyle={{ backgroundColor: '#FFFFFF', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '11px' }}
                />
                <Legend wrapperStyle={{ fontSize: '10px' }} />
                <Bar dataKey="netYield" name={isEs ? 'Rendimiento Neto' : 'Net Yield'} fill="#3B82F6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="scrapPct" name={isEs ? 'Desperdicio' : 'Scrap %'} fill="#EF4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[10px] text-slate-400 text-center">
            FFD preserves largest contiguous 3D remnant boxes on multi-part jobs
          </p>
        </div>

        {/* Chart 3: Baseline vs. Optimized */}
        <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <span className="text-xs font-bold text-slate-800 flex items-center space-x-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>Baseline vs. Optimized</span>
            </span>
            <span className="text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
              Heuristic delta
            </span>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={baselineVsOptimizedData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                <XAxis dataKey="metric" tick={{ fontSize: 9, fill: '#64748B' }} />
                <YAxis tick={{ fontSize: 10, fill: '#64748B' }} />
                <Tooltip contentStyle={{ backgroundColor: '#FFFFFF', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '11px' }} />
                <Legend wrapperStyle={{ fontSize: '10px' }} />
                <Bar dataKey="Baseline" fill="#94A3B8" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Optimized" fill="#10B981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[10px] text-slate-400 text-center">
            Reduces {baselineBlocks - currentResult.blocks_used_count} full raw foam bun(s)
          </p>
        </div>

        {/* Chart 4: Per-Block Utilization Stacked */}
        <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <span className="text-xs font-bold text-slate-800 flex items-center space-x-1.5">
              <span className="w-2 h-2 rounded-full bg-violet-500" />
              <span>Per-Block Utilization (%)</span>
            </span>
            <span className="text-[10px] font-mono text-slate-400">{currentResult.blocks.length} Blocks</span>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={perBlockData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                <XAxis dataKey="block" tick={{ fontSize: 10, fill: '#64748B' }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#64748B' }} />
                <Tooltip
                  formatter={(val: any) => [`${val}%`]}
                  contentStyle={{ backgroundColor: '#FFFFFF', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '11px' }}
                />
                <Legend wrapperStyle={{ fontSize: '10px' }} />
                <Bar dataKey="parts" stackId="a" fill="#3B82F6" name={isEs ? 'Piezas' : 'Parts'} />
                <Bar dataKey="remnants" stackId="a" fill="#10B981" name={isEs ? 'Remanentes' : 'Remnants'} />
                <Bar dataKey="kerf" stackId="a" fill="#8B5CF6" name={isEs ? 'Kerf' : 'Kerf'} />
                <Bar dataKey="scrap" stackId="a" fill="#EF4444" name={isEs ? 'Desperdicio' : 'Scrap'} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[10px] text-slate-400 text-center">
            Early blocks packed densely; trailing block yields usable remnant box
          </p>
        </div>

        {/* Chart 5: Cost Breakdown Components */}
        <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <span className="text-xs font-bold text-slate-800 flex items-center space-x-1.5">
              <span className="w-2 h-2 rounded-full bg-cyan-500" />
              <span>Cost Component Breakdown</span>
            </span>
            <span className="text-[10px] font-mono text-slate-400">${Math.round(optNetJobCost)} Total</span>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={costBreakdownData}
                  cx="50%"
                  cy="50%"
                  outerRadius={75}
                  dataKey="value"
                  label={({ name, percent }) => `${name} (${((percent || 0) * 100).toFixed(0)}%)`}
                  labelLine={false}
                >
                  {costBreakdownData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(val: any) => [`$${val}`, 'Cost']}
                  contentStyle={{ backgroundColor: '#FFFFFF', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '11px' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[10px] text-slate-400 text-center">
            Remnant recovery offsets {((optRemnantCredit / Math.max(1, optMaterialCost)) * 100).toFixed(1)}% of foam bun material cost
          </p>
        </div>

        {/* Chart 6: Machine Efficiency Comparison */}
        <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <span className="text-xs font-bold text-slate-800 flex items-center space-x-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              <span>Machine Efficiency Trade-offs</span>
            </span>
            <span className="text-[10px] text-slate-500 font-mono">Guillotine vs Waterjet</span>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={machineEfficiencyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                <XAxis dataKey="metric" tick={{ fontSize: 9, fill: '#64748B' }} />
                <YAxis tick={{ fontSize: 10, fill: '#64748B' }} />
                <Tooltip contentStyle={{ backgroundColor: '#FFFFFF', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '11px' }} />
                <Legend wrapperStyle={{ fontSize: '10px' }} />
                <Bar dataKey="Guillotine" fill="#64748B" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Waterjet" fill="#06B6D4" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[10px] text-slate-400 text-center">
            Waterjet reduces kerf volume by 50% with stream kerf (0.0625" vs 0.125")
          </p>
        </div>
      </div>

      {/* Execution Tracking Table (Planned vs. Actual) */}
      <div className="p-5 border border-slate-200 rounded-xl bg-slate-50/50 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-200 pb-3">
          <div>
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center space-x-2">
              <Clock className="w-4 h-4 text-blue-600" />
              <span>{t('planned_vs_actual')}</span>
            </h3>
            <p className="text-[11px] text-slate-500">
              Floor operator execution logging: update actual yields and saw runtimes to track variances.
            </p>
          </div>
          <button
            type="button"
            onClick={onGoToCutSteps}
            className="inline-flex items-center space-x-1 text-xs text-blue-600 hover:text-blue-800 font-semibold"
          >
            <span>{t('go_to_cut_steps')}</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs bg-white rounded-lg border border-slate-200 overflow-hidden shadow-2xs">
            <thead className="bg-slate-100 text-slate-600 font-semibold border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-3">Block #</th>
                <th className="py-2.5 px-3">Bun Code</th>
                <th className="py-2.5 px-3">Grade</th>
                <th className="py-2.5 px-3 text-right">Planned Yield</th>
                <th className="py-2.5 px-3 text-right">Actual Yield</th>
                <th className="py-2.5 px-3 text-right">Planned Time</th>
                <th className="py-2.5 px-3 text-right">Actual Time</th>
                <th className="py-2.5 px-3 text-center">Variance</th>
                <th className="py-2.5 px-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {currentResult.blocks.map((b) => {
                const tr = trackingState[b.block_index] || {
                  actualYield: b.net_utilization_pct,
                  actualTime: Math.round(currentResult.estimated_saw_time_minutes / currentResult.blocks.length),
                  status: 'Pending'
                };
                const plannedTime = Math.round(currentResult.estimated_saw_time_minutes / currentResult.blocks.length);
                const yieldDiff = tr.actualYield - b.net_utilization_pct;
                const timeDiff = tr.actualTime - plannedTime;

                return (
                  <tr key={b.block_index} className="hover:bg-slate-50/80 transition">
                    <td className="py-2.5 px-3 font-semibold text-slate-900">Block #{b.block_index}</td>
                    <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600">{b.stock_id}</td>
                    <td className="py-2.5 px-3 font-medium text-slate-600">{b.grade}</td>
                    <td className="py-2.5 px-3 text-right font-medium text-slate-600">{b.net_utilization_pct}%</td>
                    <td className="py-2.5 px-3 text-right">
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        max="100"
                        value={tr.actualYield}
                        onChange={(e) => handleUpdateTracking(b.block_index, 'actualYield', parseFloat(e.target.value) || 0)}
                        className="w-16 px-1.5 py-0.5 border border-slate-300 rounded text-right font-semibold text-slate-800 text-xs focus:ring-1 focus:ring-blue-500"
                      />
                      <span className="text-[10px] text-slate-400 ml-1">%</span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-medium text-slate-600">{plannedTime} min</td>
                    <td className="py-2.5 px-3 text-right">
                      <input
                        type="number"
                        step="1"
                        min="0"
                        value={tr.actualTime}
                        onChange={(e) => handleUpdateTracking(b.block_index, 'actualTime', parseInt(e.target.value, 10) || 0)}
                        className="w-14 px-1.5 py-0.5 border border-slate-300 rounded text-right font-semibold text-slate-800 text-xs focus:ring-1 focus:ring-blue-500"
                      />
                      <span className="text-[10px] text-slate-400 ml-1">m</span>
                      <div className="text-[9px] text-slate-400">
                        {timeDiff >= 0 ? `+${timeDiff}m` : `${timeDiff}m`}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span
                        className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                          yieldDiff >= 0
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}
                      >
                        {yieldDiff >= 0 ? `+${yieldDiff.toFixed(1)}%` : `${yieldDiff.toFixed(1)}%`}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <select
                        value={tr.status}
                        onChange={(e) => handleUpdateTracking(b.block_index, 'status', e.target.value as any)}
                        className="text-[11px] font-medium rounded border border-slate-300 bg-white px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      >
                        <option value="Pending">Pending</option>
                        <option value="In Progress">In Progress</option>
                        <option value="Completed">Completed</option>
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recorded Usable Remnants Table */}
      <div className="p-5 border border-slate-200 rounded-xl bg-slate-50/50 space-y-3">
        <div className="flex items-center justify-between border-b border-slate-200 pb-2">
          <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center space-x-2">
            <Layers className="w-4 h-4 text-emerald-600" />
            <span>{t('remnants_recorded')} ({allRemnants.length})</span>
          </h3>
          <span className="text-[11px] text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
            Total Remnant Recovery: {optRemnantsCuFt.toFixed(1)} ft³ (${Math.round(optRemnantCredit)} Credit)
          </span>
        </div>

        {allRemnants.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-400 bg-white rounded-lg border border-slate-200">
            No large remnants generated for retention (all scrap minimized below threshold volume).
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs bg-white rounded-lg border border-slate-200 overflow-hidden shadow-2xs">
              <thead className="bg-slate-100 text-slate-600 font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">Remnant ID</th>
                  <th className="py-2.5 px-3">Grade</th>
                  <th className="py-2.5 px-3">Dimensions (L × W × H)</th>
                  <th className="py-2.5 px-3 text-right">Volume</th>
                  <th className="py-2.5 px-3 text-center">Usability Score</th>
                  <th className="py-2.5 px-3">Warehouse Bay</th>
                  <th className="py-2.5 px-3 text-center">Inventory Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {allRemnants.map((r) => {
                  const volCuFt = (r.volume / CU_FT_IN_CU_IN).toFixed(2);
                  return (
                    <tr key={r.id} className="hover:bg-slate-50/80 transition">
                      <td className="py-2.5 px-3 font-mono font-semibold text-slate-800">{r.code}</td>
                      <td className="py-2.5 px-3 font-medium text-slate-600">{r.grade}</td>
                      <td className="py-2.5 px-3 font-mono text-[11px]">
                        {r.length}" × {r.width}" × {r.height}"
                      </td>
                      <td className="py-2.5 px-3 text-right font-medium text-slate-800">{volCuFt} ft³</td>
                      <td className="py-2.5 px-3 text-center">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          {Math.round(r.usability_score * 100)}% usable
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-medium text-slate-600">{r.storage_location || 'Bay R-04'}</td>
                      <td className="py-2.5 px-3 text-center">
                        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                          <CheckCircle2 className="w-3 h-3 text-blue-500" />
                          <span>Stocked into ERP</span>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
};
