import React, { useState } from 'react';
import {
  Play,
  BarChart2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type {
  AlgorithmInfo,
  OptimizationResult,
  MachineProfile,
} from '../types';
import { TYPOGRAPHY_SCALE } from '../tokens';
import { FoamSlicingLoader, InlineProgressDots } from './HelperComponents';

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
  selectedMachine?: MachineProfile;
  totalPartsCount?: number;
  blockTypesCount?: number;
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
  selectedMachine,
  totalPartsCount = 154,
  blockTypesCount = 1,
}) => {
  const [activeTab, setActiveTab] = useState<'manifest' | 'comparison'>('manifest');
  const [showUnplacedDetail, setShowUnplacedDetail] = useState<boolean>(false);

  const selectedAlgo =
    algorithms.find((a) => a.id === selectedAlgorithmId) || algorithms[0];
  const machineCutType = selectedMachine?.cut_type || 'guillotine';

  const unplacedList = currentResult?.unplaced_parts || [];
  const totalUnplacedCount = unplacedList.reduce(
    (acc, u) => acc + u.unplaced_qty,
    0
  );

  return (
    <section
      aria-label="Algorithm Selection and Placement"
      className="bg-surface rounded-card border border-hairline shadow-card flex flex-col h-full min-h-[620px] lg:h-[680px] overflow-hidden"
    >
      {/* Card Header */}
      <div className="p-5 border-b border-hairline flex items-center justify-between gap-2 shrink-0">
        <div>
          <h2 className={`${TYPOGRAPHY_SCALE.cardTitle} text-ink`}>
            Algorithm selection & placement
          </h2>
          <p className="text-[12px] text-secondary mt-0.5">
            Heuristic solution · {machineCutType === 'free' ? 'Free contour nesting' : 'Guillotine through-cut'}
          </p>
        </div>

        {/* Segmented Control for Manifest vs Comparison */}
        <div
          role="tablist"
          aria-label="Placement View Mode"
          className="inline-flex rounded-control bg-raised p-1 border border-hairline shrink-0"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'manifest'}
            onClick={() => setActiveTab('manifest')}
            className={`px-2.5 py-1 rounded-sm text-[12px] font-medium transition duration-150 cursor-pointer whitespace-nowrap ${
              activeTab === 'manifest'
                ? 'bg-cocoa-tint text-cocoa font-semibold'
                : 'text-secondary hover:text-ink'
            }`}
          >
            Placement
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'comparison'}
            onClick={() => setActiveTab('comparison')}
            className={`px-2.5 py-1 rounded-sm text-[12px] font-medium transition duration-150 cursor-pointer whitespace-nowrap ${
              activeTab === 'comparison'
                ? 'bg-cocoa-tint text-cocoa font-semibold'
                : 'text-secondary hover:text-ink'
            }`}
          >
            Compare ({comparisonResults.length})
          </button>
        </div>
      </div>

      {/* Card Body */}
      <div className="p-5 flex-1 flex flex-col space-y-4 overflow-y-auto">
        {/* Algorithm Selector */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label
              htmlFor="algorithm-select"
              className={TYPOGRAPHY_SCALE.labelUppercase}
            >
              Optimization algorithm
            </label>
            {selectedAlgo && (
              <span className="text-[11.5px] font-mono text-secondary">
                {selectedAlgo.speed_tag}
              </span>
            )}
          </div>

          <select
            id="algorithm-select"
            value={selectedAlgorithmId}
            onChange={(e) => onSelectAlgorithm(e.target.value)}
            className="w-full h-10 rounded-control border border-strong bg-surface px-3 text-[14px] font-medium text-ink"
          >
            {algorithms.map((algo) => {
              const isCompatible = algo.supported_cut_types.includes(machineCutType);
              const reason = !isCompatible
                ? machineCutType === 'free'
                  ? ' — Requires guillotine saw'
                  : ' — Requires free-contour waterjet'
                : '';

              return (
                <option
                  key={algo.id}
                  value={algo.id}
                  disabled={!isCompatible}
                >
                  {algo.name} ({algo.speed_tag}){reason}
                </option>
              );
            })}
          </select>

          {selectedAlgo && (
            <p className="text-[12.5px] leading-[18px] text-secondary mt-1.5 line-clamp-2">
              {selectedAlgo.description}
            </p>
          )}
        </div>

        {/* Action Buttons Row (One Primary + One Secondary) */}
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={isOptimizing}
              onClick={onRunOptimization}
              className="btn-primary flex-1 inline-flex items-center justify-center space-x-2 cursor-pointer whitespace-nowrap"
            >
              {isOptimizing ? (
                <InlineProgressDots />
              ) : (
                <Play className="w-4 h-4 stroke-[1.5]" />
              )}
              <span>Run optimization</span>
            </button>

            <button
              type="button"
              disabled={isOptimizing}
              onClick={() => {
                setActiveTab('comparison');
                onCompareAll();
              }}
              className="btn-secondary inline-flex items-center justify-center space-x-2 cursor-pointer whitespace-nowrap"
              title="Run and benchmark all compatible algorithms"
            >
              <BarChart2 className="w-4 h-4 stroke-[1.5]" />
              <span>Compare all</span>
            </button>
          </div>

          {/* One-line Readiness Indicator */}
          <div className="text-[12px] font-mono text-secondary flex items-center justify-between">
            {isStale ? (
              <span className="text-status-warning font-medium">
                Inputs changed, re-run to update
              </span>
            ) : (
              <span>
                Ready: {totalPartsCount} parts, {blockTypesCount} block type{blockTypesCount === 1 ? '' : 's'}
              </span>
            )}
            {currentResult && !isStale && (
              <span className="text-status-success">
                Solved in {currentResult.runtime_ms} ms
              </span>
            )}
          </div>
        </div>

        {/* Stale Banner */}
        {isStale && (
          <div
            role="alert"
            className="px-3 py-2.5 rounded-control bg-status-warning-tint border border-status-warning text-[13px] text-ink flex items-center justify-between gap-2"
          >
            <div className="flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 stroke-[1.5] text-status-warning shrink-0" />
              <span>Inputs modified. Re-run optimization to refresh layout.</span>
            </div>
            <button
              type="button"
              onClick={onRunOptimization}
              className="text-[12.5px] font-semibold text-cocoa underline hover:text-cocoa-hover shrink-0 cursor-pointer"
            >
              Re-run
            </button>
          </div>
        )}

        {/* Active Loader or Results Area */}
        {isOptimizing ? (
          <FoamSlicingLoader
            algorithmName={selectedAlgo?.name || 'Optimization Heuristic'}
            elapsedSeconds={elapsedSeconds}
          />
        ) : activeTab === 'comparison' && comparisonResults.length > 0 ? (
          /* Benchmark Comparison Table */
          <div className="space-y-3 flex-1 flex flex-col min-h-0">
            <div className="overflow-x-auto border border-hairline rounded-control flex-1">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-raised border-b border-hairline z-10">
                  <tr className="h-10">
                    <th className={`px-3 ${TYPOGRAPHY_SCALE.labelUppercase}`}>Algorithm</th>
                    <th className={`px-3 text-right ${TYPOGRAPHY_SCALE.labelUppercase}`}>Yield</th>
                    <th className={`px-3 text-right ${TYPOGRAPHY_SCALE.labelUppercase}`}>Scrap (cu ft)</th>
                    <th className={`px-3 text-right ${TYPOGRAPHY_SCALE.labelUppercase}`}>Buns</th>
                    <th className={`px-3 text-right ${TYPOGRAPHY_SCALE.labelUppercase}`}>Cuts</th>
                    <th className={`px-3 text-right ${TYPOGRAPHY_SCALE.labelUppercase}`}>Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline text-[13px]">
                  {comparisonResults.map((res) => {
                    const isSelected = res.algorithm_id === selectedAlgorithmId;
                    const scrapCuFt = (res.total_unrecoverable_scrap_volume / 1728).toFixed(1);

                    return (
                      <tr
                        key={res.algorithm_id}
                        onClick={() => onSelectResultFromTable(res.algorithm_id)}
                        className={`h-11 transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-cocoa-tint/60 font-medium'
                            : 'hover:bg-row-hover'
                        }`}
                      >
                        <td className="px-3 text-ink">
                          <div className="flex flex-col">
                            <span className="truncate max-w-[140px]" title={res.algorithm_name}>
                              {res.algorithm_name}
                            </span>
                            {res.is_best && (
                              <span className="inline-block w-fit mt-0.5 px-1.5 py-0.5 rounded-sm bg-terracotta-tint text-terracotta text-[10.5px] font-semibold">
                                Best in this comparison
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 text-right font-mono tabular-nums font-semibold text-ink">
                          {res.net_utilization_pct.toFixed(1)}%
                        </td>
                        <td className="px-3 text-right font-mono tabular-nums text-secondary">
                          {scrapCuFt}
                        </td>
                        <td className="px-3 text-right font-mono tabular-nums text-ink">
                          {res.blocks_used_count}
                        </td>
                        <td className="px-3 text-right font-mono tabular-nums text-secondary">
                          {res.total_cuts_count}
                        </td>
                        <td className="px-3 text-right font-mono tabular-nums text-secondary">
                          {res.runtime_ms}ms
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <p className="text-[12px] text-secondary">
              Best among tested heuristics, not proven optimal. Click any row to inspect its 3D cutting plan.
            </p>
          </div>
        ) : currentResult ? (
          /* Single Algorithm Placement Summary & Manifest */
          <div className="space-y-3 flex-1 flex flex-col min-h-0">
            {/* Summary Line: N of N parts placed */}
            <div className="px-3 py-2.5 rounded-control bg-raised/70 border border-hairline flex items-center justify-between">
              <div className="flex items-center space-x-2">
                {totalUnplacedCount === 0 ? (
                  <CheckCircle2 className="w-4 h-4 stroke-[1.5] text-status-success shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 stroke-[1.5] text-status-warning shrink-0" />
                )}
                <span className="text-[13px] font-semibold text-ink font-mono tabular-nums">
                  {currentResult.total_parts_placed} of {currentResult.total_parts_demanded} parts placed
                </span>
              </div>
              <span className="text-[12px] font-mono text-secondary">
                {currentResult.blocks_used_count} block{currentResult.blocks_used_count === 1 ? '' : 's'} used
              </span>
            </div>

            {/* Single Grouped Collapsible Panel for Unplaced Parts (Never repeated per unit) */}
            {unplacedList.length > 0 && (
              <div className="rounded-control border border-status-warning bg-status-warning-tint/60 overflow-hidden shrink-0">
                <button
                  type="button"
                  onClick={() => setShowUnplacedDetail(!showUnplacedDetail)}
                  className="w-full px-3 py-2 flex items-center justify-between text-left text-[12.5px] font-semibold text-ink cursor-pointer"
                >
                  <span>
                    {unplacedList.length} SKU type{unplacedList.length === 1 ? '' : 's'} unplaced ({totalUnplacedCount} pcs)
                  </span>
                  {showUnplacedDetail ? (
                    <ChevronUp className="w-4 h-4 stroke-[1.5]" />
                  ) : (
                    <ChevronDown className="w-4 h-4 stroke-[1.5]" />
                  )}
                </button>

                {showUnplacedDetail && (
                  <div className="border-t border-hairline bg-surface divide-y divide-hairline max-h-44 overflow-y-auto">
                    {unplacedList.map((u) => (
                      <div key={u.sku} className="p-3 text-[12px] space-y-1">
                        <div className="flex items-center justify-between font-mono">
                          <span className="font-semibold text-ink">{u.sku}</span>
                          <span className="text-status-error">
                            Req: {u.requested_qty} · Placed: {u.placed_qty} · Unplaced: {u.unplaced_qty}
                          </span>
                        </div>
                        <p className="text-secondary">{u.message}</p>
                        <p className="text-cocoa font-medium">Fix: {u.suggested_action}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Block-by-Block Placement Table */}
            <div className="overflow-x-auto border border-hairline rounded-control flex-1 min-h-0">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-raised border-b border-hairline z-10">
                  <tr className="h-10">
                    <th className={`px-3 ${TYPOGRAPHY_SCALE.labelUppercase}`}>Block</th>
                    <th className={`px-3 text-right ${TYPOGRAPHY_SCALE.labelUppercase}`}>Parts</th>
                    <th className={`px-3 text-right ${TYPOGRAPHY_SCALE.labelUppercase}`}>Net yield</th>
                    <th className={`px-3 text-right ${TYPOGRAPHY_SCALE.labelUppercase}`}>Remnants</th>
                    <th className={`px-3 text-right ${TYPOGRAPHY_SCALE.labelUppercase}`}>Cuts</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline text-[13px]">
                  {currentResult.blocks.map((b) => (
                    <tr key={b.block_index} className="h-11 hover:bg-row-hover transition-colors">
                      <td className="px-3 font-mono font-medium text-ink">
                        #{b.block_index} ({b.grade})
                      </td>
                      <td className="px-3 text-right font-mono tabular-nums text-ink">
                        {b.placed_parts.length}
                      </td>
                      <td className="px-3 text-right font-mono tabular-nums font-semibold text-ink">
                        {b.net_utilization_pct.toFixed(1)}%
                      </td>
                      <td className="px-3 text-right font-mono tabular-nums text-secondary">
                        {b.usable_remnants.length}
                      </td>
                      <td className="px-3 text-right font-mono tabular-nums text-secondary">
                        {b.cuts.length}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Solver Status & Validation Line */}
            <div className="flex items-center justify-between text-[12px] text-secondary pt-1">
              <span className="truncate" title={currentResult.solver_status || 'Heuristic complete'}>
                {currentResult.solver_status || 'Heuristic slicing verified'}
              </span>
              <span className="inline-flex items-center space-x-1 font-mono shrink-0">
                {currentResult.validation?.is_valid ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 stroke-[1.5] text-status-success" />
                    <span className="text-status-success">Valid geometry</span>
                  </>
                ) : (
                  <>
                    <XCircle className="w-3.5 h-3.5 stroke-[1.5] text-status-error" />
                    <span className="text-status-error">Check warnings</span>
                  </>
                )}
              </span>
            </div>
          </div>
        ) : (
          /* Empty State */
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6 border border-dashed border-strong rounded-control">
            <p className="text-[14px] font-medium text-ink">
              No placement calculated for this algorithm
            </p>
            <p className="text-[13px] text-secondary mt-1">
              Select a heuristic above and click Run optimization to pack parts into available blocks.
            </p>
          </div>
        )}
      </div>
    </section>
  );
};
