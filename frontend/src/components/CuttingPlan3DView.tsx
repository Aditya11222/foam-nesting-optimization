import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ChevronLeft,
  ChevronRight,
  Scissors,
  Bookmark,
  Archive
} from 'lucide-react';
import type { OptimizationResult, BlockLayout, CutStep } from '../types';
import { ThreeBlockView } from './ThreeBlockView';

interface CuttingPlan3DViewProps {
  result: OptimizationResult;
}

export const CuttingPlan3DView: React.FC<CuttingPlan3DViewProps> = ({ result }) => {
  const { i18n } = useTranslation();
  const isEs = i18n.language === 'es';

  const [selectedBlockIndex, setSelectedBlockIndex] = useState(0);
  const [activeCutStepNumber, setActiveCutStepNumber] = useState<number>(1);

  // Layer toggles
  const [showTrim, setShowTrim] = useState(true);
  const [showParts, setShowParts] = useState(true);
  const [showRemnants, setShowRemnants] = useState(true);
  const [showCutPlane, setShowCutPlane] = useState(true);

  const activeBlock: BlockLayout =
    result.blocks[selectedBlockIndex] || result.blocks[0] || null;

  if (!activeBlock) {
    return (
      <div className="p-8 text-center text-xs text-slate-500">
        No blocks available to display.
      </div>
    );
  }

  const cuts = activeBlock.cuts || [];
  const activeCut: CutStep | undefined =
    cuts.find((c) => c.step_number === activeCutStepNumber) || cuts[0];

  // Group placed parts by SKU for the Legend
  const skuMap: Record<string, { count: number; color: string; dims: string; grade: string }> = {};
  activeBlock.placed_parts.forEach((p) => {
    if (!skuMap[p.sku]) {
      skuMap[p.sku] = {
        count: 0,
        color: p.color_hex || '#3b82f6',
        dims: `${p.length}" × ${p.width}" × ${p.height}"`,
        grade: p.grade,
      };
    }
    skuMap[p.sku].count += 1;
  });

  return (
    <div className="space-y-5">
      {/* Block Selector & Layer Toggles Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
        {/* Block Pagination Tabs */}
        <div className="flex items-center space-x-2">
          <span className="text-xs font-bold text-slate-700">Block:</span>
          <div className="flex items-center space-x-1">
            {result.blocks.map((b, idx) => {
              const isSelected = idx === selectedBlockIndex;
              return (
                <button
                  key={b.block_index}
                  type="button"
                  onClick={() => {
                    setSelectedBlockIndex(idx);
                    setActiveCutStepNumber(1);
                  }}
                  className={`px-3 py-1 rounded-md text-xs font-semibold transition ${
                    isSelected
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  Block #{b.block_index} ({b.placed_parts.length} parts)
                </button>
              );
            })}
          </div>
        </div>

        {/* Layer Visibility Toggles */}
        <div className="flex items-center space-x-3 text-xs text-slate-600">
          <span className="font-semibold text-slate-500 text-[11px] uppercase tracking-wider">
            Layers:
          </span>
          <label className="flex items-center space-x-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={showTrim}
              onChange={(e) => setShowTrim(e.target.checked)}
              className="rounded text-blue-600 focus:ring-blue-500"
            />
            <span>Skin Trim</span>
          </label>
          <label className="flex items-center space-x-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={showParts}
              onChange={(e) => setShowParts(e.target.checked)}
              className="rounded text-blue-600 focus:ring-blue-500"
            />
            <span>Parts</span>
          </label>
          <label className="flex items-center space-x-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={showRemnants}
              onChange={(e) => setShowRemnants(e.target.checked)}
              className="rounded text-emerald-600 focus:ring-emerald-500"
            />
            <span>Remnants</span>
          </label>
          <label className="flex items-center space-x-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={showCutPlane}
              onChange={(e) => setShowCutPlane(e.target.checked)}
              className="rounded text-rose-600 focus:ring-rose-500"
            />
            <span>Cut Plane</span>
          </label>
        </div>
      </div>

      {/* 3D Canvas View */}
      <ThreeBlockView
        layout={activeBlock}
        highlightedCut={showCutPlane ? activeCut : null}
        showTrim={showTrim}
        showParts={showParts}
        showRemnants={showRemnants}
        showCutPlane={showCutPlane}
      />

      {/* Interactive SKU Legend */}
      <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
        <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
          Parts Legend (Block #{activeBlock.block_index}):
        </span>
        <div className="flex flex-wrap gap-2.5">
          {Object.entries(skuMap).map(([sku, data]) => (
            <div
              key={sku}
              className="inline-flex items-center space-x-2 px-2.5 py-1 bg-white border border-slate-200 rounded-md text-xs shadow-2xs"
            >
              <span
                className="w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: data.color }}
              />
              <span className="font-bold text-slate-800">{sku}</span>
              <span className="text-slate-500 text-[11px]">({data.dims})</span>
              <span className="font-semibold text-blue-600">×{data.count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Cut Sequence Stepper Controls */}
      {cuts.length > 0 && (
        <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Scissors className="w-4 h-4 text-rose-600" />
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Saw Cut Sequencer: Step {activeCut ? activeCut.step_number : 0} of {cuts.length}
              </h3>
            </div>
            <div className="flex items-center space-x-1.5">
              <button
                type="button"
                onClick={() => setActiveCutStepNumber((prev) => Math.max(1, prev - 1))}
                disabled={activeCutStepNumber <= 1}
                className="p-1 rounded bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 transition"
                title="Previous Cut"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setActiveCutStepNumber((prev) => Math.min(cuts.length, prev + 1))}
                disabled={activeCutStepNumber >= cuts.length}
                className="p-1 rounded bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 transition"
                title="Next Cut"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Stepper Slider */}
          <div className="flex items-center space-x-3">
            <span className="text-[10px] text-slate-400 font-mono">1</span>
            <input
              type="range"
              min="1"
              max={cuts.length}
              value={activeCutStepNumber}
              onChange={(e) => setActiveCutStepNumber(parseInt(e.target.value, 10))}
              className="flex-1 accent-rose-600 cursor-pointer"
            />
            <span className="text-[10px] text-slate-400 font-mono">{cuts.length}</span>
          </div>

          {/* Active Cut Details Card */}
          {activeCut && (
            <div className="p-3 bg-rose-50/60 border border-rose-200 rounded-lg text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-rose-900 text-xs">
                  {activeCut.cut_type === 'skin_trim'
                    ? 'Perimeter Skin Trim'
                    : activeCut.axis === 'Z'
                    ? 'Horizontal Slab Cut'
                    : activeCut.axis === 'X'
                    ? 'Vertical Rip Cut'
                    : 'Crosscut'}{' '}
                  (Axis {activeCut.axis} @ {activeCut.position_display})
                </span>
                <span className="text-[10px] font-mono text-rose-700">
                  Kerf: {activeCut.kerf_in}"
                </span>
              </div>
              <div className="text-slate-700">
                <span className="font-semibold">Produces: </span>
                {isEs ? activeCut.produces_description_es : activeCut.produces_description_en}
              </div>
              {activeCut.remnant_prompt_en && (
                <div className="text-emerald-700 font-medium flex items-center space-x-1.5">
                  <Bookmark className="w-3.5 h-3.5 shrink-0" />
                  <span>{isEs ? activeCut.remnant_prompt_es : activeCut.remnant_prompt_en}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Ordered Cut Plan List Table */}
      {cuts.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center space-x-1.5">
              <Scissors className="w-3.5 h-3.5 text-slate-500" />
              <span>Ordered Saw Cut Plan ({cuts.length} passes)</span>
            </h4>
            <span className="text-[11px] text-slate-500">
              Click any cut row to highlight its 3D plane
            </span>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-200 max-h-64 overflow-y-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 text-[11px] sticky top-0">
                <tr>
                  <th className="py-2 px-3 text-center">Step</th>
                  <th className="py-2 px-3">Cut Type</th>
                  <th className="py-2 px-3 text-center">Axis</th>
                  <th className="py-2 px-3 text-right">Position</th>
                  <th className="py-2 px-3 text-right">Kerf</th>
                  <th className="py-2 px-3">Produces Description</th>
                  <th className="py-2 px-3">Remnant / Offcut Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cuts.map((c) => {
                  const isActive = c.step_number === activeCutStepNumber;
                  return (
                    <tr
                      key={c.step_number}
                      onClick={() => setActiveCutStepNumber(c.step_number)}
                      className={`cursor-pointer transition ${
                        isActive
                          ? 'bg-rose-50/80 font-medium text-rose-900'
                          : 'hover:bg-slate-50 bg-white text-slate-700'
                      }`}
                    >
                      <td className="py-1.5 px-3 text-center font-bold font-mono">
                        #{c.step_number}
                      </td>
                      <td className="py-1.5 px-3 font-medium capitalize">
                        {c.cut_type.replace('_', ' ')}
                      </td>
                      <td className="py-1.5 px-3 text-center font-mono font-semibold">
                        {c.axis}
                      </td>
                      <td className="py-1.5 px-3 text-right font-mono font-bold">
                        {c.position_display}
                      </td>
                      <td className="py-1.5 px-3 text-right font-mono text-[11px] text-slate-500">
                        {c.kerf_in}"
                      </td>
                      <td className="py-1.5 px-3">
                        {isEs ? c.produces_description_es : c.produces_description_en}
                      </td>
                      <td className="py-1.5 px-3">
                        {c.remnant_prompt_en ? (
                          <span className="inline-flex items-center space-x-1 text-emerald-700 text-[11px] font-medium">
                            <Bookmark className="w-3 h-3 text-emerald-600" />
                            <span>Retain as Remnant</span>
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px]">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Predicted Remnants Table */}
      {activeBlock.usable_remnants.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-slate-100">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center space-x-1.5">
              <Archive className="w-3.5 h-3.5 text-emerald-600" />
              <span>
                Predicted Usable Remnants ({activeBlock.usable_remnants.length} offcuts in Block #{activeBlock.block_index})
              </span>
            </h4>
            <span className="text-[11px] text-emerald-700 font-semibold font-mono">
              Total Remnant Vol: {Math.round(activeBlock.usable_remnants.reduce((acc, r) => acc + r.volume, 0)).toLocaleString()} cu in
            </span>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 text-[11px]">
                <tr>
                  <th className="py-2 px-3">Remnant Code</th>
                  <th className="py-2 px-3 text-center">Grade</th>
                  <th className="py-2 px-3 text-right">Dimensions (L × W × H)</th>
                  <th className="py-2 px-3 text-right">Volume</th>
                  <th className="py-2 px-3 text-center">Usability Score</th>
                  <th className="py-2 px-3 text-right">Storage Bay</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {activeBlock.usable_remnants.map((rem) => (
                  <tr key={rem.id} className="hover:bg-slate-50 transition text-slate-700">
                    <td className="py-1.5 px-3 font-bold text-emerald-800">
                      {rem.code}
                    </td>
                    <td className="py-1.5 px-3 text-center font-medium">
                      {rem.grade}
                    </td>
                    <td className="py-1.5 px-3 text-right font-mono">
                      {rem.length}" × {rem.width}" × {rem.height}"
                    </td>
                    <td className="py-1.5 px-3 text-right font-mono font-medium">
                      {Math.round(rem.volume).toLocaleString()} cu in
                    </td>
                    <td className="py-1.5 px-3 text-center font-medium text-emerald-700">
                      {rem.usability_score}
                    </td>
                    <td className="py-1.5 px-3 text-right font-mono text-[11px] text-slate-600">
                      {rem.storage_location}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
