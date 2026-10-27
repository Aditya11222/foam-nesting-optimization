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
          <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded text-[11px] font-mono bg-[#EFF6FF] text-[#1D4ED8] border border-[#BFDBFE]" title="Rise-locked: height locked to Z, 2 XY rotations">
            <span>2↑</span>
          </span>
        );
      case 'free-in-plane':
        return (
          <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded text-[11px] font-mono bg-[#ECFEFF] text-[#0E7490] border border-[#A5F3FC]" title="Free in XY plane">
            <span>free</span>
          </span>
        );
      case 'any':
        return (
          <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded text-[11px] font-mono bg-[#F0FDF4] text-[#15803D] border border-[#BBF7D0]" title="Any 3D Cartesian orientation">
            <span>any</span>
          </span>
        );
      default:
        return <span>{mode}</span>;
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#F8FAFC] text-[#0F172A]">
      {/* Top action / status bar */}
      <div className="px-6 py-3 bg-white border-b border-[#E2E8F0] flex flex-wrap items-center justify-between gap-4 shadow-soft">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
              <span className="text-sm font-bold text-[#0F172A]">Job #{result.job_id}</span>
              {result.customer && (
                <>
                  <span className="text-[#CBD5E1]">•</span>
                  <span className="text-xs text-[#475569]">{result.customer}</span>
                </>
              )}
            </div>

          <div className="flex items-center space-x-2 bg-[#F8FAFC] px-2.5 py-1 rounded-lg border border-[#CBD5E1] text-xs">
            <span className="text-[#64748B] font-medium">{t('grade')}:</span>
            <select
              value={selectedGrade}
              onChange={(e) => onSelectGrade(e.target.value)}
              className="bg-transparent text-[#2563EB] font-bold focus:outline-none cursor-pointer"
            >
              {grades.map((g) => (
                <option key={g.code} value={g.code} className="bg-white text-[#0F172A]">
                  {g.code} ({g.name})
                </option>
              ))}
            </select>
          </div>

          {machines.length > 0 && onSelectMachine && (
            <div className="flex items-center space-x-2 bg-[#F8FAFC] px-2.5 py-1 rounded-lg border border-[#CBD5E1] text-xs">
              <span className="text-[#64748B] font-medium">Saw:</span>
              <select
                value={selectedMachineId || machines[0]?.id}
                onChange={(e) => onSelectMachine(e.target.value)}
                className="bg-transparent text-[#16A34A] font-bold focus:outline-none cursor-pointer"
              >
                {machines.map((m) => (
                  <option key={m.id} value={m.id} className="bg-white text-[#0F172A]">
                    {m.name} ({m.cut_type})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="hidden sm:flex items-center space-x-2 bg-[#F1F5F9] px-2.5 py-1 rounded-lg border border-[#E2E8F0] text-xs text-[#475569]">
            <span>{t('block')}:</span>
            <span className="text-[#0F172A] font-semibold">108 × 82 × 40 in</span>
          </div>

          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-[#FFFBEB] text-[#D97706] border border-[#FDE68A]">
            {t('heuristic_badge')}
          </span>
        </div>

        <button
          onClick={onRunOptimization}
          disabled={isOptimizing}
          className="flex items-center space-x-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white px-4 py-2 rounded-lg text-sm font-semibold shadow-soft transition-all disabled:opacity-50 focus:ring-2 focus:ring-blue-400"
        >
          <Sparkles className={`w-4 h-4 ${isOptimizing ? 'animate-spin' : ''}`} />
          <span>{isOptimizing ? t('optimizing') : t('run_optimization')}</span>
        </button>
      </div>

      {/* 3-Column main area */}
      <div className="flex-1 grid grid-cols-12 gap-4 p-4 min-h-0 overflow-y-auto lg:overflow-hidden bg-[#F8FAFC]">
        {/* LEFT COLUMN: Required Parts Table (3 cols) */}
        <div className="col-span-12 lg:col-span-3 flex flex-col bg-white rounded-xl border border-[#E2E8F0] shadow-soft p-3.5 min-h-[320px]">
          <div className="flex items-center justify-between pb-2 border-b border-[#E2E8F0]">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#475569]">
              {t('required_parts')}
            </h3>
            <span className="text-xs font-semibold text-[#64748B]">
              {result.total_parts_demanded} {t('pieces')}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto mt-2 space-y-1.5 pr-1">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-[#F1F5F9] text-[#475569] border-b border-[#E2E8F0]">
                  <th className="py-1.5 px-2 font-semibold">PART (L×W×H)</th>
                  <th className="py-1.5 px-1 text-center font-semibold">QTY</th>
                  <th className="py-1.5 px-1 text-right font-semibold">ROT</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {/* Aggregate unique parts placed */}
                {Array.from(new Set(activeBlock?.placed_parts.map((p) => p.sku) || [])).map((sku) => {
                  const sample = activeBlock.placed_parts.find((p) => p.sku === sku);
                  if (!sample) return null;
                  const qty = activeBlock.placed_parts.filter((p) => p.sku === sku).length;
                  return (
                    <tr key={sku} className="hover:bg-[#F8FAFC] transition-colors">
                      <td className="py-2 px-2 flex items-center space-x-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: sample.color_hex }}
                        ></span>
                        <div>
                          <div className="font-semibold text-[#0F172A]">{sku}</div>
                          <div className="text-[10px] text-[#64748B]">
                            {sample.length}×{sample.width}×{sample.height} in
                          </div>
                        </div>
                      </td>
                      <td className="py-2 px-1 text-center font-mono font-bold text-[#0F172A]">
                        {qty}
                      </td>
                      <td className="py-2 px-1 text-right">
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

          <div className="pt-2 border-t border-[#E2E8F0] mt-2 space-y-2">
            <button
              onClick={() => setShowAddModal(true)}
              className="w-full py-2 px-3 rounded-lg border border-dashed border-[#CBD5E1] hover:border-[#2563EB] hover:bg-[#EFF6FF] text-[#475569] hover:text-[#2563EB] text-xs font-semibold flex items-center justify-center space-x-1.5 transition-all"
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
                  color_hex: '#DC2626',
                });
              }}
              className="w-full py-1.5 px-3 rounded-lg bg-[#FFFBEB] hover:bg-[#FEF3C7] text-[#D97706] border border-[#FDE68A] text-xs font-semibold flex items-center justify-center space-x-1.5 transition-all shadow-soft"
              title="Simulates proposal Section 5.7: fold new rush demand into active plan"
            >
              <Zap className="w-3.5 h-3.5 text-[#D97706]" />
              <span>+ Simulate Rush Order (8 pcs)</span>
            </button>
          </div>
        </div>

        {/* CENTER COLUMN: 3D Nesting Layout & Cut Plan Preview (6 cols) */}
        <div className="col-span-12 lg:col-span-6 flex flex-col space-y-3 min-h-[480px]">
          {/* Top block header and pagination */}
          <div className="flex items-center justify-between bg-white px-4 py-2.5 rounded-xl border border-[#E2E8F0] shadow-soft">
            <div className="flex items-center space-x-3">
              <span className="text-sm font-bold text-[#0F172A]">
                {t('nesting_layout')} — {t('block_counter', { current: selectedBlockIndex + 1, total: result.blocks_used_count })}
              </span>
              <span className="text-xs px-2 py-0.5 rounded-md bg-[#F1F5F9] border border-[#E2E8F0] text-[#475569] font-medium">
                {activeBlock.stock_type === 'remnant' ? 'Remnant Stock' : 'Full Bun'}
              </span>
            </div>

            <div className="flex items-center space-x-1.5">
              <button
                onClick={() => onSelectBlock(Math.max(0, selectedBlockIndex - 1))}
                disabled={selectedBlockIndex === 0}
                className="p-1.5 rounded-lg bg-[#F8FAFC] hover:bg-[#F1F5F9] border border-[#E2E8F0] disabled:opacity-40 text-[#475569] transition-all"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              {result.blocks.map((_, i) => (
                <button
                  key={i}
                  onClick={() => onSelectBlock(i)}
                  className={`w-7 h-7 rounded-lg text-xs font-mono font-bold transition-all ${
                    i === selectedBlockIndex
                      ? 'bg-[#2563EB] text-white shadow-soft'
                      : 'bg-[#F8FAFC] text-[#475569] hover:bg-[#F1F5F9] border border-[#E2E8F0]'
                  }`}
                >
                  {i + 1}
                </button>
              ))}
              <button
                onClick={() => onSelectBlock(Math.min(result.blocks.length - 1, selectedBlockIndex + 1))}
                disabled={selectedBlockIndex === result.blocks.length - 1}
                className="p-1.5 rounded-lg bg-[#F8FAFC] hover:bg-[#F1F5F9] border border-[#E2E8F0] disabled:opacity-40 text-[#475569] transition-all"
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
          <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-soft p-3.5 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="text-xs space-y-0.5">
              <div className="font-bold text-[#0F172A] flex items-center space-x-1.5">
                <Scissors className="w-3.5 h-3.5 text-[#2563EB]" />
                <span>{t('cut_plan_preview')}</span>
              </div>
              <p className="text-[#64748B] text-[11px]">
                Stage 1 — Horizontal slab cuts (Z) · Stage 2 — Rip slabs into strips (X) · Stage 3 — Crosscuts (Y)
              </p>
            </div>

            <div className="flex items-center space-x-2 flex-shrink-0">
              <button
                onClick={() => window.print()}
                className="px-3 py-1.5 rounded-lg bg-white hover:bg-[#F8FAFC] text-[#0F172A] text-xs font-semibold flex items-center space-x-1.5 border border-[#CBD5E1] shadow-soft transition-all"
              >
                <Printer className="w-3.5 h-3.5 text-[#475569]" />
                <span>{t('export_cut_sheet')}</span>
              </button>

              <button
                onClick={onSendToSaw}
                className="px-3.5 py-1.5 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold flex items-center space-x-1.5 shadow-soft transition-all"
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
          <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-soft p-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#475569] pb-2 border-b border-[#E2E8F0]">
              {t('yield_summary')}
            </h3>

            <div className="mt-3 text-center">
              <div className="text-3xl font-extrabold text-[#16A34A] tracking-tight">
                {activeBlock.net_utilization_pct}%
              </div>
              <div className="text-[11px] text-[#475569] font-medium">
                {t('net_utilization')} (usable volume)
              </div>
              <div className="text-xs text-[#64748B] mt-0.5">
                {t('gross_utilization')}: {activeBlock.gross_utilization_pct}%
              </div>
            </div>

            <div className="mt-4 space-y-2 text-xs border-t border-[#E2E8F0] pt-3">
              <div className="flex justify-between">
                <span className="text-[#475569]">{t('blocks_required')}</span>
                <span className="font-semibold text-[#0F172A]">{result.blocks_used_count}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#475569]">{t('scrap_unrecoverable')}</span>
                <span className="font-bold text-[#D97706]">
                  {roundVal((activeBlock.unrecoverable_scrap_volume / activeBlock.usable_volume) * 100)}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#475569]">{t('usable_remnants')}</span>
                <span className="font-bold text-[#16A34A]">
                  {roundVal((activeBlock.usable_remnants.reduce((a, b) => a + b.volume, 0) / activeBlock.usable_volume) * 100)}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#475569]">{t('total_cuts')}</span>
                <span className="font-semibold text-[#0F172A]">{activeBlock.cuts.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#475569]">{t('est_saw_time')}</span>
                <span className="font-bold text-[#2563EB]">
                  {Math.floor(result.estimated_saw_time_minutes / 60)}h{' '}
                  {Math.round(result.estimated_saw_time_minutes % 60)}m
                </span>
              </div>
            </div>
          </div>

          {/* Card 2: Predicted Remnants */}
          <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-soft p-4 flex-1">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#475569] pb-2 border-b border-[#E2E8F0]">
              {t('predicted_remnants')}
            </h3>

            <div className="mt-3 space-y-2">
              {activeBlock.usable_remnants.length === 0 ? (
                <div className="text-xs text-[#64748B] italic py-2 text-center">
                  No large remnants in this block (volume utilized for parts).
                </div>
              ) : (
                activeBlock.usable_remnants.map((rem) => (
                  <div
                    key={rem.id}
                    className="p-2.5 rounded-lg bg-[#F8FAFC] border border-[#BBF7D0] text-xs space-y-1"
                  >
                    <div className="flex justify-between font-mono font-bold text-[#16A34A]">
                      <span>
                        {rem.length}×{rem.width}×{rem.height} in
                      </span>
                      <span className="text-[11px] px-1.5 py-0.2 bg-[#F0FDF4] text-[#15803D] rounded border border-[#BBF7D0]">
                        score {rem.usability_score}
                      </span>
                    </div>
                    <div className="text-[11px] text-[#475569] flex justify-between">
                      <span>Grade: {rem.grade}</span>
                      <span className="text-[#64748B]">{rem.storage_location}</span>
                    </div>
                  </div>
                ))
              )}
            </div>

            {activeBlock.usable_remnants.length > 0 && (
              <p className="mt-3 text-[11px] text-[#15803D] bg-[#F0FDF4] p-2 rounded-lg border border-[#BBF7D0]">
                {t('remnants_flagged_retain', { count: activeBlock.usable_remnants.length })}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Modal to add custom part */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-6 w-full max-w-md shadow-2xl text-[#0F172A]">
            <h4 className="text-base font-bold text-[#0F172A] mb-3">Add Custom Part to Job</h4>
            <form onSubmit={handleCreatePart} className="space-y-3 text-xs">
              <div>
                <label className="text-[#475569] block mb-1 font-semibold">Part SKU / Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Cushion Extra F"
                  value={newPart.sku || ''}
                  onChange={(e) => setNewPart({ ...newPart, sku: e.target.value })}
                  className="w-full bg-white border border-[#CBD5E1] focus:border-[#2563EB] focus:ring-2 focus:ring-blue-100 rounded-lg p-2 text-[#0F172A]"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[#475569] block mb-1 font-semibold">Length (X)</label>
                  <input
                    type="number"
                    step="0.0625"
                    min="1"
                    required
                    value={newPart.length || 24}
                    onChange={(e) => setNewPart({ ...newPart, length: Number(e.target.value) })}
                    className="w-full bg-white border border-[#CBD5E1] focus:border-[#2563EB] focus:ring-2 focus:ring-blue-100 rounded-lg p-2 text-[#0F172A] font-mono"
                  />
                </div>
                <div>
                  <label className="text-[#475569] block mb-1 font-semibold">Width (Y)</label>
                  <input
                    type="number"
                    step="0.0625"
                    min="1"
                    required
                    value={newPart.width || 24}
                    onChange={(e) => setNewPart({ ...newPart, width: Number(e.target.value) })}
                    className="w-full bg-white border border-[#CBD5E1] focus:border-[#2563EB] focus:ring-2 focus:ring-blue-100 rounded-lg p-2 text-[#0F172A] font-mono"
                  />
                </div>
                <div>
                  <label className="text-[#475569] block mb-1 font-semibold">Height (Z)</label>
                  <input
                    type="number"
                    step="0.0625"
                    min="1"
                    required
                    value={newPart.height || 6}
                    onChange={(e) => setNewPart({ ...newPart, height: Number(e.target.value) })}
                    className="w-full bg-white border border-[#CBD5E1] focus:border-[#2563EB] focus:ring-2 focus:ring-blue-100 rounded-lg p-2 text-[#0F172A] font-mono"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[#475569] block mb-1 font-semibold">Quantity</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={newPart.quantity || 1}
                    onChange={(e) => setNewPart({ ...newPart, quantity: Number(e.target.value) })}
                    className="w-full bg-white border border-[#CBD5E1] focus:border-[#2563EB] focus:ring-2 focus:ring-blue-100 rounded-lg p-2 text-[#0F172A] font-mono"
                  />
                </div>
                <div>
                  <label className="text-[#475569] block mb-1 font-semibold">Orientation Mode</label>
                  <select
                    value={newPart.orientation_mode || 'rise-locked'}
                    onChange={(e) => setNewPart({ ...newPart, orientation_mode: e.target.value as any })}
                    className="w-full bg-white border border-[#CBD5E1] focus:border-[#2563EB] focus:ring-2 focus:ring-blue-100 rounded-lg p-2 text-[#0F172A]"
                  >
                    <option value="rise-locked">Rise-locked (Z)</option>
                    <option value="free-in-plane">Free in plane (XY)</option>
                    <option value="any">Any 3D orientation</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end space-x-2 pt-3 border-t border-[#E2E8F0]">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-1.5 rounded-lg bg-[#F1F5F9] text-[#475569] hover:bg-[#E2E8F0] font-semibold border border-[#E2E8F0]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-[#2563EB] text-white font-semibold hover:bg-[#1D4ED8] shadow-soft"
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
