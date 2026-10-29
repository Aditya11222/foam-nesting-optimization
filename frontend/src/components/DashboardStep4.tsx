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
  AlertCircle,
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
import { computeCostReconciliation } from '../services/costReconciliation';
import { computeVolumeBreakdown, VOLUME_COLORS } from '../services/volumeBreakdown';
import { computeMachineEfficiency } from '../services/machineEfficiency';
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
  comparisonResults,
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
  const [showCostCalculation, setShowCostCalculation] = useState<boolean>(false);
  const [showAllVolumeBlocks, setShowAllVolumeBlocks] = useState<boolean>(false);

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
    optRemnantsCuFt,
    optScrapCuFt,
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

  // Chart 1: Volume Breakdown Report & Categories
  const volumeReport = useMemo(() => {
    return computeVolumeBreakdown(currentResult, unitCost, remnantCreditPct);
  }, [currentResult, unitCost, remnantCreditPct]);

  const volumeChartData = useMemo(() => [
    {
      name: isEs ? volumeReport.partsItem.nameEs : volumeReport.partsItem.name,
      cuFt: Number(volumeReport.partsItem.volumeCuFt.toFixed(1)),
      sharePct: volumeReport.partsItem.sharePct.toFixed(1),
      fill: volumeReport.partsItem.color,
      industryMeaning: isEs ? volumeReport.partsItem.industryMeaningEs : volumeReport.partsItem.industryMeaning
    },
    {
      name: isEs ? volumeReport.remnantsItem.nameEs : volumeReport.remnantsItem.name,
      cuFt: Number(volumeReport.remnantsItem.volumeCuFt.toFixed(1)),
      sharePct: volumeReport.remnantsItem.sharePct.toFixed(1),
      fill: volumeReport.remnantsItem.color,
      industryMeaning: isEs ? volumeReport.remnantsItem.industryMeaningEs : volumeReport.remnantsItem.industryMeaning
    },
    {
      name: isEs ? volumeReport.scrapItem.nameEs : volumeReport.scrapItem.name,
      cuFt: Number(volumeReport.scrapItem.volumeCuFt.toFixed(1)),
      sharePct: volumeReport.scrapItem.sharePct.toFixed(1),
      fill: volumeReport.scrapItem.color,
      industryMeaning: isEs ? volumeReport.scrapItem.industryMeaningEs : volumeReport.scrapItem.industryMeaning
    },
    {
      name: isEs ? volumeReport.trimItem.nameEs : volumeReport.trimItem.name,
      cuFt: Number(volumeReport.trimItem.volumeCuFt.toFixed(1)),
      sharePct: volumeReport.trimItem.sharePct.toFixed(1),
      fill: volumeReport.trimItem.color,
      industryMeaning: isEs ? volumeReport.trimItem.industryMeaningEs : volumeReport.trimItem.industryMeaning
    },
    {
      name: isEs ? volumeReport.kerfItem.nameEs : volumeReport.kerfItem.name,
      cuFt: Number(volumeReport.kerfItem.volumeCuFt.toFixed(1)),
      sharePct: volumeReport.kerfItem.sharePct.toFixed(1),
      fill: volumeReport.kerfItem.color,
      industryMeaning: isEs ? volumeReport.kerfItem.industryMeaningEs : volumeReport.kerfItem.industryMeaning
    },
  ], [volumeReport, isEs]);

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
      currentResult.blocks_used_count,
      currentResult.total_parts_placed,
      currentResult.total_parts_demanded
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
    currentResult.total_parts_placed,
    currentResult.total_parts_demanded,
  ]);

  // Chart 4: Per-Block Utilization Stacked (All 5 Categories summing to 100% of Gross Bun Volume)
  const perBlockChartData = useMemo(() => {
    return volumeReport.blocks.map((b) => ({
      block: isEs ? b.blockLabelEs : b.blockLabel,
      parts: Number(b.partsSharePct.toFixed(1)),
      remnants: Number(b.remnantsSharePct.toFixed(1)),
      scrap: Number(b.scrapSharePct.toFixed(1)),
      trim: Number(b.trimSharePct.toFixed(1)),
      kerf: Number(b.kerfSharePct.toFixed(1)),
      partsCuFt: b.partsCuFt,
      remnantsCuFt: b.remnantsCuFt,
      scrapCuFt: b.scrapCuFt,
      trimCuFt: b.trimCuFt,
      kerfCuFt: b.kerfCuFt,
      netYieldPct: b.netYieldPct,
    }));
  }, [volumeReport.blocks, isEs]);

  // Chart 6: Machine Efficiency Report
  const machineEfficiencyReport = useMemo(() => {
    return computeMachineEfficiency(currentResult, comparisonResults);
  }, [currentResult, comparisonResults]);

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

      {/* 5 Light-Themed Visualizations (Three-Column Balanced Stack) */}
      <div className="grid grid-cols-1 min-[801px]:grid-cols-2 min-[1201px]:grid-cols-3 gap-4 items-start">
        {/* Column 1: Volume Breakdown */}
        <div className="flex flex-col gap-4 min-w-0">
          {/* Chart 1: Volume Reconciliation Breakdown */}
          <div
            className="p-4 rounded-xl border border-slate-200 bg-white space-y-3.5 flex flex-col justify-between"
          role="region"
          aria-label={isEs ? 'Desglose y conciliación del volumen de espuma' : 'Foam volume reconciliation and breakdown'}
        >
          <div className="space-y-3">
            {/* Header: Title, Yield Clarification Tooltip, and Reconciled Badge */}
            <div className="flex flex-wrap items-center justify-between border-b border-slate-100 pb-2 gap-2">
              <div className="flex items-center space-x-1.5">
                <span className="w-2 h-2 rounded-full bg-[#2563EB]" />
                <span className="text-xs font-bold text-slate-800">
                  {isEs ? 'Desglose de Volumen (ft³)' : 'Volume Breakdown (ft³)'}
                </span>
                <button
                  type="button"
                  title={isEs ? volumeReport.yieldExplanationEs : volumeReport.yieldExplanationEn}
                  className="text-slate-400 hover:text-blue-600 transition-colors cursor-help p-0.5 rounded"
                  aria-label={isEs ? 'Explicación del rendimiento bruto vs neto' : 'Gross vs net yield explanation'}
                >
                  <Info className="w-3.5 h-3.5" />
                </button>
              </div>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shadow-2xs font-mono ${
                  volumeReport.isReconciled
                    ? 'text-emerald-800 bg-emerald-50 border-emerald-300'
                    : 'text-rose-800 bg-rose-50 border-rose-300'
                }`}
              >
                {volumeReport.isReconciled
                  ? (isEs ? '100% Conciliado' : '100% Reconciled')
                  : (isEs ? 'No Conciliado' : 'Totals do not reconcile')}
              </span>
            </div>

            {/* Reconciliation Discrepancy Alert if not reconciled */}
            {!volumeReport.isReconciled && (
              <div className="p-2 bg-rose-50 border border-rose-300 rounded text-xs text-rose-800 font-semibold flex items-center space-x-1.5">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>
                  {isEs
                    ? `Discrepancia de volumen detectada: ${volumeReport.reconciliationDeltaCuFt.toFixed(2)} ft³`
                    : `Volume discrepancy detected: ${volumeReport.reconciliationDeltaCuFt.toFixed(2)} ft³`}
                </span>
              </div>
            )}

            {/* Vertical Bar Chart with Direct Labels and Minimum Point Size */}
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={volumeChartData} margin={{ top: 28, right: 10, left: -20, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748B' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#64748B' }} />
                  <Tooltip
                    content={({ active, payload }: any) => {
                      if (active && payload && payload.length) {
                        const d = payload[0].payload;
                        return (
                          <div className="bg-[#FFFDF7] border border-amber-200/90 shadow-md rounded-lg p-2.5 text-xs space-y-1">
                            <div className="flex items-center space-x-1.5 font-bold text-slate-900">
                              <span className="w-2.5 h-2.5 rounded-xs" style={{ backgroundColor: d.fill }} />
                              <span>{d.name}</span>
                            </div>
                            <div className="font-mono text-slate-700">
                              <span className="font-bold text-slate-900">{d.cuFt} ft³</span>
                              <span className="text-slate-400 mx-1.5">•</span>
                              <span className="font-bold text-amber-900">{d.sharePct}% {isEs ? 'del bruto' : 'of gross'}</span>
                            </div>
                            <div className="text-[10.5px] text-slate-600 max-w-[210px] leading-tight pt-0.5">
                              {d.industryMeaning}
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar
                    dataKey="cuFt"
                    radius={[4, 4, 0, 0]}
                    minPointSize={8}
                    label={(props: any) => {
                      const { x, y, width, index } = props;
                      const cat = volumeReport.categories[index];
                      if (!cat) return null;
                      return (
                        <g>
                          <text
                            x={x + width / 2}
                            y={y - 13}
                            textAnchor="middle"
                            fill="#0F172A"
                            fontSize="9.5"
                            fontWeight="700"
                            fontFamily="monospace"
                          >
                            {cat.volumeCuFt.toFixed(1)}
                          </text>
                          <text
                            x={x + width / 2}
                            y={y - 3}
                            textAnchor="middle"
                            fill="#64748B"
                            fontSize="8.5"
                            fontWeight="600"
                            fontFamily="monospace"
                          >
                            {cat.sharePct.toFixed(1)}%
                          </text>
                        </g>
                      );
                    }}
                  >
                    {volumeChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Hairline Divider */}
            <div className="border-t border-slate-100 pt-2" />

            {/* 3.1 Composition Bar */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                <span className="flex items-center space-x-1.5">
                  <span className="font-bold">{isEs ? 'Composición del Bloque Bruto' : 'Gross Bun Composition'}</span>
                  <span className="text-[10px] text-slate-400 font-normal">({isEs ? 'particionado 100%' : '100% partitioned'})</span>
                </span>
                <span className="font-mono text-[11px] font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                  {volumeReport.totalGrossCuFtDisplay} {isEs ? 'bruto' : 'gross'}
                </span>
              </div>

              {/* Horizontal 100% Stacked Bar */}
              <div className="w-full h-5 rounded-md overflow-hidden flex bg-slate-100 shadow-inner">
                {volumeReport.categories.map((cat) => (
                  cat.sharePct > 0 && (
                    <div
                      key={cat.key}
                      style={{ width: `${cat.sharePct}%`, backgroundColor: cat.color }}
                      className="h-full transition-all duration-300 relative group cursor-help flex items-center justify-center text-[10px] text-white font-mono font-bold select-none overflow-hidden"
                      title={`${isEs ? cat.nameEs : cat.name}: ${cat.volumeCuFtDisplay} (${cat.sharePctDisplay})`}
                    >
                      {cat.sharePct >= 12 && <span>{cat.sharePctDisplay}</span>}
                    </div>
                  )
                ))}
              </div>

              {/* Direct Segment Chips */}
              <div className="flex flex-wrap items-center justify-between gap-1 text-[10px] pt-0.5">
                {volumeReport.categories.map((cat) => (
                  <div key={cat.key} className="flex items-center space-x-1">
                    <span className="w-2 h-2 rounded-xs shrink-0" style={{ backgroundColor: cat.color }} />
                    <span className="text-slate-600 font-medium">{isEs ? cat.nameEs : cat.name}</span>
                    <span className="font-mono font-bold text-slate-900">{cat.sharePctDisplay}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Hairline Divider */}
            <div className="border-t border-slate-100 pt-2" />

            {/* 3.2 Breakdown Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                    <th className="py-1 pr-2">{isEs ? 'Categoría' : 'Category'}</th>
                    <th className="py-1 px-1.5 text-right font-mono">{isEs ? 'Volumen (ft³)' : 'Volume (ft³)'}</th>
                    <th className="py-1 px-1.5 text-right font-mono">{isEs ? '% del Bruto' : '% of Gross'}</th>
                    <th className="py-1 pl-2.5">{isEs ? 'Significado Industrial' : 'Industry Meaning'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-[10.5px]">
                  {volumeReport.categories.map((cat) => (
                    <tr key={cat.key} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-1 pr-2 font-medium text-slate-800 flex items-center space-x-1.5 whitespace-nowrap">
                        <span className="w-2.5 h-2.5 rounded-xs shrink-0" style={{ backgroundColor: cat.color }} />
                        <span>{isEs ? cat.nameEs : cat.name}</span>
                      </td>
                      <td className="py-1 px-1.5 text-right font-mono font-semibold text-slate-800 whitespace-nowrap">
                        {cat.volumeCuFt.toFixed(1)}
                      </td>
                      <td className="py-1 px-1.5 text-right font-mono font-semibold text-slate-700 whitespace-nowrap">
                        {cat.sharePct.toFixed(1)}%
                      </td>
                      <td className="py-1 pl-2.5 text-slate-500 text-[10px]">
                        {isEs ? cat.industryMeaningEs : cat.industryMeaning}
                      </td>
                    </tr>
                  ))}
                  {/* Totals row */}
                  <tr className="border-t-2 border-slate-200 bg-slate-50/80 font-bold text-[10.5px]">
                    <td className="py-1 pr-2 text-slate-900 flex items-center space-x-1.5">
                      <span className="w-2.5 h-2.5 rounded-xs bg-slate-800 shrink-0" />
                      <span>{isEs ? 'Bloque Bruto Total' : 'Total Gross Bun'}</span>
                    </td>
                    <td className="py-1 px-1.5 text-right font-mono text-slate-900">
                      {volumeReport.totalGrossCuFt.toFixed(1)}
                    </td>
                    <td className="py-1 px-1.5 text-right font-mono text-slate-900">
                      100.0%
                    </td>
                    <td className="py-1 pl-2.5 text-slate-500 font-normal text-[10px]">
                      {isEs ? 'Volumen bruto total de bloques asignados' : 'Total raw foam bun volume allocated'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Hairline Divider & Live Reconciliation Equation */}
            <div className="pt-1.5 border-t border-slate-100 space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-1 text-[10.5px]">
                <div className="flex items-center space-x-1.5 text-slate-800 font-mono overflow-x-auto">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span className="font-sans font-semibold text-slate-600 mr-0.5">{isEs ? 'Ecuación:' : 'Equation:'}</span>
                  <span className="font-bold text-slate-900 bg-slate-100/90 px-2 py-0.5 rounded border border-slate-200">
                    {isEs ? volumeReport.reconciliationEquationEs : volumeReport.reconciliationEquation}
                  </span>
                </div>
                {volumeReport.roundingNote && (
                  <span className="italic text-slate-400 text-[9.5px]">
                    {isEs ? volumeReport.roundingNoteEs : volumeReport.roundingNote}
                  </span>
                )}
              </div>
            </div>

            {/* Hairline Divider */}
            <div className="border-t border-slate-100 pt-2" />

            {/* 3.3 Per-Block Utilization */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                <span className="flex items-center space-x-1.5">
                  <span className="font-bold">{isEs ? 'Distribución por Bloque' : 'Per-Block Distribution'}</span>
                  <span className="text-[10px] text-slate-400 font-normal">
                    ({isEs ? '5 componentes' : '5 components'})
                  </span>
                </span>
                <span className="font-mono text-[10.5px] font-semibold text-slate-600 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200">
                  {volumeReport.totalBlocksCount} {isEs ? 'bloques' : 'buns'}
                </span>
              </div>

              {/* List of Blocks (First 4 or All) */}
              <div className="space-y-1.5 pt-0.5">
                {(showAllVolumeBlocks ? volumeReport.blocks : volumeReport.blocks.slice(0, 4)).map((block) => (
                  <div key={block.blockIndex} className="flex items-center space-x-2 text-[10.5px]">
                    <span className="w-16 font-mono font-semibold text-slate-600 truncate text-right shrink-0">
                      {isEs ? block.blockLabelEs : block.blockLabel}
                    </span>
                    <div className="flex-1 bg-slate-100 rounded-sm h-3.5 overflow-hidden flex shadow-2xs">
                      {block.partsSharePct > 0 && (
                        <div
                          style={{ width: `${block.partsSharePct}%`, backgroundColor: VOLUME_COLORS.parts }}
                          className="h-full transition-all duration-300"
                          title={`${isEs ? 'Piezas' : 'Parts'}: ${block.partsSharePct.toFixed(1)}% (${block.partsCuFt.toFixed(1)} ft³)`}
                        />
                      )}
                      {block.remnantsSharePct > 0 && (
                        <div
                          style={{ width: `${block.remnantsSharePct}%`, backgroundColor: VOLUME_COLORS.remnants }}
                          className="h-full transition-all duration-300"
                          title={`${isEs ? 'Remanentes' : 'Remnants'}: ${block.remnantsSharePct.toFixed(1)}% (${block.remnantsCuFt.toFixed(1)} ft³)`}
                        />
                      )}
                      {block.scrapSharePct > 0 && (
                        <div
                          style={{ width: `${block.scrapSharePct}%`, backgroundColor: VOLUME_COLORS.scrap }}
                          className="h-full transition-all duration-300"
                          title={`${isEs ? 'Desperdicio' : 'Scrap'}: ${block.scrapSharePct.toFixed(1)}% (${block.scrapCuFt.toFixed(1)} ft³)`}
                        />
                      )}
                      {block.trimSharePct > 0 && (
                        <div
                          style={{ width: `${block.trimSharePct}%`, backgroundColor: VOLUME_COLORS.trim }}
                          className="h-full transition-all duration-300"
                          title={`${isEs ? 'Desorillado' : 'Skin Trim'}: ${block.trimSharePct.toFixed(1)}% (${block.trimCuFt.toFixed(1)} ft³)`}
                        />
                      )}
                      {block.kerfSharePct > 0 && (
                        <div
                          style={{ width: `${block.kerfSharePct}%`, backgroundColor: VOLUME_COLORS.kerf }}
                          className="h-full transition-all duration-300"
                          title={`${isEs ? 'Kerf' : 'Kerf'}: ${block.kerfSharePct.toFixed(1)}% (${block.kerfCuFt.toFixed(1)} ft³)`}
                        />
                      )}
                    </div>
                    <span className="w-20 font-mono font-bold text-right text-[10px] text-blue-700 whitespace-nowrap shrink-0">
                      {block.partsSharePct.toFixed(1)}% {isEs ? 'piezas' : 'parts'}
                    </span>
                  </div>
                ))}
              </div>

              {/* Show All / Show Fewer Toggle if > 4 blocks */}
              {volumeReport.totalBlocksCount > 4 && (
                <div className="pt-0.5 text-right">
                  <button
                    type="button"
                    onClick={() => setShowAllVolumeBlocks(!showAllVolumeBlocks)}
                    className="text-[10.5px] font-semibold text-blue-600 hover:text-blue-800 transition inline-flex items-center space-x-1 cursor-pointer"
                  >
                    <span>
                      {showAllVolumeBlocks
                        ? (isEs ? 'Mostrar menos bloques' : 'Show fewer blocks')
                        : (isEs ? `Mostrar los ${volumeReport.totalBlocksCount} bloques` : `Show all ${volumeReport.totalBlocksCount} blocks`)}
                    </span>
                    {showAllVolumeBlocks ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                </div>
              )}
            </div>

            {/* Hairline Divider */}
            <div className="border-t border-slate-100 pt-2" />

            {/* 3.4 Key Takeaways */}
            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5 text-xs text-slate-700 leading-relaxed">
              <div className="flex items-center space-x-1.5 text-[11px] font-bold text-slate-800">
                <Sparkles className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span>{isEs ? 'Conclusiones Clave' : 'Key Takeaways'}</span>
              </div>
              <ul className="space-y-1 text-[11px] text-slate-600 pl-0.5">
                {(isEs ? volumeReport.takeawaySentencesEs : volumeReport.takeawaySentencesEn).map((sentence, sIdx) => (
                  <li key={sIdx} className="flex items-start space-x-1.5">
                    <span className="text-amber-800 font-bold shrink-0 mt-0.5">•</span>
                    <span>{sentence}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Footnote / Yield Note */}
          <div className="pt-2 border-t border-slate-100 text-[10px] text-slate-500 flex items-center justify-between">
            <span>
              {isEs ? 'Rendimiento Neto Utilizable' : 'Net Usable Yield'}: <strong className="text-slate-800 font-mono">{volumeReport.netYieldPct.toFixed(1)}%</strong>
            </span>
            <span className="italic text-slate-400">
              {isEs ? 'Rendimiento Bruto' : 'Gross Yield'}: <strong className="text-slate-800 font-mono">{volumeReport.grossYieldPct.toFixed(1)}%</strong>
            </span>
          </div>
        </div>
      </div>

      {/* Column 2: Efficiency vs Baseline + Per-Block Utilization */}
      <div className="flex flex-col gap-4 min-w-0">
        {/* Chart 2: Efficiency vs Baseline (<Selected Algorithm Name>) */}
        <div className={`p-4 rounded-xl border border-slate-200 bg-white space-y-3 flex flex-col justify-between ${isStale ? 'opacity-80 ring-1 ring-amber-300' : ''}`}>
          <div>
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between border-b border-slate-100 pb-2 gap-2">
              <div>
                <span className="text-xs font-bold text-slate-800 flex items-center space-x-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-800" />
                  <span>{isEs ? 'Eficiencia vs Línea Base' : 'Efficiency vs Baseline'}</span>
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5 truncate max-w-[220px]" title={efficiencyReport.algorithmName}>
                  {efficiencyReport.algorithmName}
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

        {/* Chart 4: Per-Block Utilization Stacked */}
        <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <div>
              <span className="text-xs font-bold text-slate-800 flex items-center space-x-1.5">
                <span className="w-2 h-2 rounded-full bg-violet-600" />
                <span>{isEs ? 'Aprovechamiento por Bloque (%)' : 'Per-Block Utilization (%)'}</span>
              </span>
              <span className="text-[10px] text-slate-400 block mt-0.5">
                {isEs ? 'Partición 100% del volumen bruto' : '100% gross bun volume partitioned'}
              </span>
            </div>
            <span className="text-[10.5px] font-mono font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
              {currentResult.blocks.length} {isEs ? (currentResult.blocks.length === 1 ? 'bloque' : 'bloques') : (currentResult.blocks.length === 1 ? 'bun' : 'buns')}
            </span>
          </div>

          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={perBlockChartData} margin={{ top: 12, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                <XAxis dataKey="block" tick={{ fontSize: 10, fill: '#64748B' }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#64748B' }} ticks={[0, 25, 50, 75, 100]} />
                <Tooltip
                  formatter={(val: any, name: any, item: any) => {
                    const key = item.dataKey;
                    const cuFt = item.payload?.[`${key}CuFt`];
                    const cuFtStr = typeof cuFt === 'number' ? ` (${cuFt.toFixed(1)} ft³)` : '';
                    return [`${Number(val).toFixed(1)}%${cuFtStr}`, name];
                  }}
                  contentStyle={{ backgroundColor: '#FFFFFF', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '11px' }}
                />
                <Legend wrapperStyle={{ fontSize: '10px' }} />
                <Bar dataKey="parts" stackId="a" fill={VOLUME_COLORS.parts} name={isEs ? 'Piezas' : 'Parts'}>
                  <LabelList
                    dataKey="parts"
                    content={(props: any) => {
                      const { x, y, width, height, value } = props;
                      if (!value || value < 6 || height < 12) return null;
                      return (
                        <text
                          x={x + width / 2}
                          y={y + height / 2 + 3}
                          textAnchor="middle"
                          fill="#FFFFFF"
                          fontSize="9"
                          fontWeight="700"
                          fontFamily="monospace"
                        >
                          {Number(value).toFixed(1)}%
                        </text>
                      );
                    }}
                  />
                </Bar>
                <Bar dataKey="remnants" stackId="a" fill={VOLUME_COLORS.remnants} name={isEs ? 'Remanentes' : 'Remnants'}>
                  <LabelList
                    dataKey="remnants"
                    content={(props: any) => {
                      const { x, y, width, height, value } = props;
                      if (!value || value < 6 || height < 12) return null;
                      return (
                        <text
                          x={x + width / 2}
                          y={y + height / 2 + 3}
                          textAnchor="middle"
                          fill="#FFFFFF"
                          fontSize="9"
                          fontWeight="700"
                          fontFamily="monospace"
                        >
                          {Number(value).toFixed(1)}%
                        </text>
                      );
                    }}
                  />
                </Bar>
                <Bar dataKey="scrap" stackId="a" fill={VOLUME_COLORS.scrap} name={isEs ? 'Desperdicio' : 'Scrap'}>
                  <LabelList
                    dataKey="scrap"
                    content={(props: any) => {
                      const { x, y, width, height, value } = props;
                      if (!value || value < 6 || height < 12) return null;
                      return (
                        <text
                          x={x + width / 2}
                          y={y + height / 2 + 3}
                          textAnchor="middle"
                          fill="#FFFFFF"
                          fontSize="9"
                          fontWeight="700"
                          fontFamily="monospace"
                        >
                          {Number(value).toFixed(1)}%
                        </text>
                      );
                    }}
                  />
                </Bar>
                <Bar dataKey="trim" stackId="a" fill={VOLUME_COLORS.trim} name={isEs ? 'Desorillado' : 'Skin Trim'}>
                  <LabelList
                    dataKey="trim"
                    content={(props: any) => {
                      const { x, y, width, height, value } = props;
                      if (!value || value < 6 || height < 12) return null;
                      return (
                        <text
                          x={x + width / 2}
                          y={y + height / 2 + 3}
                          textAnchor="middle"
                          fill="#FFFFFF"
                          fontSize="9"
                          fontWeight="700"
                          fontFamily="monospace"
                        >
                          {Number(value).toFixed(1)}%
                        </text>
                      );
                    }}
                  />
                </Bar>
                <Bar dataKey="kerf" stackId="a" fill={VOLUME_COLORS.kerf} name={isEs ? 'Kerf' : 'Kerf'}>
                  <LabelList
                    dataKey="kerf"
                    content={(props: any) => {
                      const { x, y, width, height, value } = props;
                      if (!value || value < 6 || height < 12) return null;
                      return (
                        <text
                          x={x + width / 2}
                          y={y + height / 2 + 3}
                          textAnchor="middle"
                          fill="#FFFFFF"
                          fontSize="9"
                          fontWeight="700"
                          fontFamily="monospace"
                        >
                          {Number(value).toFixed(1)}%
                        </text>
                      );
                    }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="pt-2 border-t border-slate-100">
            <p className="text-[10.5px] text-slate-500 text-center leading-snug">
              {isEs ? volumeReport.perBlockCaptionEs : volumeReport.perBlockCaptionEn}
            </p>
          </div>
        </div>
      </div>

      {/* Column 3: Baseline vs. Optimized + Machine Efficiency Trade-offs */}
      <div className="flex flex-col gap-4 min-w-0">
        {/* Chart 3: Baseline vs. Optimized Cost */}
        <div
          className="p-4 rounded-xl border border-slate-200 bg-white space-y-3.5 flex flex-col justify-between"
          role="region"
          aria-label={isEs ? 'Gráfico comparativo de costos entre línea base y optimizado' : 'Baseline versus optimized cost comparison chart'}
        >
          <div className="space-y-3">
            {/* Header: Title, Subtitle, and Net Savings Chip */}
            <div className="flex flex-wrap items-center justify-between border-b border-slate-100 pb-2 gap-2">
              <div>
                <span className="text-xs font-bold text-slate-800 flex items-center space-x-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#78350F]" />
                  <span>{isEs ? 'Línea Base vs. Optimizado' : 'Baseline vs. Optimized'}</span>
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">
                  {isEs ? 'Costo (USD, estimado)' : 'Cost (USD, estimated)'}
                </span>
              </div>
              <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-300 shadow-2xs font-mono">
                {isEs ? costReport.savingsChipTextEs : costReport.savingsChipText}
              </span>
            </div>

            {/* Reconciliation Warning if Delta Detected */}
            {!costReport.isFullyReconciled && (
              <div className="p-2 bg-rose-50 border border-rose-300 rounded text-xs text-rose-800 font-semibold flex items-center space-x-1.5">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{costReport.reconciliationError}</span>
              </div>
            )}

            {/* Unplaced Parts Warning if applicable */}
            {costReport.unplacedNote && (
              <div className="text-[10.5px] font-semibold text-amber-800 bg-amber-50 px-2.5 py-1 rounded border border-amber-200">
                {isEs ? costReport.unplacedNoteEs : costReport.unplacedNote}
              </div>
            )}

            {/* Horizontal Grouped Bars */}
            <div className="space-y-2.5 pt-1">
              {/* Component Rows (Foam, Scrap of-which, Saw, Remnant Credit) */}
              {costReport.componentRows.map((row) => (
                <div
                  key={row.key}
                  className={`space-y-1 ${row.isOfWhich ? 'pl-2.5 border-l-2 border-slate-200 py-0.5 bg-slate-50/50 rounded-r' : ''}`}
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className={`font-semibold flex items-center space-x-1 ${row.isOfWhich ? 'text-slate-500 text-[11px]' : 'text-slate-700'}`}>
                      {row.isOfWhich && <span className="font-mono text-[10px] mr-0.5">↳</span>}
                      <span>{isEs ? row.categoryEs : row.category}</span>
                    </span>
                    <span
                      className={`font-mono text-[10px] font-bold px-1.5 py-0.2 rounded border ${
                        row.deltaStatus === 'improvement'
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                          : row.deltaStatus === 'worse'
                          ? 'bg-rose-50 text-rose-800 border-rose-300'
                          : 'bg-slate-100 text-slate-600 border-slate-200'
                      }`}
                    >
                      {isEs ? row.deltaDisplayEs : row.deltaDisplay}
                    </span>
                  </div>

                  <div className="space-y-1">
                    {/* Baseline Bar */}
                    <div className="flex items-center space-x-2 text-[10px]">
                      <span className="w-14 text-slate-400 font-medium truncate text-right">
                        {isEs ? 'Base' : 'Baseline'}
                      </span>
                      <div className="flex-1 bg-slate-100 rounded-md h-2.5 overflow-hidden flex items-center">
                        {row.isCredit ? (
                          <span className="text-[9.5px] text-slate-400 italic px-1.5">
                            {isEs ? row.baselineNoteEs : row.baselineNote}
                          </span>
                        ) : (
                          <div
                            className={`bg-[#A8A29E] h-full rounded-md transition-all duration-300 ${row.isOfWhich ? 'opacity-65' : ''}`}
                            style={{ width: `${Math.max(2, Math.min(100, row.baselineRatio * 100))}%` }}
                            title={`${isEs ? 'Línea Base' : 'Baseline'}: ${row.baselineDisplay}`}
                          />
                        )}
                      </div>
                      <span className="w-16 font-mono text-slate-600 text-right font-medium text-[10.5px]">
                        {row.baselineDisplay}
                      </span>
                    </div>

                    {/* Optimized Bar */}
                    <div className="flex items-center space-x-2 text-[10px]">
                      <span className="w-14 text-amber-950 font-bold truncate text-right">
                        {isEs ? 'Optim.' : 'Optimized'}
                      </span>
                      <div className="flex-1 bg-slate-100 rounded-md h-2.5 overflow-hidden flex items-center">
                        <div
                          className={`${row.isCredit ? 'bg-[#15803D]' : 'bg-[#78350F]'} h-full rounded-md transition-all duration-300 ${row.isOfWhich ? 'opacity-70' : ''}`}
                          style={{ width: `${Math.max(2, Math.min(100, row.optimizedRatio * 100))}%` }}
                          title={`${isEs ? 'Optimizado' : 'Optimized'}: ${row.optimizedDisplay}`}
                        />
                      </div>
                      <span className={`w-16 font-mono font-bold text-right text-[10.5px] ${row.isCredit ? 'text-emerald-700' : 'text-amber-950'}`}>
                        {row.optimizedDisplay}
                      </span>
                    </div>
                  </div>
                </div>
              ))}

              {/* Hairline Divider Before Total */}
              <div className="border-t border-slate-200 pt-1 mt-1" />

              {/* Net Cost Row (Emphasized Total) */}
              <div className="space-y-1 bg-slate-50 p-2 rounded-lg border border-slate-200">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-900 flex items-center space-x-1.5">
                    <span className="w-2 h-2 rounded-xs bg-[#78350F]" />
                    <span>{isEs ? costReport.totalRow.categoryEs : costReport.totalRow.category} ({isEs ? 'Total' : 'Total'})</span>
                  </span>
                  <span
                    className={`font-mono text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                      costReport.totalRow.deltaStatus === 'improvement'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                        : costReport.totalRow.deltaStatus === 'worse'
                        ? 'bg-rose-50 text-rose-800 border-rose-300'
                        : 'bg-slate-100 text-slate-600 border-slate-200'
                    }`}
                  >
                    {isEs ? costReport.totalRow.deltaDisplayEs : costReport.totalRow.deltaDisplay}
                  </span>
                </div>

                <div className="space-y-1">
                  {/* Baseline Net Bar */}
                  <div className="flex items-center space-x-2 text-[10px]">
                    <span className="w-14 text-slate-500 font-semibold truncate text-right">
                      {isEs ? 'Base' : 'Baseline'}
                    </span>
                    <div className="flex-1 bg-slate-200/70 rounded-md h-3 overflow-hidden flex items-center">
                      <div
                        className="bg-[#A8A29E] h-full rounded-md transition-all duration-300"
                        style={{ width: `${Math.max(2, Math.min(100, costReport.totalRow.baselineRatio * 100))}%` }}
                        title={`${isEs ? 'Costo Neto Base' : 'Baseline Net Cost'}: ${costReport.totalRow.baselineDisplay}`}
                      />
                    </div>
                    <span className="w-16 font-mono text-slate-800 text-right font-bold text-[11px]">
                      {costReport.totalRow.baselineDisplay}
                    </span>
                  </div>

                  {/* Optimized Net Bar */}
                  <div className="flex items-center space-x-2 text-[10px]">
                    <span className="w-14 text-amber-950 font-black truncate text-right">
                      {isEs ? 'Optim.' : 'Optimized'}
                    </span>
                    <div className="flex-1 bg-slate-200/70 rounded-md h-3.5 overflow-hidden flex items-center">
                      <div
                        className="bg-[#78350F] h-full rounded-md transition-all duration-300 shadow-2xs"
                        style={{ width: `${Math.max(2, Math.min(100, costReport.totalRow.optimizedRatio * 100))}%` }}
                        title={`${isEs ? 'Costo Neto Optimizado' : 'Optimized Net Cost'}: ${costReport.totalRow.optimizedDisplay}`}
                      />
                    </div>
                    <span className="w-16 font-mono text-amber-950 font-black text-right text-[11px]">
                      {costReport.totalRow.optimizedDisplay}
                    </span>
                  </div>
                </div>
              </div>

              {/* X-Axis Scale Reference Line */}
              <div className="pt-1">
                <div className="flex items-center text-[10px] text-slate-400 font-mono pl-16 pr-16 justify-between">
                  {costReport.axisTicks.map((tick) => (
                    <span key={tick}>
                      {tick === 0 ? '$0' : `$${(tick / 1000).toFixed(0)}k`}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Calculation Reconciliation Strip */}
            <div className="pt-2 border-t border-slate-100 space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-1.5 text-xs">
                <div className="flex items-center space-x-1.5 text-slate-800 text-[11px] font-mono overflow-x-auto">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span className="font-sans font-semibold text-slate-600 mr-0.5">{isEs ? 'Cálculo:' : 'Calculation:'}</span>
                  <span className="font-bold text-slate-900 bg-slate-100/80 px-2 py-0.5 rounded border border-slate-200">
                    {isEs ? costReport.optimizedCalculationLineEs : costReport.optimizedCalculationLine}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setShowCostCalculation((prev) => !prev)}
                  className="text-[11px] font-medium text-blue-600 hover:text-blue-800 underline flex items-center space-x-1 cursor-pointer shrink-0"
                  aria-expanded={showCostCalculation}
                >
                  <span>
                    {showCostCalculation
                      ? (isEs ? 'Ocultar desglose' : 'Hide calculation')
                      : (isEs ? 'Mostrar desglose' : 'Show calculation')}
                  </span>
                  {showCostCalculation ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
              </div>

              {/* Expandable Calculation Drawer */}
              {showCostCalculation && (
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2 text-xs text-slate-700 animate-fadeIn">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono">
                    <div className="p-2 bg-white rounded border border-slate-200 space-y-1">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block font-sans">
                        {isEs ? 'Línea Base' : 'Baseline Calculation'}
                      </span>
                      <p className="text-slate-800 font-medium leading-snug">
                        {isEs ? costReport.baselineCalculationLineEs : costReport.baselineCalculationLine}
                      </p>
                    </div>
                    <div className="p-2 bg-white rounded border border-slate-200 space-y-1">
                      <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider block font-sans">
                        {isEs ? 'Optimizado' : 'Optimized Calculation'}
                      </span>
                      <p className="text-emerald-900 font-medium leading-snug">
                        {isEs ? costReport.optimizedCalculationLineEs : costReport.optimizedCalculationLine}
                      </p>
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-500 italic">
                    * {isEs
                      ? 'El costo de desperdicio está incluido en el costo de espuma (materia prima bruta) y se excluye de la suma para evitar duplicación.'
                      : 'Scrap cost is already included within foam material cost (gross bun volume) and is excluded from the summation to avoid double-counting.'}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Footnote and Legend */}
          <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between text-[10px] text-slate-500 gap-2 mt-1">
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex items-center space-x-1">
                <span className="w-2.5 h-2.5 rounded-xs bg-[#A8A29E]" />
                <span>{isEs ? 'Línea base (simulada)' : 'Baseline (simulated)'}</span>
              </span>
              <span className="flex items-center space-x-1">
                <span className="w-2.5 h-2.5 rounded-xs bg-[#78350F]" />
                <span className="font-semibold text-slate-700">{isEs ? 'Optimizado' : 'Optimized'}</span>
              </span>
              {costReport.hasRemnantCredit && (
                <span className="flex items-center space-x-1">
                  <span className="w-2.5 h-2.5 rounded-xs bg-[#15803D]" />
                  <span className="font-semibold text-emerald-700">{isEs ? 'Crédito (−)' : 'Credit (−)'}</span>
                </span>
              )}
            </div>

            <div className="flex items-center space-x-2">
              <span className="font-medium text-slate-700">
                {isEs ? costReport.bunReductionTextEs : costReport.bunReductionText}
              </span>
              <span>•</span>
              <span className="italic text-slate-400">
                {isEs ? costReport.disclaimerTextEs : costReport.disclaimerText}
              </span>
            </div>
          </div>
        </div>

        {/* Chart 6: Machine Efficiency Trade-offs */}
        <div
          className="p-4 rounded-xl border border-slate-200 bg-white space-y-3"
          role="region"
          aria-label={isEs ? 'Compensaciones de eficiencia de máquina' : 'Machine efficiency trade-offs comparison'}
        >
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between border-b border-slate-100 pb-2 gap-2">
            <div>
              <span className="text-xs font-bold text-slate-800 flex items-center space-x-1.5">
                <span className="w-2 h-2 rounded-full bg-[#78350F]" />
                <span>{isEs ? 'Compensaciones de Eficiencia de Máquina' : 'Machine Efficiency Trade-offs'}</span>
              </span>
              <span className="text-[10px] text-slate-400 block mt-0.5 truncate max-w-[240px]">
                {isEs ? 'Activa' : 'Active'}: {machineEfficiencyReport.activeMachineName}
              </span>
            </div>
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border cursor-help ${
                machineEfficiencyReport.hasComparison
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                  : 'bg-slate-100 text-slate-700 border-slate-200'
              }`}
              title={isEs ? machineEfficiencyReport.statusBadgeEs : machineEfficiencyReport.statusBadgeEn}
            >
              {isEs ? machineEfficiencyReport.statusBadgeEs : machineEfficiencyReport.statusBadgeEn}
            </span>
          </div>

          {/* 3 Metric Comparison Panels */}
          <div className="space-y-2.5 pt-0.5">
            {machineEfficiencyReport.metrics.map((m) => (
              <div key={m.key} className="p-2.5 bg-slate-50/70 border border-slate-200 rounded-lg space-y-1.5">
                {/* Metric Name & Delta Chip */}
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-800">
                    {isEs ? m.nameEs : m.name}
                  </span>
                  <span
                    className={`font-mono text-[10px] font-bold px-1.5 py-0.2 rounded border ${
                      m.deltaStatus === 'improvement'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                        : m.deltaStatus === 'worse'
                        ? 'bg-rose-50 text-rose-800 border-rose-300'
                        : m.deltaStatus === 'neutral'
                        ? 'bg-slate-100 text-slate-600 border-slate-200'
                        : 'bg-amber-50 text-amber-800 border-amber-200'
                    }`}
                  >
                    {isEs ? m.deltaDisplayEs : m.deltaDisplay}
                  </span>
                </div>

                {/* Bars */}
                <div className="space-y-1">
                  {/* Active Machine Bar */}
                  <div className="flex items-center space-x-2 text-[10px]">
                    <span className="w-20 font-medium text-amber-950 truncate text-right">
                      {machineEfficiencyReport.activeMachineName}
                    </span>
                    <div className="flex-1 bg-slate-200/70 rounded h-2.5 overflow-hidden flex items-center">
                      <div
                        className="bg-[#78350F] h-full rounded transition-all duration-300"
                        style={{ width: `${Math.max(4, Math.min(100, m.activeRatio * 100))}%` }}
                        title={`${machineEfficiencyReport.activeMachineName}: ${m.activeDisplay}`}
                      />
                    </div>
                    <span className="w-24 font-mono text-amber-950 font-bold text-right text-[10px] truncate">
                      {m.activeDisplay}
                    </span>
                  </div>

                  {/* Alternative Machine Bar or Uncompared State */}
                  {machineEfficiencyReport.hasComparison && m.otherRatio !== null ? (
                    <div className="flex items-center space-x-2 text-[10px]">
                      <span className="w-20 font-medium text-slate-500 truncate text-right">
                        {machineEfficiencyReport.otherMachineName}
                      </span>
                      <div className="flex-1 bg-slate-200/70 rounded h-2.5 overflow-hidden flex items-center">
                        <div
                          className="bg-[#A8A29E] h-full rounded transition-all duration-300"
                          style={{ width: `${Math.max(4, Math.min(100, m.otherRatio * 100))}%` }}
                          title={`${machineEfficiencyReport.otherMachineName}: ${m.otherDisplay}`}
                        />
                      </div>
                      <span className="w-24 font-mono text-slate-600 font-semibold text-right text-[10px] truncate">
                        {m.otherDisplay}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center space-x-2 text-[9.5px] text-slate-400 pl-22">
                      <span className="italic">
                        {isEs
                          ? `Sin datos empíricos para ${machineEfficiencyReport.otherMachineName}`
                          : `No empirical run data for ${machineEfficiencyReport.otherMachineName}`}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Dynamic Summary Note */}
          <div className="p-2 bg-slate-50 border border-slate-200 rounded-lg text-[10.5px] text-slate-600 leading-snug">
            {isEs ? machineEfficiencyReport.summaryTextEs : machineEfficiencyReport.summaryTextEn}
          </div>

          {/* Footnote / Legend */}
          <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between text-[10px] text-slate-500 gap-1.5">
            <div className="flex items-center space-x-3">
              <span className="flex items-center space-x-1">
                <span className="w-2.5 h-2.5 rounded-xs bg-[#78350F]" />
                <span className="font-semibold text-slate-700">{isEs ? 'Máquina activa' : 'Active machine'}</span>
              </span>
              {machineEfficiencyReport.hasComparison && (
                <span className="flex items-center space-x-1">
                  <span className="w-2.5 h-2.5 rounded-xs bg-[#A8A29E]" />
                  <span className="text-slate-600">{isEs ? 'Comparación empírica' : 'Empirical comparison'}</span>
                </span>
              )}
            </div>
            <span className="italic text-slate-400">
              {machineEfficiencyReport.hasComparison ? (isEs ? 'Resultados reales medidos' : 'Real measured runs') : (isEs ? 'Sin datos inventados' : 'Zero fabricated figures')}
            </span>
          </div>
        </div>
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
