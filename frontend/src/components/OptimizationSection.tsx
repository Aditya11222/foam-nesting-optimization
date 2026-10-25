import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Zap,
  BarChart2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Layers,
  Scissors,
  Archive,
  Star,
  Info,
  Loader2,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import type { AlgorithmInfo, OptimizationResult } from '../types';

import type { MachineProfile } from '../types';

interface OptimizationSectionProps {
  algorithms: AlgorithmInfo[];
  selectedAlgorithmId: string;
  onSelectAlgorithm: (id: string) => void;
  onRunOptimization: () => void;
  onCompareAll: () => void;
  isOptimizing: boolean;
  elapsedSeconds: number;
  isStale: boolean;
  currentResult: OptimizationResult | null;
  comparisonResults: OptimizationResult[] | null;
  onSelectResultFromTable: (algoId: string) => void;
  selectedMachine?: MachineProfile;
}

export const OptimizationSection: React.FC<OptimizationSectionProps> = ({
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
}) => {
  const { t } = useTranslation();
  const [isUnplacedExpanded, setIsUnplacedExpanded] = React.useState(true);
  const [showAllUnplaced, setShowAllUnplaced] = React.useState(false);

  // Filter algorithms compatible with selected machine cut_type
  const compatibleAlgorithms = selectedMachine
    ? algorithms.filter((a) => a.supported_cut_types && a.supported_cut_types.includes(selectedMachine.cut_type))
    : algorithms;

  const activeAlgorithms = compatibleAlgorithms.length > 0 ? compatibleAlgorithms : algorithms;
  const hasSolverStatus = comparisonResults ? comparisonResults.some((r) => r.solver_status || r.fallback_used) : false;
  const selectedAlgo = activeAlgorithms.find((a) => a.id === selectedAlgorithmId) || activeAlgorithms[0];

  return (
    <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
        <div className="flex items-center space-x-2">
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white font-bold text-xs">
            2
          </span>
          <h2 className="font-semibold text-slate-800 text-base">{t('step2_title')}</h2>
        </div>
        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
          {t('heuristic_badge')}
        </span>
      </div>

      {/* Stale Results Banner */}
      {isStale && currentResult && (
        <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-lg flex items-start space-x-3 text-amber-800 text-xs">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <div className="font-bold">{t('stale_banner_title')}</div>
            <div className="text-amber-700">{t('stale_banner_desc')}</div>
          </div>
        </div>
      )}

      {/* Algorithm Selection & Actions Bar */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
        {/* Dropdown */}
        <div className="md:col-span-6 space-y-1.5">
          <label className="block text-xs font-medium text-slate-700">
            {t('algorithm_label')}
          </label>
          <div className="relative">
            <select
              value={selectedAlgorithmId}
              onChange={(e) => onSelectAlgorithm(e.target.value)}
              disabled={isOptimizing}
              className="w-full pl-3 pr-8 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
            >
              {activeAlgorithms.map((algo) => {
                const tagPrefix = algo.tag ? `[${algo.tag}] ` : '';
                const disabledReason = algo.available === false ? ` (Disabled: ${algo.unavailable_reason || 'Package uninstalled'})` : '';
                return (
                  <option key={algo.id} value={algo.id} disabled={algo.available === false}>
                    {tagPrefix}{algo.name} — {algo.speed_tag}{disabledReason}
                  </option>
                );
              })}
            </select>
          </div>
          {selectedAlgo && (
            <p className="text-[11px] text-slate-500 flex items-center space-x-1">
              <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span>{selectedAlgo.description}</span>
            </p>
          )}
        </div>

        {/* Buttons */}
        <div className="md:col-span-6 flex items-center space-x-2">
          <button
            type="button"
            onClick={onRunOptimization}
            disabled={isOptimizing}
            className="flex-1 inline-flex items-center justify-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-xs font-semibold rounded-lg shadow-sm transition"
          >
            {isOptimizing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{t('optimizing')} ({elapsedSeconds.toFixed(1)}s)</span>
              </>
            ) : (
              <>
                <Zap className="w-4 h-4 text-amber-300" />
                <span>{t('run_optimization')}</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onCompareAll}
            disabled={isOptimizing}
            className="inline-flex items-center justify-center space-x-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 disabled:bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg border border-slate-300 shadow-sm transition"
            title="Runs all algorithms sequentially on identical inputs"
          >
            <BarChart2 className="w-4 h-4 text-blue-600" />
            <span>{t('compare_all')}</span>
          </button>
        </div>
      </div>

      {/* Infeasible / Unplaced Parts Grouped Diagnostic Alert */}
      {currentResult && (currentResult.unplaced_parts?.length || 0) > 0 && (() => {
        const unplacedList = currentResult.unplaced_parts || [];
        const totalUnplacedPieces = unplacedList.reduce((acc, u) => acc + (u.unplaced_qty ?? u.quantity), 0);
        const totalDemandedPieces = currentResult.total_parts_demanded || 0;
        const visibleUnplaced = showAllUnplaced ? unplacedList : unplacedList.slice(0, 10);

        return (
          <div className="bg-amber-50 border border-amber-300 rounded-lg overflow-hidden text-xs shadow-sm">
            {/* Collapsible Header */}
            <div
              onClick={() => setIsUnplacedExpanded(!isUnplacedExpanded)}
              className="p-3.5 flex items-center justify-between cursor-pointer hover:bg-amber-100/60 transition-colors select-none"
            >
              <div className="flex items-center space-x-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <div className="font-bold text-amber-900">
                  {t('unplaced_alert_summary', {
                    skus: unplacedList.length,
                    unplaced: totalUnplacedPieces,
                    demanded: totalDemandedPieces,
                    defaultValue: `${unplacedList.length} part types could not be fully placed (${totalUnplacedPieces} of ${totalDemandedPieces} pieces)`
                  })}
                </div>
              </div>
              <div className="flex items-center space-x-2 text-amber-800 text-xs font-medium">
                <span>{isUnplacedExpanded ? 'Collapse' : 'Expand Details'}</span>
                {isUnplacedExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </div>
            </div>

            {/* Expanded Table */}
            {isUnplacedExpanded && (
              <div className="border-t border-amber-200 bg-white p-3 space-y-2">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-700">
                    <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                      <tr>
                        <th className="py-2 px-2.5">{t('unplaced_table_sku', 'Part SKU & Name')}</th>
                        <th className="py-2 px-2.5">{t('unplaced_table_dims', 'Dimensions (L×W×H)')}</th>
                        <th className="py-2 px-2.5">{t('unplaced_table_qty', 'Req / Placed / Unplaced')}</th>
                        <th className="py-2 px-2.5">{t('unplaced_table_reason', 'Diagnosis & Reason')}</th>
                        <th className="py-2 px-2.5">{t('unplaced_table_action', 'Suggested Fix')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {visibleUnplaced.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/70">
                          <td className="py-2 px-2.5 font-medium text-slate-900">
                            <div>{item.sku}</div>
                            {item.name && item.name !== item.sku && (
                              <div className="text-[11px] text-slate-500 font-normal">{item.name}</div>
                            )}
                          </td>
                          <td className="py-2 px-2.5 font-mono text-[11px]">
                            {item.length}" × {item.width}" × {item.height}"
                          </td>
                          <td className="py-2 px-2.5 font-mono">
                            <span className="text-slate-600">{item.requested_qty ?? item.quantity} req</span> /{' '}
                            <span className="text-emerald-600 font-medium">{item.placed_qty ?? 0} placed</span> /{' '}
                            <span className="text-red-600 font-bold">{item.unplaced_qty ?? item.quantity} unplaced</span>
                          </td>
                          <td className="py-2 px-2.5">
                            <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 mb-0.5">
                              {item.reason_code || 'UNPLACED'}
                            </span>
                            <div className="text-slate-600 text-[11px]">{item.message || 'Exceeds capacity or usable dimensions.'}</div>
                          </td>
                          <td className="py-2 px-2.5 text-blue-700 font-medium">
                            {item.suggested_action || 'Add more stock blocks or adjust part dimensions.'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {unplacedList.length > 10 && (
                  <div className="pt-2 text-center border-t border-slate-100">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowAllUnplaced(!showAllUnplaced);
                      }}
                      className="text-xs text-blue-600 hover:text-blue-800 font-semibold"
                    >
                      {showAllUnplaced
                        ? t('unplaced_show_less', 'Show less')
                        : t('unplaced_show_all', { count: unplacedList.length, defaultValue: `Show all ${unplacedList.length} items` })}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* Algorithm Benchmark Comparison Table */}
      {comparisonResults && comparisonResults.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-slate-100">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center space-x-1.5">
              <BarChart2 className="w-4 h-4 text-blue-600" />
              <span>{t('comparison_title')}</span>
            </h3>
            <span className="text-[11px] text-slate-500">
              Click a row to inspect its layout and KPI metrics
            </span>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 text-[11px]">
                <tr>
                  <th className="py-2.5 px-3">Algorithm</th>
                  <th className="py-2.5 px-3 text-right">{t('net_util')}</th>
                  <th className="py-2.5 px-3 text-right">{t('gross_util')}</th>
                  <th className="py-2.5 px-3 text-right">{t('scrap_vol')}</th>
                  <th className="py-2.5 px-3 text-center">{t('blocks_used')}</th>
                  <th className="py-2.5 px-3 text-center">{t('cuts_count')}</th>
                  <th className="py-2.5 px-3 text-right">{t('runtime')}</th>
                  {hasSolverStatus && (
                    <th className="py-2.5 px-3 text-center">{t('solver_status_label')}</th>
                  )}
                  <th className="py-2.5 px-3 text-center">{t('status')}</th>
                  <th className="py-2.5 px-3 text-center">Badge</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {comparisonResults.map((r) => {
                  const isSelected = r.algorithm_id === selectedAlgorithmId;
                  const isValid = r.validation.is_valid;

                  return (
                    <tr
                      key={r.algorithm_id}
                      onClick={() => onSelectResultFromTable(r.algorithm_id)}
                      className={`cursor-pointer transition ${
                        isSelected
                          ? 'bg-blue-50/70 font-medium'
                          : 'hover:bg-slate-50/80 bg-white'
                      }`}
                    >
                      <td className="py-2 px-3 font-semibold text-slate-800 flex items-center space-x-2">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            isSelected ? 'bg-blue-600 ring-2 ring-blue-300' : 'bg-slate-300'
                          }`}
                        />
                        <span>{r.algorithm_name}</span>
                      </td>
                      <td className="py-2 px-3 text-right font-bold text-blue-700">
                        {r.net_utilization_pct.toFixed(1)}%
                      </td>
                      <td className="py-2 px-3 text-right text-slate-600">
                        {r.gross_utilization_pct.toFixed(1)}%
                      </td>
                      <td className="py-2 px-3 text-right text-slate-600 font-mono text-[11px]">
                        {r.total_unrecoverable_scrap_volume.toLocaleString()} cu in
                      </td>
                      <td className="py-2 px-3 text-center text-slate-700 font-medium">
                        {r.blocks_used_count}
                      </td>
                      <td className="py-2 px-3 text-center text-slate-700 font-medium">
                        {r.total_cuts_count}
                      </td>
                      <td className="py-2 px-3 text-right text-slate-500 font-mono text-[11px]">
                        {r.runtime_ms.toFixed(1)} ms
                      </td>
                      {hasSolverStatus && (
                        <td className="py-2 px-3 text-center">
                          {r.fallback_used ? (
                            <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                              <span>{t('fallback_used_label')}</span>
                            </span>
                          ) : r.solver_status ? (
                            <span
                              className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-blue-50 text-blue-700 border border-blue-200"
                              title={r.solver_status}
                            >
                              <span>{r.solver_status.startsWith('OPTIMAL') ? 'Optimal (Model)' : r.solver_status}</span>
                              {r.solver_time_ms ? <span className="text-[9px] text-blue-500">({r.solver_time_ms}ms)</span> : null}
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[10px]">Heuristic</span>
                          )}
                        </td>
                      )}
                      <td className="py-2 px-3 text-center">
                        {isValid ? (
                          <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>{t('valid')}</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-50 text-red-700 border border-red-200">
                            <XCircle className="w-3 h-3 text-red-600" />
                            <span>{t('invalid')}</span>
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-center">
                        {r.is_best ? (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 shadow-xs">
                            <Star className="w-3 h-3 text-amber-600 fill-amber-500" />
                            <span>{t('best_badge')}</span>
                          </span>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-slate-500 italic">
            * {t('comparison_disclaimer')}
          </p>
        </div>
      )}

      {/* KPI Cards for the Selected Algorithm */}
      {currentResult ? (
        <div className="space-y-2 pt-2 border-t border-slate-100">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="font-semibold text-slate-700">
              Results: <span className="text-blue-600">{currentResult.algorithm_name}</span>
            </span>
            <span className="font-mono text-[11px]">
              {currentResult.total_parts_placed}/{currentResult.total_parts_demanded} parts placed ({currentResult.runtime_ms.toFixed(1)} ms)
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {/* Net Util */}
            <div className="p-3 bg-blue-50/50 border border-blue-200 rounded-xl space-y-1">
              <div className="flex items-center justify-between text-blue-800 text-xs">
                <span className="font-medium">{t('net_util')}</span>
                <Zap className="w-3.5 h-3.5 text-blue-600" />
              </div>
              <div className="text-2xl font-black text-blue-900 tracking-tight">
                {currentResult.net_utilization_pct.toFixed(1)}%
              </div>
              <div className="text-[10px] text-blue-600">
                Gross Bun Yield: {currentResult.gross_utilization_pct.toFixed(1)}%
              </div>
            </div>

            {/* Scrap Volume */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <div className="flex items-center justify-between text-slate-700 text-xs">
                <span className="font-medium">{t('scrap_vol')}</span>
                <Archive className="w-3.5 h-3.5 text-slate-500" />
              </div>
              <div className="text-xl font-bold text-slate-900 font-mono">
                {Math.round(currentResult.total_unrecoverable_scrap_volume).toLocaleString()}
              </div>
              <div className="text-[10px] text-slate-500">cu in unrecoverable</div>
            </div>

            {/* Blocks Used */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <div className="flex items-center justify-between text-slate-700 text-xs">
                <span className="font-medium">{t('blocks_used')}</span>
                <Layers className="w-3.5 h-3.5 text-slate-500" />
              </div>
              <div className="text-xl font-bold text-slate-900">
                {currentResult.blocks_used_count}
              </div>
              <div className="text-[10px] text-slate-500">raw buns / remnants</div>
            </div>

            {/* Total Cuts */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <div className="flex items-center justify-between text-slate-700 text-xs">
                <span className="font-medium">{t('cuts_count')}</span>
                <Scissors className="w-3.5 h-3.5 text-slate-500" />
              </div>
              <div className="text-xl font-bold text-slate-900">
                {currentResult.total_cuts_count}
              </div>
              <div className="text-[10px] text-slate-500">
                Est. saw time: {currentResult.estimated_saw_time_minutes.toFixed(0)} min
              </div>
            </div>

            {/* Remnants */}
            <div className="p-3 bg-emerald-50/50 border border-emerald-200 rounded-xl space-y-1">
              <div className="flex items-center justify-between text-emerald-800 text-xs">
                <span className="font-medium">Remnants Retained</span>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              </div>
              <div className="text-xl font-bold text-emerald-900">
                {currentResult.blocks.reduce((acc, b) => acc + b.usable_remnants.length, 0)}
              </div>
              <div className="text-[10px] text-emerald-700 font-mono">
                {Math.round(currentResult.total_remnant_volume).toLocaleString()} cu in
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-6 bg-slate-50 border border-dashed border-slate-300 rounded-xl text-center space-y-2">
          <p className="text-xs text-slate-600">{t('run_to_see_results')}</p>
        </div>
      )}
    </section>
  );
};
