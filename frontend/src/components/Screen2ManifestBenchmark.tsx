import React, { useState, useMemo } from 'react';
import {
  Layers,
  BarChart2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Star,
  Zap,
  Info,
} from 'lucide-react';
import type { OptimizationResult, MachineProfile, AlgorithmInfo } from '../types';
import {
  partitionComparisonResults,
  isSingleCompatibleMachine,
  rankAndMarkBestResult,
  calculateMetricBadges,
  calculateEfficiency,
  generateBenchmarkSummary,
} from '../services/comparison';

interface Screen2ManifestBenchmarkProps {
  currentResult: OptimizationResult | null;
  comparisonResults: OptimizationResult[];
  selectedAlgorithmId: string;
  onSelectResultFromTable: (algorithmId: string) => void;
  onRunCompareAll: () => void;
  isComparing: boolean;
  comparingProgress?: { current: number; total: number };
  onCancelCompare?: () => void;
  isOptimizing: boolean;
  isStale: boolean;
  selectedMachine?: MachineProfile;
  algorithms: AlgorithmInfo[];
}

const CU_FT_IN_CU_IN = 1728.0;

const DEFAULT_COST_BY_GRADE: Record<string, number> = {
  'HR-40': 4.5,
  'HR-30': 3.8,
  'VE-50': 6.2,
};

function computeResultCost(r: OptimizationResult): number {
  const grade = r.grade || 'HR-40';
  const uCost = DEFAULT_COST_BY_GRADE[grade] ?? 4.5;
  const sawRatePerHour = 65.0;
  const remnantCreditPct = 40.0;

  const gCuFt = r.total_gross_volume / CU_FT_IN_CU_IN;
  const rCuFt = r.total_remnant_volume / CU_FT_IN_CU_IN;
  const sHours = r.estimated_saw_time_minutes / 60.0;

  const matCost = gCuFt * uCost;
  const sawCost = sHours * sawRatePerHour;
  const remCredit = rCuFt * uCost * (remnantCreditPct / 100.0);

  return Math.max(0, matCost + sawCost - remCredit);
}

