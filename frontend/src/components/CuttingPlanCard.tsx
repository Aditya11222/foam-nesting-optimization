import React, { useState, useEffect } from 'react';
import {
  Layers,
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
  Scissors,
  Box,
} from 'lucide-react';
import type { OptimizationResult, MachineProfile, BlockLayout, CutStep } from '../types';
import { ThreeBlockView } from './ThreeBlockView';

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
  isStale: _isStale,
  is3DGenerated: _is3DGenerated,
  onGenerate3DPlan: _onGenerate3DPlan,
}) => {

  const [selectedBlockIndex, setSelectedBlockIndex] = useState<number>(0);
  const [activeCutStepNumber, setActiveCutStepNumber] = useState<number>(1);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  // Layer visibility toggles
  const [showTrim, setShowTrim] = useState<boolean>(true);
  const [showParts, setShowParts] = useState<boolean>(true);
  const [showRemnants, setShowRemnants] = useState<boolean>(true);
  const [showCutPlane, setShowCutPlane] = useState<boolean>(true);

  const activeBlock: BlockLayout | null =
    currentResult && currentResult.blocks && currentResult.blocks.length > 0
      ? currentResult.blocks[selectedBlockIndex] || currentResult.blocks[0]
      : null;

  const cuts = activeBlock?.cuts || [];
  const totalCuts = cuts.length;
  const activeCut: CutStep | undefined =
    cuts.find((c) => c.step_number === activeCutStepNumber) || cuts[0];

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
      }, 1200);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isPlaying, totalCuts]);

  // Group placed parts by SKU for the Legend
  const skuMap = React.useMemo(() => {
    if (!activeBlock) return {};
    const map: Record<string, { count: number; color: string; dims: string; grade: string }> = {};
    activeBlock.placed_parts.forEach((p) => {
      if (!map[p.sku]) {
        map[p.sku] = {
          count: 0,
          color: p.color_hex || '#3b82f6',
          dims: `${p.length}" × ${p.width}" × ${p.height}"`,
          grade: p.grade,
        };
      }
      map[p.sku].count += 1;
    });
    return map;
  }, [activeBlock]);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col h-full min-h-[580px] lg:h-[640px] overflow-hidden">
      {/* Card Header: Title + Machine Profile Name */}
      <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shrink-0">
        <div className="flex items-center space-x-2.5">
          <div className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-200">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900 leading-tight">Cutting Plan & Visualization</h2>
            <span className="text-[10px] text-slate-500 font-medium">3D Spatial Cut Simulator</span>
          </div>
        </div>

        {/* Machine Badge */}
        {selectedMachine && (
          <div className="flex items-center space-x-1.5 self-start sm:self-auto">
            <span className="text-xs font-semibold text-slate-700 bg-white border border-slate-200 px-2.5 py-1 rounded-md shadow-2xs">
              {selectedMachine.name}
            </span>
            <span className="text-[10px] font-bold text-slate-500 uppercase bg-slate-200/80 px-1.5 py-1 rounded">
              {selectedMachine.cut_type}
            </span>
          </div>
        )}
      </div>

      {/* Card Content */}
      <div className="p-4 flex-1 flex flex-col space-y-3 overflow-y-auto">
        {currentResult && activeBlock ? (
          <>
            {/* Toolbar: Block Pagination Tabs & Layer Toggles */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-xs shrink-0">
              {/* Block Selection Tabs */}
              <div className="flex items-center space-x-1.5 overflow-x-auto">
                <span className="text-[11px] font-bold text-slate-600 shrink-0">Block:</span>
                {currentResult.blocks.map((b, idx) => {
                  const isSelected = idx === selectedBlockIndex;
                  return (
                    <button
                      key={b.block_index}
                      type="button"
                      onClick={() => {
                        setSelectedBlockIndex(idx);
                        setActiveCutStepNumber(1);
                      }}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition cursor-pointer shrink-0 ${
                        isSelected
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      Block #{b.block_index} ({b.placed_parts.length} pcs)
                    </button>
                  );
                })}
              </div>

              {/* Layer Toggles */}
              <div className="flex items-center space-x-2.5 text-[11px] text-slate-600 select-none shrink-0">
                <label className="flex items-center space-x-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showTrim}
                    onChange={(e) => setShowTrim(e.target.checked)}
                    className="rounded text-blue-600 focus:ring-blue-500"
                  />
                  <span>Trim</span>
                </label>
                <label className="flex items-center space-x-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showParts}
                    onChange={(e) => setShowParts(e.target.checked)}
                    className="rounded text-blue-600 focus:ring-blue-500"
                  />
                  <span>Parts</span>
                </label>
                <label className="flex items-center space-x-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showRemnants}
                    onChange={(e) => setShowRemnants(e.target.checked)}
                    className="rounded text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>Remnants</span>
                </label>
                <label className="flex items-center space-x-1 cursor-pointer">
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

            {/* 3D Canvas Box */}
            <div className="relative rounded-lg overflow-hidden border border-slate-200 bg-slate-50 flex-1 min-h-[260px] max-h-[340px]">
              <ThreeBlockView
                layout={activeBlock}
                highlightedCut={showCutPlane ? activeCut : null}
                showTrim={showTrim}
                showParts={showParts}
                showRemnants={showRemnants}
                showCutPlane={showCutPlane}
              />

              {/* Dimension Floating Tag */}
              <div className="absolute top-2.5 left-2.5 bg-white/90 backdrop-blur-xs border border-slate-200 px-2.5 py-1 rounded text-[10px] font-mono text-slate-700 shadow-xs pointer-events-none">
                Usable: {activeBlock.usable_length}" × {activeBlock.usable_width}" × {activeBlock.usable_height}"
              </div>
            </div>

            {/* Docked Cut Stepper Bar */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 shrink-0 flex flex-col space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="p-1 rounded bg-rose-50 text-rose-600 border border-rose-200">
                    <Scissors className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-xs font-bold text-slate-800">
                    Cut {totalCuts > 0 ? `${activeCutStepNumber} of ${totalCuts}` : '0 of 0'}
                  </span>
                </div>

                {/* Stepper Buttons: Prev, Play/Pause, Next */}
                <div className="flex items-center space-x-1.5">
                  <button
                    type="button"
                    onClick={() => setActiveCutStepNumber((prev) => Math.max(1, prev - 1))}
                    disabled={activeCutStepNumber <= 1 || totalCuts === 0}
                    className="p-1 rounded bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 disabled:opacity-40 cursor-pointer"
                    title="Previous Cut"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsPlaying(!isPlaying)}
                    disabled={totalCuts === 0}
                    className={`px-2 py-1 rounded text-xs font-bold flex items-center space-x-1 transition cursor-pointer ${
                      isPlaying
                        ? 'bg-rose-600 text-white shadow-2xs'
                        : 'bg-white hover:bg-slate-100 border border-slate-200 text-slate-700'
                    }`}
                    title={isPlaying ? 'Pause Animation' : 'Auto-Animate Cut Sequence'}
                  >
                    {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                    <span className="text-[10px]">{isPlaying ? 'Pause' : 'Animate'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveCutStepNumber((prev) => Math.min(totalCuts, prev + 1))}
                    disabled={activeCutStepNumber >= totalCuts || totalCuts === 0}
                    className="p-1 rounded bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 disabled:opacity-40 cursor-pointer"
                    title="Next Cut"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Active Cut Description Readout */}
              {activeCut && (
                <div className="text-[11px] text-slate-600 bg-white border border-slate-200/80 rounded px-2.5 py-1.5 flex items-center justify-between">
                  <span className="font-semibold text-slate-800 truncate">
                    {activeCut.produces_description_en || `Cut Step #${activeCut.step_number}`}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono shrink-0 ml-2">
                    Axis {activeCut.axis} @ {activeCut.position_display} (Kerf: {activeCut.kerf_in}")
                  </span>
                </div>
              )}
            </div>

            {/* Docked SKU Color Legend */}
            <div className="shrink-0 flex items-center space-x-1.5 overflow-x-auto py-0.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0 mr-1">
                Legend:
              </span>
              {Object.entries(skuMap).map(([sku, info]) => (
                <div
                  key={sku}
                  className="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-[10px] text-slate-700 shrink-0"
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: info.color }}
                  />
                  <span className="font-bold">{sku}</span>
                  <span className="text-slate-400">({info.count})</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="h-full min-h-[300px] flex flex-col items-center justify-center p-6 text-center text-slate-400">
            <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 mb-3 border border-slate-200">
              <Box className="w-6 h-6 stroke-[1.5]" />
            </div>
            <h3 className="text-sm font-bold text-slate-700">3D Simulator Idle</h3>
            <p className="text-xs text-slate-400 max-w-xs mt-1">
              Select an algorithm on the left and click <strong>Run Selected</strong> to compute and visualize the 3D cutting layout.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
