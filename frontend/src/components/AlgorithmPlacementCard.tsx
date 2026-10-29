import React, { useState } from 'react';
import {
  Sliders,
  Zap,
  BarChart2,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Layers,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Info,
} from 'lucide-react';
import type { AlgorithmInfo, OptimizationResult, StrategyRecommendationResult, MachineProfile } from '../types';
import {
  isAlgorithmCompatibleWithMachine,
  getIncompatibilityReason,
  getRecommendedCompatibleAlgorithm,
  getCompatibleAlgorithmsForMachine,
} from '../services/compatibility';

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
  comparisonResults?: OptimizationResult[];
  onSelectResultFromTable?: (id: string) => void;
  isStrategyAuto?: boolean;
  onToggleStrategyAuto?: (isAuto: boolean) => void;
  strategyRec?: StrategyRecommendationResult | null;
  onRestoreRecommendedStrategy?: () => void;
  runningAlgorithmName?: string;
  selectedMachine?: MachineProfile;
  machines?: MachineProfile[];
  onSelectMachine?: (machineId: string) => void;
  activeTab?: 'manifest' | 'comparison';
  onTabChange?: (tab: 'manifest' | 'comparison') => void;
  isComparing?: boolean;
  comparingProgress?: { current: number; total: number };
  onCancelCompare?: () => void;
  onCancelRun?: () => void;
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
  isStrategyAuto = true,
  onToggleStrategyAuto,
  strategyRec,
  onRestoreRecommendedStrategy,
  runningAlgorithmName,
  selectedMachine,
  machines,
  onSelectMachine,
  isComparing = false,
  onCancelRun,
}) => {
  const [showUnplacedDetail, setShowUnplacedDetail] = useState<boolean>(false);

  const selectedAlgo = algorithms.find((a) => a.id === selectedAlgorithmId);

  const compatibleAlgorithms = getCompatibleAlgorithmsForMachine(selectedMachine, algorithms);
  const missingPackageAlgorithms = algorithms.filter((a) => a.available === false && a.id.startsWith('ortools'));

  // Machine-Algorithm compatibility check
  const isCurrentIncompatible = selectedMachine
    ? !isAlgorithmCompatibleWithMachine(selectedAlgorithmId, selectedMachine.cut_type, algorithms)
    : false;

  const currentIncompReason = isCurrentIncompatible && selectedMachine
    ? getIncompatibilityReason(selectedAlgorithmId, selectedMachine, algorithms)
    : null;

  const recommendedAlgoId = selectedMachine
    ? getRecommendedCompatibleAlgorithm(selectedMachine, selectedAlgorithmId, algorithms)
    : selectedAlgorithmId;

  const recommendedAlgoName =
    algorithms.find((a) => a.id === recommendedAlgoId)?.name || recommendedAlgoId;

  const compatibleMachine = machines?.find((m) =>
    isAlgorithmCompatibleWithMachine(selectedAlgorithmId, m.cut_type, algorithms)
  );

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
          {compatibleAlgorithms.length === 0 ? (
            <div className="p-3 bg-amber-50 border border-amber-300 rounded-lg text-amber-900 text-xs">
              <div className="flex items-start space-x-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-[11px] block">No Compatible Strategies</span>
                  <p className="text-[11px]">
                    Machine &ldquo;{selectedMachine?.name}&rdquo; ({selectedMachine?.cut_type}) has 0 supported algorithms configured. Please select a compatible machine.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <>
              <select
                value={selectedAlgorithmId}
                onChange={(e) => {
                  onSelectAlgorithm(e.target.value);
                  onToggleStrategyAuto?.(false);
                }}
                disabled={isOptimizing || isComparing}
                className={`w-full px-3 py-2 rounded-lg border text-xs font-bold focus:ring-2 focus:outline-none shadow-2xs ${
                  isCurrentIncompatible
                    ? 'border-amber-400 bg-amber-50/40 text-amber-900 focus:ring-amber-500'
                    : 'border-slate-300 bg-white text-slate-800 focus:ring-blue-500'
                }`}
              >
                {compatibleAlgorithms.map((algo) => (
                  <option key={algo.id} value={algo.id}>
                    {algo.name}
                  </option>
                ))}
              </select>

              {/* Muted line: Showing N strategies available with info tooltip */}
              <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
                <span className="flex items-center gap-1">
                  <span>
                    Showing {compatibleAlgorithms.length} {compatibleAlgorithms.length === 1 ? 'strategy' : 'strategies'} available for {selectedMachine?.name || 'machine'}.
                  </span>
                  <span
                    className="inline-flex cursor-help text-slate-400 hover:text-slate-600"
                    title="Other algorithms are omitted because they do not support this machine's cut type."
                  >
                    <Info className="w-3.5 h-3.5" />
                  </span>
                </span>
              </div>

              {/* Package not installed note if OR-Tools is missing */}
              {missingPackageAlgorithms.length > 0 && (
                <div className="text-[10px] text-slate-500 italic mt-0.5">
                  OR-Tools strategies unavailable: package not installed
                </div>
              )}

              {/* Clean Description & Speed Tag Row Below Dropdown */}
              {selectedAlgo && (
                <div className="mt-1.5 flex flex-wrap items-center justify-between gap-1 text-[11px] text-slate-500">
                  <span className="leading-snug">{selectedAlgo.description}</span>
                  <span className="font-semibold text-blue-800 bg-blue-50 px-2 py-0.5 rounded text-[10px] whitespace-nowrap border border-blue-200">
                    {selectedAlgo.speed_tag}
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Incompatible Machine/Algorithm Recovery Banner */}
        {isCurrentIncompatible && (
          <div className="p-3 bg-amber-50 border border-amber-300 rounded-lg text-amber-900 text-xs space-y-2">
            <div className="flex items-start space-x-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <span className="font-bold text-[11px] block">Incompatible Configuration</span>
                <p className="leading-relaxed text-[11px]">
                  Machine &ldquo;{selectedMachine?.name}&rdquo; ({selectedMachine?.cut_type}) is not compatible with algorithm &ldquo;{selectedAlgo?.name}&rdquo;.
                  {currentIncompReason ? ` ${currentIncompReason}` : ''}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  onSelectAlgorithm(recommendedAlgoId);
                  onToggleStrategyAuto?.(false);
                }}
                className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded text-[11px] font-bold transition cursor-pointer shadow-2xs"
              >
                Switch to {recommendedAlgoName}
              </button>
              {compatibleMachine && onSelectMachine && (
                <button
                  type="button"
                  onClick={() => onSelectMachine(compatibleMachine.id)}
                  className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-amber-300 text-amber-900 rounded text-[11px] font-bold transition cursor-pointer shadow-2xs"
                >
                  Switch to {compatibleMachine.name}
                </button>
              )}
            </div>
          </div>
        )}

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
            disabled={isOptimizing || isCurrentIncompatible}
            title={isCurrentIncompatible ? currentIncompReason || 'Selected algorithm is incompatible with machine' : undefined}
            className={`flex items-center justify-center space-x-2 py-2 px-3 rounded-lg text-xs font-bold text-white transition shadow-sm ${
              isOptimizing || isCurrentIncompatible
                ? 'bg-slate-300 text-slate-500 cursor-not-allowed shadow-none'
                : 'bg-blue-600 hover:bg-blue-700 active:scale-[0.99] cursor-pointer'
            }`}
          >
            {isOptimizing ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Running ({elapsedSeconds}s)...</span>
              </>
            ) : isCurrentIncompatible ? (
              <>
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                <span>Incompatible</span>
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
              <div className="flex items-center space-x-2">
                <span className="font-mono text-blue-700">{elapsedSeconds}s</span>
                {onCancelRun && (
                  <button
                    type="button"
                    onClick={onCancelRun}
                    className="text-[10px] bg-white hover:bg-red-50 text-red-600 border border-red-200 px-2 py-0.5 rounded font-bold cursor-pointer transition shadow-2xs"
                  >
                    Cancel
                  </button>
                )}
              </div>
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

        {/* Callout to Full-Width Manifest & Benchmark Section Below */}
        <div className="pt-2 border-t border-slate-200 mt-auto">
          <button
            type="button"
            onClick={() => {
              const el = document.getElementById('manifest-benchmark-section');
              if (el) el.scrollIntoView({ behavior: 'smooth' });
            }}
            className="w-full py-2 px-3 bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-200 rounded-lg text-xs font-semibold text-slate-700 hover:text-blue-700 flex items-center justify-between transition cursor-pointer"
          >
            <div className="flex items-center space-x-2">
              <Layers className="w-3.5 h-3.5 text-blue-600" />
              <span>Placement Manifest & Benchmark</span>
            </div>
            <span className="text-[10px] text-blue-600 font-bold">
              {placementRows.length > 0 ? `${placementRows.length} items` : 'View'} &darr;
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
