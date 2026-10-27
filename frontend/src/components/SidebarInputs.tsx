import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Plus,
  Trash2,
  AlertTriangle,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Info,
  Merge,
} from 'lucide-react';
import type {
  FoamGrade,
  MachineProfile,
  PartItem,
  BlockInput,
  OrientationMode,
  OptimizationObjective,
} from '../types';
import {
  isSixteenthInch,
  computeUsableDimensions,
  evaluateStockSufficiency,
  recommendMachine,
  recommendObjective,
  evaluateManualMachine,
} from '../services/recommender';

export interface SidebarInputsProps {
  customerRef?: string;
  onChangeCustomerRef?: (ref: string) => void;
  grades: FoamGrade[];
  selectedGrade: string;
  onSelectGrade: (grade: string) => void;
  allowMixedGrades: boolean;
  onToggleMixedGrades: (allowed: boolean) => void;
  machines: MachineProfile[];
  selectedMachineId: string;
  onSelectMachine: (machineId: string) => void;
  isMachineAuto?: boolean;
  onToggleMachineAuto?: (isAuto: boolean) => void;
  objective?: OptimizationObjective;
  onSelectObjective?: (obj: OptimizationObjective) => void;
  isObjectiveAuto?: boolean;
  onToggleObjectiveAuto?: (isAuto: boolean) => void;
  // Legacy compatibility props
  machineObjective?: 'lowest_cost' | 'best_yield' | 'lowest_time' | OptimizationObjective;
  onSelectMachineObjective?: (obj: any) => void;
  skinTrim: number;
  onChangeSkinTrim: (trim: number) => void;
  kerf: number;
  onChangeKerf: (kerf: number) => void;
  blocks: BlockInput[];
  onAddBlock: () => void;
  onRemoveBlock: (index: number) => void;
  onUpdateBlock: (index: number, updated: Partial<BlockInput>) => void;
  onMergeBlocks?: (targetIndex: number, sourceIndex: number) => void;
  parts: PartItem[];
  onAddPart: () => void;
  onRemovePart: (index: number) => void;
  onUpdatePart: (index: number, updated: Partial<PartItem>) => void;
  onLoadSample: () => void;
  onInputModified: () => void;
  mode?: 'sidebar' | 'card';
  onContinueToOptimization?: () => void;
  validationError?: string | null;
}

