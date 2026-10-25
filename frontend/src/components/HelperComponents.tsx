import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Globe,
  ChevronRight,
  Clock
} from 'lucide-react';

export const ProgressHeader: React.FC<{
  currentStep: 1 | 2 | 3;
  isStale: boolean;
  hasResult: boolean;
  is3DGenerated: boolean;
  onToggleLang: () => void;
}> = ({ currentStep: _step, isStale, hasResult, is3DGenerated, onToggleLang }) => {
  const { t, i18n } = useTranslation();

  return (
    <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between sticky top-0 z-30 shadow-xs">
      {/* Brand */}
      <div className="flex items-center space-x-3">
        <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-sm">
          <Box className="w-5 h-5" />
        </div>
        <div>
          <h1 className="font-extrabold text-slate-900 text-base tracking-tight">
            Tatras NestPro
          </h1>
          <p className="text-[11px] text-slate-500 font-medium">
            3D Polyurethane Foam Slicing & Nesting Optimizer
          </p>
        </div>
      </div>

      {/* Slim Progress Stepper */}
      <div className="hidden md:flex items-center space-x-1 text-xs">
        {/* Step 1 */}
        <div className="flex items-center space-x-1.5 px-3 py-1 rounded-full bg-blue-50 text-blue-700 font-semibold border border-blue-200">
          <span className="w-4 h-4 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px]">1</span>
          <span>{t('progress_input')}</span>
        </div>

        <ChevronRight className="w-3.5 h-3.5 text-slate-400" />

        {/* Step 2 */}
        <div
          className={`flex items-center space-x-1.5 px-3 py-1 rounded-full font-semibold border transition ${
            hasResult && !isStale
              ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
              : 'bg-slate-100 text-slate-600 border-slate-200'
          }`}
        >
          <span
            className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${
              hasResult && !isStale ? 'bg-emerald-600 text-white' : 'bg-slate-300 text-slate-700'
            }`}
          >
            2
          </span>
          <span>{t('progress_optimize')}</span>
        </div>

        <ChevronRight className="w-3.5 h-3.5 text-slate-400" />

        {/* Step 3 */}
        <div
          className={`flex items-center space-x-1.5 px-3 py-1 rounded-full font-semibold border transition ${
            is3DGenerated && !isStale
              ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
              : 'bg-slate-100 text-slate-400 border-slate-200'
          }`}
        >
          <span
            className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${
              is3DGenerated && !isStale ? 'bg-white text-blue-600' : 'bg-slate-300 text-slate-700'
            }`}
          >
            3
          </span>
          <span>{t('progress_plan')}</span>
        </div>

        <ChevronRight className="w-3.5 h-3.5 text-slate-400" />

        {/* Step 4 */}
        <div
          className={`flex items-center space-x-1.5 px-3 py-1 rounded-full font-semibold border transition ${
            hasResult && !isStale
              ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
              : 'bg-slate-100 text-slate-400 border-slate-200'
          }`}
        >
          <span
            className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${
              hasResult && !isStale ? 'bg-white text-emerald-600' : 'bg-slate-300 text-slate-700'
            }`}
          >
            4
          </span>
          <span>{t('progress_track')}</span>
        </div>
      </div>

      {/* Language Toggle */}
      <button
        type="button"
        onClick={onToggleLang}
        className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
      >
        <Globe className="w-3.5 h-3.5 text-slate-500" />
        <span>{i18n.language === 'en' ? 'Español' : 'English'}</span>
      </button>
    </header>
  );
};

export const Step4Placeholder: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="p-6 bg-slate-50/70 border border-dashed border-slate-300 rounded-xl text-center space-y-2">
      <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-slate-200 text-slate-600">
        <Clock className="w-5 h-5" />
      </div>
      <h3 className="text-sm font-semibold text-slate-700">{t('step4_title')}</h3>
      <p className="text-xs text-slate-500 max-w-md mx-auto">
        Run optimization in Step 2 to generate the executive KPI dashboard, cost model, 6 light-themed charts, and shop-floor execution tracking.
      </p>
    </div>
  );
};
