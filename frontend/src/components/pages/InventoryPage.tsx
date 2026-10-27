import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Archive,
  Layers,
  Plus,
  Trash2,
  AlertCircle,
  Database,
  ArrowRight,
  Boxes
} from 'lucide-react';
import type { BlockInput, RemnantInventoryItem } from '../../types';

interface InventoryPageProps {
  blocks: BlockInput[];
  remnants: RemnantInventoryItem[];
  onAddBlock: (block: BlockInput) => void;
  onUpdateBlock: (index: number, updated: Partial<BlockInput>) => void;
  onRemoveBlock: (index: number) => void;
  onRemoveRemnant: (id: string) => void;
  onUseGradeInOptimization: (grade: string, gradeBlocks: BlockInput[]) => void;
}

export const InventoryPage: React.FC<InventoryPageProps> = ({
  blocks,
  remnants,
  onAddBlock,
  onUpdateBlock: _onUpdateBlock,
  onRemoveBlock,
  onRemoveRemnant,
  onUseGradeInOptimization,
}) => {
  const { t } = useTranslation();
  const [selectedGrade, setSelectedGrade] = useState<string>('all');
  const [isAddingBlock, setIsAddingBlock] = useState(false);
  const [newBlock, setNewBlock] = useState<BlockInput>({
    id: `bun-inv-${Date.now().toString().slice(-4)}`,
    nominal_length: 108.0,
    nominal_width: 82.0,
    nominal_height: 40.0,
    grade: 'HR-40',
    quantity: 4,
  });

  const grades = ['all', 'HR-40', 'HR-30', 'VE-50'];

  const filteredBlocks = useMemo(() => {
    if (selectedGrade === 'all') return blocks;
    return blocks.filter((b) => b.grade === selectedGrade);
  }, [blocks, selectedGrade]);

  const filteredRemnants = useMemo(() => {
    if (selectedGrade === 'all') return remnants;
    return remnants.filter((r) => r.grade === selectedGrade);
  }, [remnants, selectedGrade]);

  // Summaries
  const totalBunsCount = filteredBlocks.reduce((acc, b) => acc + b.quantity, 0);
  const totalRemnantCuFt = filteredRemnants.reduce((acc, r) => acc + (r.volume_cu_in / 1728), 0);
  const activeRemnantsCount = filteredRemnants.length;

  const handleCreateBlock = () => {
    onAddBlock({
      ...newBlock,
      id: `bun-inv-${Date.now().toString().slice(-4)}`,
    });
    setIsAddingBlock(false);
  };

  const handleUseInOptimization = () => {
    const targetGrade = selectedGrade === 'all' ? 'HR-40' : selectedGrade;
    const blocksForGrade = blocks.filter((b) => b.grade === targetGrade);
    onUseGradeInOptimization(targetGrade, blocksForGrade.length > 0 ? blocksForGrade : blocks);
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 lg:p-8 space-y-6 max-w-7xl mx-auto w-full">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-xl lg:text-2xl font-black text-slate-900 tracking-tight flex items-center space-x-2">
            <span>{t('stock_overview')}</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
              Warehouse
            </span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Grade-segregated virgin buns and retained reusable remnants stocked for cutting allocation.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <div className="hidden sm:flex items-center space-x-1.5 text-xs text-slate-500 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg">
            <Database className="w-3.5 h-3.5 text-slate-400" />
            <span>{t('saved_in_browser_demo')}</span>
          </div>

          <button
            type="button"
            onClick={handleUseInOptimization}
            className="inline-flex items-center space-x-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg transition shadow-xs cursor-pointer"
            title="Load this grade's blocks into Step 1 of Optimization"
          >
            <span>{t('use_in_optimization')}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Summary KPI Cards & Grade Filter Chips Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Card 1: Total Buns */}
        <div className="p-4 rounded-xl border border-slate-200 bg-white flex items-center justify-between shadow-2xs">
          <div>
            <span className="text-xs font-semibold text-slate-500">{t('summary_total_blocks')}</span>
            <div className="text-2xl font-bold text-slate-900 mt-1">{totalBunsCount} buns</div>
            <span className="text-[11px] text-slate-400">Available across {filteredBlocks.length} SKU sizes</span>
          </div>
          <div className="p-3 bg-blue-50 rounded-xl text-blue-600">
            <Boxes className="w-6 h-6" />
          </div>
        </div>

        {/* Card 2: Remnant Volume */}
        <div className="p-4 rounded-xl border border-slate-200 bg-white flex items-center justify-between shadow-2xs">
          <div>
            <span className="text-xs font-semibold text-slate-500">{t('summary_remnant_vol')}</span>
            <div className="text-2xl font-bold text-emerald-700 mt-1">{totalRemnantCuFt.toFixed(1)} ft³</div>
            <span className="text-[11px] text-slate-400">Preserved high-yield offcuts</span>
          </div>
          <div className="p-3 bg-emerald-50 rounded-xl text-emerald-600">
            <Layers className="w-6 h-6" />
          </div>
        </div>

        {/* Card 3: Active Remnants */}
        <div className="p-4 rounded-xl border border-slate-200 bg-white flex items-center justify-between shadow-2xs">
          <div>
            <span className="text-xs font-semibold text-slate-500">{t('summary_remnant_count')}</span>
            <div className="text-2xl font-bold text-slate-900 mt-1">{activeRemnantsCount} pieces</div>
            <span className="text-[11px] text-slate-400">Logged in inventory vault</span>
          </div>
          <div className="p-3 bg-purple-50 rounded-xl text-purple-600">
            <Archive className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Grade Filter Row */}
      <div className="flex items-center space-x-2 bg-white p-3 rounded-xl border border-slate-200 shadow-2xs text-xs">
        <span className="font-semibold text-slate-500 uppercase tracking-wider text-[11px] mr-1">
          Grade View:
        </span>
        {grades.map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => setSelectedGrade(g)}
            className={`px-3 py-1 rounded-lg font-semibold transition cursor-pointer ${
              selectedGrade === g
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {g === 'all' ? t('all_grades') : g}
          </button>
        ))}
      </div>

      {/* Section 1: Raw Bun Blocks Stock */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden space-y-4 p-5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center space-x-2">
              <Boxes className="w-4 h-4 text-blue-600" />
              <span>{t('blocks_inventory')}</span>
            </h2>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Virgin polyurethane foam blocks with nominal dimensions and usable interior volume (after 1.0" skin trim).
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsAddingBlock(true)}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold rounded-lg border border-blue-200 transition cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Bun Block</span>
          </button>
        </div>

        {/* Add Block Form Drawer */}
        {isAddingBlock && (
          <div className="p-4 bg-blue-50/50 border border-blue-200 rounded-xl space-y-3 text-xs">
            <span className="font-bold text-blue-900 block">Configure New Raw Block Stock</span>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div>
                <label className="block text-slate-500 mb-1">Grade</label>
                <select
                  value={newBlock.grade}
                  onChange={(e) => setNewBlock({ ...newBlock, grade: e.target.value })}
                  className="w-full px-2 py-1.5 border border-slate-300 rounded bg-white"
                >
                  <option value="HR-40">HR-40</option>
                  <option value="HR-30">HR-30</option>
                  <option value="VE-50">VE-50</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-500 mb-1">Length (in)</label>
                <input
                  type="number"
                  value={newBlock.nominal_length}
                  onChange={(e) => setNewBlock({ ...newBlock, nominal_length: parseFloat(e.target.value) || 0 })}
                  className="w-full px-2 py-1.5 border border-slate-300 rounded bg-white"
                />
              </div>
              <div>
                <label className="block text-slate-500 mb-1">Width (in)</label>
                <input
                  type="number"
                  value={newBlock.nominal_width}
                  onChange={(e) => setNewBlock({ ...newBlock, nominal_width: parseFloat(e.target.value) || 0 })}
                  className="w-full px-2 py-1.5 border border-slate-300 rounded bg-white"
                />
              </div>
              <div>
                <label className="block text-slate-500 mb-1">Height (in)</label>
                <input
                  type="number"
                  value={newBlock.nominal_height}
                  onChange={(e) => setNewBlock({ ...newBlock, nominal_height: parseFloat(e.target.value) || 0 })}
                  className="w-full px-2 py-1.5 border border-slate-300 rounded bg-white"
                />
              </div>
              <div>
                <label className="block text-slate-500 mb-1">Quantity</label>
                <input
                  type="number"
                  min="1"
                  value={newBlock.quantity}
                  onChange={(e) => setNewBlock({ ...newBlock, quantity: parseInt(e.target.value) || 1 })}
                  className="w-full px-2 py-1.5 border border-slate-300 rounded bg-white font-semibold"
                />
              </div>
            </div>
            <div className="flex justify-end space-x-2 pt-1">
              <button
                type="button"
                onClick={() => setIsAddingBlock(false)}
                className="px-3 py-1 text-slate-600 hover:bg-slate-100 rounded"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateBlock}
                className="px-4 py-1 bg-blue-600 text-white font-semibold rounded shadow-xs"
              >
                Save Block
              </button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold select-none">
              <tr>
                <th className="py-2.5 px-3">Grade</th>
                <th className="py-2.5 px-3">Nominal Dims (L × W × H)</th>
                <th className="py-2.5 px-3 text-right">Quantity</th>
                <th className="py-2.5 px-3 text-right">Usable Interior (in³)</th>
                <th className="py-2.5 px-3 text-right">Gross Volume (ft³)</th>
                <th className="py-2.5 px-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredBlocks.map((block, idx) => {
                const usableL = Math.max(0, block.nominal_length - 2.0);
                const usableW = Math.max(0, block.nominal_width - 2.0);
                const usableH = Math.max(0, block.nominal_height - 2.0);
                const usableCuIn = usableL * usableW * usableH;
                const grossCuFt = ((block.nominal_length * block.nominal_width * block.nominal_height) / 1728) * block.quantity;

                return (
                  <tr key={block.id || idx} className="hover:bg-slate-50/80 transition">
                    <td className="py-2.5 px-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                        {block.grade}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-mono">
                      {block.nominal_length}" × {block.nominal_width}" × {block.nominal_height}"
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                      {block.quantity}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                      {usableCuIn.toLocaleString()} in³
                    </td>
                    <td className="py-2.5 px-3 text-right font-semibold text-slate-800">
                      {grossCuFt.toFixed(1)} ft³
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <button
                        type="button"
                        onClick={() => onRemoveBlock(idx)}
                        disabled={blocks.length <= 1}
                        className={`p-1 text-slate-400 hover:text-red-600 rounded transition ${
                          blocks.length <= 1 ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'
                        }`}
                        title="Remove Block"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Section 2: Retained Remnants Vault */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden space-y-4 p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center space-x-2">
              <Layers className="w-4 h-4 text-emerald-600" />
              <span>{t('remnants_inventory')}</span>
            </h2>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Usable foam boxes retained from completed optimization jobs, available to offset upcoming cut orders.
            </p>
          </div>

          {/* Planned Note */}
          <div
            className="flex items-center space-x-1.5 px-2.5 py-1 rounded bg-amber-50 border border-amber-200 text-amber-800 text-[11px]"
            title={t('remnant_aging_note')}
          >
            <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span className="italic">Aging & oxidation tracking: planned (demo assumptions apply)</span>
          </div>
        </div>

        {filteredRemnants.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-400 space-y-2">
            <Archive className="w-8 h-8 text-slate-300 mx-auto" />
            <p>No remnants saved to inventory yet.</p>
            <p className="text-[11px] text-slate-400">
              Run an optimization in Step 4 and click "+ Add to Inventory" on any retained remnant row.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold select-none">
                <tr>
                  <th className="py-2.5 px-3">Remnant Code</th>
                  <th className="py-2.5 px-3">Grade</th>
                  <th className="py-2.5 px-3">Dimensions (L × W × H)</th>
                  <th className="py-2.5 px-3 text-right">Volume</th>
                  <th className="py-2.5 px-3">Source Job</th>
                  <th className="py-2.5 px-3">Created</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                  <th className="py-2.5 px-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredRemnants.map((rem) => {
                  const volCuFt = (rem.volume_cu_in / 1728).toFixed(2);
                  return (
                    <tr key={rem.id} className="hover:bg-slate-50/80 transition">
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-800">
                        {rem.remnant_id}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          {rem.grade}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px]">
                        {rem.length}" × {rem.width}" × {rem.height}"
                      </td>
                      <td className="py-2.5 px-3 text-right font-medium text-slate-800">
                        {volCuFt} ft³ <span className="text-[10px] text-slate-400">({rem.volume_cu_in.toLocaleString()} in³)</span>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600">
                        {rem.source_job_id}
                      </td>
                      <td className="py-2.5 px-3 text-slate-400 text-[11px]">
                        {new Date(rem.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-blue-50 text-blue-700 border border-blue-200">
                          {rem.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => onRemoveRemnant(rem.id)}
                          className="p-1 text-slate-400 hover:text-red-600 rounded transition cursor-pointer"
                          title="Remove Remnant"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
