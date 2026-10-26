import React, { useState, useEffect, useCallback } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
  Check,
  RotateCcw,
  Box,
} from 'lucide-react';
import type {
  OptimizationResult,
  MachineProfile,
  BlockLayout,
  CutStep,
} from '../types';
import { ThreeBlockView, type CameraPreset } from './ThreeBlockView';
import { DATA_PALETTE, PART_PATTERN_LABELS, TYPOGRAPHY_SCALE } from '../tokens';

interface CuttingPlanCardProps {
  currentResult: OptimizationResult | null;
  selectedMachine?: MachineProfile;
  isStale: boolean;
  is3DGenerated: boolean;
  onGenerate3DPlan: () => void;
}

export const CuttingPlanCard: React.FC<CuttingPlanCardProps> = ({
  currentResult,
  selectedMachine,
  isStale,
  is3DGenerated,
  onGenerate3DPlan,
}) => {
  const [selectedBlockIndex, setSelectedBlockIndex] = useState<number>(0);
  const [activeCutStepNumber, setActiveCutStepNumber] = useState<number>(1);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [belowView, setBelowView] = useState<'cuts' | 'remnants'>('cuts');

  // Layer visibility toggles (chips with check marks)
  const [showTrim, setShowTrim] = useState<boolean>(true);
  const [showParts, setShowParts] = useState<boolean>(true);
  const [showRemnants, setShowRemnants] = useState<boolean>(true);
  const [showScrap, setShowScrap] = useState<boolean>(false);
  const [showCutPlane, setShowCutPlane] = useState<boolean>(true);

  // Camera presets
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('isometric');
  const [cameraResetTrigger, setCameraResetTrigger] = useState<number>(0);

  const activeBlock: BlockLayout | null =
    currentResult && currentResult.blocks && currentResult.blocks.length > 0
      ? currentResult.blocks[selectedBlockIndex] || currentResult.blocks[0]
      : null;

  const cuts = activeBlock?.cuts || [];
  const totalCuts = cuts.length;
  const activeCut: CutStep | undefined =
    cuts.find((c) => c.step_number === activeCutStepNumber) || cuts[0];

  const isFreeNesting = selectedMachine?.cut_type === 'free';

  // Auto-play animation timer
  useEffect(() => {
    let interval: any = null;
    if (isPlaying && totalCuts > 0) {
      interval = setInterval(() => {
        setActiveCutStepNumber((prev) => {
          if (prev >= totalCuts) {
            setIsPlaying(false);
            return 1;
          }
          return prev + 1;
        });
      }, 1100);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isPlaying, totalCuts]);

  // Keyboard Left/Right arrow navigation for cut stepper
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (totalCuts === 0) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setActiveCutStepNumber((prev) => Math.max(1, prev - 1));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setActiveCutStepNumber((prev) => Math.min(totalCuts, prev + 1));
      }
    },
    [totalCuts]
  );

  // Group placed parts by SKU for the docked bottom-right legend
  const skuEntries = React.useMemo(() => {
    if (!activeBlock) return [];
    const map = new Map<
      string,
      { sku: string; count: number; color: string; dims: string; pattern: string }
    >();
    activeBlock.placed_parts.forEach((p, idx) => {
      const existing = map.get(p.sku);
      if (existing) {
        existing.count += 1;
      } else {
        const groupIdx = map.size;
        map.set(p.sku, {
          sku: p.sku,
          count: 1,
          color: p.color_hex || DATA_PALETTE[groupIdx % DATA_PALETTE.length],
          dims: `${p.length}×${p.width}×${p.height} in`,
          pattern: PART_PATTERN_LABELS[idx % PART_PATTERN_LABELS.length],
        });
      }
    });
    return Array.from(map.values());
  }, [activeBlock]);

  const canGenerate3D = Boolean(currentResult && !isStale && currentResult.validation?.is_valid);
  const generateDisabledReason = !currentResult
    ? 'Run optimization first to generate a valid placement result'
    : isStale
    ? 'Inputs changed — re-run optimization before generating the 3D cutting plan'
    : !currentResult.validation?.is_valid
    ? 'Validation errors detected — resolve infeasible dimensions first'
    : 'Generate interactive 3D cutting plan';

  const progressPct = totalCuts > 0 ? Math.round((activeCutStepNumber / totalCuts) * 100) : 0;

  return (
    <section
      aria-label="Cutting Plan and 3D Visualization"
      onKeyDown={handleKeyDown}
      tabIndex={0}
      className="bg-surface rounded-card border border-hairline shadow-card flex flex-col h-full min-h-[620px] lg:h-[680px] overflow-hidden focus:outline-none"
    >
      {/* Card Header */}
      <div className="p-5 border-b border-hairline flex flex-col sm:flex-row sm:items-center justify-between gap-2 shrink-0">
        <div>
          <h2 className={`${TYPOGRAPHY_SCALE.cardTitle} text-ink`}>
            {selectedMachine ? selectedMachine.name : 'Cutting plan & 3D visualization'}
          </h2>
          <p className="text-[12px] text-secondary mt-0.5">
            {isFreeNesting
              ? 'CNC contour toolpath · Active part highlighted in Terracotta'
              : 'Orthogonal guillotine slicing · Use Left/Right arrows to step cuts'}
          </p>
        </div>

        {/* Block Selector Tabs */}
        {currentResult && currentResult.blocks.length > 0 && (
          <div
            role="tablist"
            aria-label="Select Foam Block"
            className="inline-flex items-center rounded-control bg-raised p-1 border border-hairline overflow-x-auto shrink-0"
          >
            {currentResult.blocks.map((b, idx) => {
              const isSelected = idx === selectedBlockIndex;
              return (
                <button
                  key={b.block_index}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  onClick={() => {
                    setSelectedBlockIndex(idx);
                    setActiveCutStepNumber(1);
                  }}
                  className={`px-2.5 py-1 rounded-sm text-[12px] font-mono transition duration-150 cursor-pointer whitespace-nowrap ${
                    isSelected
                      ? 'bg-cocoa-tint text-cocoa font-semibold'
                      : 'text-secondary hover:text-ink'
                  }`}
                >
                  Bun #{b.block_index} ({b.placed_parts.length})
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Card Body */}
      <div className="p-5 flex-1 flex flex-col space-y-4 overflow-y-auto">
        {currentResult && activeBlock && is3DGenerated && !isStale ? (
          <>
            {/* 3D Viewport Container (min-h 360px, 16px inset non-overlapping HUD) */}
            <div className="relative rounded-control overflow-hidden border border-hairline min-h-[360px] flex-1">
              <ThreeBlockView
                layout={activeBlock}
                highlightedCut={showCutPlane ? activeCut : null}
                showTrim={showTrim}
                showParts={showParts}
                showRemnants={showRemnants}
                showScrap={showScrap}
                showCutPlane={showCutPlane}
                cameraPreset={cameraPreset}
                cameraResetTrigger={cameraResetTrigger}
                isFreeNesting={isFreeNesting}
              />

              {/* Top-Left Docked Layer Toggle Chips (16px from edge) */}
              <div
                role="group"
                aria-label="3D Layer Visibility Toggles"
                className="absolute top-4 left-4 flex flex-wrap items-center gap-1.5 max-w-[58%] z-10"
              >
                {[
                  { label: 'Trim', active: showTrim, toggle: () => setShowTrim(!showTrim) },
                  { label: 'Parts', active: showParts, toggle: () => setShowParts(!showParts) },
                  { label: 'Remnants', active: showRemnants, toggle: () => setShowRemnants(!showRemnants) },
                  { label: 'Scrap', active: showScrap, toggle: () => setShowScrap(!showScrap) },
                  {
                    label: isFreeNesting ? 'Part highlight' : 'Cut plane',
                    active: showCutPlane,
                    toggle: () => setShowCutPlane(!showCutPlane),
                  },
                ].map((chip) => (
                  <button
                    key={chip.label}
                    type="button"
                    aria-pressed={chip.active}
                    onClick={chip.toggle}
                    className={`inline-flex items-center space-x-1 px-2 py-1 rounded-sm text-[11.5px] font-medium border transition duration-150 cursor-pointer whitespace-nowrap ${
                      chip.active
                        ? 'bg-cocoa-tint text-cocoa border-strong'
                        : 'bg-surface/90 text-secondary border-hairline hover:text-ink'
                    }`}
                  >
                    {chip.active && <Check className="w-3 h-3 stroke-[2]" />}
                    <span>{chip.label}</span>
                  </button>
                ))}
              </div>

              {/* Top-Right Docked Camera Presets & Reset (16px from edge) */}
              <div
                role="group"
                aria-label="3D Camera View Presets"
                className="absolute top-4 right-4 flex items-center gap-1 bg-surface/95 p-1 rounded-control border border-hairline shadow-card z-10"
              >
                {(
                  [
                    { id: 'isometric', label: 'Iso' },
                    { id: 'top', label: 'Top' },
                    { id: 'front', label: 'Front' },
                    { id: 'side', label: 'Side' },
                  ] as { id: CameraPreset; label: string }[]
                ).map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setCameraPreset(preset.id)}
                    className={`px-2 py-0.5 rounded-sm text-[11.5px] font-medium transition duration-150 cursor-pointer ${
                      cameraPreset === preset.id
                        ? 'bg-cocoa-tint text-cocoa font-semibold'
                        : 'text-secondary hover:text-ink'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setCameraPreset('isometric');
                    setCameraResetTrigger((c) => c + 1);
                  }}
                  title="Reset camera view"
                  aria-label="Reset camera view"
                  className="p-1 rounded-sm text-secondary hover:text-ink cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5 stroke-[1.5]" />
                </button>
              </div>

              {/* Bottom-Center Docked Cut Stepper with Progress Strip (16px from bottom) */}
              <div className="absolute bottom-4 left-4 right-4 xl:right-52 flex justify-center pointer-events-none z-10">
                <div className="pointer-events-auto bg-surface/95 border border-hairline rounded-control shadow-card px-3 py-2 flex flex-col space-y-1.5 min-w-[260px] max-w-md w-full">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center space-x-1.5">
                      <button
                        type="button"
                        aria-label="Previous cut step"
                        disabled={activeCutStepNumber <= 1 || totalCuts === 0}
                        onClick={() =>
                          setActiveCutStepNumber((prev) => Math.max(1, prev - 1))
                        }
                        className="p-1 rounded-sm border border-strong bg-surface text-ink hover:bg-raised disabled:opacity-40 cursor-pointer"
                      >
                        <ChevronLeft className="w-3.5 h-3.5 stroke-[1.5]" />
                      </button>

                      <button
                        type="button"
                        aria-label={isPlaying ? 'Pause cut animation' : 'Play cut animation'}
                        disabled={totalCuts === 0}
                        onClick={() => setIsPlaying(!isPlaying)}
                        className="px-2 py-0.5 rounded-sm border border-strong bg-cocoa-tint text-cocoa text-[11.5px] font-medium inline-flex items-center space-x-1 cursor-pointer"
                      >
                        {isPlaying ? (
                          <Pause className="w-3 h-3 stroke-[1.5]" />
                        ) : (
                          <Play className="w-3 h-3 stroke-[1.5]" />
                        )}
                        <span>{isPlaying ? 'Pause' : 'Step'}</span>
                      </button>

                      <button
                        type="button"
                        aria-label="Next cut step"
                        disabled={activeCutStepNumber >= totalCuts || totalCuts === 0}
                        onClick={() =>
                          setActiveCutStepNumber((prev) => Math.min(totalCuts, prev + 1))
                        }
                        className="p-1 rounded-sm border border-strong bg-surface text-ink hover:bg-raised disabled:opacity-40 cursor-pointer"
                      >
                        <ChevronRight className="w-3.5 h-3.5 stroke-[1.5]" />
                      </button>
                    </div>

                    <div className="font-mono text-[11.5px] text-ink tabular-nums truncate">
                      Cut {totalCuts > 0 ? `${activeCutStepNumber}/${totalCuts}` : '0/0'}
                      {activeCut ? ` · ${activeCut.axis} = ${activeCut.position_display}` : ''}
                    </div>
                  </div>

                  {/* Thin Progress Strip */}
                  <div className="w-full h-1 bg-raised rounded-full overflow-hidden">
                    <div
                      className="h-full bg-terracotta transition-all duration-200"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Bottom-Right Docked SKU Legend in Cream Card (16px from edge) */}
              <div className="hidden xl:block absolute bottom-4 right-4 bg-surface/95 border border-hairline rounded-control shadow-card p-2.5 w-44 max-h-36 overflow-y-auto z-10">
                <div className="text-[10.5px] font-medium uppercase tracking-[0.06em] text-secondary mb-1.5">
                  SKU Legend
                </div>
                <div className="space-y-1">
                  {skuEntries.map((item) => (
                    <div
                      key={item.sku}
                      className="flex items-center justify-between text-[11.5px] gap-1.5"
                    >
                      <div className="flex items-center space-x-1.5 min-w-0">
                        <span
                          className="w-3 h-3 rounded-sm border border-strong shrink-0"
                          style={{ backgroundColor: item.color }}
                        />
                        <span className="text-ink truncate" title={`${item.sku} (${item.dims})`}>
                          {item.sku}
                        </span>
                      </div>
                      <span className="font-mono text-secondary tabular-nums shrink-0">
                        ×{item.count}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Below-Canvas Ordered Cut List & Remnants Table */}
            <div className="border border-hairline rounded-control overflow-hidden shrink-0">
              <div className="bg-raised px-3 py-1.5 border-b border-hairline flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => setBelowView('cuts')}
                    className={`px-2 py-0.5 rounded-sm text-[12px] font-medium cursor-pointer ${
                      belowView === 'cuts'
                        ? 'bg-cocoa-tint text-cocoa font-semibold'
                        : 'text-secondary hover:text-ink'
                    }`}
                  >
                    Ordered cut list ({cuts.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setBelowView('remnants')}
                    className={`px-2 py-0.5 rounded-sm text-[12px] font-medium cursor-pointer ${
                      belowView === 'remnants'
                        ? 'bg-cocoa-tint text-cocoa font-semibold'
                        : 'text-secondary hover:text-ink'
                    }`}
                  >
                    Retained remnants ({activeBlock.usable_remnants.length})
                  </button>
                </div>

                <span className="font-mono text-[11.5px] text-secondary tabular-nums">
                  Usable: {activeBlock.usable_length}×{activeBlock.usable_width}×{activeBlock.usable_height} in
                </span>
              </div>

              {belowView === 'cuts' ? (
                <div className="max-h-32 overflow-y-auto">
                  <table className="w-full text-left border-collapse text-[12px]">
                    <thead className="sticky top-0 bg-surface border-b border-hairline">
                      <tr className="h-8 text-secondary font-mono">
                        <th className="px-3">#</th>
                        <th className="px-3">Axis</th>
                        <th className="px-3 text-right">Position</th>
                        <th className="px-3">Resulting piece</th>
                        <th className="px-3 text-right">Offcut</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-hairline font-mono tabular-nums">
                      {cuts.map((c) => {
                        const isCurr = c.step_number === activeCutStepNumber;
                        return (
                          <tr
                            key={c.step_number}
                            onClick={() => setActiveCutStepNumber(c.step_number)}
                            className={`h-8 cursor-pointer transition-colors ${
                              isCurr ? 'bg-terracotta-tint/70 font-medium' : 'hover:bg-row-hover'
                            }`}
                          >
                            <td className="px-3 text-ink">{c.step_number}</td>
                            <td className="px-3 text-ink">{c.axis}</td>
                            <td className="px-3 text-right text-ink">{c.position_display}</td>
                            <td className="px-3 font-sans text-secondary truncate max-w-[180px]" title={c.produces_description_en}>
                              {c.produces_description_en}
                            </td>
                            <td className="px-3 text-right">
                              {c.remnant_prompt_en ? (
                                <span className="text-sage font-medium">Keep</span>
                              ) : (
                                <span className="text-muted">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="max-h-32 overflow-y-auto">
                  {activeBlock.usable_remnants.length > 0 ? (
                    <table className="w-full text-left border-collapse text-[12px]">
                      <thead className="sticky top-0 bg-surface border-b border-hairline">
                        <tr className="h-8 text-secondary font-mono">
                          <th className="px-3">Remnant code</th>
                          <th className="px-3 text-right">Dimensions (in)</th>
                          <th className="px-3 text-right">Volume (cu ft)</th>
                          <th className="px-3 text-right">Rack</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-hairline font-mono tabular-nums">
                        {activeBlock.usable_remnants.map((r) => (
                          <tr key={r.id} className="h-8 hover:bg-row-hover">
                            <td className="px-3 text-sage font-medium">{r.code}</td>
                            <td className="px-3 text-right text-ink">
                              {r.length}×{r.width}×{r.height}
                            </td>
                            <td className="px-3 text-right text-secondary">
                              {(r.volume / 1728).toFixed(2)}
                            </td>
                            <td className="px-3 text-right text-secondary">
                              {r.storage_location}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="p-3 text-center text-[12px] text-secondary">
                      No offcuts met the minimum remnant volume threshold in this block.
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        ) : (
          /* Empty / Stale Readiness State for 3D Plan */
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6 border border-dashed border-strong rounded-control space-y-3">
            <div className="w-10 h-10 rounded-control bg-raised text-cocoa flex items-center justify-center border border-hairline">
              <Box className="w-5 h-5 stroke-[1.5]" />
            </div>
            <div className="max-w-xs space-y-1">
              <h3 className="text-[15px] font-semibold text-ink">
                {isStale
                  ? '3D cutting plan paused (inputs changed)'
                  : 'Interactive 3D cutting plan'}
              </h3>
              <p className="text-[13px] text-secondary">
                {generateDisabledReason}.
              </p>
            </div>
            <button
              type="button"
              disabled={!canGenerate3D}
              onClick={onGenerate3DPlan}
              title={generateDisabledReason}
              className="btn-primary inline-flex items-center space-x-2 cursor-pointer"
            >
              <span>Generate 3D cutting plan</span>
            </button>
          </div>
        )}
      </div>
    </section>
  );
};
