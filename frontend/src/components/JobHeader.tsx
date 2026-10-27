import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Edit3,
  Check,
  X,
  Save,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Loader2,
  Download,
  FileCode,
  Tag
} from 'lucide-react';

interface JobHeaderProps {
  jobName: string;
  onRenameJob: (newName: string) => void;
  jobId: string;
  customerRef?: string;
  grade: string;
  machineName: string;
  cutType: string;
  algorithmName?: string;
  createdAt: string;
  lastOptimizedAt?: string;
  isOptimizing: boolean;
  elapsedSeconds: number;
  isStale: boolean;
  hasValidResult: boolean;
  onSaveJob: () => void;
  onExportCSV: () => void;
  isSaved?: boolean;
}

export const JobHeader: React.FC<JobHeaderProps> = ({
  jobName,
  onRenameJob,
  jobId,
  customerRef,
  grade,
  machineName,
  cutType,
  algorithmName,
  createdAt,
  lastOptimizedAt,
  isOptimizing,
  elapsedSeconds,
  isStale,
  hasValidResult,
  onSaveJob,
  onExportCSV,
  isSaved,
}) => {
  const { t, i18n } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(jobName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEditValue(jobName);
  }, [jobName]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSaveRename = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== jobName) {
      onRenameJob(trimmed);
    } else {
      setEditValue(jobName);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSaveRename();
    } else if (e.key === 'Escape') {
      setEditValue(jobName);
      setIsEditing(false);
    }
  };

  // Locale-formatted runtime dates
  const formatRuntimeDate = (isoString?: string, includeTime = false) => {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return '';
      const locale = i18n.language === 'es' ? 'es-ES' : 'en-US';
      if (includeTime) {
        return new Intl.DateTimeFormat(locale, {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }).format(d);
      }
      return new Intl.DateTimeFormat(locale, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }).format(d);
    } catch {
      return '';
    }
  };

  const createdDateStr = formatRuntimeDate(createdAt, false);
  const lastOptimizedStr = formatRuntimeDate(lastOptimizedAt, true);

  return (
    <section className="bg-white border-b border-slate-200 px-6 py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 shrink-0 shadow-2xs">
      {/* Left: Job Title & Metadata */}
      <div className="flex flex-col min-w-0 max-w-full md:max-w-[62%]">
        {/* Title row with inline editing */}
        <div className="flex items-center space-x-2.5 min-w-0">
          {isEditing ? (
            <div className="flex items-center space-x-1.5 flex-1 min-w-0">
              <input
                ref={inputRef}
                type="text"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={handleSaveRename}
                className="px-2.5 py-1 text-base lg:text-lg font-bold text-slate-900 border border-blue-500 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400 w-full max-w-md shadow-2xs"
                placeholder={t('untitled_job')}
                maxLength={80}
              />
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleSaveRename();
                }}
                className="p-1 rounded bg-blue-50 hover:bg-blue-100 text-blue-700 transition cursor-pointer"
                title="Save name (Enter)"
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setEditValue(jobName);
                  setIsEditing(false);
                }}
                className="p-1 rounded hover:bg-slate-100 text-slate-500 transition cursor-pointer"
                title="Cancel (Esc)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div
              className="group flex items-center space-x-2 min-w-0 cursor-pointer"
              onClick={() => setIsEditing(true)}
              title={`${jobName} (Click to rename)`}
            >
              <h1 className="text-base lg:text-lg font-bold text-slate-900 tracking-tight truncate max-w-[260px] sm:max-w-[420px] lg:max-w-[540px]">
                {jobName || t('untitled_job')}
              </h1>
              <Edit3 className="w-3.5 h-3.5 text-slate-400 opacity-0 group-hover:opacity-100 transition shrink-0" />
            </div>
          )}

          {/* Grade Badge */}
          <span className="shrink-0 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-md bg-blue-50 text-blue-700 border border-blue-200">
            {grade}
          </span>

          {/* Customer / Order Ref badge (if entered by user) */}
          {customerRef && customerRef.trim() && (
            <span
              className="hidden lg:inline-flex items-center space-x-1 px-2 py-0.5 text-[11px] font-medium rounded-md bg-slate-100 text-slate-700 border border-slate-200 truncate max-w-[200px]"
              title={`Customer / Order Reference: ${customerRef}`}
            >
              <Tag className="w-3 h-3 text-slate-500 shrink-0" />
              <span className="truncate">{customerRef}</span>
            </span>
          )}
        </div>

        {/* Subtitle Line with Real Runtime State */}
        <div className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0">
          <span className="font-mono text-slate-600 font-semibold">{jobId}</span>
          <span className="text-slate-300">•</span>
          <span>
            {t('created_at_label')}: <strong>{createdDateStr || 'Today'}</strong>
          </span>
          {lastOptimizedStr && (
            <>
              <span className="text-slate-300">•</span>
              <span className="text-emerald-700 font-medium">
                {t('last_optimized_label')}: <strong>{lastOptimizedStr}</strong>
              </span>
            </>
          )}
          <span className="text-slate-300">•</span>
          <span>
            Machine: <strong>{machineName}</strong> ({cutType})
          </span>
          {algorithmName && (
            <>
              <span className="text-slate-300">•</span>
              <span className="truncate max-w-[180px]" title={algorithmName}>
                Algo: <strong>{algorithmName}</strong>
              </span>
            </>
          )}
        </div>
      </div>

      {/* Right: Real-time Status Badge & Actions */}
      <div className="flex items-center space-x-2 sm:space-x-3 shrink-0 flex-wrap gap-y-2">
        {/* Real-time Status Badge */}
        {isOptimizing ? (
          <div className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold animate-pulse">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
            <span>Optimizing ({elapsedSeconds}s)...</span>
          </div>
        ) : isStale ? (
          <div
            className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg bg-amber-50 border border-amber-300 text-amber-800 text-xs font-semibold"
            title="Inputs have been modified since last optimization run"
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
            <span>Inputs Modified (Stale)</span>
          </div>
        ) : hasValidResult ? (
          <div className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-semibold">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Optimized</span>
          </div>
        ) : (
          <div className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg bg-slate-100 border border-slate-300 text-slate-600 text-xs font-semibold">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span>Ready to Optimize</span>
          </div>
        )}

        {/* Action: Save Job */}
        <button
          type="button"
          onClick={onSaveJob}
          className={`inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition cursor-pointer shadow-2xs ${
            isSaved
              ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
              : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-300'
          }`}
          title="Save job inputs and optimization results to local browser store"
        >
          {isSaved ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-600" />
              <span>{t('job_saved')}</span>
            </>
          ) : (
            <>
              <Save className="w-3.5 h-3.5 text-slate-600" />
              <span>{t('save_job')}</span>
            </>
          )}
        </button>

        {/* Action Button: Export CSV */}
        <button
          type="button"
          onClick={hasValidResult && !isStale ? onExportCSV : undefined}
          disabled={!hasValidResult || isStale}
          className={`inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border shadow-2xs transition ${
            hasValidResult && !isStale
              ? 'text-slate-700 bg-white hover:bg-slate-50 border-slate-300 cursor-pointer'
              : 'text-slate-400 bg-slate-50 border-slate-200 cursor-not-allowed opacity-75'
          }`}
          title={
            hasValidResult && !isStale
              ? 'Export complete placement & cut manifest to CSV'
              : t('export_csv_reason_no_result')
          }
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export CSV</span>
        </button>

        {/* Action Button: Generate G-Code (Honest Disabled Tooltip) */}
        <button
          type="button"
          disabled
          title={t('gcode_tooltip')}
          className="hidden sm:inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-bold text-white bg-slate-900 rounded-lg opacity-70 cursor-not-allowed shadow-2xs transition"
        >
          <FileCode className="w-3.5 h-3.5 text-slate-300" />
          <span>Generate G-Code</span>
        </button>
      </div>
    </section>
  );
};
