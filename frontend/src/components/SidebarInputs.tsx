import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Plus,
  Trash2,
  AlertTriangle,
  Sparkles,
  } from 'lucide-react';
import type { FoamGrade, MachineProfile, PartItem, BlockInput, OrientationMode } from '../types';

interface SidebarInputsProps {
  grades: FoamGrade[];
  selectedGrade: string;
  onSelectGrade: (grade: string) => void;
  allowMixedGrades: boolean;
  onToggleMixedGrades: (allowed: boolean) => void;
  machines: MachineProfile[];
  selectedMachineId: string;
  onSelectMachine: (machineId: string) => void;
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
}

export const SidebarInputs: React.FC<SidebarInputsProps> = ({
  grades,
  selectedGrade,
  onSelectGrade,
  allowMixedGrades,
  onToggleMixedGrades,
  machines,
  selectedMachineId,
  onSelectMachine,
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
}) => {
  const { t } = useTranslation();

  // Helper to validate 1/16" precision
  const isSnappedTo16th = (v: number) => {
    return Math.abs(Math.round(v * 16) / 16 - v) < 1e-4;
  };

  // Max usable dimensions across configured blocks
  const maxUsableX = Math.max(0, ...blocks.map(b => b.nominal_length - 2 * skinTrim));
  const maxUsableY = Math.max(0, ...blocks.map(b => b.nominal_width - 2 * skinTrim));
  const maxUsableZ = Math.max(0, ...blocks.map(b => b.nominal_height - 2 * skinTrim));

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
          title="Fills inputs with proposal sample job #4821"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>{t('load_sample')}</span>
        </button>
      </div>

      <div className="p-4 space-y-5 text-xs text-slate-700">
        {/* Foam Grade Selector */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block font-medium text-slate-700">{t('grade')}</label>
            <span className="text-[10px] text-slate-400">
              {grades.find(g => g.code === selectedGrade)?.name || selectedGrade}
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
                  className={`py-1.5 px-3 rounded-lg border font-medium text-xs text-center transition flex items-center justify-center space-x-1.5 ${
                    isSelected
                      ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
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
          <div className="flex items-center justify-between pt-1.5">
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

        {/* Machine Profile Dropdown */}
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
            className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-800 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
          >
            {machines.map((m) => {
              const badge =
                m.id === 'saw-g1'
                  ? '[Guillotine CNC]'
                  : m.id === 'saw-g2'
                  ? '[Guillotine Rotating]'
                  : '[Waterjet CNC]';
              return (
                <option key={m.id} value={m.id}>
                  {m.name} {badge} (Kerf: {m.kerf}", Max H: {m.max_cut_height}")
                </option>
              );
            })}
          </select>

          {/* Machine Clearance Warning Check */}
          {(() => {
            const currentMach = machines.find((m) => m.id === selectedMachineId);
            if (!currentMach) return null;
            const exceededBlock = blocks.find((b) => (b.nominal_height - 2 * skinTrim) > currentMach.max_cut_height);
            if (!exceededBlock) return null;
            const usableH = exceededBlock.nominal_height - 2 * skinTrim;
            return (
              <div className="mt-2 p-2.5 bg-rose-50 border border-rose-200 rounded-lg flex items-start space-x-2 text-rose-700 text-[11px]">
                <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <div className="font-semibold">Clearance Limit Exceeded:</div>
                  <div>
                    Block usable height ({usableH}") exceeds machine '{currentMach.name}' throat height ({currentMach.max_cut_height}").
                    Waterjet cutting requires stock bun height &le; {currentMach.max_cut_height}".
                  </div>
                </div>
              </div>
            );
          })()}
        </div>

        {/* Skin Trim & Kerf Controls */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block font-medium text-slate-700 mb-1">{t('skin_trim')}</label>
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
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
              <span className="absolute right-2.5 top-1.5 text-slate-400 text-xs pointer-events-none">in</span>
            </div>
          </div>
          <div>
            <label className="block font-medium text-slate-700 mb-1">{t('kerf')}</label>
            <div className="relative">
              <input
                type="number"
                step="0.0625"
                min="0.0625"
                value={kerf}
                onChange={(e) => {
                  onChangeKerf(parseFloat(e.target.value) || 0.125);
                  onInputModified();
                }}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
              <span className="absolute right-2.5 top-1.5 text-slate-400 text-xs pointer-events-none">in</span>
            </div>
          </div>
        </div>

        {/* Available Blocks */}
        <div className="pt-2 border-t border-slate-200">
          <div className="flex items-center justify-between mb-2">
            <span className="font-semibold text-slate-800 text-xs uppercase tracking-wider">
              {t('available_blocks')} ({blocks.length})
            </span>
            <button
              type="button"
              onClick={() => {
                onAddBlock();
                onInputModified();
              }}
              className="text-blue-600 hover:text-blue-800 font-medium text-xs flex items-center space-x-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t('add_block')}</span>
            </button>
          </div>

          <div className="space-y-2">
            {blocks.map((blk, idx) => {
              const ux = Math.max(0, blk.nominal_length - 2 * skinTrim);
              const uy = Math.max(0, blk.nominal_width - 2 * skinTrim);
              const uz = Math.max(0, blk.nominal_height - 2 * skinTrim);

              return (
                <div key={idx} className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-1.5">
                      <span className="font-bold text-slate-800">
                        Block #{idx + 1}
                      </span>
                      {allowMixedGrades ? (
                        <select
                          value={blk.grade}
                          onChange={(e) => {
                            onUpdateBlock(idx, { grade: e.target.value });
                            onInputModified();
                          }}
                          className="text-[10px] font-bold px-1.5 py-0.5 rounded border border-slate-300 bg-white text-blue-700"
                        >
                          {['HR-40', 'HR-30', 'VE-50'].map((g) => (
                            <option key={g} value={g}>{g}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                          {blk.grade}
                        </span>
                      )}
                    </div>
                    {blocks.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          onRemoveBlock(idx);
                          onInputModified();
                        }}
                        className="text-slate-400 hover:text-red-600 p-0.5"
                        title="Remove block"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    <div>
                      <span className="text-[10px] text-slate-500">L (in)</span>
                      <input
                        type="number"
                        step="0.0625"
                        value={blk.nominal_length}
                        onChange={(e) => {
                          onUpdateBlock(idx, { nominal_length: parseFloat(e.target.value) || 0 });
                          onInputModified();
                        }}
                        className="w-full px-1.5 py-1 bg-white border border-slate-300 rounded text-xs text-slate-800"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500">W (in)</span>
                      <input
                        type="number"
                        step="0.0625"
                        value={blk.nominal_width}
                        onChange={(e) => {
                          onUpdateBlock(idx, { nominal_width: parseFloat(e.target.value) || 0 });
                          onInputModified();
                        }}
                        className="w-full px-1.5 py-1 bg-white border border-slate-300 rounded text-xs text-slate-800"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500">H (in)</span>
                      <input
                        type="number"
                        step="0.0625"
                        value={blk.nominal_height}
                        onChange={(e) => {
                          onUpdateBlock(idx, { nominal_height: parseFloat(e.target.value) || 0 });
                          onInputModified();
                        }}
                        className="w-full px-1.5 py-1 bg-white border border-slate-300 rounded text-xs text-slate-800"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500">Qty</span>
                      <input
                        type="number"
                        min="1"
                        value={blk.quantity}
                        onChange={(e) => {
                          onUpdateBlock(idx, { quantity: parseInt(e.target.value, 10) || 1 });
                          onInputModified();
                        }}
                        className="w-full px-1.5 py-1 bg-white border border-slate-300 rounded text-xs text-slate-800"
                      />
                    </div>
                  </div>
                  <div className="text-[10px] text-slate-500">
                    Usable interior: {ux}" × {uy}" × {uz}"
                  </div>
                </div>
              );
            })}
          </div>

          {/* Advanced Mixed Grades Toggle */}
          <div className="flex items-center justify-between pt-1.5">
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

        {/* Parts Table */}
        <div className="pt-2 border-t border-slate-200">
          <div className="flex items-center justify-between mb-2">
            <span className="font-semibold text-slate-800 text-xs uppercase tracking-wider">
              {t('parts_demand')} ({parts.reduce((acc, p) => acc + p.quantity, 0)} {t('pieces')})
            </span>
            <button
              type="button"
              onClick={() => {
                onAddPart();
                onInputModified();
              }}
              className="text-blue-600 hover:text-blue-800 font-medium text-xs flex items-center space-x-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t('add_part')}</span>
            </button>
          </div>

          <div className="space-y-3">
            {parts.map((p, idx) => {
              const snapWarning =
                !isSnappedTo16th(p.length) || !isSnappedTo16th(p.width) || !isSnappedTo16th(p.height);
              const exceedsUsable =
                (p.length > maxUsableX || p.width > maxUsableY || p.height > maxUsableZ) &&
                (p.length > maxUsableY || p.width > maxUsableX || p.height > maxUsableZ) &&
                (p.orientation_mode === 'any' ? false : true);

              return (
                <div
                  key={p.id || idx}
                  className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg space-y-2 hover:border-slate-300 transition"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <input
                        type="color"
                        value={p.color_hex || '#3b82f6'}
                        onChange={(e) => {
                          onUpdatePart(idx, { color_hex: e.target.value });
                          onInputModified();
                        }}
                        className="w-4 h-4 rounded border-0 cursor-pointer p-0 bg-transparent"
                        title="Part SKU color"
                      />
                      <input
                        type="text"
                        value={p.sku}
                        placeholder="Part SKU"
                        onChange={(e) => {
                          onUpdatePart(idx, { sku: e.target.value, name: e.target.value });
                          onInputModified();
                        }}
                        className="font-bold text-slate-800 text-xs bg-transparent border-b border-dashed border-slate-300 focus:border-blue-500 focus:outline-none w-28"
                      />
                    </div>
                    <div className="flex items-center space-x-2">
                      {allowMixedGrades ? (
                        <select
                          value={p.grade}
                          onChange={(e) => {
                            onUpdatePart(idx, { grade: e.target.value });
                            onInputModified();
                          }}
                          className="text-[10px] font-bold px-1.5 py-0.5 rounded border border-slate-300 bg-white text-blue-700"
                          title="Part Grade"
                        >
                          {['HR-40', 'HR-30', 'VE-50'].map((g) => (
                            <option key={g} value={g}>{g}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                          {p.grade}
                        </span>
                      )}
                      <select
                        value={p.orientation_mode}
                        onChange={(e) => {
                          onUpdatePart(idx, { orientation_mode: e.target.value as OrientationMode });
                          onInputModified();
                        }}
                        className="text-[10px] px-1.5 py-0.5 rounded border border-slate-300 bg-white text-slate-700"
                        title="Orientation Rule"
                      >
                        <option value="rise-locked">2x (rise-locked)</option>
                        <option value="free-in-plane">free (XY plane)</option>
                        <option value="any">any (3D free)</option>
                      </select>
                      {parts.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            onRemovePart(idx);
                            onInputModified();
                          }}
                          className="text-slate-400 hover:text-red-600 p-0.5"
                          title="Remove part"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Dimensions & Quantity */}
                  <div className="grid grid-cols-4 gap-1.5">
                    <div>
                      <span className="text-[10px] text-slate-500">L (in)</span>
                      <input
                        type="number"
                        step="0.0625"
                        min="0.0625"
                        value={p.length}
                        onChange={(e) => {
                          onUpdatePart(idx, { length: parseFloat(e.target.value) || 0 });
                          onInputModified();
                        }}
                        className="w-full px-1.5 py-1 bg-white border border-slate-300 rounded text-xs text-slate-800"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500">W (in)</span>
                      <input
                        type="number"
                        step="0.0625"
                        min="0.0625"
                        value={p.width}
                        onChange={(e) => {
                          onUpdatePart(idx, { width: parseFloat(e.target.value) || 0 });
                          onInputModified();
                        }}
                        className="w-full px-1.5 py-1 bg-white border border-slate-300 rounded text-xs text-slate-800"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500">H (in)</span>
                      <input
                        type="number"
                        step="0.0625"
                        min="0.0625"
                        value={p.height}
                        onChange={(e) => {
                          onUpdatePart(idx, { height: parseFloat(e.target.value) || 0 });
                          onInputModified();
                        }}
                        className="w-full px-1.5 py-1 bg-white border border-slate-300 rounded text-xs text-slate-800"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500">Qty</span>
                      <input
                        type="number"
                        min="1"
                        value={p.quantity}
                        onChange={(e) => {
                          onUpdatePart(idx, { quantity: parseInt(e.target.value, 10) || 1 });
                          onInputModified();
                        }}
                        className="w-full px-1.5 py-1 bg-white border border-slate-300 rounded text-xs text-slate-800 font-semibold text-blue-600"
                      />
                    </div>
                  </div>

                  {/* Inline Warnings */}
                  {snapWarning && (
                    <div className="flex items-center space-x-1 text-[10px] text-amber-600">
                      <AlertTriangle className="w-3 h-3" />
                      <span>Dimensions snap to 1/16" (0.0625") precision.</span>
                    </div>
                  )}
                  {exceedsUsable && (
                    <div className="flex items-center space-x-1 text-[10px] text-red-600">
                      <AlertTriangle className="w-3 h-3" />
                      <span>Part exceeds usable block dimensions!</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Advanced Mixed Grades Toggle */}
          <div className="flex items-center justify-between pt-1.5">
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
      </div>
    </aside>
  );
};
