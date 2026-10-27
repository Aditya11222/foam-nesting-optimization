import React from 'react';
import {
  Box,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import type { OptimizationResult } from '../types';
import { computeStickyBarState } from '../services/recommender';
export { computeStickyBarState };

export interface StickyActionBarProps {
  mode?: 'step2' | 'step3';
  currentResult: OptimizationResult | null;
  isOptimizing: boolean;
  isStale: boolean;
  onGenerate3DPlan: () => void;
  onBackToInputs: () => void;
  algorithmName?: string;
}

export const StickyActionBar: React.FC<StickyActionBarProps> = ({
  mode = 'step2',
  currentResult,
  isOptimizing,
  isStale,
  onGenerate3DPlan,
  onBackToInputs,
  algorithmName,
}) => {
  const { isDisabled, tooltipMessage, primaryLabel, secondaryLabel } = computeStickyBarState(
    currentResult,
    isOptimizing,
    isStale,
    mode
  );

  return (
    <div className="sticky bottom-0 z-30 bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] px-4 sm:px-6 py-3">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
        {/* Left: Solution & Validation Summary Badge */}
        <div className="flex items-center space-x-2 sm:space-x-3 w-full sm:w-auto justify-between sm:justify-start">
          {isOptimizing ? (
            <div className="flex items-center space-x-2 text-xs font-semibold text-blue-700 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-200">
              <Loader2 className="w-4 h-4 animate-spin text-blue-600 shrink-0" />
              <span>Solving heuristics in progress...</span>
            </div>
          ) : isStale ? (
            <div className="flex items-center space-x-1.5 text-xs font-semibold text-amber-800 bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-200">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Inputs modified — Re-run needed for updated plan</span>
            </div>
          ) : currentResult ? (
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-700">
              <span className="font-bold text-slate-900 bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200 shadow-2xs">
                {algorithmName || currentResult.algorithm_name}
              </span>
              <span className="inline-flex items-center font-bold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200 text-xs">
                {currentResult.net_utilization_pct.toFixed(1)}% Yield
              </span>
              <span className="text-slate-500 font-medium text-[11px] hidden md:inline">
                ({currentResult.blocks_used_count} bun{currentResult.blocks_used_count > 1 ? 's' : ''} used)
              </span>
              <span className="hidden sm:inline-flex items-center space-x-1 text-emerald-700 text-xs font-medium">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>Validated</span>
              </span>
            </div>
          ) : (
            <span className="text-xs text-slate-500 font-medium">
              Select strategy and run optimization to generate 3D cut plan
            </span>
          )}
        </div>

        {/* Right: Actions */}
        <div className="flex items-center space-x-2.5 w-full sm:w-auto justify-end">
          {/* Secondary Action */}
          <button
            type="button"
            onClick={onBackToInputs}
            className="inline-flex items-center space-x-1.5 px-3.5 sm:px-4 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 active:bg-slate-100 rounded-lg border border-slate-300 shadow-2xs transition cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-slate-500" />
            <span>{secondaryLabel}</span>
          </button>

          {/* Primary Action */}
          <div className="relative group inline-block">
            <button
              type="button"
              onClick={onGenerate3DPlan}
              disabled={isDisabled}
              className={`inline-flex items-center space-x-2 px-4 sm:px-5 py-2 text-xs sm:text-sm font-bold rounded-lg shadow-sm transition-all duration-150 ${
                isDisabled
                  ? 'bg-slate-200 text-slate-400 border border-slate-300 cursor-not-allowed shadow-none'
                  : 'bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white shadow-emerald-600/20 hover:shadow-md cursor-pointer'
              }`}
            >
              <Box className="w-4 h-4 shrink-0" />
              <span>{primaryLabel}</span>
              <ArrowRight className="w-3.5 h-3.5 shrink-0" />
            </button>

            {/* Explanatory Tooltip when disabled */}
            {isDisabled && tooltipMessage && (
              <div className="absolute right-0 bottom-full mb-2 hidden group-hover:flex items-center space-x-1.5 px-3 py-1.5 bg-slate-900 text-white text-[11px] font-medium rounded-lg shadow-xl whitespace-nowrap z-50 pointer-events-none border border-slate-700">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>{tooltipMessage}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