export const Screen2ManifestBenchmark: React.FC<Screen2ManifestBenchmarkProps> = ({
  currentResult,
  comparisonResults,
  selectedAlgorithmId,
  onSelectResultFromTable,
  onRunCompareAll,
  isComparing,
  comparingProgress,
  onCancelCompare,
  isOptimizing,
  isStale,
  selectedMachine,
  algorithms,
}) => {
  const [activeTab, setActiveTab] = useState<'manifest' | 'benchmark'>('manifest');

  // 1. Build Placement Manifest Rows
  const { manifestRows, totalRequested, totalPlaced, totalPartsVolumeCuFt } = useMemo(() => {
    if (!currentResult) {
      return { manifestRows: [], totalRequested: 0, totalPlaced: 0, totalPartsVolumeCuFt: 0 };
    }

    type ManifestRow = {
      key: string;
      sku: string;
      name: string;
      color: string;
      requestedQty: number;
      placedQty: number;
      dims: string;
      volumeCuIn: number;
      blockLabel: string;
      orientation: string;
      status: 'FIT' | 'UNPLACED';
      unplacedReason?: string;
    };

    const rows: ManifestRow[] = [];
    let reqSum = 0;
    let placedSum = 0;
    let volCuInSum = 0;

    // Group placed parts by (SKU, Block, Orientation)
    const placedGroups: Record<
      string,
      {
        sku: string;
        name: string;
        color: string;
        count: number;
        length: number;
        width: number;
        height: number;
        blockIndex: number;
        orientationUsed: [number, number, number];
      }
    > = {};

    currentResult.blocks.forEach((block) => {
      block.placed_parts.forEach((p) => {
        const orientKey = p.orientation_used ? p.orientation_used.join('x') : `${p.length}x${p.width}x${p.height}`;
        const key = `${p.sku}_B${block.block_index}_${orientKey}`;
        if (!placedGroups[key]) {
          placedGroups[key] = {
            sku: p.sku,
            name: p.name,
            color: p.color_hex || '#3b82f6',
            count: 0,
            length: p.length,
            width: p.width,
            height: p.height,
            blockIndex: block.block_index,
            orientationUsed: p.orientation_used || [p.length, p.width, p.height],
          };
        }
        placedGroups[key].count += 1;
      });
    });

    // Populate placed rows
    Object.entries(placedGroups).forEach(([key, g]) => {
      const partVol = g.length * g.width * g.height * g.count;
      volCuInSum += partVol;
      placedSum += g.count;

      const orientLabel =
        g.orientationUsed && (g.orientationUsed[0] !== g.length || g.orientationUsed[1] !== g.width)
          ? `Rotated (${g.orientationUsed[0]}×${g.orientationUsed[1]}×${g.orientationUsed[2]})`
          : 'XYZ (Standard)';

      rows.push({
        key,
        sku: g.sku,
        name: g.name,
        color: g.color,
        requestedQty: g.count, // matched placed count in this group
        placedQty: g.count,
        dims: `${g.length}" × ${g.width}" × ${g.height}"`,
        volumeCuIn: partVol,
        blockLabel: `Bun #${g.blockIndex}`,
        orientation: orientLabel,
        status: 'FIT',
      });
    });

    // Populate unplaced rows
    if (currentResult.unplaced_parts && currentResult.unplaced_parts.length > 0) {
      currentResult.unplaced_parts.forEach((u, i) => {
        reqSum += u.requested_qty;
        const partVol = u.length * u.width * u.height * u.unplaced_qty;

        rows.push({
          key: `unplaced-${u.sku}-${i}`,
          sku: u.sku,
          name: u.name,
          color: u.color_hex || '#ef4444',
          requestedQty: u.requested_qty,
          placedQty: u.placed_qty,
          dims: `${u.length}" × ${u.width}" × ${u.height}"`,
          volumeCuIn: partVol,
          blockLabel: '—',
          orientation: '—',
          status: 'UNPLACED',
          unplacedReason: `${u.reason_code}: ${u.message}`,
        });
      });
    }

    reqSum = Math.max(reqSum, currentResult.total_parts_demanded);
    placedSum = currentResult.total_parts_placed;

    return {
      manifestRows: rows,
      totalRequested: reqSum,
      totalPlaced: placedSum,
      totalPartsVolumeCuFt: volCuInSum / CU_FT_IN_CU_IN,
    };
  }, [currentResult]);

  // 2. Build Benchmark Table Data
  const isSingleCompatible = useMemo(() => {
    return isSingleCompatibleMachine(selectedMachine, algorithms);
  }, [selectedMachine, algorithms]);

  const { applicable: rawApplicable } = useMemo(() => {
    return partitionComparisonResults(comparisonResults);
  }, [comparisonResults]);

  // If compare-all has not been run or only 1 result is present, incorporate currentResult
  const benchmarkList = useMemo(() => {
    if (rawApplicable.length > 0) {
      return rankAndMarkBestResult(rawApplicable);
    }
    if (currentResult) {
      return [{ ...currentResult, is_best: true }];
    }
    return [];
  }, [rawApplicable, currentResult]);

  const metricBadges = useMemo(() => {
    return calculateMetricBadges(benchmarkList);
  }, [benchmarkList]);

  const benchmarkSummary = useMemo(() => {
    return generateBenchmarkSummary(benchmarkList);
  }, [benchmarkList]);

  // 3. Naive Baseline Row calculations
  const baselineRow = useMemo(() => {
    if (!currentResult) return null;
    const sampleBlock = currentResult.blocks[0];
    const uCost = DEFAULT_COST_BY_GRADE[currentResult.grade || 'HR-40'] ?? 4.5;
    const sawRatePerHour = 65.0;

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
    const pCuFt = currentResult.total_parts_volume / CU_FT_IN_CU_IN;
    const bScrapCuFt = Math.max(0, bGrossCuFt - pCuFt);
    const sHours = (currentResult.estimated_saw_time_minutes / 60.0) * 1.45;
    const bTotalCost = bGrossCuFt * uCost + sHours * sawRatePerHour;

    return {
      name: 'Manual Baseline (Naive Single-Orientation)',
      description: 'Pre-nesting manual layout assumption with single rotation',
      netYieldPct: 41.2,
      grossYieldPct: sampleBlock ? ((singleBunUsableCuIn * 0.412) / bunGrossCuIn) * 100 : 35.0,
      scrapCuFt: bScrapCuFt,
      blocksUsed: bBlocks,
      totalCuts: Math.round(currentResult.total_cuts_count * 0.65),
      cost: bTotalCost,
      runtimeSec: '—',
      efficiency: 'Baseline Ref',
      validation: 'Manual',
      status: 'BASELINE',
    };
  }, [currentResult]);

  return (
    <div className="w-full bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Top Navigation & Action Header */}
      <div className="px-5 py-3.5 bg-slate-50/90 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
        {/* Tab Switcher with Persistent Counts */}
        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={() => setActiveTab('manifest')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-2 cursor-pointer ${
              activeTab === 'manifest'
                ? 'bg-blue-600 text-white shadow-2xs'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Placement Manifest</span>
            <span
              className={`text-[11px] px-1.5 py-0.2 rounded-full font-mono ${
                activeTab === 'manifest' ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-600'
              }`}
            >
              {manifestRows.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('benchmark')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-2 cursor-pointer ${
              activeTab === 'benchmark'
                ? 'bg-blue-600 text-white shadow-2xs'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <BarChart2 className="w-3.5 h-3.5" />
            <span>Benchmark Comparison</span>
            <span
              className={`text-[11px] px-1.5 py-0.2 rounded-full font-mono ${
                activeTab === 'benchmark' ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-600'
              }`}
            >
              {benchmarkList.length > 0 ? benchmarkList.length : '1'}
            </span>
          </button>
        </div>

        {/* Right Action: Compare All CTA if on benchmark tab or always accessible */}
        <div className="flex items-center space-x-2">
          {rawApplicable.length === 0 && (
            <button
              type="button"
              onClick={onRunCompareAll}
              disabled={isComparing || isOptimizing}
              className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-bold flex items-center space-x-1.5 transition cursor-pointer shadow-2xs disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isComparing ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Comparing Heuristics...</span>
                </>
              ) : (
                <>
                  <Zap className="w-3.5 h-3.5 fill-current text-indigo-600" />
                  <span>Run Compare All to Benchmark</span>
                </>
              )}
            </button>
          )}

          {isStale && (
            <span className="text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-md flex items-center space-x-1">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
              <span>Inputs modified (stale)</span>
            </span>
          )}
        </div>
      </div>

      {/* Progress / Status banner during compare */}
      {isComparing && (
        <div className="p-3 bg-blue-50/90 border-b border-blue-200 text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
            <span className="font-semibold text-blue-900">
              Running comparison:{' '}
              {comparingProgress && comparingProgress.total > 0
                ? `${comparingProgress.current} of ${comparingProgress.total} heuristics evaluated`
                : 'Evaluating compatible algorithms on identical seed...'}
            </span>
          </div>
          {onCancelCompare && (
            <button
              type="button"
              onClick={onCancelCompare}
              className="px-2.5 py-1 bg-white hover:bg-red-50 text-red-600 border border-red-200 rounded text-xs font-bold transition cursor-pointer"
            >
              Cancel Comparison
            </button>
          )}
        </div>
      )}

      {/* Machine has only 1 compatible algorithm notice */}
      {isSingleCompatible && activeTab === 'benchmark' && (
        <div className="p-3 bg-slate-50 border-b border-slate-200 text-xs text-slate-700 flex items-center space-x-2">
          <Info className="w-4 h-4 text-blue-600 shrink-0" />
          <span>
            Machine <strong>{selectedMachine?.name}</strong> ({selectedMachine?.cut_type}) has only 1 compatible
            algorithm configured; cross-algorithm comparison is not applicable.
          </span>
        </div>
      )}

      {/* TAB CONTENT: TAB 1 PLACEMENT MANIFEST */}
      {activeTab === 'manifest' && (
        <div className="p-4">
          {manifestRows.length > 0 ? (
            <div className="w-full overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-left text-xs border-collapse min-w-[720px]">
                <thead className="bg-slate-100 text-slate-700 text-[11px] font-bold uppercase tracking-wider sticky top-0 border-b border-slate-200 select-none">
                  <tr>
                    <th className="py-2.5 px-3">SKU / Part Name</th>
                    <th className="py-2.5 px-2 text-center">Req / Placed</th>
                    <th className="py-2.5 px-3 font-mono">Dimensions (L×W×H)</th>
                    <th className="py-2.5 px-3">Block / Bun</th>
                    <th className="py-2.5 px-3">Orientation</th>
                    <th className="py-2.5 px-3 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {manifestRows.map((r) => {
                    const isFit = r.status === 'FIT';
                    return (
                      <tr key={r.key} className="hover:bg-slate-50/80 transition">
                        {/* SKU & Color Swatch */}
                        <td className="py-2 px-3">
                          <div className="flex items-center space-x-2">
                            <span
                              className="w-3 h-3 rounded-md shrink-0 shadow-2xs border border-black/10"
                              style={{ backgroundColor: r.color }}
                            />
                            <div className="truncate max-w-[200px]">
                              <span className="font-bold text-slate-900 block truncate">{r.sku}</span>
                              <span className="text-[10px] text-slate-500 truncate block">{r.name}</span>
                            </div>
                          </div>
                        </td>

                        {/* Req / Placed */}
                        <td className="py-2 px-2 text-center font-mono font-bold text-slate-800">
                          <span>{r.placedQty}</span>
                          <span className="text-slate-400 font-normal"> / {r.requestedQty}</span>
                        </td>

                        {/* Dimensions */}
                        <td className="py-2 px-3 font-mono text-slate-600 text-[11px] whitespace-nowrap">
                          {r.dims}
                        </td>

                        {/* Block */}
                        <td className="py-2 px-3 text-slate-700 font-medium">
                          {r.blockLabel}
                        </td>

                        {/* Orientation */}
                        <td className="py-2 px-3 text-slate-600 text-[11px]">
                          {r.orientation}
                        </td>

                        {/* Status */}
                        <td className="py-2 px-3 text-right whitespace-nowrap">
                          {isFit ? (
                            <span className="inline-flex items-center space-x-1 text-[10px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              <span>Fit</span>
                            </span>
                          ) : (
                            <span
                              title={r.unplacedReason}
                              className="inline-flex items-center space-x-1 text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-300 px-2 py-0.5 rounded-full cursor-help"
                            >
                              <XCircle className="w-3 h-3 text-amber-600" />
                              <span>Unplaced</span>
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>

                {/* Sticky / Dedicated Totals Row */}
                <tfoot className="bg-slate-50 border-t-2 border-slate-300 font-bold text-slate-800 text-xs">
                  <tr>
                    <td className="py-2.5 px-3">
                      Total ({manifestRows.length} Line Items)
                    </td>
                    <td className="py-2.5 px-2 text-center font-mono">
                      {totalPlaced} / {totalRequested} placed
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600">
                      {totalPartsVolumeCuFt.toFixed(2)} ft³ total volume
                    </td>
                    <td className="py-2.5 px-3 text-slate-600">
                      {currentResult?.blocks_used_count ?? 0} Buns Used
                    </td>
                    <td className="py-2.5 px-3 text-slate-600">
                      {currentResult?.total_cuts_count ?? 0} Guillotine Cuts
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <span className="text-emerald-700 font-extrabold font-mono">
                        {currentResult ? `${currentResult.net_utilization_pct.toFixed(1)}% Yield` : '—'}
                      </span>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <div className="py-12 flex flex-col items-center justify-center text-center text-slate-400">
              <Layers className="w-10 h-10 mb-2 text-slate-300 stroke-[1.5]" />
              <p className="font-semibold text-slate-600 text-sm">No placement manifest generated</p>
              <p className="text-xs text-slate-400 max-w-sm mt-1">
                Run an optimization algorithm above to calculate cut layouts and populate the part manifest.
              </p>
            </div>
          )}
        </div>
      )}

      {/* TAB CONTENT: TAB 2 BENCHMARK COMPARISON */}
      {activeTab === 'benchmark' && (
        <div className="p-4 space-y-4">
          <div className="w-full overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-left text-xs border-collapse min-w-[960px]">
              <thead className="bg-slate-100 text-slate-700 text-[11px] font-bold uppercase tracking-wider sticky top-0 border-b border-slate-200 select-none">
                <tr>
                  <th className="py-2.5 px-3">Algorithm</th>
                  <th className="py-2.5 px-2 text-center">Net Yield</th>
                  <th className="py-2.5 px-2 text-center">Gross Yield</th>
                  <th className="py-2.5 px-2 text-center">Scrap Vol</th>
                  <th className="py-2.5 px-2 text-center">Blocks</th>
                  <th className="py-2.5 px-2 text-center">Cuts</th>
                  <th className="py-2.5 px-2 text-right">Est. Cost</th>
                  <th className="py-2.5 px-2 text-center">Runtime</th>
                  <th className="py-2.5 px-2 text-center">
                    <span
                      className="cursor-help inline-flex items-center gap-0.5 border-b border-dotted border-slate-400"
                      title="Yield points gained per second of runtime relative to the fastest heuristic baseline."
                    >
                      Efficiency
                    </span>
                  </th>
                  <th className="py-2.5 px-2 text-center">Validation</th>
                  <th className="py-2.5 px-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {/* 1. Naive Baseline Row */}
                {baselineRow && (
                  <tr className="bg-slate-50/60 text-slate-600 hover:bg-slate-100/60 transition">
                    <td className="py-2.5 px-3">
                      <div>
                        <span className="font-bold text-slate-800 block text-xs">{baselineRow.name}</span>
                        <span className="text-[10px] text-slate-500">{baselineRow.description}</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-2 text-center font-mono font-bold text-slate-700">
                      {baselineRow.netYieldPct.toFixed(1)}%
                    </td>
                    <td className="py-2.5 px-2 text-center font-mono text-slate-600">
                      {baselineRow.grossYieldPct.toFixed(1)}%
                    </td>
                    <td className="py-2.5 px-2 text-center font-mono text-slate-600">
                      {baselineRow.scrapCuFt.toFixed(1)} ft³
                    </td>
                    <td className="py-2.5 px-2 text-center font-mono font-bold text-slate-700">
                      {baselineRow.blocksUsed}
                    </td>
                    <td className="py-2.5 px-2 text-center font-mono text-slate-600">
                      {baselineRow.totalCuts}
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono font-bold text-slate-700">
                      ${Math.round(baselineRow.cost).toLocaleString()}
                    </td>
                    <td className="py-2.5 px-2 text-center font-mono text-slate-400">
                      {baselineRow.runtimeSec}
                    </td>
                    <td className="py-2.5 px-2 text-center font-mono text-[10px] text-slate-500">
                      {baselineRow.efficiency}
                    </td>
                    <td className="py-2.5 px-2 text-center">
                      <span className="text-[10px] text-slate-500 bg-slate-200/80 px-1.5 py-0.5 rounded">
                        Simulated
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <span className="text-[10px] font-bold text-slate-600 bg-slate-200/70 px-2 py-0.5 rounded-full">
                        Baseline
                      </span>
                    </td>
                  </tr>
                )}

                {/* 2. Real Evaluated Heuristics */}
                {benchmarkList.map((r) => {
                  const isSelected = r.algorithm_id === selectedAlgorithmId;
                  const isPending = r.comparison_status === 'PENDING';
                  const isFailed = r.comparison_status === 'FAILED';
                  const isTimedOut = r.comparison_status === 'TIMED_OUT';
                  const isCancelled = r.comparison_status === 'CANCELLED';
                  const isCompleted = r.comparison_status === 'COMPLETED' || r.comparison_status === 'FALLBACK';
                  const cost = computeResultCost(r);
                  const badges = metricBadges[r.algorithm_id] || {
                    isBestOverall: false,
                    isHighestYield: false,
                    isLowestCost: false,
                    isFastest: false,
                  };
                  const efficiency = calculateEfficiency(r, benchmarkList);

                  return (
                    <tr
                      key={r.algorithm_id}
                      onClick={() => {
                        if (isCompleted) {
                          onSelectResultFromTable(r.algorithm_id);
                        }
                      }}
                      className={`transition ${
                        isCompleted
                          ? isSelected
                            ? 'bg-blue-50/90 font-bold border-l-4 border-blue-600 cursor-pointer'
                            : 'hover:bg-slate-50 cursor-pointer'
                          : 'text-slate-400 bg-slate-50/40'
                      }`}
                    >
                      {/* Algorithm Name & Badges */}
                      <td className="py-2.5 px-3">
                        <div className="flex flex-col space-y-1">
                          <div className="flex items-center space-x-1.5">
                            <span className="font-bold text-slate-900 text-xs">{r.algorithm_name}</span>
                            {isSelected && (
                              <span className="text-[9px] font-bold uppercase tracking-wider text-blue-700 bg-blue-100 border border-blue-300 px-1.5 py-0.2 rounded">
                                Selected
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-1">
                            {badges.isBestOverall && (
                              <span
                                className="inline-flex items-center space-x-0.5 text-[9px] font-extrabold text-amber-800 bg-amber-100 border border-amber-300 px-1.5 py-0.5 rounded shadow-2xs"
                                title="Winner under selected objective (tie-break: fewer blocks, cuts, runtime). Best among tested heuristics, not proven optimal."
                              >
                                <Star className="w-2.5 h-2.5 fill-amber-500 text-amber-600" />
                                <span>Best overall</span>
                              </span>
                            )}
                            {badges.isHighestYield && (
                              <span className="text-[9px] font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 px-1.5 py-0.5 rounded">
                                Highest yield
                              </span>
                            )}
                            {badges.isLowestCost && (
                              <span className="text-[9px] font-bold text-indigo-800 bg-indigo-100 border border-indigo-300 px-1.5 py-0.5 rounded">
                                Lowest cost
                              </span>
                            )}
                            {badges.isFastest && (
                              <span className="text-[9px] font-bold text-sky-800 bg-sky-100 border border-sky-300 px-1.5 py-0.5 rounded">
                                Fastest
                              </span>
                            )}
                            {r.comparison_status === 'FALLBACK' && (
                              <span className="text-[9px] text-amber-700 bg-amber-50 border border-amber-200 px-1 rounded">
                                Fallback
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Net Yield */}
                      <td className="py-2.5 px-2 text-center font-mono font-bold text-xs">
                        {isPending ? (
                          <span className="inline-block w-8 h-3 bg-slate-200 animate-pulse rounded" />
                        ) : isCompleted ? (
                          <span className="text-blue-700">{r.net_utilization_pct.toFixed(1)}%</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* Gross Yield */}
                      <td className="py-2.5 px-2 text-center font-mono text-slate-600 text-xs">
                        {isPending ? (
                          <span className="inline-block w-8 h-3 bg-slate-200 animate-pulse rounded" />
                        ) : isCompleted ? (
                          <span>{r.gross_utilization_pct.toFixed(1)}%</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* Scrap Volume */}
                      <td className="py-2.5 px-2 text-center font-mono text-slate-600 text-xs">
                        {isPending ? (
                          <span className="inline-block w-8 h-3 bg-slate-200 animate-pulse rounded" />
                        ) : isCompleted ? (
                          <span>{(r.total_unrecoverable_scrap_volume / CU_FT_IN_CU_IN).toFixed(1)} ft³</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* Blocks Used */}
                      <td className="py-2.5 px-2 text-center font-mono font-bold text-slate-800 text-xs">
                        {isPending ? (
                          <span className="inline-block w-5 h-3 bg-slate-200 animate-pulse rounded" />
                        ) : isCompleted ? (
                          <span>{r.blocks_used_count}</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* Total Cuts */}
                      <td className="py-2.5 px-2 text-center font-mono text-slate-600 text-xs">
                        {isPending ? (
                          <span className="inline-block w-5 h-3 bg-slate-200 animate-pulse rounded" />
                        ) : isCompleted ? (
                          <span>{r.total_cuts_count}</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* Estimated Cost */}
                      <td className="py-2.5 px-2 text-right font-mono font-bold text-slate-800 text-xs">
                        {isPending ? (
                          <span className="inline-block w-10 h-3 bg-slate-200 animate-pulse rounded" />
                        ) : isCompleted ? (
                          <span>${Math.round(cost).toLocaleString()}</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* Runtime */}
                      <td className="py-2.5 px-2 text-center font-mono text-xs text-slate-600">
                        {isPending ? (
                          <span className="text-[10px] text-blue-500 italic">running...</span>
                        ) : isCompleted ? (
                          <span className="inline-flex items-center gap-1">
                            {(r.runtime_ms / 1000).toFixed(2)}s
                            {r.cached && (
                              <span className="text-[9px] bg-emerald-50 text-emerald-700 px-1 rounded border border-emerald-200">
                                Cached
                              </span>
                            )}
                          </span>
                        ) : isTimedOut ? (
                          <span className="text-amber-600 text-[10px]">15.0s</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* Efficiency */}
                      <td className="py-2.5 px-2 text-center font-mono text-[11px] text-slate-700">
                        {isPending ? '—' : efficiency}
                      </td>

                      {/* Validation */}
                      <td className="py-2.5 px-2 text-center">
                        {isCompleted && r.validation?.is_valid ? (
                          <span className="inline-flex items-center space-x-0.5 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                            <CheckCircle2 className="w-2.5 h-2.5" />
                            <span>Passed</span>
                          </span>
                        ) : isCompleted ? (
                          <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
                            Flagged
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-2.5 px-3 text-right">
                        {isPending ? (
                          <span className="inline-flex items-center space-x-1 text-[10px] font-bold text-blue-600 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded">
                            <Loader2 className="w-2.5 h-2.5 animate-spin" />
                            <span>Pending</span>
                          </span>
                        ) : isCompleted ? (
                          <span className="inline-flex items-center space-x-0.5 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                            <CheckCircle2 className="w-2.5 h-2.5" />
                            <span>Completed</span>
                          </span>
                        ) : isFailed ? (
                          <span
                            title={r.status_reason || 'Solver error'}
                            className="inline-flex items-center space-x-0.5 text-[10px] font-bold text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded"
                          >
                            <XCircle className="w-2.5 h-2.5 shrink-0" />
                            <span>Failed</span>
                          </span>
                        ) : isTimedOut ? (
                          <span className="inline-flex items-center text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                            Timed out
                          </span>
                        ) : isCancelled ? (
                          <span className="inline-flex items-center text-[10px] font-bold text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded">
                            Cancelled
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Factual Transparent Benchmark Summary Paragraph */}
          {benchmarkList.length > 0 && (
            <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-700 leading-relaxed flex items-start space-x-2.5">
              <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <strong className="text-slate-900 block font-bold text-[11px] uppercase tracking-wide mb-0.5">
                  Comparative Analysis Summary
                </strong>
                <span>{benchmarkSummary}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
