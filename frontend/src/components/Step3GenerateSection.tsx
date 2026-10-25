import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box,
  AlertCircle,
  } from 'lucide-react';
import type { OptimizationResult } from '../types';

interface Step3GenerateSectionProps {
  currentResult: OptimizationResult | null;
  isStale: boolean;
  is3DGenerated: boolean;
  onGenerate3DPlan: () => void;
  children?: React.ReactNode;
}

export const Step3GenerateSection: React.FC<Step3GenerateSectionProps> = ({
  currentResult,
  isStale,
  is3DGenerated,
  onGenerate3DPlan,
  children,
}) => {
  const { t } = useTranslation();

  // Determine disabled state and reason
  let disabled = false;
  let disabledReason = '';

  if (!currentResult) {
    disabled = true;
    disabledReason = t('generate_3d_tip_disabled');
  } else if (isStale) {
    disabled = true;
    disabledReason = t('generate_3d_tip_stale');
  } else if (!currentResult.validation.is_valid) {
    disabled = true;
    disabledReason = t('generate_3d_tip_invalid');
  }

  return (
    <section id="step3-section" className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
        <div className="flex items-center space-x-2">
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white font-bold text-xs">
            3
          </span>
          <h2 className="font-semibold text-slate-800 text-base">{t('step3_title')}</h2>
        </div>

        {currentResult && !isStale && (
          <span className="text-xs text-slate-500 font-medium">
            Active: <span className="font-bold text-blue-600">{currentResult.algorithm_name}</span> ({currentResult.blocks_used_count} blocks)
          </span>
        )}
      </div>

      {/* Button & Tooltip Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
        <div className="space-y-0.5">
          <h3 className="font-bold text-xs text-slate-800">
            {t('generate_3d_btn')}
          </h3>
          <p className="text-[11px] text-slate-500">
            {currentResult
              ? `Generates 3D cut planes and spatial block layout using ${currentResult.algorithm_name}`
              : 'Requires a valid optimization result before rendering 3D scene.'}
          </p>
        </div>

        <div className="relative group inline-block">
          <button
            type="button"
            onClick={onGenerate3DPlan}
            disabled={disabled}
            className={`inline-flex items-center space-x-2 px-5 py-2.5 rounded-lg text-xs font-bold transition shadow-sm ${
              disabled
                ? 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-200 hover:shadow-md'
            }`}
          >
            <Box className="w-4 h-4" />
            <span>{t('generate_3d_btn')}</span>
          </button>

          {/* Disabled Tooltip */}
          {disabled && (
            <div className="absolute right-0 bottom-full mb-2 hidden group-hover:flex items-center space-x-1.5 px-3 py-1.5 bg-slate-900 text-white text-[11px] rounded-lg shadow-xl whitespace-nowrap z-50 pointer-events-none">
              <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>{disabledReason}</span>
            </div>
          )}
        </div>
      </div>

      {/* 3D Container (Revealed only after clicking button) */}
      {is3DGenerated && !isStale && currentResult ? (
        <div className="space-y-4">
          {children}
        </div>
      ) : (
        <div className="py-10 px-4 bg-slate-50/50 border border-dashed border-slate-200 rounded-xl text-center space-y-2">
          <Box className="w-8 h-8 text-slate-300 mx-auto" />
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            The 3D cutting plan and interactive saw sequencer will appear here once generated for the selected algorithm.
          </p>
        </div>
      )}
    </section>
  );
};