export const SidebarInputs: React.FC<SidebarInputsProps> = ({
  customerRef = '',
  onChangeCustomerRef,
  validationError,
  grades,
  selectedGrade,
  onSelectGrade,
  allowMixedGrades,
  onToggleMixedGrades,
  machines,
  selectedMachineId,
  onSelectMachine,
  isMachineAuto = true,
  onToggleMachineAuto,
  objective: directObjective,
  onSelectObjective,
  isObjectiveAuto = true,
  onToggleObjectiveAuto,
  machineObjective = 'balanced',
  onSelectMachineObjective,
  skinTrim,
  onChangeSkinTrim,
  kerf,
  onChangeKerf,
  blocks,
  onAddBlock,
  onRemoveBlock,
  onUpdateBlock,
  onMergeBlocks,
  parts,
  onAddPart,
  onRemovePart,
  onUpdatePart,
  onLoadSample,
  onInputModified,
  mode = 'sidebar',
  onContinueToOptimization,
}) => {
  const { t } = useTranslation();
  const [showWhyNotOthers, setShowWhyNotOthers] = useState<boolean>(false);

  // Normalize active objective
  const activeObjective: OptimizationObjective = useMemo(() => {
    if (directObjective) return directObjective;
    if (machineObjective === 'lowest_cost') return 'minimize_cost';
    if (machineObjective === 'best_yield') return 'maximize_yield';
    if (machineObjective === 'lowest_time') return 'minimize_time';
    return (machineObjective as OptimizationObjective) || 'balanced';
  }, [directObjective, machineObjective]);

  const handleObjectiveChange = (newObj: OptimizationObjective) => {
    onSelectObjective?.(newObj);
    onSelectMachineObjective?.(newObj);
    onToggleObjectiveAuto?.(false);
    onInputModified();
  };

  const selectedMachine = useMemo(
    () => machines.find((mach) => mach.id === selectedMachineId) || machines[0],
    [machines, selectedMachineId]
  );

  // 1. Run Machine Recommender
  const machineRec = useMemo(
    () => recommendMachine(machines, blocks, parts, skinTrim, activeObjective, selectedGrade),
    [machines, blocks, parts, skinTrim, activeObjective, selectedGrade]
  );

  // 2. Run Objective Recommender
  const objectiveRec = useMemo(
    () => recommendObjective(blocks, parts, skinTrim, selectedGrade, selectedMachine),
    [blocks, parts, skinTrim, selectedGrade, selectedMachine]
  );

  // 3. Run Stock Sufficiency Check
  const stockSufficiency = useMemo(
    () => evaluateStockSufficiency(blocks, parts, skinTrim),
    [blocks, parts, skinTrim]
  );

  // 4. Run Manual Machine Validation (if manually selected)
  const manualValidation = useMemo(() => {
    if (isMachineAuto || !selectedMachine) return null;
    return evaluateManualMachine(selectedMachine, blocks, parts, skinTrim);
  }, [isMachineAuto, selectedMachine, blocks, parts, skinTrim]);

  // Group machines by cut type
  const guillotineMachines = useMemo(
    () => machines.filter((m) => m.cut_type === 'guillotine'),
    [machines]
  );
  const freeMachines = useMemo(
    () => machines.filter((m) => m.cut_type === 'free'),
    [machines]
  );

  // Detect duplicate blocks
  const duplicateBlockPairs = useMemo(() => {
    const pairs: Array<{ firstIdx: number; secondIdx: number; specs: string }> = [];
    for (let i = 0; i < blocks.length; i++) {
      for (let j = i + 1; j < blocks.length; j++) {
        const b1 = blocks[i];
        const b2 = blocks[j];
        if (
          b1.nominal_length === b2.nominal_length &&
          b1.nominal_width === b2.nominal_width &&
          b1.nominal_height === b2.nominal_height &&
          (b1.grade || selectedGrade) === (b2.grade || selectedGrade)
        ) {
          pairs.push({
            firstIdx: i,
            secondIdx: j,
            specs: `${b1.nominal_length}" × ${b1.nominal_width}" × ${b1.nominal_height}" (${b1.grade || selectedGrade})`,
          });
        }
      }
    }
    return pairs;
  }, [blocks, selectedGrade]);

  const handleMergeDuplicateBlocks = (firstIdx: number, secondIdx: number) => {
    if (onMergeBlocks) {
      onMergeBlocks(firstIdx, secondIdx);
    } else {
      const mergedQty = blocks[firstIdx].quantity + blocks[secondIdx].quantity;
      onUpdateBlock(firstIdx, { quantity: mergedQty });
      onRemoveBlock(secondIdx);
    }
    onInputModified();
  };

  const handleRestoreAutoMachine = () => {
    if (machineRec.recommendedMachine) {
      onSelectMachine(machineRec.recommendedMachine.id);
      onChangeKerf(machineRec.recommendedMachine.kerf);
    }
    onToggleMachineAuto?.(true);
    onInputModified();
  };

  const handleRestoreAutoObjective = () => {
    onSelectObjective?.(objectiveRec.recommendedObjective);
    onSelectMachineObjective?.(objectiveRec.recommendedObjective);
    onToggleObjectiveAuto?.(true);
    onInputModified();
  };

  const totalPartsCount = parts.reduce((acc, p) => acc + p.quantity, 0);
  const totalBlocksCount = blocks.reduce((acc, b) => acc + b.quantity, 0);

  // Render Customer / Order Reference
  const renderCustomerRef = () => (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="block font-medium text-slate-700 text-xs">
          {t('customer_ref_label')}
        </label>
        <span className="text-[10px] text-slate-400">Optional</span>
      </div>
      <input
        type="text"
        value={customerRef}
        onChange={(e) => {
          onChangeCustomerRef?.(e.target.value);
          onInputModified();
        }}
        placeholder={t('customer_ref_placeholder')}
        className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-800 text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
        maxLength={60}
      />
    </div>
  );

  // 1. Grade Selector (with single Advanced Mixed Grades toggle)
  const renderGradeSelector = () => (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="block font-medium text-slate-700 text-xs">{t('grade')}</label>
        <span className="text-[10px] text-slate-400">
          {grades.find((g) => g.code === selectedGrade)?.name || selectedGrade}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {['HR-40', 'HR-30', 'VE-50'].map((gCode) => {
          const isSelected = selectedGrade === gCode;
          return (
            <button
              key={gCode}
              type="button"
              onClick={() => {
                onSelectGrade(gCode);
                onInputModified();
              }}
              className={`py-1.5 px-3 rounded-lg border font-medium text-xs text-center transition flex items-center justify-center space-x-1.5 cursor-pointer ${
                isSelected
                  ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{
                  backgroundColor:
                    gCode === 'HR-40' ? '#ef4444' : gCode === 'HR-30' ? '#3b82f6' : '#8b5cf6',
                }}
              />
              <span>{gCode}</span>
            </button>
          );
        })}
      </div>

      {/* Advanced Mixed Grades Toggle (Single, Un-duplicated) */}
      <div className="flex items-center justify-between pt-2">
        <label className="text-[11px] font-medium text-slate-600 flex items-center space-x-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={allowMixedGrades}
            onChange={(e) => onToggleMixedGrades(e.target.checked)}
            className="rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
          />
          <span>Advanced: mixed grades</span>
        </label>
        {allowMixedGrades && (
          <span className="text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
            Independent per-grade solving
          </span>
        )}
      </div>
    </div>
  );

  // 2. Machine Profile Selector with Full Proposal Fleet & Auto-Recommendation
  const renderMachineSelector = () => (
    <div className="space-y-2">
      {/* Header with Auto / Manual Status Tag */}
      <div className="flex items-center justify-between">
        <label className="block font-medium text-slate-700 text-xs">
          {t('machine')}
        </label>
        <div className="flex items-center space-x-2">
          {isMachineAuto ? (
            <span className="inline-flex items-center space-x-1 text-[10px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
              <Sparkles className="w-3 h-3 text-blue-600" />
              <span>Auto (Recommended)</span>
            </span>
          ) : (
            <div className="flex items-center space-x-1.5">
              <span className="text-[10px] font-semibold text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">
                Manual selection
              </span>
              <button
                type="button"
                onClick={handleRestoreAutoMachine}
                className="text-[10px] font-semibold text-blue-600 hover:text-blue-800 underline cursor-pointer"
              >
                Use recommended
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Grouped Machine Dropdown */}
      <select
        value={selectedMachineId}
        onChange={(e) => {
          const mId = e.target.value;
          onSelectMachine(mId);
          onToggleMachineAuto?.(false);
          const m = machines.find((mach) => mach.id === mId);
          if (m) {
            onChangeKerf(m.kerf);
          }
          onInputModified();
        }}
        className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 text-xs font-semibold focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-2xs"
      >
        <optgroup label="Guillotine / Straight Saws (Edge-to-Edge Slicing)">
          {guillotineMachines.map((m) => {
            const isRec = machineRec.recommendedMachine?.id === m.id;
            return (
              <option key={m.id} value={m.id}>
                {m.name} — {m.automation.toUpperCase()} ({m.max_cut_height}" max, {m.kerf}" kerf)
                {isRec ? ' ★ Recommended' : ''}
                {m.support_level === 'basic_heuristic' ? ' [Basic Heuristic]' : ''}
              </option>
            );
          })}
        </optgroup>
        <optgroup label="Free / Non-Guillotine (Waterjet & Wire Contouring)">
          {freeMachines.map((m) => {
            const isRec = machineRec.recommendedMachine?.id === m.id;
            return (
              <option key={m.id} value={m.id}>
                {m.name} — {m.automation.toUpperCase()} ({m.max_cut_height}" max, {m.kerf}" kerf)
                {isRec ? ' ★ Recommended' : ''}
                {m.support_level === 'basic_heuristic' ? ' [Basic Heuristic]' : ''}
              </option>
            );
          })}
        </optgroup>
      </select>

      {/* Active Machine Details Strip */}
      {selectedMachine && (
        <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-slate-700 space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <span className="font-semibold text-slate-900">{selectedMachine.name}</span>
            <div className="flex items-center space-x-1">
              <span className="uppercase text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-200 text-slate-700">
                {selectedMachine.cut_type}
              </span>
              <span className="capitalize text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-800">
                {selectedMachine.automation}
              </span>
              {selectedMachine.support_level === 'basic_heuristic' && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">
                  Basic Heuristic
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2 pt-1 border-t border-slate-200/80 text-[10px]">
            <div>
              <span className="text-slate-400 block">Max Height</span>
              <span className="font-mono font-bold text-slate-800">{selectedMachine.max_cut_height}"</span>
            </div>
            <div>
              <span className="text-slate-400 block">Blade Kerf</span>
              <span className="font-mono font-bold text-slate-800">{selectedMachine.kerf}"</span>
            </div>
            <div>
              <span className="text-slate-400 block">Feed Rate</span>
              <span className="font-mono font-bold text-slate-800">{selectedMachine.feed_rate_ipm || 100} IPM</span>
            </div>
            <div>
              <span className="text-slate-400 block">Rate ($/hr)</span>
              <span className="font-mono font-bold text-slate-800">${selectedMachine.hourly_rate || 60}/hr</span>
            </div>
          </div>
        </div>
      )}

      {/* Why This Machine Explanation (Auto Mode) */}
      {isMachineAuto && (
        <div className="p-2.5 bg-blue-50/70 border border-blue-200 rounded-lg text-xs space-y-2">
          <div className="flex items-start space-x-1.5">
            <Info className="w-3.5 h-3.5 text-blue-600 mt-0.5 shrink-0" />
            <div>
              <span className="font-semibold text-blue-900 block text-[11px] mb-0.5">Why this machine</span>
              <p className="text-[11px] text-blue-800 leading-relaxed">{machineRec.reasonSummary}</p>
            </div>
          </div>

          {/* Collapsible "Why not others" Section */}
          {Object.keys(machineRec.rejectedReasons).length > 0 && (
            <div className="pt-1.5 border-t border-blue-200/60">
              <button
                type="button"
                onClick={() => setShowWhyNotOthers(!showWhyNotOthers)}
                className="inline-flex items-center space-x-1 text-[10px] font-semibold text-blue-700 hover:text-blue-900 cursor-pointer"
              >
                <span>{showWhyNotOthers ? 'Hide' : 'View'} why other saws were not recommended ({Object.keys(machineRec.rejectedReasons).length})</span>
                {showWhyNotOthers ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>

              {showWhyNotOthers && (
                <div className="mt-2 space-y-1.5 pl-1 text-[10px] text-slate-600 bg-white/70 p-2 rounded border border-blue-100">
                  {Object.entries(machineRec.rejectedReasons).map(([mId, reason]) => {
                    const mObj = machines.find((mach) => mach.id === mId);
                    return (
                      <div key={mId} className="flex items-start space-x-1.5">
                        <span className="text-slate-400 shrink-0">•</span>
                        <span>
                          <strong>{mObj?.name || mId}:</strong> {reason}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Manual Selection Constraint Checks (Manual Mode) */}
      {!isMachineAuto && manualValidation && (
        <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1.5">
          <span className="font-semibold text-slate-800 block text-[11px]">Machine Constraint Validation</span>
          <div className="space-y-1">
            {manualValidation.checks.map((chk, idx) => (
              <div key={idx} className="flex items-start space-x-1.5 text-[11px]">
                {chk.passed ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 mt-0.5 shrink-0" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 mt-0.5 shrink-0" />
                )}
                <span className={chk.passed ? 'text-slate-700' : 'text-amber-800 font-medium'}>
                  {chk.message}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Diagnostic Failure if No Machine Qualifies */}
      {machineRec.hasNoEligible && (
        <div className="p-2.5 bg-red-50 border border-red-300 rounded-lg text-xs flex items-start space-x-2 text-red-800">
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold block">No Machine Satisfies Constraints</span>
            <p className="text-[11px] leading-relaxed mt-0.5">{machineRec.failureMessage}</p>
          </div>
        </div>
      )}
    </div>
  );

  // 3. Optimization Priority Objective Selector
  const renderObjectiveSelector = () => (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="block font-medium text-slate-700 text-xs">
          Optimization Priority Objective
        </label>
        <div className="flex items-center space-x-2">
          {isObjectiveAuto ? (
            <span className="inline-flex items-center space-x-1 text-[10px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full">
              <Sparkles className="w-3 h-3 text-indigo-600" />
              <span>Auto (Recommended)</span>
            </span>
          ) : (
            <div className="flex items-center space-x-1.5">
              <span className="text-[10px] font-semibold text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">
                Manual
              </span>
              <button
                type="button"
                onClick={handleRestoreAutoObjective}
                className="text-[10px] font-semibold text-blue-600 hover:text-blue-800 underline cursor-pointer"
              >
                Use recommended
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-xs">
        {[
          { id: 'maximize_yield', label: 'Maximize Yield' },
          { id: 'minimize_cost', label: 'Minimize Cost' },
          { id: 'minimize_time', label: 'Minimize Saw Time' },
          { id: 'balanced', label: 'Balanced' },
        ].map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => handleObjectiveChange(opt.id as OptimizationObjective)}
            className={`py-2 px-2 rounded-lg border text-center font-semibold text-xs transition cursor-pointer ${
              activeObjective === opt.id
                ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Why This Objective Line */}
      <div className="p-2 bg-slate-50 border border-slate-200 rounded-md text-[11px] text-slate-600 flex items-start space-x-1.5">
        <Info className="w-3.5 h-3.5 text-slate-500 mt-0.5 shrink-0" />
        <div>
          <span className="font-semibold text-slate-800 block text-[10px] uppercase tracking-wide">
            Why this objective
          </span>
          <p className="leading-snug">{objectiveRec.reason}</p>
          <span className="block mt-1 text-[10px] text-slate-400 italic">
            Note: Objective affects machine routing choice and heuristic ranking.
          </span>
        </div>
      </div>
    </div>
  );

  // 4. Skin Trim and Blade Kerf Inputs with 1/16" Snap Validation
  const renderTrimAndKerf = () => {
    const isTrim16th = isSixteenthInch(skinTrim);
    const isKerf16th = isSixteenthInch(kerf);

    return (
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block font-medium text-slate-700 text-xs mb-1">{t('skin_trim')}</label>
          <div className="relative">
            <input
              type="number"
              step="0.0625"
              min="0"
              value={skinTrim}
              onChange={(e) => {
                onChangeSkinTrim(parseFloat(e.target.value) || 0);
                onInputModified();
              }}
              className={`w-full px-2.5 py-1.5 rounded-lg border text-xs text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none ${
                !isTrim16th ? 'border-amber-400 bg-amber-50/40' : 'border-slate-300'
              }`}
            />
            <span className="absolute right-2 top-1.5 text-slate-400 text-xs">in</span>
          </div>
          {!isTrim16th && (
            <span className="text-[10px] text-amber-700 mt-0.5 block">
              Snaps to 1/16" (0.0625") precision.
            </span>
          )}
        </div>

        <div>
          <label className="block font-medium text-slate-700 text-xs mb-1">{t('kerf')}</label>
          <div className="relative">
            <input
              type="number"
              step="0.0625"
              min="0"
              value={kerf}
              onChange={(e) => {
                onChangeKerf(parseFloat(e.target.value) || 0);
                onInputModified();
              }}
              className={`w-full px-2.5 py-1.5 rounded-lg border text-xs text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none ${
                !isKerf16th ? 'border-amber-400 bg-amber-50/40' : 'border-slate-300'
              }`}
            />
            <span className="absolute right-2 top-1.5 text-slate-400 text-xs">in</span>
          </div>
          {!isKerf16th && (
            <span className="text-[10px] text-amber-700 mt-0.5 block">
              Snaps to 1/16" (0.0625") precision.
            </span>
          )}
        </div>
      </div>
    );
  };

  // 5. Available Blocks Section (Audited, Fixed, and Validated)
  const renderBlocksSection = () => (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <div>
          <label className="font-semibold text-slate-800 text-xs">{t('available_blocks')}</label>
          <span className="ml-2 text-[10px] text-slate-500">
            ({totalBlocksCount} total raw bun{totalBlocksCount === 1 ? '' : 's'})
          </span>
        </div>
        <button
          type="button"
          onClick={onAddBlock}
          className="inline-flex items-center space-x-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>{t('add_block')}</span>
        </button>
      </div>

      {/* Stock Sufficiency Metric Strip */}
      <div
        className={`p-2.5 rounded-lg border text-xs flex items-start space-x-2 ${
          stockSufficiency.isSufficient
            ? 'bg-slate-50 border-slate-200 text-slate-700'
            : 'bg-amber-50 border-amber-300 text-amber-900'
        }`}
      >
        {stockSufficiency.isSufficient ? (
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
        ) : (
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        )}
        <div className="text-[11px] leading-relaxed">
          <div className="flex items-center space-x-2">
            <span className="font-bold">
              Estimated minimum blocks needed: {stockSufficiency.estimatedMinBlocksNeeded}, available: {stockSufficiency.availableBlocksCount}
            </span>
            <span className="text-[10px] text-slate-400 italic">(estimate)</span>
          </div>
          {stockSufficiency.warningMessage && (
            <p className="mt-0.5 text-amber-800">{stockSufficiency.warningMessage}</p>
          )}
        </div>
      </div>

      {/* Duplicate Block Rows Merge Action */}
      {duplicateBlockPairs.length > 0 && (
        <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-lg text-xs space-y-1.5">
          <div className="flex items-center space-x-1.5 font-semibold text-blue-900 text-[11px]">
            <Merge className="w-3.5 h-3.5 text-blue-600" />
            <span>Duplicate Block Rows Detected</span>
          </div>
          {duplicateBlockPairs.map((pair, pIdx) => (
            <div key={pIdx} className="flex items-center justify-between text-[11px] text-blue-800">
              <span>
                Bun #{pair.firstIdx + 1} and Bun #{pair.secondIdx + 1} have identical specs ({pair.specs}).
              </span>
              <button
                type="button"
                onClick={() => handleMergeDuplicateBlocks(pair.firstIdx, pair.secondIdx)}
                className="inline-flex items-center space-x-1 px-2 py-0.5 bg-blue-600 hover:bg-blue-700 text-white rounded font-semibold text-[10px] transition cursor-pointer"
              >
                <span>Merge Quantities</span>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Individual Block Cards */}
      <div className="space-y-2">
        {blocks.map((block, idx) => {
          const usable = computeUsableDimensions(
            block.nominal_length,
            block.nominal_width,
            block.nominal_height,
            skinTrim
          );

          const isL16 = isSixteenthInch(block.nominal_length);
          const isW16 = isSixteenthInch(block.nominal_width);
          const isH16 = isSixteenthInch(block.nominal_height);
          const hasDimPrecisionError = !isL16 || !isW16 || !isH16;

          // Check if block usable height exceeds selected machine max_cut_height
          const exceedsMachineThroat =
            selectedMachine && usable.height > selectedMachine.max_cut_height;

          const blockGrade = block.grade || selectedGrade;

          return (
            <div
              key={block.id || idx}
              className={`p-3 rounded-lg text-xs space-y-2 border ${
                !usable.isValid || exceedsMachineThroat
                  ? 'bg-amber-50/50 border-amber-300'
                  : 'bg-slate-50 border-slate-200'
              }`}
            >
              {/* Row Header: Bun Index + Read-Only Grade Tag + Remove Button */}
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="font-mono font-bold text-slate-700 text-[11px]">
                    Bun #{idx + 1}
                  </span>
                  {/* Read-Only Grade Tag following Global Grade */}
                  <span className="inline-flex items-center space-x-1 text-[10px] font-bold px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-700 shadow-2xs">
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{
                        backgroundColor:
                          blockGrade === 'HR-40'
                            ? '#ef4444'
                            : blockGrade === 'HR-30'
                            ? '#3b82f6'
                            : '#8b5cf6',
                      }}
                    />
                    <span>{blockGrade}</span>
                  </span>
                </div>

                {blocks.length > 1 && (
                  <button
                    type="button"
                    onClick={() => onRemoveBlock(idx)}
                    className="text-slate-400 hover:text-red-500 transition cursor-pointer"
                    title="Remove Block"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Dimension Inputs (L, W, H, Qty) */}
              <div className="grid grid-cols-4 gap-1.5">
                <div>
                  <label className="block text-[9px] text-slate-500 font-medium">L (Length)</label>
                  <input
                    type="number"
                    step="0.0625"
                    min="1"
                    value={block.nominal_length}
                    onChange={(e) => {
                      onUpdateBlock(idx, { nominal_length: parseFloat(e.target.value) || 0 });
                      onInputModified();
                    }}
                    className={`w-full px-1.5 py-1 rounded border text-xs font-semibold ${
                      !isL16 ? 'border-amber-400 bg-amber-50/50' : 'border-slate-300 bg-white'
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-[9px] text-slate-500 font-medium">W (Width)</label>
                  <input
                    type="number"
                    step="0.0625"
                    min="1"
                    value={block.nominal_width}
                    onChange={(e) => {
                      onUpdateBlock(idx, { nominal_width: parseFloat(e.target.value) || 0 });
                      onInputModified();
                    }}
                    className={`w-full px-1.5 py-1 rounded border text-xs font-semibold ${
                      !isW16 ? 'border-amber-400 bg-amber-50/50' : 'border-slate-300 bg-white'
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-[9px] text-slate-500 font-medium">H (Height/Rise)</label>
                  <input
                    type="number"
                    step="0.0625"
                    min="1"
                    value={block.nominal_height}
                    onChange={(e) => {
                      onUpdateBlock(idx, { nominal_height: parseFloat(e.target.value) || 0 });
                      onInputModified();
                    }}
                    className={`w-full px-1.5 py-1 rounded border text-xs font-semibold ${
                      !isH16 || exceedsMachineThroat
                        ? 'border-amber-400 bg-amber-50/50'
                        : 'border-slate-300 bg-white'
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-[9px] text-slate-500 font-medium">Quantity</label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={block.quantity}
                    onChange={(e) => {
                      onUpdateBlock(idx, { quantity: Math.max(1, parseInt(e.target.value, 10) || 1) });
                      onInputModified();
                    }}
                    className="w-full px-1.5 py-1 rounded border border-slate-300 text-xs font-bold bg-white text-slate-900"
                  />
                </div>
              </div>

              {/* Live Usable Interior Display */}
              <div className="flex flex-wrap items-center justify-between text-[11px] pt-1 border-t border-slate-200/70 text-slate-600">
                <span>
                  <strong>Live Usable:</strong> {usable.length.toFixed(1)}" × {usable.width.toFixed(1)}" × {usable.height.toFixed(1)}"
                  <span className="text-[10px] text-slate-400 ml-1">
                    (nominal − 2×{skinTrim}" trim)
                  </span>
                </span>
                <span className="font-mono text-[10px] text-slate-500">
                  {((usable.length * usable.width * usable.height) / 1728).toFixed(1)} cu ft
                </span>
              </div>

              {/* Warning: Usable Interior Invalidation */}
              {!usable.isValid && (
                <div className="flex items-center space-x-1.5 text-[10px] text-red-700 bg-red-50 p-1.5 rounded border border-red-200">
                  <AlertTriangle className="w-3 h-3 shrink-0" />
                  <span>{usable.error}</span>
                </div>
              )}

              {/* Warning: Machine Throat Height Limit Exceeded */}
              {exceedsMachineThroat && (
                <div className="flex items-start space-x-1.5 text-[10px] text-amber-800 bg-amber-100/70 p-1.5 rounded border border-amber-300">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-700" />
                  <span>
                    Block usable height ({usable.height.toFixed(1)}") exceeds <strong>{selectedMachine.name}</strong> throat limit ({selectedMachine.max_cut_height}"). Change machine or reduce block height.
                  </span>
                </div>
              )}

              {/* Warning: 1/16" Precision Error */}
              {hasDimPrecisionError && (
                <div className="text-[10px] text-amber-700">
                  * All dimensions must snap to 1/16" (0.0625") increments.
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  // 6. Parts Demand Section
  const renderPartsSection = () => {
    const maxUsableX = Math.max(0, ...blocks.map((b) => b.nominal_length - 2 * skinTrim));
    const maxUsableY = Math.max(0, ...blocks.map((b) => b.nominal_width - 2 * skinTrim));
    const maxUsableZ = Math.max(0, ...blocks.map((b) => b.nominal_height - 2 * skinTrim));

    return (
      <div>
        <div className="flex items-center justify-between mb-2">
          <div>
            <label className="font-semibold text-slate-800 text-xs">{t('parts_demand')}</label>
            <span className="ml-2 text-[10px] text-slate-400">
              ({totalPartsCount} pcs across {parts.length} SKUs)
            </span>
          </div>
          <button
            type="button"
            onClick={onAddPart}
            className="inline-flex items-center space-x-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t('add_part')}</span>
          </button>
        </div>

        <div className="space-y-2">
          {parts.map((part, idx) => {
            const hasDimError =
              part.length > maxUsableX || part.width > maxUsableY || part.height > maxUsableZ;

            return (
              <div
                key={part.id || idx}
                className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: part.color_hex || '#3b82f6' }}
                    />
                    <input
                      type="text"
                      value={part.sku}
                      onChange={(e) => {
                        onUpdatePart(idx, { sku: e.target.value });
                        onInputModified();
                      }}
                      className="font-mono font-bold text-slate-800 text-xs bg-transparent border-b border-transparent hover:border-slate-300 focus:border-blue-500 focus:outline-none w-24"
                    />
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="text"
                      value={part.name}
                      onChange={(e) => {
                        onUpdatePart(idx, { name: e.target.value });
                        onInputModified();
                      }}
                      className="text-slate-500 text-xs bg-transparent border-b border-transparent hover:border-slate-300 focus:border-blue-500 focus:outline-none text-right w-32"
                    />
                    {parts.length > 1 && (
                      <button
                        type="button"
                        onClick={() => onRemovePart(idx)}
                        className="text-slate-400 hover:text-red-500 transition cursor-pointer"
                        title="Remove Part"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-5 gap-1.5">
                  <div>
                    <label className="block text-[9px] text-slate-400">L</label>
                    <input
                      type="number"
                      step="0.0625"
                      min="0.5"
                      value={part.length}
                      onChange={(e) => {
                        onUpdatePart(idx, { length: parseFloat(e.target.value) || 0 });
                        onInputModified();
                      }}
                      className="w-full px-1 py-0.5 rounded border border-slate-300 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] text-slate-400">W</label>
                    <input
                      type="number"
                      step="0.0625"
                      min="0.5"
                      value={part.width}
                      onChange={(e) => {
                        onUpdatePart(idx, { width: parseFloat(e.target.value) || 0 });
                        onInputModified();
                      }}
                      className="w-full px-1 py-0.5 rounded border border-slate-300 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] text-slate-400">H</label>
                    <input
                      type="number"
                      step="0.0625"
                      min="0.5"
                      value={part.height}
                      onChange={(e) => {
                        onUpdatePart(idx, { height: parseFloat(e.target.value) || 0 });
                        onInputModified();
                      }}
                      className="w-full px-1 py-0.5 rounded border border-slate-300 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] text-slate-400">Qty</label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={part.quantity}
                      onChange={(e) => {
                        onUpdatePart(idx, { quantity: Math.max(1, parseInt(e.target.value, 10) || 1) });
                        onInputModified();
                      }}
                      className="w-full px-1 py-0.5 rounded border border-slate-300 text-xs font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] text-slate-400">Mode</label>
                    <select
                      value={part.orientation_mode}
                      onChange={(e) => {
                        onUpdatePart(idx, {
                          orientation_mode: e.target.value as OrientationMode,
                        });
                        onInputModified();
                      }}
                      className="w-full px-0.5 py-0.5 rounded border border-slate-300 text-[10px]"
                    >
                      <option value="rise-locked">Locked</option>
                      <option value="free-in-plane">In-Plane</option>
                      <option value="any">Any (6-Way)</option>
                    </select>
                  </div>
                </div>

                {hasDimError && (
                  <div className="mt-1 flex items-center space-x-1 text-[10px] text-amber-700">
                    <AlertTriangle className="w-3 h-3 shrink-0" />
                    <span>Part dimensions exceed usable block bounding box!</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Step 1: Centered 2-Column Card Mode (Screen 1)
  if (mode === 'card') {
    return (
      <div className="max-w-6xl mx-auto w-full p-4 lg:p-6 space-y-6">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          {/* Card Header */}
          <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-sm shadow-xs">
                1
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">{t('step1_title')}</h2>
                <p className="text-xs text-slate-500">
                  Configure raw foam supply blocks, cutting machine constraints, and required part orders.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onLoadSample}
              className="inline-flex items-center space-x-2 px-3.5 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 transition shadow-2xs cursor-pointer"
              title="Fills inputs with sample job #4821"
            >
              <Sparkles className="w-4 h-4 text-blue-600" />
              <span>{t('load_sample')}</span>
            </button>
          </div>

          {/* Validation Error Banner */}
          {validationError && (
            <div className="mx-6 mt-4 p-3.5 bg-rose-50 border border-rose-300 rounded-lg flex items-start space-x-2.5 text-xs text-rose-800 shadow-2xs">
              <AlertTriangle className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
              <div className="flex-1">
                <span className="font-bold">Input Validation Issue: </span>
                <span className="font-medium">{validationError}</span>
              </div>
            </div>
          )}

          {/* 2-Column Responsive Body */}
          <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
            {/* Left Column: Customer Ref, Grade, Machine Profile, Priority Objective, Trim/Kerf, Blocks */}
            <div className="p-6 space-y-5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Supply Foam Buns & Machine Routing
              </h3>
              {renderCustomerRef()}
              {renderGradeSelector()}
              {renderMachineSelector()}
              {renderObjectiveSelector()}
              {renderTrimAndKerf()}
              {renderBlocksSection()}
            </div>

            {/* Right Column: Required Parts Order List */}
            <div className="p-6 space-y-5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Required Parts Order (Demand)
              </h3>
              {renderPartsSection()}
            </div>
          </div>

          {/* Card Footer Bar */}
          <div className="px-6 py-4 bg-slate-50/90 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center space-x-4 text-xs text-slate-600 font-medium">
              <span className="flex items-center space-x-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>
                  <strong>{totalBlocksCount}</strong> bun(s) configured
                </span>
              </span>
              <span>•</span>
              <span>
                <strong>{totalPartsCount}</strong> total parts ({parts.length} SKUs)
              </span>
            </div>

            {onContinueToOptimization && (
              <button
                type="button"
                onClick={onContinueToOptimization}
                className="inline-flex items-center space-x-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-lg shadow-sm transition cursor-pointer"
              >
                <span>Continue to Algorithm Selection & Placement</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Default Sidebar Mode
  return (
    <aside className="w-full lg:w-[420px] bg-white border-r border-slate-200 flex flex-col h-full overflow-y-auto">
      <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white font-bold text-xs">
            1
          </span>
          <h2 className="font-semibold text-slate-800 text-sm">{t('step1_title')}</h2>
        </div>
        <button
          type="button"
          onClick={onLoadSample}
          className="inline-flex items-center space-x-1.5 px-2.5 py-1 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md border border-blue-200 transition"
          title="Fills inputs with sample job #4821"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>{t('load_sample')}</span>
        </button>
      </div>

      <div className="p-4 space-y-5 text-xs text-slate-700">
        {renderCustomerRef()}
        {renderGradeSelector()}
        {renderMachineSelector()}
        {renderObjectiveSelector()}
        {renderTrimAndKerf()}
        {renderBlocksSection()}
        {renderPartsSection()}
      </div>
    </aside>
  );
};
