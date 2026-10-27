import React, { useState } from 'react';
import {
  Sliders,
  Zap,
  BarChart2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  Layers,
  Star,
  ChevronDown,
  ChevronUp,
  Sparkles,
} from 'lucide-react';
import type { AlgorithmInfo, OptimizationResult, StrategyRecommendationResult } from '../types';

interface AlgorithmPlacementCardProps {
  algorithms: AlgorithmInfo[];
  selectedAlgorithmId: string;
  onSelectAlgorithm: (id: string) => void;
  onRunOptimization: () => void;
  onCompareAll: () => void;
  isOptimizing: boolean;
  elapsedSeconds: number;
  isStale: boolean;
  currentResult: OptimizationResult | null;
  comparisonResults: OptimizationResult[];
  onSelectResultFromTable: (id: string) => void;
  isStrategyAuto?: boolean;
  onToggleStrategyAuto?: (isAuto: boolean) => void;
  strategyRec?: StrategyRecommendationResult | null;
  onRestoreRecommendedStrategy?: () => void;
  runningAlgorithmName?: string;
}

export const AlgorithmPlacementCard: React.FC<AlgorithmPlacementCardProps> = ({
  algorithms,
  selectedAlgorithmId,
  onSelectAlgorithm,
  onRunOptimization,
  onCompareAll,
  isOptimizing,
  elapsedSeconds,
  isStale,
  currentResult,
  comparisonResults,
  onSelectResultFromTable,
  isStrategyAuto = true,
  onToggleStrategyAuto,
  strategyRec,
  onRestoreRecommendedStrategy,
  runningAlgorithmName,
}) => {
  const [activeTab, setActiveTab] = useState<'manifest' | 'comparison'>('manifest');
  const [showUnplacedDetail, setShowUnplacedDetail] = useState<boolean>(false);

  const selectedAlgo = algorithms.find((a) => a.id === selectedAlgorithmId);

  // Group placed parts by SKU and Block for the manifest table
  const placementRows = React.useMemo(() => {
    if (!currentResult) return [];
    const rows: Array<{
      key: string;
      sku: string;
      name: string;
      color: string;
      qty: number;
      dims: string;
      blockId: string;
      isPlaced: boolean;
    }> = [];

    const placedCounts: Record<
      string,
      { count: number; sku: string; name: string; color: string; dims: string; blockId: string }
    > = {};

    currentResult.blocks.forEach((b) => {
      b.placed_parts.forEach((p) => {
        const key = `${p.sku}-B${b.block_index}`;
        if (!placedCounts[key]) {
          placedCounts[key] = {
            count: 0,
            sku: p.sku,
            name: p.name,
            color: p.color_hex || '#3b82f6',
            dims: `${p.length}" × ${p.width}" × ${p.height}"`,
            blockId: `Bun #${b.block_index}`,
          };
        }
        placedCounts[key].count += 1;
      });
    });

    Object.entries(placedCounts).forEach(([k, item]) => {
      rows.push({
        key: k,
        sku: item.sku,
        name: item.name,
        color: item.color,
        qty: item.count,
        dims: item.dims,
        blockId: item.blockId,
        isPlaced: true,
      });
    });

    if (currentResult.unplaced_parts && currentResult.unplaced_parts.length > 0) {
      currentResult.unplaced_parts.forEach((u, i) => {
        rows.push({
          key: `unplaced-${u.sku}-${i}`,
          sku: u.sku,
          name: u.name,
          color: u.color_hex || '#ef4444',
          qty: u.unplaced_qty,
          dims: `${u.length}" × ${u.width}" × ${u.height}"`,
          blockId: 'Unplaced',
          isPlaced: false,
        });
      });
    }

    return rows;
  }, [currentResult]);

  const unplacedList = currentResult?.unplaced_parts || [];

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col h-full min-h-[580px] lg:h-[640px] overflow-hidden">
      {/* Card Header */}
      <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-2.5">
          <div className="p-1.5 rounded-lg bg-blue-50 text-blue-600 border border-blue-200">
            <Sliders className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900 leading-tight">Algorithm & Placement</h2>
            <span className="text-[10px] text-slate-500 font-medium">Solver Engine & Part Allocations</span>
          </div>
        </div>
        {selectedAlgo && (
          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-200">
            {selectedAlgo.tag || selectedAlgo.id.toUpperCase().slice(0, 10)}
          </span>
        )}
      </div>

      {/* Card Body */}
      <div className="p-4 sm:p-5 flex-1 flex flex-col space-y-3.5 overflow-y-auto">
        {/* Strategy Selector Header with Auto / Manual Status */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-semibold text-slate-700">
              Optimization Strategy
            </label>
            <div className="flex items-center space-x-1.5">
              {isStrategyAuto ? (
                <span className="inline-flex items-center space-x-1 text-[10px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
                  <Sparkles className="w-3 h-3 text-blue-600" />
                  <span>Auto (Recommended)</span>
                </span>
              ) : (
                <div className="flex items-center space-x-1.5">
                  <span className="text-[10px] font-semibold text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">
                    Manual
                  </span>
                  {onRestoreRecommendedStrategy && (
                    <button
                      type="button"
                      onClick={onRestoreRecommendedStrategy}
                      className="text-[10px] font-semibold text-blue-600 hover:text-blue-800 underline cursor-pointer"
                    >
                      Use recommended
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Clean Select: Closed shows ONLY clean name to prevent clipping */}
          <select
            value={selectedAlgorithmId}
            onChange={(e) => {
              onSelectAlgorithm(e.target.value);
              onToggleStrategyAuto?.(false);
            }}
            disabled={isOptimizing}
            className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs font-bold text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-2xs"
          >
            {algorithms.map((algo) => (
              <option key={algo.id} value={algo.id}>
                {algo.name} — {algo.speed_tag} | {algo.description}
              </option>
            ))}
          </select>

          {/* Clean Description & Speed Tag Row Below Dropdown */}
          {selectedAlgo && (
            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-1 text-[11px] text-slate-500">
              <span className="leading-snug">{selectedAlgo.description}</span>
              <span className="font-semibold text-blue-800 bg-blue-50 px-2 py-0.5 rounded text-[10px] whitespace-nowrap border border-blue-200">
                {selectedAlgo.speed_tag}
              </span>
            </div>
          )}
        </div>

        {/* 'Why this strategy' Card (Real Data & Measured Evidence) */}
        {strategyRec && (
          <div className="p-3 bg-gradient-to-r from-blue-50/90 to-indigo-50/70 border border-blue-200 rounded-lg text-xs space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-1.5">
                <Sparkles className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span className="font-bold text-blue-900 text-[11px] uppercase tracking-wide">
                  Why this strategy
                </span>
              </div>
              <span className="text-[10px] font-semibold text-blue-700 bg-white/80 px-2 py-0.5 rounded border border-blue-200 shadow-2xs">
                {strategyRec.finalStrategyName}
              </span>
            </div>

            {/* Rule Prior Reason */}
            <div className="text-[11px] text-slate-700 space-y-0.5">
              <span className="text-[10px] font-semibold text-slate-500 block uppercase">
                Rule Heuristic Prior:
              </span>
              <p className="leading-relaxed">{strategyRec.ruleReason}</p>
            </div>

            {/* Switched Notice if Measured Benchmark Beat Prior */}
            {strategyRec.isSwitchedFromRule && strategyRec.switchedNotice && (
              <div className="p-2 bg-emerald-50 border border-emerald-200 rounded text-[11px] text-emerald-900 flex items-start space-x-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 mt-0.5 shrink-0" />
                <span className="font-medium">{strategyRec.switchedNotice}</span>
              </div>
            )}

            {/* Measured Benchmark Evidence */}
            {strategyRec.measuredEvidence && (
              <div className="text-[11px] text-slate-700 space-y-0.5 pt-1 border-t border-blue-200/60">
                <span className="text-[10px] font-semibold text-slate-500 block uppercase">
                  Measured Benchmark Evidence:
                </span>
                <p className="leading-relaxed font-mono text-[10.5px] text-slate-800">
                  {strategyRec.measuredEvidence}
                </p>
              </div>
            )}

            {/* Fallback Notice */}
            {strategyRec.fallbackNotice && (
              <div className="text-[10px] text-amber-800 bg-amber-50 p-1.5 rounded border border-amber-200 flex items-center space-x-1">
                <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
                <span>{strategyRec.fallbackNotice}</span>
              </div>
            )}

            {/* Honest Wording Disclaimer */}
            <div className="text-[10px] text-slate-400 italic pt-1 border-t border-blue-200/40">
              {strategyRec.wordingDisclaimer}
            </div>
          </div>
        )}

        {/* Dual Action Buttons */}
        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={onRunOptimization}
            disabled={isOptimizing}
            className={`flex items-center justify-center space-x-2 py-2 px-3 rounded-lg text-xs font-bold text-white transition shadow-sm cursor-pointer ${
              isOptimizing
                ? 'bg-blue-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 active:scale-[0.99]'
            }`}
          >
            {isOptimizing ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Running ({elapsedSeconds}s)...</span>
              </>
            ) : (
              <>
                <Zap className="w-3.5 h-3.5 fill-current" />
                <span>Run Selected</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onCompareAll}
            disabled={isOptimizing}
            className="flex items-center justify-center space-x-2 py-2 px-3 rounded-lg text-xs font-bold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-300 transition shadow-2xs cursor-pointer"
          >
            <BarChart2 className="w-3.5 h-3.5 text-slate-500" />
            <span>Compare All</span>
          </button>
        </div>

        {/* Sliced-Block Progress Loader Banner when Optimizing */}
        {isOptimizing && (
          <div className="p-3 bg-blue-50/90 border border-blue-200 rounded-lg text-xs space-y-2 animate-pulse">
            <div className="flex items-center justify-between text-blue-900 font-bold">
              <span className="flex items-center space-x-1.5">
                <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                <span>
                  Solving: {runningAlgorithmName || selectedAlgo?.name || 'Nesting Solver'}
                </span>
              </span>
              <span className="font-mono text-blue-700">{elapsedSeconds}s</span>
            </div>
            <div className="w-full bg-blue-200 h-1.5 rounded-full overflow-hidden">
              <div className="bg-blue-600 h-1.5 rounded-full w-2/3 animate-progress" />
            </div>
            <span className="text-[10px] text-blue-700 block">
              Executing 3D guillotine slicing tree heuristics and kerf verification...
            </span>
          </div>
        )}

        {/* Stale Warning Banner */}
        {isStale && !isOptimizing && (
          <div className="p-2.5 bg-amber-50 border border-amber-300 rounded-lg flex items-center space-x-2 text-xs text-amber-800">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span className="font-medium text-[11px]">
              Inputs modified — click <strong>Run Selected</strong> or <strong>Compare All</strong> to refresh.
            </span>
          </div>
        )}

        {/* Placement Summary Box */}
        {currentResult ? (
          <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg shrink-0">
            <div className="grid grid-cols-3 gap-2 text-center divide-x divide-slate-200">
              <div className="px-1">
                <span className="block text-[10px] text-slate-500 font-medium uppercase">Net Yield</span>
                <span className="text-sm font-extrabold text-blue-700">
                  {currentResult.net_utilization_pct.toFixed(1)}%
                </span>
              </div>
              <div className="px-1">
                <span className="block text-[10px] text-slate-500 font-medium uppercase">Total Cuts</span>
                <span className="text-sm font-extrabold text-slate-800">
                  {currentResult.total_cuts_count}
                </span>
              </div>
              <div className="px-1">
                <span className="block text-[10px] text-slate-500 font-medium uppercase">Fit Rate</span>
                <span className="text-sm font-extrabold text-emerald-600">
                  {currentResult.total_parts_placed}/{currentResult.total_parts_demanded}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-3 bg-slate-50/60 border border-dashed border-slate-200 rounded-lg text-center text-xs text-slate-400 shrink-0">
            Run an algorithm to generate placement metrics.
          </div>
        )}

        {/* Unplaced parts alert panel if unplaced exist */}
        {unplacedList.length > 0 && (
          <div className="p-2.5 bg-amber-50/90 border border-amber-300 rounded-lg text-xs text-amber-900 shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-1.5 font-bold">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <span>
                  {unplacedList.reduce((acc, u) => acc + u.unplaced_qty, 0)} Unplaced Parts across {unplacedList.length} SKUs
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowUnplacedDetail(!showUnplacedDetail)}
                className="text-[11px] font-semibold text-amber-800 hover:underline flex items-center space-x-0.5 cursor-pointer"
              >
                <span>{showUnplacedDetail ? 'Hide' : 'Inspect'}</span>
                {showUnplacedDetail ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            </div>
            {showUnplacedDetail && (
              <div className="mt-2 pt-2 border-t border-amber-200/80 space-y-1.5 text-[11px]">
                {unplacedList.map((u) => (
                  <div key={u.sku} className="bg-white/80 p-1.5 rounded border border-amber-200">
                    <div className="flex justify-between font-bold text-slate-800">
                      <span>{u.sku} ({u.unplaced_qty}/{u.requested_qty} unplaced)</span>
                      <span className="text-[10px] text-amber-700 uppercase">{u.reason_code}</span>
                    </div>
                    <p className="text-[10px] text-slate-600 mt-0.5">{u.message}</p>
                    {u.suggested_action && (
                      <p className="text-[10px] text-blue-700 mt-0.5">Tip: {u.suggested_action}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab Header (Placement Manifest vs Benchmark Comparison) */}
        <div className="flex items-center justify-between border-b border-slate-200 pt-1 shrink-0">
          <div className="flex space-x-2">
            <button
              type="button"
              onClick={() => setActiveTab('manifest')}
              className={`pb-1.5 text-xs font-bold transition cursor-pointer border-b-2 ${
                activeTab === 'manifest'
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              Placement Manifest ({placementRows.length})
            </button>
            {comparisonResults && comparisonResults.length > 0 && (
              <button
                type="button"
                onClick={() => setActiveTab('comparison')}
                className={`pb-1.5 text-xs font-bold transition cursor-pointer border-b-2 ${
                  activeTab === 'comparison'
                    ? 'border-blue-600 text-blue-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                Benchmark ({comparisonResults.length})
              </button>
            )}
          </div>
        </div>

        {/* Tab 1: Placement Data Manifest */}
        {activeTab === 'manifest' ? (
          <div className="flex-1 border border-slate-200 rounded-lg overflow-hidden flex flex-col bg-slate-50/40 min-h-0">
            <div className="overflow-y-auto flex-1 max-h-[220px]">
              {placementRows.length > 0 ? (
                <table className="w-full text-[11px] text-left border-collapse">
                  <thead className="bg-slate-100 text-slate-600 text-[10px] font-bold uppercase sticky top-0 border-b border-slate-200 select-none">
                    <tr>
                      <th className="py-1.5 px-2.5">SKU / Part</th>
                      <th className="py-1.5 px-1.5 text-center">Qty</th>
                      <th className="py-1.5 px-1.5">Dim (L×W×H)</th>
                      <th className="py-1.5 px-1.5">Block</th>
                      <th className="py-1.5 px-2 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {placementRows.map((r) => (
                      <tr key={r.key} className="hover:bg-slate-50/80 transition">
                        <td className="py-1.5 px-2.5 font-semibold text-slate-800">
                          <div className="flex items-center space-x-1.5 truncate">
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: r.color }}
                            />
                            <span className="truncate max-w-[85px]">{r.sku}</span>
                          </div>
                        </td>
                        <td className="py-1.5 px-1.5 text-center font-bold text-slate-700">
                          {r.qty}
                        </td>
                        <td className="py-1.5 px-1.5 text-[10px] text-slate-500 font-mono">
                          {r.dims}
                        </td>
                        <td className="py-1.5 px-1.5 text-[10px] text-slate-600 font-medium">
                          {r.blockId}
                        </td>
                        <td className="py-1.5 px-2 text-right">
                          {r.isPlaced ? (
                            <span className="inline-flex items-center space-x-0.5 text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                              <CheckCircle2 className="w-2.5 h-2.5" />
                              <span>Fit</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center space-x-0.5 text-[9px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                              <XCircle className="w-2.5 h-2.5" />
                              <span>Drop</span>
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="h-full min-h-[140px] flex flex-col items-center justify-center p-4 text-center text-slate-400 text-xs">
                  <Layers className="w-6 h-6 mb-1 text-slate-300 stroke-[1.5]" />
                  <span>No placement data available.</span>
                  <span className="text-[10px] text-slate-400">Click "Run Selected" above to populate manifest.</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Tab 2: Comparison Benchmark Table */
          <div className="flex-1 border border-slate-200 rounded-lg overflow-hidden flex flex-col bg-white min-h-0">
            <div className="overflow-y-auto flex-1 max-h-[220px]">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-slate-100 text-slate-600 text-[10px] font-bold uppercase sticky top-0 border-b border-slate-200">
                  <tr>
                    <th className="py-1.5 px-2">Algorithm</th>
                    <th className="py-1.5 px-1.5 text-center">Net Yield</th>
                    <th className="py-1.5 px-1.5 text-center">Cuts</th>
                    <th className="py-1.5 px-1.5 text-right">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {comparisonResults.map((r) => {
                    const isSelected = r.algorithm_id === selectedAlgorithmId;
                    return (
                      <tr
                        key={r.algorithm_id}
                        onClick={() => onSelectResultFromTable(r.algorithm_id)}
                        className={`cursor-pointer transition ${
                          isSelected
                            ? 'bg-blue-50/90 font-bold'
                            : 'hover:bg-slate-50 text-slate-700'
                        }`}
                      >
                        <td className="py-1.5 px-2">
                          <div className="flex items-center space-x-1.5">
                            {r.is_best && (
                              <Star className="w-3 h-3 text-amber-500 fill-amber-500 shrink-0" />
                            )}
                            <span className="truncate max-w-[95px] text-[11px]">{r.algorithm_name}</span>
                          </div>
                        </td>
                        <td className="py-1.5 px-1.5 text-center font-bold text-blue-700 text-[11px]">
                          {r.net_utilization_pct.toFixed(1)}%
                        </td>
                        <td className="py-1.5 px-1.5 text-center text-[11px] text-slate-600">
                          {r.total_cuts_count}
                        </td>
                        <td className="py-1.5 px-1.5 text-right text-[11px] font-mono text-slate-500">
                          {(r.runtime_ms / 1000).toFixed(2)}s
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
