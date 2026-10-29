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
  ChevronUp,
  Info,
  Sparkles,
  Star,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Cell,
  CartesianGrid,
  LabelList,
} from 'recharts';
import type { OptimizationResult, RemnantOutput, PartItem } from '../types';
import { groupAndRankRemnants } from '../services/remnantScoring';
import { computeEfficiencyVsBaseline } from '../services/efficiencyBaseline';
import { computeCostReconciliation, formatCurrencyShort } from '../services/costReconciliation';
import { RemnantScoringExplanationBlock } from './RemnantScoringExplanationBlock';

interface DashboardStep4Props {
  currentResult: OptimizationResult;
  comparisonResults?: OptimizationResult[] | null;
  onGoToCutSteps: () => void;
  onExportCSV: () => void;
  onAddRemnantToInventory?: (remnant: any) => void;
  onAddAllRemnantsToInventory?: (remnants: any[]) => void;
  isStale?: boolean;
  onRunOptimization?: () => void;
}

const CU_FT_IN_CU_IN = 1728.0;

const DEFAULT_COST_BY_GRADE: Record<string, number> = {
  'HR-40': 4.50,
  'HR-30': 3.80,
  'VE-50': 6.20
};

export const DashboardStep4: React.FC<DashboardStep4Props> = ({
  currentResult,
  comparisonResults: _comparisonResults,
  onGoToCutSteps,
  onExportCSV,
  onAddRemnantToInventory,
  onAddAllRemnantsToInventory,
  isStale = false,
  onRunOptimization,
}) => {
  const [savedRemnantCodes, setSavedRemnantCodes] = useState<Set<string>>(new Set());
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

  const [selectedRemnantCodeForBreakdown, setSelectedRemnantCodeForBreakdown] = useState<string | null>(null);

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
    baselineSawHours,
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

  // Chart 2: Efficiency vs Baseline Report
  const efficiencyReport = useMemo(() => {
    return computeEfficiencyVsBaseline(
      currentResult,
      baselineGrossCuFt,
      baselineScrapCuFt,
      baselineBlocks,
      baselineSawHours,
      baselineTotalCost,
      optNetJobCost,
      optGrossCuFt,
      optScrapCuFt
    );
  }, [
    currentResult,
    baselineGrossCuFt,
    baselineScrapCuFt,
    baselineBlocks,
    baselineSawHours,
    baselineTotalCost,
    optNetJobCost,
    optGrossCuFt,
    optScrapCuFt,
  ]);

  // Chart 3: Cost Reconciliation & Baseline vs. Optimized (USD Only)
  const costReport = useMemo(() => {
    return computeCostReconciliation(
      unitCost,
      sawRatePerHour,
      baselineGrossCuFt,
      baselineScrapCuFt,
      baselineBlocks,
      baselineSawHours,
      baselineTotalCost,
      optScrapCuFt,
      optMaterialCost,
      optSawCost,
      optRemnantCredit,
      optNetJobCost,
      currentResult.blocks_used_count
    );
  }, [
    unitCost,
    sawRatePerHour,
    baselineGrossCuFt,
    baselineScrapCuFt,
    baselineBlocks,
    baselineSawHours,
    baselineTotalCost,
    optScrapCuFt,
    optMaterialCost,
    optSawCost,
    optRemnantCredit,
    optNetJobCost,
    currentResult.blocks_used_count,
  ]);

  const baselineVsOptimizedData = useMemo(() => {
    return costReport.categories.map((c) => ({
      category: isEs ? c.categoryEs : c.category,
      Baseline: c.baseline,
      Optimized: c.optimized,
      baselineFormatted: formatCurrencyShort(c.baseline),
      optimizedFormatted: formatCurrencyShort(c.optimized),
      deltaFormatted: c.deltaDisplay,
    }));
  }, [costReport, isEs]);

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
  const costBreakdownBarData = useMemo(() => [
    { component: isEs ? 'Materia Prima' : 'Raw Foam', amount: Math.round(optMaterialCost), color: '#3B82F6', isCredit: false },
    { component: isEs ? 'Tiempo de Sierra' : 'Saw Operation', amount: Math.round(optSawCost), color: '#6366F1', isCredit: false },
    { component: isEs ? 'Crédito Remanente (-)' : 'Remnant Credit (-)', amount: Math.round(optRemnantCredit), color: '#10B981', isCredit: true },
    { component: isEs ? 'Costo Neto Total' : 'Net Total Cost', amount: Math.max(0, Math.round(optNetJobCost)), color: '#0F172A', isCredit: false },
  ], [optMaterialCost, optSawCost, optRemnantCredit, optNetJobCost, isEs]);

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

  // Active parts for remnant demand fitting
  const activeDemandParts: PartItem[] = useMemo(() => {
    const parts: PartItem[] = [];
    currentResult.blocks.forEach((b) => {
      b.placed_parts.forEach((p) => {
        parts.push({
          id: p.part_id,
          sku: p.sku,
          name: p.name,
          length: p.length,
          width: p.width,
          height: p.height,
          quantity: 1,
          grade: p.grade,
          orientation_mode: 'any',
        });
      });
    });
    if (currentResult.unplaced_parts) {
      currentResult.unplaced_parts.forEach((u) => {
        parts.push({
          id: u.sku,
          sku: u.sku,
          name: u.name,
          length: u.length,
          width: u.width,
          height: u.height,
          quantity: u.unplaced_qty,
          grade: u.grade || currentResult.grade || 'HR-40',
          orientation_mode: 'any',
        });
      });
    }
    return parts;
  }, [currentResult]);

  // Grouped and ranked remnants
  const groupedRemnants = useMemo(() => {
    return groupAndRankRemnants(allRemnants, activeDemandParts);
  }, [allRemnants, activeDemandParts]);

  const recommendedCredit = useMemo(() => {
    return (
      groupedRemnants.recommendedTotals.volumeCuFt *
      unitCost *
      (remnantCreditPct / 100.0)
    );
  }, [groupedRemnants.recommendedTotals.volumeCuFt, unitCost, remnantCreditPct]);

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

        {/* Chart 2: Efficiency vs Baseline (<Selected Algorithm Name>) */}
        <div className={`p-4 rounded-xl border border-slate-200 bg-white space-y-3 flex flex-col justify-between ${isStale ? 'opacity-80 ring-1 ring-amber-300' : ''}`}>
          <div>
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between border-b border-slate-100 pb-2 gap-2">
              <div className="flex items-center space-x-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-800" />
                <span className="text-xs font-bold text-slate-800">
                  {isEs ? 'Eficiencia vs Línea Base' : 'Efficiency vs Baseline'} ({efficiencyReport.algorithmName})
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full border cursor-help ${
                    efficiencyReport.efficiencyScorePct > 0
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                      : efficiencyReport.efficiencyScorePct < 0
                      ? 'bg-rose-50 text-rose-800 border-rose-300'
                      : 'bg-slate-100 text-slate-700 border-slate-200'
                  }`}
                  title={efficiencyReport.efficiencyScoreTooltip}
                >
                  Efficiency: {efficiencyReport.efficiencyScoreDisplay} [estimated]
                </span>
              </div>
            </div>

            {/* Stale Warning Banner if Stale */}
            {isStale && (
              <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded text-[11px] text-amber-800 flex items-center justify-between">
                <span>Inputs modified — re-run to refresh baseline efficiency.</span>
                {onRunOptimization && (
                  <button
                    type="button"
                    onClick={onRunOptimization}
                    className="px-2 py-0.5 bg-amber-600 hover:bg-amber-700 text-white rounded font-bold text-[10px] cursor-pointer"
                  >
                    Re-run
                  </button>
                )}
              </div>
            )}

            {/* Data-Driven Summary Line */}
            <div className="mt-2.5 p-2 bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-slate-700 leading-snug flex items-start space-x-2">
              <Info className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <span>{efficiencyReport.summaryText}</span>
                {efficiencyReport.hasUnplaced && (
                  <div className="text-[10px] font-semibold text-amber-800">
                    Note: {efficiencyReport.unplacedCount} of {efficiencyReport.demandedCount} parts unplaced — yield calculated on placed parts only.
                  </div>
                )}
              </div>
            </div>

            {/* 5 Comparison Metric Rows */}
            <div className="space-y-2 pt-2.5">
              {efficiencyReport.metrics.map((m) => (
                <div key={m.key} className="space-y-0.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-slate-700">{m.label}</span>
                    <span
                      className={`font-mono text-[10px] font-bold px-1.5 py-0.2 rounded border ${
                        m.isImprovement
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                          : m.isWorse
                          ? 'bg-rose-50 text-rose-800 border-rose-300'
                          : 'bg-slate-100 text-slate-600 border-slate-200'
                      }`}
                    >
                      {m.deltaDisplay}
                    </span>
                  </div>

                  {/* Horizontal Proportional Bars */}
                  <div className="space-y-1">
                    {/* Baseline Bar */}
                    <div className="flex items-center space-x-2 text-[10px]">
                      <span className="w-14 text-slate-400 font-medium truncate">Baseline</span>
                      <div className="flex-1 bg-slate-100 rounded-full h-2.5 overflow-hidden flex items-center">
                        <div
                          className="bg-[#A8A29E] h-full rounded-full transition-all duration-300"
                          style={{ width: `${Math.max(5, Math.min(100, m.baselineRatio * 100))}%` }}
                        />
                      </div>
                      <span className="w-16 font-mono text-slate-600 text-right font-medium text-[10.5px]">
                        {m.baselineDisplay}
                      </span>
                    </div>

                    {/* Selected Bar */}
                    <div className="flex items-center space-x-2 text-[10px]">
                      <span className="w-14 text-amber-950 font-bold truncate">Selected</span>
                      <div className="flex-1 bg-slate-100 rounded-full h-2.5 overflow-hidden flex items-center">
                        <div
                          className="bg-[#78350F] h-full rounded-full transition-all duration-300"
                          style={{ width: `${Math.max(5, Math.min(100, m.selectedRatio * 100))}%` }}
                        />
                      </div>
                      <span className="w-16 font-mono text-amber-950 font-bold text-right text-[10.5px]">
                        {m.selectedDisplay}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Legend and Footnote */}
          <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between text-[10px] text-slate-500 gap-1.5 mt-2">
            <div className="flex items-center space-x-3">
              <span className="flex items-center space-x-1">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#A8A29E]" />
                <span>Baseline (simulated layout)</span>
              </span>
              <span className="flex items-center space-x-1">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#78350F]" />
                <span className="font-semibold text-slate-700">Selected ({efficiencyReport.algorithmName})</span>
              </span>
            </div>
            <span className="italic text-slate-400">Real calculated values</span>
          </div>
        </div>

        {/* Chart 3: Baseline vs. Optimized Cost */}
        <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-3 flex flex-col justify-between">
          <div>
            <div className="flex flex-wrap items-center justify-between border-b border-slate-100 pb-2 gap-2">
              <span className="text-xs font-bold text-slate-800 flex items-center space-x-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span>{isEs ? 'Línea Base vs. Optimizado' : 'Baseline vs. Optimized'}</span>
              </span>
              <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-300 shadow-2xs">
                {costReport.savingsChipText}
              </span>
            </div>

            {/* Reconciliation Warning (if discrepancy detected) */}
            {!costReport.isFullyReconciled && (
              <div className="mt-2 p-2 bg-rose-50 border border-rose-300 rounded text-xs text-rose-800 font-semibold">
                {costReport.reconciliationError}
              </div>
            )}

            {/* Zero Remnant Credit Notice if hidden */}
            {!costReport.hasRemnantCredit && (
              <div className="mt-1 text-[10px] text-slate-400 italic">
                * {isEs ? 'Sin crédito por remanentes' : 'No remnant credit'} ({isEs ? 'remanentes minimizados o bajo umbral de retención' : 'all off-cuts minimized or below retention threshold'}).
              </div>
            )}

            <div className="h-60 min-h-[240px] mt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={baselineVsOptimizedData} margin={{ top: 20, right: 10, left: 15, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis
                    dataKey="category"
                    tick={{ fontSize: 10, fill: '#475569', fontWeight: 600 }}
                    interval={0}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: '#64748B' }}
                    tickFormatter={(val: number) => `$${val.toLocaleString()}`}
                    label={{
                      value: isEs ? 'Coste (USD, estimado)' : 'Cost (USD, estimated)',
                      angle: -90,
                      position: 'insideLeft',
                      offset: 0,
                      style: { textAnchor: 'middle', fontSize: 10, fill: '#64748B', fontWeight: 500 }
                    }}
                  />
                  <Tooltip
                    formatter={(val: any, name: any) => [formatCurrencyShort(Number(val)), name]}
                    contentStyle={{ backgroundColor: '#FFFFFF', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '11px' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '10px' }} />
                  <Bar dataKey="Baseline" fill="#A8A29E" radius={[4, 4, 0, 0]}>
                    <LabelList dataKey="baselineFormatted" position="top" style={{ fontSize: 9, fontWeight: 700, fill: '#64748B' }} />
                  </Bar>
                  <Bar dataKey="Optimized" fill="#10B981" radius={[4, 4, 0, 0]}>
                    <LabelList dataKey="optimizedFormatted" position="top" style={{ fontSize: 9, fontWeight: 700, fill: '#047857' }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Footnote with Data-Driven Bun Text */}
          <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between text-[10px] text-slate-500 gap-1.5">
            <span className="font-medium text-slate-700">{costReport.bunReductionText}</span>
            <span className="italic text-slate-400">{costReport.disclaimerText}</span>
          </div>
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

        {/* Chart 5: Cost Component Breakdown (Bar/Waterfall Composition) */}
        <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <span className="text-xs font-bold text-slate-800 flex items-center space-x-1.5">
              <span className="w-2 h-2 rounded-full bg-cyan-500" />
              <span>{t('cost_component_breakdown')}</span>
            </span>
            <span className="text-[10px] font-mono font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
              Net Cost: ${Math.round(optNetJobCost).toLocaleString()}
            </span>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={costBreakdownBarData} margin={{ top: 15, right: 15, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                <XAxis dataKey="component" tick={{ fontSize: 10, fill: '#64748B' }} />
                <YAxis tick={{ fontSize: 10, fill: '#64748B' }} tickFormatter={(val) => `$${val}`} />
                <Tooltip
                  formatter={(val: any, _name: any, item: any) => [
                    `${item.payload.isCredit ? '-$' : '$'}${Math.abs(Number(val)).toLocaleString()}`,
                    item.payload.component,
                  ]}
                  contentStyle={{ backgroundColor: '#FFFFFF', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '11px' }}
                />
                <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                  {costBreakdownBarData.map((entry: { color: string }, index: number) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center justify-between text-[10px] text-slate-400 border-t border-slate-50 pt-2 px-1">
            <span>* {t('cost_disclaimer')}</span>
            <span className="text-emerald-600 font-medium">
              Remnant recovery offset: ${Math.round(optRemnantCredit)} ({((optRemnantCredit / Math.max(1, optMaterialCost)) * 100).toFixed(1)}% of foam)
            </span>
          </div>
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

      {/* Recorded Usable Remnants Table (Recommended First) */}
      <div className="p-5 border border-slate-200 rounded-xl bg-slate-50/50 space-y-3">
        <div className="flex flex-wrap items-center justify-between border-b border-slate-200 pb-3 gap-2">
          <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center space-x-2">
            <Layers className="w-4 h-4 text-emerald-600" />
            <span>{t('remnants_recorded')} ({allRemnants.length})</span>
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-slate-700 font-semibold bg-white px-2.5 py-1 rounded-md border border-slate-200 shadow-2xs">
              Total Recovery: {optRemnantsCuFt.toFixed(1)} ft³ (${Math.round(optRemnantCredit)} Credit)
            </span>
            <span className="text-[11px] text-emerald-800 font-bold bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-300 shadow-2xs flex items-center space-x-1">
              <Sparkles className="w-3 h-3 text-emerald-600" />
              <span>
                Recommended: {groupedRemnants.recommendedTotals.count} pcs,{' '}
                {groupedRemnants.recommendedTotals.volumeCuFt.toFixed(1)} ft³ (${Math.round(recommendedCredit)} Credit) [est]
              </span>
            </span>

            {/* Extra button: Add Recommended Only */}
            {groupedRemnants.recommended.length > 0 && onAddAllRemnantsToInventory && (
              <button
                type="button"
                onClick={() => {
                  const items = groupedRemnants.recommended.map((sr) => {
                    const r = sr.remnant;
                    return {
                      id: `rem-${Date.now().toString().slice(-6)}-${r.code}`,
                      remnant_id: r.code,
                      grade: r.grade,
                      length: r.length,
                      width: r.width,
                      height: r.height,
                      volume_cu_in: r.volume,
                      source_job_id: currentResult.job_id,
                      source_job_name: currentResult.job_id,
                      created_at: new Date().toISOString(),
                      status: 'available' as const,
                    };
                  });
                  onAddAllRemnantsToInventory(items);
                  setSavedRemnantCodes((prev) => new Set([...prev, ...groupedRemnants.recommended.map((sr) => sr.remnant.code)]));
                }}
                className="px-2.5 py-1 text-[11px] font-bold text-emerald-800 bg-emerald-100 hover:bg-emerald-200 border border-emerald-300 rounded transition cursor-pointer shadow-2xs"
              >
                + Add Recommended Only ({groupedRemnants.recommended.length})
              </button>
            )}

            {/* Existing button: Add All to Inventory */}
            {allRemnants.length > 0 && onAddAllRemnantsToInventory && (
              <button
                type="button"
                onClick={() => {
                  const items = allRemnants.map((r) => ({
                    id: `rem-${Date.now().toString().slice(-6)}-${r.code}`,
                    remnant_id: r.code,
                    grade: r.grade,
                    length: r.length,
                    width: r.width,
                    height: r.height,
                    volume_cu_in: r.volume,
                    source_job_id: currentResult.job_id,
                    source_job_name: currentResult.job_id,
                    created_at: new Date().toISOString(),
                    status: 'available' as const,
                  }));
                  onAddAllRemnantsToInventory(items);
                  setSavedRemnantCodes(new Set(allRemnants.map((r) => r.code)));
                }}
                className="px-2.5 py-1 text-[11px] font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded transition cursor-pointer shadow-2xs"
              >
                + Add All to Inventory
              </button>
            )}
          </div>
        </div>

        {allRemnants.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-400 bg-white rounded-lg border border-slate-200">
            No large remnants generated for retention (all scrap minimized below threshold volume).
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-left text-xs bg-white border-collapse min-w-[900px]">
              <thead className="bg-slate-100 text-slate-700 font-bold text-[11px] uppercase tracking-wider border-b border-slate-200 sticky top-0 select-none">
                <tr>
                  <th className="py-2.5 px-3">Remnant ID</th>
                  <th className="py-2.5 px-2">Grade</th>
                  <th className="py-2.5 px-3 font-mono">Actual Dims (L×W×H)</th>
                  <th className="py-2.5 px-3 font-mono">Post-Aging (3d)</th>
                  <th className="py-2.5 px-2 text-right">Volume</th>
                  <th className="py-2.5 px-3 text-center">Usability Score</th>
                  <th className="py-2.5 px-3">Why (Explainable Factor)</th>
                  <th className="py-2.5 px-2">Bay</th>
                  <th className="py-2.5 px-3 text-center">Inventory Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {/* 1. Group Header: RECOMMENDED TO ADD */}
                {groupedRemnants.recommended.length > 0 && (
                  <tr className="bg-emerald-50/80 border-y border-emerald-200 select-none">
                    <td colSpan={9} className="py-2 px-3">
                      <div className="flex items-center space-x-2 text-emerald-900 font-bold text-xs uppercase tracking-wide">
                        <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Recommended to Add ({groupedRemnants.recommended.length})</span>
                        <span className="text-[10px] font-normal lowercase text-emerald-700">
                          — score &ge; 50 &amp; matches demand after 3-day aging trim (-2&quot; per axis)
                        </span>
                      </div>
                    </td>
                  </tr>
                )}
                {groupedRemnants.recommended.map((sr) => {
                  const r = sr.remnant;
                  const volCuFt = (r.volume / CU_FT_IN_CU_IN).toFixed(2);
                  const isSaved = savedRemnantCodes.has(r.code);
                  const tooltipText = `Factor Breakdown:\n• Aging Usable Volume: ${sr.factorBreakdown.agingUsableVolume}%\n• Min Useful Size: ${sr.factorBreakdown.minimumUsefulSize}%\n• Demand Fit: ${sr.factorBreakdown.demandFit}% (${sr.fitPartCount}/${sr.totalPartTypes} SKUs)\n• Compactness: ${sr.factorBreakdown.compactness}%\n• Grade Demand: ${sr.factorBreakdown.gradeDemand}%\n• Freshness: ${sr.factorBreakdown.freshness}%`;

                  return (
                    <tr key={r.id} className="bg-emerald-50/20 hover:bg-emerald-50/40 transition">
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                        <div className="flex items-center space-x-1.5">
                          <span>{r.code}</span>
                          <span className="inline-flex items-center text-[9px] font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 px-1.5 py-0.2 rounded-full">
                            Recommended
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 px-2 font-medium text-slate-700">{r.grade}</td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-800 whitespace-nowrap">
                        {r.length}&quot; × {r.width}&quot; × {r.height}&quot;
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-emerald-800 whitespace-nowrap font-medium">
                        {sr.effectiveDims[0].toFixed(1)}&quot; × {sr.effectiveDims[1].toFixed(1)}&quot; × {sr.effectiveDims[2].toFixed(1)}&quot;
                      </td>
                      <td className="py-2.5 px-2 text-right font-medium text-slate-800 whitespace-nowrap">
                        {volCuFt} ft³
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <div className="flex flex-col items-center space-y-0.5">
                          <span
                            title={tooltipText}
                            className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300 cursor-help shadow-2xs"
                          >
                            <Star className="w-2.5 h-2.5 fill-emerald-600 text-emerald-700" />
                            <span>{sr.compositeScore}/100</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => setSelectedRemnantCodeForBreakdown(r.code)}
                            className="text-[10px] text-blue-600 hover:text-blue-800 underline decoration-dotted font-medium cursor-pointer"
                            aria-label={`View score breakdown for ${r.code}`}
                          >
                            {isEs ? 'Ver desglose' : 'Score breakdown'}
                          </button>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-[11px] text-slate-600 max-w-xs leading-snug">
                        {sr.reason}
                      </td>
                      <td className="py-2.5 px-2 font-medium text-slate-600 text-[11px] whitespace-nowrap">
                        {r.storage_location || 'Bay R-04'}
                      </td>
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        {isSaved ? (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>In Inventory</span>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              onAddRemnantToInventory?.({
                                id: `rem-${Date.now().toString().slice(-6)}-${r.code}`,
                                remnant_id: r.code,
                                grade: r.grade,
                                length: r.length,
                                width: r.width,
                                height: r.height,
                                volume_cu_in: r.volume,
                                source_job_id: currentResult.job_id,
                                source_job_name: currentResult.job_id,
                                created_at: new Date().toISOString(),
                                status: 'available',
                              });
                              setSavedRemnantCodes((prev) => new Set([...prev, r.code]));
                            }}
                            className="inline-flex items-center space-x-1 px-2.5 py-1 rounded text-[10px] font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-2xs transition cursor-pointer"
                          >
                            <span>+ Add to Inventory</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}

                {/* 2. Group Header: LOW PRIORITY */}
                {groupedRemnants.lowPriority.length > 0 && (
                  <tr className="bg-slate-100/90 border-y border-slate-200 select-none">
                    <td colSpan={9} className="py-2 px-3">
                      <div className="flex items-center space-x-2 text-slate-700 font-bold text-xs uppercase tracking-wide">
                        <Layers className="w-3.5 h-3.5 text-slate-500" />
                        <span>Low Priority ({groupedRemnants.lowPriority.length})</span>
                        <span className="text-[10px] font-normal lowercase text-slate-500">
                          — usable piece but narrow aspect ratio or lower demand fit
                        </span>
                      </div>
                    </td>
                  </tr>
                )}
                {groupedRemnants.lowPriority.map((sr) => {
                  const r = sr.remnant;
                  const volCuFt = (r.volume / CU_FT_IN_CU_IN).toFixed(2);
                  const isSaved = savedRemnantCodes.has(r.code);
                  const tooltipText = `Factor Breakdown:\n• Aging Usable Volume: ${sr.factorBreakdown.agingUsableVolume}%\n• Min Useful Size: ${sr.factorBreakdown.minimumUsefulSize}%\n• Demand Fit: ${sr.factorBreakdown.demandFit}% (${sr.fitPartCount}/${sr.totalPartTypes} SKUs)\n• Compactness: ${sr.factorBreakdown.compactness}%\n• Grade Demand: ${sr.factorBreakdown.gradeDemand}%\n• Freshness: ${sr.factorBreakdown.freshness}%`;

                  return (
                    <tr key={r.id} className="hover:bg-slate-50 transition">
                      <td className="py-2.5 px-3 font-mono font-medium text-slate-800">
                        {r.code}
                      </td>
                      <td className="py-2.5 px-2 font-medium text-slate-600">{r.grade}</td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                        {r.length}&quot; × {r.width}&quot; × {r.height}&quot;
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                        {sr.effectiveDims[0].toFixed(1)}&quot; × {sr.effectiveDims[1].toFixed(1)}&quot; × {sr.effectiveDims[2].toFixed(1)}&quot;
                      </td>
                      <td className="py-2.5 px-2 text-right font-medium text-slate-700 whitespace-nowrap">
                        {volCuFt} ft³
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <div className="flex flex-col items-center space-y-0.5">
                          <span
                            title={tooltipText}
                            className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200 cursor-help"
                          >
                            {sr.compositeScore}/100
                          </span>
                          <button
                            type="button"
                            onClick={() => setSelectedRemnantCodeForBreakdown(r.code)}
                            className="text-[10px] text-blue-600 hover:text-blue-800 underline decoration-dotted font-medium cursor-pointer"
                            aria-label={`View score breakdown for ${r.code}`}
                          >
                            {isEs ? 'Ver desglose' : 'Score breakdown'}
                          </button>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-[11px] text-slate-500 max-w-xs leading-snug">
                        {sr.reason}
                      </td>
                      <td className="py-2.5 px-2 font-medium text-slate-500 text-[11px] whitespace-nowrap">
                        {r.storage_location || 'Bay R-04'}
                      </td>
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        {isSaved ? (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>In Inventory</span>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              onAddRemnantToInventory?.({
                                id: `rem-${Date.now().toString().slice(-6)}-${r.code}`,
                                remnant_id: r.code,
                                grade: r.grade,
                                length: r.length,
                                width: r.width,
                                height: r.height,
                                volume_cu_in: r.volume,
                                source_job_id: currentResult.job_id,
                                source_job_name: currentResult.job_id,
                                created_at: new Date().toISOString(),
                                status: 'available',
                              });
                              setSavedRemnantCodes((prev) => new Set([...prev, r.code]));
                            }}
                            className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 transition cursor-pointer"
                          >
                            <span>+ Add to Inventory</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}

                {/* 3. Group Header: NOT REUSABLE */}
                {groupedRemnants.notReusable.length > 0 && (
                  <tr className="bg-amber-50/70 border-y border-amber-200 select-none">
                    <td colSpan={9} className="py-2 px-3">
                      <div className="flex items-center space-x-2 text-amber-900 font-bold text-xs uppercase tracking-wide">
                        <Layers className="w-3.5 h-3.5 text-amber-600" />
                        <span>Not Reusable ({groupedRemnants.notReusable.length})</span>
                        <span className="text-[10px] font-normal lowercase text-amber-700">
                          — thickness &lt; 3.0&quot; or dimension &le; 0&quot; after 3-day aging oxidation loss
                        </span>
                      </div>
                    </td>
                  </tr>
                )}
                {groupedRemnants.notReusable.map((sr) => {
                  const r = sr.remnant;
                  const volCuFt = (r.volume / CU_FT_IN_CU_IN).toFixed(2);
                  const isSaved = savedRemnantCodes.has(r.code);
                  const tooltipText = `Factor Breakdown:\n• Aging Usable Volume: ${sr.factorBreakdown.agingUsableVolume}%\n• Min Useful Size: ${sr.factorBreakdown.minimumUsefulSize}%\n• Demand Fit: ${sr.factorBreakdown.demandFit}% (${sr.fitPartCount}/${sr.totalPartTypes} SKUs)\n• Compactness: ${sr.factorBreakdown.compactness}%\n• Grade Demand: ${sr.factorBreakdown.gradeDemand}%\n• Freshness: ${sr.factorBreakdown.freshness}%`;

                  return (
                    <tr key={r.id} className="bg-amber-50/20 hover:bg-amber-50/30 text-slate-500 transition">
                      <td className="py-2.5 px-3 font-mono font-medium text-slate-600">
                        {r.code}
                      </td>
                      <td className="py-2.5 px-2 text-slate-500">{r.grade}</td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                        {r.length}&quot; × {r.width}&quot; × {r.height}&quot;
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-amber-700 whitespace-nowrap">
                        {sr.effectiveDims[0].toFixed(1)}&quot; × {sr.effectiveDims[1].toFixed(1)}&quot; × {sr.effectiveDims[2].toFixed(1)}&quot;
                      </td>
                      <td className="py-2.5 px-2 text-right text-slate-500 whitespace-nowrap">
                        {volCuFt} ft³
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <div className="flex flex-col items-center space-y-0.5">
                          <span
                            title={tooltipText}
                            className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-800 border border-amber-200 cursor-help"
                          >
                            {sr.compositeScore}/100
                          </span>
                          <button
                            type="button"
                            onClick={() => setSelectedRemnantCodeForBreakdown(r.code)}
                            className="text-[10px] text-blue-600 hover:text-blue-800 underline decoration-dotted font-medium cursor-pointer"
                            aria-label={`View score breakdown for ${r.code}`}
                          >
                            {isEs ? 'Ver desglose' : 'Score breakdown'}
                          </button>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-[11px] text-amber-800 max-w-xs leading-snug">
                        {sr.reason}
                      </td>
                      <td className="py-2.5 px-2 text-slate-400 text-[11px] whitespace-nowrap">
                        {r.storage_location || 'Bay R-04'}
                      </td>
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        {isSaved ? (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>In Inventory</span>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              onAddRemnantToInventory?.({
                                id: `rem-${Date.now().toString().slice(-6)}-${r.code}`,
                                remnant_id: r.code,
                                grade: r.grade,
                                length: r.length,
                                width: r.width,
                                height: r.height,
                                volume_cu_in: r.volume,
                                source_job_id: currentResult.job_id,
                                source_job_name: currentResult.job_id,
                                created_at: new Date().toISOString(),
                                status: 'available',
                              });
                              setSavedRemnantCodes((prev) => new Set([...prev, r.code]));
                            }}
                            className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-medium bg-white hover:bg-slate-100 text-slate-500 border border-slate-200 transition cursor-pointer"
                          >
                            <span>+ Add to Inventory</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Honest Recommendation Heuristic Disclaimer Note */}
        <div className="pt-2 text-[11px] text-slate-500 flex items-start space-x-1.5">
          <Info className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
          <span>
            <strong>Demo Heuristic:</strong> Recommendation score is an explainable rule-based heuristic, not learned from production history. Production oxidation aging models and ML-based scoring remain planned items.
          </span>
        </div>
      </div>

      {/* How Recommendations Are Scored (Explainability Block) */}
      <RemnantScoringExplanationBlock
        scoredRemnants={groupedRemnants.allScored}
        activeParts={activeDemandParts}
        isStale={isStale}
        selectedRemnantCode={selectedRemnantCodeForBreakdown}
        onCloseBreakdown={() => setSelectedRemnantCodeForBreakdown(null)}
      />
    </section>
  );
};
