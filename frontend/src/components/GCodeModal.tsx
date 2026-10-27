import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FileCode,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Copy,
  Check,
  Download,
  Archive,
  Search,
  ShieldAlert,
  X,
} from 'lucide-react';
import type { GCodeExportResponse, GCodeFilePayload, MachineProfile } from '../types';
import { createSimpleZipBlob } from '../services/gcode';

interface GCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  gcodeData: GCodeExportResponse | null;
  selectedMachine?: MachineProfile;
  jobName: string;
  unplacedCount?: number;
  onStepSelect?: (stepNumber: number) => void;
  onRecordExport?: (filenames: string[]) => void;
}

export const GCodeModal: React.FC<GCodeModalProps> = ({
  isOpen,
  onClose,
  gcodeData,
  selectedMachine,
  jobName,
  unplacedCount = 0,
  onStepSelect,
  onRecordExport,
}) => {
  const { t } = useTranslation();
  const [selectedBlockIdx, setSelectedBlockIdx] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [hasAcknowledged, setHasAcknowledged] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  // Active file payload
  const activeFile: GCodeFilePayload | undefined = useMemo(() => {
    if (!gcodeData || !gcodeData.files || gcodeData.files.length === 0) return undefined;
    return gcodeData.files[selectedBlockIdx] || gcodeData.files[0];
  }, [gcodeData, selectedBlockIdx]);

  // Filtered lines with search
  const lines = useMemo(() => {
    if (!activeFile) return [];
    return activeFile.content.split('\n');
  }, [activeFile]);

  const filteredLines = useMemo(() => {
    if (!searchQuery.trim()) return lines.map((text, idx) => ({ text, originalLineNum: idx + 1 }));
    const q = searchQuery.toLowerCase();
    return lines
      .map((text, idx) => ({ text, originalLineNum: idx + 1 }))
      .filter((item) => item.text.toLowerCase().includes(q));
  }, [lines, searchQuery]);

  // Extract cut step line targets for jump dropdown
  const cutStepOptions = useMemo(() => {
    if (!lines) return [];
    const options: Array<{ stepNumber: number; lineNum: number; label: string }> = [];
    lines.forEach((l, idx) => {
      const match = l.match(/\( --- Step (\d+): (.*?) --- \)/i);
      if (match) {
        options.push({
          stepNumber: parseInt(match[1], 10),
          lineNum: idx + 1,
          label: `Step ${match[1]}: ${match[2].slice(0, 32)}...`,
        });
      }
    });
    return options;
  }, [lines]);

  const handleCopyGCode = async () => {
    if (!activeFile) return;
    try {
      await navigator.clipboard.writeText(activeFile.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleDownloadSingle = () => {
    if (!activeFile || !hasAcknowledged || !activeFile.path_check_passed) return;
    const blob = new Blob([activeFile.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = activeFile.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    onRecordExport?.([activeFile.filename]);
  };

  const handleDownloadAllZip = () => {
    if (!gcodeData || !hasAcknowledged || !gcodeData.all_passed) return;
    const filesToZip = gcodeData.files.map((f) => ({
      name: f.filename,
      content: f.content,
    }));
    const zipBlob = createSimpleZipBlob(filesToZip);
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    const dateCompact = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    a.download = `foam-nesting_${gcodeData.job_id}_all-blocks_${dateCompact}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    onRecordExport?.(filesToZip.map((f) => f.name));
  };

  if (!isOpen || !gcodeData || !activeFile) return null;

  const canDownload = hasAcknowledged && activeFile.path_check_passed;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      {/* Calm Cream Card Shell */}
      <div
        className="w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl bg-[#fefdf8] border border-amber-200/80 shadow-2xl overflow-hidden"
        style={{ color: '#1e293b' }}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-amber-200/70 bg-[#faf7ee] flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-amber-100 text-amber-800 border border-amber-300">
              <FileCode className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-bold text-slate-900 leading-tight">
                  {t('gcode_export_title', 'CNC G-Code Program Export')}
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-mono font-semibold rounded bg-amber-100/80 text-amber-800 border border-amber-300">
                  {gcodeData.dialect}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {jobName} • {selectedMachine?.name || gcodeData.machine_name}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition cursor-pointer"
            title="Close dialog (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body: Scrollable Content */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {/* 1. Mandatory DEMO Safety Warning Banner */}
          <div className="p-4 rounded-xl border border-red-300 bg-red-50/80 text-red-950 flex items-start space-x-3.5 shadow-xs">
            <ShieldAlert className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="font-bold uppercase tracking-wider text-[11px] text-red-900">
                {t('gcode_demo_badge', 'DEMO POST-PROCESSOR — NOT VALIDATED ON PHYSICAL MACHINERY')}
              </div>
              <p className="text-xs text-red-900/90 leading-relaxed">
                {t('gcode_demo_disclaimer', 'This G-code export is an experimental demonstration feature. It has NOT been certified or dry-run on physical industrial saws, CNC waterjets, or machine controllers. Coordinates must be rigorously inspected, zero-offsets calibrated, and an air-cut / dry-run performed before touching material.')}
              </p>
            </div>
          </div>

          {/* Unplaced Parts Warning (if any) */}
          {unplacedCount > 0 && (
            <div className="p-3 rounded-lg border border-amber-300 bg-amber-50 text-amber-900 flex items-center space-x-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span className="text-xs">
                {t('gcode_unplaced_warning', { count: unplacedCount, defaultValue: `Partial Job Warning: ${unplacedCount} demanded parts could not be placed. This G-code program will cut the placed items only.` })}
              </span>
            </div>
          )}

          {/* 2. Block Switcher Tabs & Machine Spec Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-amber-50/50 p-3 rounded-xl border border-amber-200/60">
            {/* Block Tabs */}
            <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 sm:pb-0">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mr-1 shrink-0">
                Block:
              </span>
              {gcodeData.files.map((file, idx) => (
                <button
                  key={file.block_index}
                  type="button"
                  onClick={() => setSelectedBlockIdx(idx)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer shrink-0 ${
                    selectedBlockIdx === idx
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
                  }`}
                >
                  Block {file.block_index}
                  <span className="ml-1 text-[10px] opacity-75 font-mono">({file.cut_count} cuts)</span>
                </button>
              ))}
            </div>

            {/* Quick Stats Pill */}
            <div className="flex items-center space-x-3 text-[11px] text-slate-600 shrink-0">
              <span>
                Cuts: <strong>{activeFile.cut_count}</strong>
              </span>
              <span className="text-slate-300">•</span>
              <span>
                Cut Length: <strong>{activeFile.estimated_cut_length_in}"</strong>
              </span>
              <span className="text-slate-300">•</span>
              <span>
                Est. Time: <strong>~{activeFile.estimated_time_minutes} min</strong>
              </span>
            </div>
          </div>

          {/* 3. Path Simulation Check Status Badge */}
          <div
            className={`p-2.5 rounded-lg border flex items-center justify-between text-xs font-medium ${
              activeFile.path_check_passed
                ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                : 'bg-rose-50 text-rose-900 border-rose-300'
            }`}
          >
            <div className="flex items-center space-x-2 min-w-0">
              {activeFile.path_check_passed ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span className="truncate">{activeFile.path_check_message}</span>
            </div>
            <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-white/80 border border-current shrink-0 ml-2">
              {activeFile.path_check_passed ? t('gcode_sim_pass', 'Sim Pass') : t('gcode_sim_fail', 'Sim Fail')}
            </span>
          </div>

          {/* 4. Preview Toolbar: Search, Jump to Step, Copy */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center space-x-2 flex-1 max-w-md">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('gcode_search_placeholder', 'Filter G-code commands (e.g. G01, Step 2, Z42)...')}
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono shadow-2xs"
                />
              </div>
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="text-xs text-slate-400 hover:text-slate-600 px-1.5 py-1"
                >
                  Clear
                </button>
              )}
            </div>

            <div className="flex items-center space-x-2">
              {/* Jump to Cut Step dropdown */}
              {cutStepOptions.length > 0 && (
                <select
                  onChange={(e) => {
                    const stepNum = parseInt(e.target.value, 10);
                    if (!isNaN(stepNum)) {
                      onStepSelect?.(stepNum);
                      setSearchQuery(`Step ${stepNum}:`);
                    }
                  }}
                  className="px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-700 font-medium cursor-pointer shadow-2xs"
                  defaultValue=""
                >
                  <option value="" disabled>
                    {t('gcode_jump_to_step', 'Jump to Cut Step...')}
                  </option>
                  {cutStepOptions.map((opt) => (
                    <option key={opt.stepNumber} value={opt.stepNumber}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              )}

              {/* Copy Button */}
              <button
                type="button"
                onClick={handleCopyGCode}
                className="inline-flex items-center space-x-1 px-3 py-1.5 text-xs font-semibold bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg transition shadow-2xs cursor-pointer"
                title="Copy G-code to clipboard"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-emerald-700">{t('gcode_copied', 'Copied!')}</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-slate-500" />
                    <span>{t('gcode_copy', 'Copy')}</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* 5. G-Code Monospace Preview Terminal */}
          <div className="relative rounded-xl bg-slate-900 border border-slate-800 text-slate-200 font-mono text-xs overflow-hidden shadow-inner">
            <div className="bg-slate-950 px-4 py-2 border-b border-slate-800 flex items-center justify-between text-[11px] text-slate-400 font-sans">
              <span className="font-mono text-slate-300">{activeFile.filename}</span>
              <span>
                {filteredLines.length} of {lines.length} lines
              </span>
            </div>

            <div className="max-h-72 overflow-y-auto p-3 text-[11px] leading-relaxed divide-y divide-slate-800/40">
              {filteredLines.length === 0 ? (
                <div className="py-8 text-center text-slate-500 italic">
                  No G-code lines match "{searchQuery}"
                </div>
              ) : (
                filteredLines.map((item) => {
                  const isComment = item.text.startsWith('(');
                  const isStepHeader = item.text.includes('( --- Step');
                  const isProgramTermination = item.text.includes('M30');
                  const isGCode = item.text.startsWith('G');

                  let textColor = 'text-slate-300';
                  if (isStepHeader) textColor = 'text-amber-300 font-bold';
                  else if (isComment) textColor = 'text-slate-500 italic';
                  else if (isProgramTermination) textColor = 'text-rose-400 font-bold';
                  else if (isGCode) textColor = 'text-emerald-400';

                  return (
                    <div
                      key={item.originalLineNum}
                      className="flex items-start hover:bg-slate-800/50 px-1.5 py-0.5 rounded transition font-mono"
                    >
                      <span className="text-slate-600 select-none w-10 text-right pr-3 shrink-0 text-[10px]">
                        {item.originalLineNum}
                      </span>
                      <span className={`break-all ${textColor}`}>{item.text}</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* 6. Mandatory Checkbox Gating */}
          <div className="p-3.5 rounded-xl border border-amber-300 bg-amber-50/60 flex items-start space-x-3">
            <input
              id="gcode-safety-ack"
              type="checkbox"
              checked={hasAcknowledged}
              onChange={(e) => setHasAcknowledged(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
            />
            <label
              htmlFor="gcode-safety-ack"
              className="text-xs text-slate-800 font-medium cursor-pointer select-none leading-normal"
            >
              {t('gcode_safety_ack_label', 'Safety Acknowledgment: I understand this file must be reviewed and dry-run before use. I acknowledge that Tatras NestPro output is an unvalidated demonstration export and has not been tested on physical shop-floor equipment.')}
            </label>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 border-t border-amber-200/70 bg-[#faf7ee] flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div className="text-[11px] text-slate-500">
            Export Target:{' '}
            <strong className="text-slate-700">
              {activeFile.filename}
            </strong>
          </div>

          <div className="flex items-center space-x-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 transition cursor-pointer shadow-2xs"
            >
              Cancel
            </button>

            {/* Multi-Block ZIP button (if more than 1 block) */}
            {gcodeData.files.length > 1 && (
              <button
                type="button"
                onClick={handleDownloadAllZip}
                disabled={!canDownload || !gcodeData.all_passed}
                className={`inline-flex items-center space-x-1.5 px-3.5 py-2 text-xs font-bold rounded-lg border shadow-xs transition cursor-pointer ${
                  canDownload && gcodeData.all_passed
                    ? 'bg-amber-100 hover:bg-amber-200 text-amber-900 border-amber-300'
                    : 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-60'
                }`}
                title={
                  !hasAcknowledged
                    ? 'Check safety acknowledgement to download'
                    : 'Download all block programs in a .zip bundle'
                }
              >
                <Archive className="w-3.5 h-3.5 text-amber-700" />
                <span>{t('gcode_download_all', 'Download All (.zip)')}</span>
              </button>
            )}

            {/* Single Block Download Button */}
            <button
              type="button"
              onClick={handleDownloadSingle}
              disabled={!canDownload}
              className={`inline-flex items-center space-x-1.5 px-4 py-2 text-xs font-bold rounded-lg transition shadow-xs cursor-pointer ${
                canDownload
                  ? 'bg-slate-900 hover:bg-slate-800 text-white'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed opacity-60'
              }`}
              title={
                !hasAcknowledged
                  ? 'Check safety acknowledgement to download'
                  : `Download ${activeFile.filename}`
              }
            >
              <Download className="w-3.5 h-3.5" />
              <span>
                {t('gcode_download_single', { block: activeFile.block_index, defaultValue: `Download Block ${activeFile.block_index} (.nc)` })}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
