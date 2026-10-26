import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ChevronLeft,
  ChevronRight,
  Scissors,
  Bookmark,
  Archive,
} from 'lucide-react';
import type { OptimizationResult, BlockLayout, CutStep } from '../types';
import { DATA_PALETTE, PART_PATTERN_LABELS } from '../tokens';
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
  const [showScrap, setShowScrap] = useState(true);
  const [showCutPlane, setShowCutPlane] = useState(true);

  const activeBlock: BlockLayout =
    result.blocks[selectedBlockIndex] || result.blocks[0] || null;

  if (!activeBlock) {
    return (
      <div className="p-8 text-center text-[13px] text-secondary">
        No blocks available to display.
      </div>
    );
  }

  const cuts = activeBlock.cuts || [];
  const activeCut: CutStep | undefined =
    cuts.find((c) => c.step_number === activeCutStepNumber) || cuts[0];

  // Group placed parts by SKU for the Legend
  const skuMap: Record<string, { count: number; color: string; dims: string; grade: string }> = {};
  activeBlock.placed_parts.forEach((p, idx) => {
    if (!skuMap[p.sku]) {
      skuMap[p.sku] = {
        count: 0,
        color: p.color_hex || DATA_PALETTE[idx % DATA_PALETTE.length],
        dims: `${p.length}" × ${p.width}" × ${p.height}"`,
        grade: p.grade,
      };
    }
    skuMap[p.sku].count += 1;
  });

  return (
    <div className="space-y-4">
      {/* Block Selector & Layer Toggles Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-raised p-4 rounded-card border border-hairline">
        <div className="flex items-center gap-2">
          <span className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-secondary">
            Bun:
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
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
                  className={`h-8 px-3 rounded-control text-[12px] font-medium transition cursor-pointer ${
                    isSelected ? 'btn-primary' : 'btn-secondary'
                  }`}
                >
                  Bun #{b.block_index} ({b.placed_parts.length} parts)
                </button>
              );
            })}
          </div>
        </div>

        {/* Layer Visibility Toggles */}
        <div className="flex flex-wrap items-center gap-3 text-[12px] text-ink">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={showTrim}
              onChange={(e) => setShowTrim(e.target.checked)}
              className="rounded accent-cocoa"
            />
            <span>Skin Trim</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={showParts}
              onChange={(e) => setShowParts(e.target.checked)}
              className="rounded accent-cocoa"
            />
            <span>Parts</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={showRemnants}
              onChange={(e) => setShowRemnants(e.target.checked)}
              className="rounded accent-cocoa"
            />
            <span>Remnants</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={showScrap}
              onChange={(e) => setShowScrap(e.target.checked)}
              className="rounded accent-cocoa"
            />
            <span>Scrap</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={showCutPlane}
              onChange={(e) => setShowCutPlane(e.target.checked)}
              className="rounded accent-cocoa"
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
        showScrap={showScrap}
        showCutPlane={showCutPlane}
      />

      {/* Interactive SKU Legend */}
      <div className="p-4 bg-raised border border-hairline rounded-card space-y-2">
        <span className="text-[11.5px] font-semibold text-secondary uppercase tracking-[0.06em]">
          Parts Legend (Bun #{activeBlock.block_index}):
        </span>
        <div className="flex flex-wrap gap-2">
          {Object.entries(skuMap).map(([sku, data], idx) => (
            <div
              key={sku}
              className="inline-flex items-center gap-2 px-2.5 py-1 bg-surface border border-hairline rounded-control text-[12px]"
            >
              <span
                className="w-3 h-3 rounded-xs shrink-0"
                style={{ backgroundColor: data.color }}
              />
              <span className="font-mono text-[10px] text-secondary">
                [{PART_PATTERN_LABELS[idx % PART_PATTERN_LABELS.length]}]
              </span>
              <span className="font-semibold text-ink">{sku}</span>
              <span className="text-secondary font-mono text-[11px]">({data.dims})</span>
              <span className="font-mono font-semibold text-cocoa">×{data.count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Cut Sequence Stepper Controls */}
      {cuts.length > 0 && (
        <div className="p-4 bg-surface border border-hairline rounded-card space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Scissors className="w-4 h-4 text-terracotta stroke-[1.5]" />
              <h3 className="text-[13px] font-semibold text-ink">
                Saw Cut Sequencer: Step {activeCut ? activeCut.step_number : 0} of {cuts.length}
              </h3>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setActiveCutStepNumber((prev) => Math.max(1, prev - 1))}
                disabled={activeCutStepNumber <= 1}
                className="w-8 h-8 rounded-control bg-raised border border-hairline flex items-center justify-center disabled:opacity-40 text-ink transition cursor-pointer"
                title="Previous Cut"
              >
                <ChevronLeft className="w-4 h-4 stroke-[1.5]" />
              </button>
              <button
                type="button"
                onClick={() => setActiveCutStepNumber((prev) => Math.min(cuts.length, prev + 1))}
                disabled={activeCutStepNumber >= cuts.length}
                className="w-8 h-8 rounded-control bg-raised border border-hairline flex items-center justify-center disabled:opacity-40 text-ink transition cursor-pointer"
                title="Next Cut"
              >
                <ChevronRight className="w-4 h-4 stroke-[1.5]" />
              </button>
            </div>
          </div>

          {activeCut && (
            <div className="p-3 bg-terracotta-tint/50 border border-terracotta/30 rounded-control text-[12px] space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-ink">
                  Axis {activeCut.axis} @ {activeCut.position_display} ({activeCut.cut_type.replace('_', ' ')})
                </span>
                <span className="font-mono text-secondary">
                  Kerf: {activeCut.kerf_in}&quot;
                </span>
              </div>
              <div className="text-secondary">
                {isEs ? activeCut.produces_description_es : activeCut.produces_description_en}
              </div>
              {activeCut.remnant_prompt_en && (
                <div className="text-sage font-medium flex items-center gap-1.5">
                  <Bookmark className="w-3.5 h-3.5 shrink-0 stroke-[1.5]" />
                  <span>{isEs ? activeCut.remnant_prompt_es : activeCut.remnant_prompt_en}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Predicted Remnants Summary */}
      {activeBlock.usable_remnants.length > 0 && (
        <div className="flex items-center justify-between p-3 bg-sage-tint/40 border border-sage/30 rounded-control text-[12px]">
          <span className="flex items-center gap-1.5 font-medium text-ink">
            <Archive className="w-3.5 h-3.5 text-sage stroke-[1.5]" />
            <span>Retained Remnants in Bun #{activeBlock.block_index}: {activeBlock.usable_remnants.length}</span>
          </span>
          <span className="font-mono font-semibold text-sage">
            {Math.round(activeBlock.usable_remnants.reduce((acc, r) => acc + r.volume, 0)).toLocaleString()} in³
          </span>
        </div>
      )}
    </div>
  );
};
