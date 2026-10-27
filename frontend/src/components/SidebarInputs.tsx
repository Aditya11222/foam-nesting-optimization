import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Plus,
  Trash2,
  AlertTriangle,
  Sparkles,
  ArrowRight,
  CheckCircle2,
} from 'lucide-react';
import type { FoamGrade, MachineProfile, PartItem, BlockInput, OrientationMode } from '../types';

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
  machineObjective?: 'lowest_cost' | 'best_yield' | 'lowest_time';
  onSelectMachineObjective?: (obj: 'lowest_cost' | 'best_yield' | 'lowest_time') => void;
  skinTrim: number;
  onChangeSkinTrim: (trim: number) => void;
  kerf: number;
  onChangeKerf: (kerf: number) => void;
  blocks: BlockInput[];
  onAddBlock: () => void;
  onRemoveBlock: (index: number) => void;
  onUpdateBlock: (index: number, updated: Partial<BlockInput>) => void;
  parts: PartItem[];
  onAddPart: () => void;
  onRemovePart: (index: number) => void;
  onUpdatePart: (index: number, updated: Partial<PartItem>) => void;
  onLoadSample: () => void;
  onInputModified: () => void;
  mode?: 'sidebar' | 'card';
  onContinueToOptimization?: () => void;
}

export const SidebarInputs: React.FC<SidebarInputsProps> = ({
  customerRef = '',
  onChangeCustomerRef,
  grades,
  selectedGrade,
  onSelectGrade,
  allowMixedGrades,
  onToggleMixedGrades,
  machines,
  selectedMachineId,
  onSelectMachine,
  machineObjective = 'lowest_cost',
  onSelectMachineObjective,
  skinTrim,
  onChangeSkinTrim,
  kerf,
  onChangeKerf,
  blocks,
  onAddBlock,
  onRemoveBlock,
  onUpdateBlock,
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

  // Max usable dimensions across configured blocks
  const maxUsableX = Math.max(0, ...blocks.map((b) => b.nominal_length - 2 * skinTrim));
  const maxUsableY = Math.max(0, ...blocks.map((b) => b.nominal_width - 2 * skinTrim));
  const maxUsableZ = Math.max(0, ...blocks.map((b) => b.nominal_height - 2 * skinTrim));

  const totalPartsCount = parts.reduce((acc, p) => acc + p.quantity, 0);
  const totalBlocksCount = blocks.reduce((acc, b) => acc + b.quantity, 0);

  // Optional Customer / Order Reference input
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

  // Reusable Form Subcomponents:
  const renderGradeSelector = () => (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="block font-medium text-slate-700">{t('grade')}</label>
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

      {/* Advanced Mixed Grades Toggle */}
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

  const renderMachineSelector = () => {
    const selectedMachine = machines.find((mach) => mach.id === selectedMachineId);
    return (
      <div>
        <label className="block font-medium text-slate-700 mb-1.5">{t('machine')}</label>
        <select
          value={selectedMachineId}
          onChange={(e) => {
            const mId = e.target.value;
            onSelectMachine(mId);
            const m = machines.find((mach) => mach.id === mId);
            if (m) {
              onChangeKerf(m.kerf);
            }
            onInputModified();
          }}
          className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-800 text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
        >
          {machines.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} ({m.cut_type === 'free' ? 'Free / Wire' : 'Guillotine'})
            </option>
          ))}
        </select>

        {selectedMachine && (
          <div className="mt-2 p-2 bg-slate-50 border border-slate-200 rounded-md text-[11px] text-slate-600 space-y-1">
            <div className="flex justify-between">
              <span>{t('machine_cut_type')}:</span>
              <span className="font-semibold text-slate-800 uppercase text-[10px] bg-slate-200 px-1.5 rounded">
                {selectedMachine.cut_type}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Default Kerf:</span>
              <span className="font-semibold text-slate-800">{selectedMachine.kerf}"</span>
            </div>
            <div className="flex justify-between">
              <span>Automation:</span>
              <span className="font-semibold text-slate-800 capitalize">{selectedMachine.automation}</span>
            </div>
            {selectedMachine.feed_rate_ipm && (
              <div className="flex justify-between">
                <span>Feed Rate:</span>
                <span className="font-semibold text-slate-800">
                  {selectedMachine.feed_rate_ipm} IPM
                </span>
              </div>
            )}
          </div>
        )}

        {/* Machine Objective Selection */}
        {onSelectMachineObjective && (
          <div className="mt-2.5">
            <label className="block font-medium text-slate-700 text-[11px] mb-1">
              Optimization Priority Objective
            </label>
            <div className="grid grid-cols-3 gap-1 text-[10px]">
              {[
                { id: 'lowest_cost', label: 'Lowest Cost' },
                { id: 'best_yield', label: 'Best Yield' },
                { id: 'lowest_time', label: 'Fastest Cut' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    onSelectMachineObjective(opt.id as any);
                    onInputModified();
                  }}
                  className={`py-1 px-1.5 rounded border text-center font-medium transition cursor-pointer ${
                    machineObjective === opt.id
                      ? 'bg-blue-50 border-blue-500 text-blue-700 font-bold'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderTrimAndKerf = () => (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className="block font-medium text-slate-700 mb-1">{t('skin_trim')}</label>
        <div className="relative">
          <input
            type="number"
            step="0.125"
            min="0"
            value={skinTrim}
            onChange={(e) => {
              onChangeSkinTrim(parseFloat(e.target.value) || 0);
              onInputModified();
            }}
            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
          <span className="absolute right-2 top-1.5 text-slate-400 text-xs">in</span>
        </div>
      </div>
      <div>
        <label className="block font-medium text-slate-700 mb-1">{t('kerf')}</label>
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
            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
          <span className="absolute right-2 top-1.5 text-slate-400 text-xs">in</span>
        </div>
      </div>
    </div>
  );

  const renderBlocksSection = () => (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="font-semibold text-slate-800 text-xs">{t('available_blocks')}</label>
        <button
          type="button"
          onClick={onAddBlock}
          className="inline-flex items-center space-x-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>{t('add_block')}</span>
        </button>
      </div>

      <div className="space-y-2">
        {blocks.map((block, idx) => (
          <div
            key={block.id || idx}
            className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-2"
          >
            <div className="flex items-center justify-between">
              <span className="font-mono font-medium text-slate-600 text-[11px]">
                Bun #{idx + 1}
              </span>
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

            <div className="grid grid-cols-4 gap-1.5">
              <div>
                <label className="block text-[9px] text-slate-400">L</label>
                <input
                  type="number"
                  step="0.5"
                  value={block.nominal_length}
                  onChange={(e) => {
                    onUpdateBlock(idx, { nominal_length: parseFloat(e.target.value) || 0 });
                    onInputModified();
                  }}
                  className="w-full px-1.5 py-1 rounded border border-slate-300 text-xs"
                />
              </div>
              <div>
                <label className="block text-[9px] text-slate-400">W</label>
                <input
                  type="number"
                  step="0.5"
                  value={block.nominal_width}
                  onChange={(e) => {
                    onUpdateBlock(idx, { nominal_width: parseFloat(e.target.value) || 0 });
                    onInputModified();
                  }}
                  className="w-full px-1.5 py-1 rounded border border-slate-300 text-xs"
                />
              </div>
              <div>
                <label className="block text-[9px] text-slate-400">H</label>
                <input
                  type="number"
                  step="0.5"
                  value={block.nominal_height}
                  onChange={(e) => {
                    onUpdateBlock(idx, { nominal_height: parseFloat(e.target.value) || 0 });
                    onInputModified();
                  }}
                  className="w-full px-1.5 py-1 rounded border border-slate-300 text-xs"
                />
              </div>
              <div>
                <label className="block text-[9px] text-slate-400">Qty</label>
                <input
                  type="number"
                  min="1"
                  value={block.quantity}
                  onChange={(e) => {
                    onUpdateBlock(idx, { quantity: parseInt(e.target.value) || 1 });
                    onInputModified();
                  }}
                  className="w-full px-1.5 py-1 rounded border border-slate-300 text-xs font-semibold"
                />
              </div>
            </div>

            <div className="mt-1.5 text-[10px] text-slate-400">
              Usable: {(block.nominal_length - 2 * skinTrim).toFixed(1)} ×{' '}
              {(block.nominal_width - 2 * skinTrim).toFixed(1)} ×{' '}
              {(block.nominal_height - 2 * skinTrim).toFixed(1)} in
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderPartsSection = () => (
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
          const exceedsX = part.length > maxUsableX;
          const exceedsY = part.width > maxUsableY;
          const exceedsZ = part.height > maxUsableZ;
          const hasDimError = exceedsX || exceedsY || exceedsZ;

          return (
            <div
              key={part.id || idx}
              className={`p-3 bg-slate-50 border rounded-lg text-xs space-y-2 ${
                hasDimError ? 'border-amber-400 bg-amber-50/30' : 'border-slate-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 flex-1 min-w-0">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: part.color_hex }}
                  />
                  <input
                    type="text"
                    value={part.name}
                    onChange={(e) => {
                      onUpdatePart(idx, { name: e.target.value, sku: e.target.value });
                      onInputModified();
                    }}
                    className="font-medium text-slate-800 text-xs bg-transparent border-b border-transparent hover:border-slate-300 focus:border-blue-500 focus:outline-none w-full"
                    placeholder="Part Name"
                  />
                </div>
                {parts.length > 1 && (
                  <button
                    type="button"
                    onClick={() => onRemovePart(idx)}
                    className="text-slate-400 hover:text-red-500 transition ml-2 cursor-pointer"
                    title="Remove Part"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-5 gap-1.5">
                <div>
                  <label className="block text-[9px] text-slate-400">L</label>
                  <input
                    type="number"
                    step="0.0625"
                    value={part.length}
                    onChange={(e) => {
                      onUpdatePart(idx, { length: parseFloat(e.target.value) || 0 });
                      onInputModified();
                    }}
                    className={`w-full px-1 py-0.5 rounded border text-xs ${
                      exceedsX ? 'border-amber-500 bg-amber-50' : 'border-slate-300'
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-[9px] text-slate-400">W</label>
                  <input
                    type="number"
                    step="0.0625"
                    value={part.width}
                    onChange={(e) => {
                      onUpdatePart(idx, { width: parseFloat(e.target.value) || 0 });
                      onInputModified();
                    }}
                    className={`w-full px-1 py-0.5 rounded border text-xs ${
                      exceedsY ? 'border-amber-500 bg-amber-50' : 'border-slate-300'
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-[9px] text-slate-400">H</label>
                  <input
                    type="number"
                    step="0.0625"
                    value={part.height}
                    onChange={(e) => {
                      onUpdatePart(idx, { height: parseFloat(e.target.value) || 0 });
                      onInputModified();
                    }}
                    className={`w-full px-1 py-0.5 rounded border text-xs ${
                      exceedsZ ? 'border-amber-500 bg-amber-50' : 'border-slate-300'
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-[9px] text-slate-400">Qty</label>
                  <input
                    type="number"
                    min="1"
                    value={part.quantity}
                    onChange={(e) => {
                      onUpdatePart(idx, { quantity: parseInt(e.target.value) || 1 });
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

  // If rendering in Card Mode (centered 2-column container for Step 1)
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

          {/* 2-Column Responsive Body */}
          <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
            {/* Left Column: Customer Ref, Grade, Machine, Trim/Kerf, Blocks */}
            <div className="p-6 space-y-5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Supply Foam Buns & Machine Routing
              </h3>
              {renderCustomerRef()}
              {renderGradeSelector()}
              {renderMachineSelector()}
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
      {/* Step 1 Header */}
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
        {renderTrimAndKerf()}
        {renderBlocksSection()}
        {renderPartsSection()}
      </div>
    </aside>
  );
};
