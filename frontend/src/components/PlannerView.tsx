import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Printer,
  Send,
  Plus,
  Scissors,
  Zap
} from 'lucide-react';
import type { OptimizationResult, PartItem, BlockLayout, FoamGrade, MachineProfile } from '../types';
import { ThreeBlockView } from './ThreeBlockView';
import { PrintableCutSheet } from './PrintableCutSheet';

interface PlannerViewProps {
  result: OptimizationResult;
  selectedBlockIndex: number;
  onSelectBlock: (index: number) => void;
  onRunOptimization: () => void;
  isOptimizing: boolean;
  onSendToSaw: () => void;
  grades: FoamGrade[];
  selectedGrade: string;
  onSelectGrade: (code: string) => void;
  onAddPart: (part: PartItem) => void;
  machines?: MachineProfile[];
  selectedMachineId?: string;
  onSelectMachine?: (id: string) => void;
}

export const PlannerView: React.FC<PlannerViewProps> = ({
  result,
  selectedBlockIndex,
  onSelectBlock,
  onRunOptimization,
  isOptimizing,
  onSendToSaw,
  grades,
  selectedGrade,
  onSelectGrade,
  onAddPart,
  machines = [],
  selectedMachineId,
  onSelectMachine,
}) => {
  const { t } = useTranslation();
  const [showAddModal, setShowAddModal] = useState(false);
  const [newPart, setNewPart] = useState<Partial<PartItem>>({
    sku: '',
    name: '',
    length: 24,
    width: 24,
    height: 6,
    quantity: 10,
    orientation_mode: 'rise-locked',
    color_hex: '#ec4899',
  });

  const activeBlock: BlockLayout | undefined = result.blocks[selectedBlockIndex] || result.blocks[0];

  const handleCreatePart = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPart.sku || !newPart.length || !newPart.width || !newPart.height) return;
    onAddPart({
      id: `part-${Date.now()}`,
      sku: newPart.sku,
      name: newPart.name || newPart.sku,
      grade: selectedGrade,
      length: Number(newPart.length),
      width: Number(newPart.width),
      height: Number(newPart.height),
      quantity: Number(newPart.quantity || 1),
      orientation_mode: newPart.orientation_mode || 'rise-locked',
      color_hex: newPart.color_hex || '#ec4899',
    });
    setShowAddModal(false);
  };

  // Orientation badge renderer
  const renderOrientationBadge = (mode: string) => {
    switch (mode) {
      case 'rise-locked':
        return (
          <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded text-[11px] font-mono bg-sky-950/80 text-sky-400 border border-sky-800/60" title="Rise-locked: height locked to Z, 2 XY rotations">
            <span>2↑</span>
          </span>
        );
      case 'free-in-plane':
        return (
          <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded text-[11px] font-mono bg-cyan-950/80 text-cyan-400 border border-cyan-800/60" title="Free in XY plane">
            <span>free</span>
          </span>
        );
      case 'any':
        return (
          <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded text-[11px] font-mono bg-emerald-950/80 text-emerald-400 border border-emerald-800/60" title="Any 3D Cartesian orientation">
            <span>any</span>
          </span>
        );
      default:
        return <span>{mode}</span>;
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-950 text-slate-100">
      {/* Top action / status bar */}
      <div className="px-6 py-3 bg-slate-900/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <span className="text-sm font-semibold text-slate-300">Job #4821</span>
            <span className="text-slate-500">·</span>
            <span className="text-xs text-slate-400">Acme Bedding · SO-10592</span>
          </div>

          <div className="flex items-center space-x-2 bg-slate-800/80 px-2.5 py-1 rounded-md border border-slate-700/80 text-xs">
            <span className="text-slate-400">{t('grade')}:</span>
            <select
              value={selectedGrade}
              onChange={(e) => onSelectGrade(e.target.value)}
              className="bg-transparent text-sky-400 font-semibold focus:outline-none cursor-pointer"
            >
              {grades.map((g) => (
                <option key={g.code} value={g.code} className="bg-slate-900 text-white">
                  {g.code} ({g.name})
                </option>
              ))}
            </select>
          </div>

          {machines.length > 0 && onSelectMachine && (
            <div className="flex items-center space-x-2 bg-slate-800/80 px-2.5 py-1 rounded-md border border-slate-700/80 text-xs">
              <span className="text-slate-400">Saw:</span>
              <select
                value={selectedMachineId || machines[0]?.id}
                onChange={(e) => onSelectMachine(e.target.value)}
                className="bg-transparent text-emerald-400 font-semibold focus:outline-none cursor-pointer"
              >
                {machines.map((m) => (
                  <option key={m.id} value={m.id} className="bg-slate-900 text-white">
                    {m.name} ({m.cut_type})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="hidden sm:flex items-center space-x-2 bg-slate-800/60 px-2.5 py-1 rounded-md text-xs text-slate-400">
            <span>{t('block')}:</span>
            <span className="text-slate-200 font-medium">108 × 82 × 40 in</span>
          </div>

          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-amber-500/10 text-amber-300 border border-amber-500/30">
            {t('heuristic_badge')}
          </span>
        </div>

        <button
          onClick={onRunOptimization}
          disabled={isOptimizing}
          className="flex items-center space-x-2 bg-sky-600 hover:bg-sky-500 text-white px-4 py-2 rounded-lg text-sm font-semibold shadow-md transition-all disabled:opacity-50"
        >
          <Sparkles className={`w-4 h-4 ${isOptimizing ? 'animate-spin' : ''}`} />
          <span>{isOptimizing ? t('optimizing') : t('run_optimization')}</span>
        </button>
      </div>

      {/* 3-Column main area */}
      <div className="flex-1 grid grid-cols-12 gap-4 p-4 min-h-0 overflow-y-auto lg:overflow-hidden">
        {/* LEFT COLUMN: Required Parts Table (3 cols) */}
        <div className="col-span-12 lg:col-span-3 flex flex-col bg-slate-900/70 rounded-xl border border-slate-800/80 p-3 min-h-[320px]">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              {t('required_parts')}
            </h3>
            <span className="text-xs text-slate-500">
              {result.total_parts_demanded} {t('pieces')}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto mt-2 space-y-1.5 pr-1">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-slate-500 border-b border-slate-800/60 pb-1">
                  <th className="py-1">PART (L×W×H)</th>
                  <th className="py-1 text-center">QTY</th>
                  <th className="py-1 text-right">ROT</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40">
                {/* Aggregate unique parts placed */}
                {Array.from(new Set(activeBlock?.placed_parts.map((p) => p.sku) || [])).map((sku) => {
                  const sample = activeBlock.placed_parts.find((p) => p.sku === sku);
                  if (!sample) return null;
                  const qty = activeBlock.placed_parts.filter((p) => p.sku === sku).length;
                  return (
                    <tr key={sku} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-1.5 flex items-center space-x-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: sample.color_hex }}
                        ></span>
                        <div>
                          <div className="font-medium text-slate-200">{sku}</div>
                          <div className="text-[10px] text-slate-400">
                            {sample.length}×{sample.width}×{sample.height} in
                          </div>
                        </div>
                      </td>
                      <td className="py-1.5 text-center font-mono font-bold text-slate-300">
                        {qty}
                      </td>
                      <td className="py-1.5 text-right">
                        {renderOrientationBadge(
                          sample.length === sample.width && sample.width === sample.height
                            ? 'any'
                            : 'rise-locked'
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="pt-2 border-t border-slate-800/80 mt-2 space-y-1.5">
            <button
              onClick={() => setShowAddModal(true)}
              className="w-full py-2 px-3 rounded-lg border border-dashed border-slate-700 hover:border-sky-500/60 hover:bg-sky-500/5 text-slate-400 hover:text-sky-400 text-xs font-medium flex items-center justify-center space-x-1.5 transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t('add_part')}</span>
            </button>

            <button
              onClick={() => {
                onAddPart({
                  id: `rush-${Date.now()}`,
                  sku: 'Rush Cushion R-1',
                  name: 'Urgent Rush Cushion',
                  grade: selectedGrade,
                  length: 24.0,
                  width: 20.0,
                  height: 6.0,
                  quantity: 8,
                  orientation_mode: 'rise-locked',
                  color_hex: '#f43f5e',
                });
              }}
              className="w-full py-1.5 px-3 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs font-semibold flex items-center justify-center space-x-1.5 transition-all"
              title="Simulates proposal Section 5.7: fold new rush demand into active plan"
            >
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>+ Simulate Rush Order (8 pcs)</span>
            </button>
          </div>
        </div>

        {/* CENTER COLUMN: 3D Nesting Layout & Cut Plan Preview (6 cols) */}
        <div className="col-span-12 lg:col-span-6 flex flex-col space-y-3 min-h-[480px]">
          {/* Top block header and pagination */}
          <div className="flex items-center justify-between bg-slate-900/60 px-4 py-2 rounded-lg border border-slate-800">
            <div className="flex items-center space-x-3">
              <span className="text-sm font-semibold text-slate-200">
                {t('nesting_layout')} — {t('block_counter', { current: selectedBlockIndex + 1, total: result.blocks_used_count })}
              </span>
              <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                {activeBlock.stock_type === 'remnant' ? 'Remnant Stock' : 'Full Bun'}
              </span>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={() => onSelectBlock(Math.max(0, selectedBlockIndex - 1))}
                disabled={selectedBlockIndex === 0}
                className="p-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              {result.blocks.map((_, i) => (
                <button
                  key={i}
                  onClick={() => onSelectBlock(i)}
                  className={`w-6 h-6 rounded text-xs font-mono font-bold transition-all ${
                    i === selectedBlockIndex
                      ? 'bg-sky-600 text-white shadow-sm'
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  {i + 1}
                </button>
              ))}
              <button
                onClick={() => onSelectBlock(Math.min(result.blocks.length - 1, selectedBlockIndex + 1))}
                disabled={selectedBlockIndex === result.blocks.length - 1}
                className="p-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* 3D Canvas Box */}
          <div className="flex-1 min-h-[300px] relative">
            {activeBlock && <ThreeBlockView layout={activeBlock} />}
          </div>

          {/* Bottom Bar: Cut Plan Preview & Send to Saw */}
          <div className="bg-slate-900/80 rounded-xl border border-slate-800 p-3 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="text-xs space-y-1">
              <div className="font-bold text-slate-300 flex items-center space-x-1.5">
                <Scissors className="w-3.5 h-3.5 text-sky-400" />
                <span>{t('cut_plan_preview')}</span>
              </div>
              <p className="text-slate-400 text-[11px]">
                Stage 1 — Horizontal slab cuts (Z) · Stage 2 — Rip slabs into strips (X) · Stage 3 — Crosscuts (Y)
              </p>
            </div>

            <div className="flex items-center space-x-2 flex-shrink-0">
              <button
                onClick={() => window.print()}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium flex items-center space-x-1.5 border border-slate-700 transition-all"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>{t('export_cut_sheet')}</span>
              </button>

              <button
                onClick={onSendToSaw}
                className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold flex items-center space-x-1.5 shadow-md transition-all"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{t('send_to_saw')}</span>
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Yield Summary & Predicted Remnants (3 cols) */}
        <div className="col-span-12 lg:col-span-3 flex flex-col space-y-3 min-h-0 overflow-y-auto">
          {/* Card 1: Yield Summary */}
          <div className="bg-slate-900/70 rounded-xl border border-slate-800 p-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 pb-2 border-b border-slate-800">
              {t('yield_summary')}
            </h3>

            <div className="mt-3 text-center">
              <div className="text-3xl font-extrabold text-sky-400 tracking-tight">
                {activeBlock.net_utilization_pct}%
              </div>
              <div className="text-[11px] text-slate-400 font-medium">
                {t('net_utilization')} (usable volume)
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                {t('gross_utilization')}: {activeBlock.gross_utilization_pct}%
              </div>
            </div>

            <div className="mt-4 space-y-2 text-xs border-t border-slate-800/80 pt-3">
              <div className="flex justify-between">
                <span className="text-slate-400">{t('blocks_required')}</span>
                <span className="font-semibold text-slate-200">{result.blocks_used_count}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">{t('scrap_unrecoverable')}</span>
                <span className="font-semibold text-rose-400">
                  {roundVal((activeBlock.unrecoverable_scrap_volume / activeBlock.usable_volume) * 100)}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">{t('usable_remnants')}</span>
                <span className="font-semibold text-emerald-400">
                  {roundVal((activeBlock.usable_remnants.reduce((a, b) => a + b.volume, 0) / activeBlock.usable_volume) * 100)}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">{t('total_cuts')}</span>
                <span className="font-semibold text-slate-200">{activeBlock.cuts.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">{t('est_saw_time')}</span>
                <span className="font-semibold text-sky-300">
                  {Math.floor(result.estimated_saw_time_minutes / 60)}h{' '}
                  {Math.round(result.estimated_saw_time_minutes % 60)}m
                </span>
              </div>
            </div>
          </div>

          {/* Card 2: Predicted Remnants */}
          <div className="bg-slate-900/70 rounded-xl border border-slate-800 p-4 flex-1">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 pb-2 border-b border-slate-800">
              {t('predicted_remnants')}
            </h3>

            <div className="mt-3 space-y-2">
              {activeBlock.usable_remnants.length === 0 ? (
                <div className="text-xs text-slate-500 italic py-2 text-center">
                  No large remnants in this block (volume utilized for parts).
                </div>
              ) : (
                activeBlock.usable_remnants.map((rem) => (
                  <div
                    key={rem.id}
                    className="p-2.5 rounded-lg bg-slate-800/50 border border-emerald-900/40 text-xs space-y-1"
                  >
                    <div className="flex justify-between font-mono font-bold text-emerald-400">
                      <span>
                        {rem.length}×{rem.width}×{rem.height} in
                      </span>
                      <span className="text-[11px] px-1.5 py-0.2 bg-emerald-950 text-emerald-300 rounded border border-emerald-800/50">
                        score {rem.usability_score}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 flex justify-between">
                      <span>Grade: {rem.grade}</span>
                      <span className="text-slate-500">{rem.storage_location}</span>
                    </div>
                  </div>
                ))
              )}
            </div>

            {activeBlock.usable_remnants.length > 0 && (
              <p className="mt-3 text-[11px] text-emerald-400/90 bg-emerald-950/30 p-2 rounded border border-emerald-900/30">
                {t('remnants_flagged_retain', { count: activeBlock.usable_remnants.length })}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Modal to add custom part */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-5 w-full max-w-md shadow-2xl">
            <h4 className="text-base font-bold text-white mb-3">Add Custom Part to Job</h4>
            <form onSubmit={handleCreatePart} className="space-y-3 text-xs">
              <div>
                <label className="text-slate-400 block mb-1">Part SKU / Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Cushion Extra F"
                  value={newPart.sku || ''}
                  onChange={(e) => setNewPart({ ...newPart, sku: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-slate-400 block mb-1">Length (X)</label>
                  <input
                    type="number"
                    step="0.0625"
                    min="1"
                    required
                    value={newPart.length || 24}
                    onChange={(e) => setNewPart({ ...newPart, length: Number(e.target.value) })}
                    className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Width (Y)</label>
                  <input
                    type="number"
                    step="0.0625"
                    min="1"
                    required
                    value={newPart.width || 24}
                    onChange={(e) => setNewPart({ ...newPart, width: Number(e.target.value) })}
                    className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Height (Z)</label>
                  <input
                    type="number"
                    step="0.0625"
                    min="1"
                    required
                    value={newPart.height || 6}
                    onChange={(e) => setNewPart({ ...newPart, height: Number(e.target.value) })}
                    className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white font-mono"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-slate-400 block mb-1">Quantity</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={newPart.quantity || 1}
                    onChange={(e) => setNewPart({ ...newPart, quantity: Number(e.target.value) })}
                    className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Orientation Mode</label>
                  <select
                    value={newPart.orientation_mode || 'rise-locked'}
                    onChange={(e) => setNewPart({ ...newPart, orientation_mode: e.target.value as any })}
                    className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white"
                  >
                    <option value="rise-locked">Rise-locked (Z)</option>
                    <option value="free-in-plane">Free in plane (XY)</option>
                    <option value="any">Any 3D orientation</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-1.5 rounded bg-slate-800 text-slate-300 hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded bg-sky-600 text-white font-semibold hover:bg-sky-500"
                >
                  Add to Parts List
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Hidden on screen, rendered on window.print() */}
      {activeBlock && <PrintableCutSheet result={result} block={activeBlock} />}
    </div>
  );
};

function roundVal(v: number): string {
  return isNaN(v) ? '0.0' : v.toFixed(1);
}
