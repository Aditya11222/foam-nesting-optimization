import React from 'react';
import {
  Plus,
  Trash2,
  RotateCcw,
  ArrowRight,
  AlertCircle,
} from 'lucide-react';
import type {
  FoamGrade,
  MachineProfile,
  BlockInput,
  PartItem,
  OrientationMode,
} from '../types';
import { DATA_PALETTE, PART_PATTERN_LABELS, TYPOGRAPHY_SCALE } from '../tokens';
import { formatFraction16th } from '../engine/units';

interface SidebarInputsProps {
  mode?: 'sidebar' | 'card';
  onContinueToOptimization?: () => void;
  grades: FoamGrade[];
  selectedGrade: string;
  onSelectGrade: (grade: string) => void;
  allowMixedGrades: boolean;
  onToggleMixedGrades: (allowed: boolean) => void;
  machines: MachineProfile[];
  selectedMachineId: string;
  onSelectMachine: (id: string) => void;
  machineObjective: 'lowest_cost' | 'best_yield' | 'lowest_time';
  onSelectMachineObjective: (obj: 'lowest_cost' | 'best_yield' | 'lowest_time') => void;
  skinTrim: number;
  onChangeSkinTrim: (val: number) => void;
  kerf: number;
  onChangeKerf: (val: number) => void;
  blocks: BlockInput[];
  onAddBlock: () => void;
  onRemoveBlock: (idx: number) => void;
  onUpdateBlock: (idx: number, updated: Partial<BlockInput>) => void;
  parts: PartItem[];
  onAddPart: () => void;
  onRemovePart: (idx: number) => void;
  onUpdatePart: (idx: number, updated: Partial<PartItem>) => void;
  onLoadSample: () => void;
  onInputModified: () => void;
}

function snap16(val: number): number {
  return Math.max(0.0625, Math.round(val * 16) / 16);
}

export const SidebarInputs: React.FC<SidebarInputsProps> = ({
  onContinueToOptimization,
  grades,
  selectedGrade,
  onSelectGrade,
  allowMixedGrades,
  onToggleMixedGrades,
  machines,
  selectedMachineId,
  onSelectMachine,
  machineObjective,
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
}) => {
  const activeMachine = machines.find((m) => m.id === selectedMachineId) || machines[0];
  const primaryBlock = blocks[0] || {
    nominal_length: 108,
    nominal_width: 82,
    nominal_height: 40,
  };

  const usableL = Math.max(0, primaryBlock.nominal_length - 2 * skinTrim);
  const usableW = Math.max(0, primaryBlock.nominal_width - 2 * skinTrim);
  const usableH = Math.max(0, primaryBlock.nominal_height - 2 * skinTrim);

  const totalPieces = parts.reduce((acc, p) => acc + p.quantity, 0);
  const totalBlocksCount = blocks.reduce((acc, b) => acc + b.quantity, 0);

  const trimWarning =
    skinTrim < 0 || skinTrim > 4
      ? 'Skin trim must be between 0 in and 4 in (snapped to 1/16 in).'
      : null;
  const kerfWarning =
    kerf <= 0 || kerf > 1
      ? 'Blade kerf must be between 1/16 in and 1 in.'
      : null;

  return (
    <div className="max-w-workbench mx-auto space-y-6">
      {/* Section 1: Global Parameters Card (12-Column Form Grid) */}
      <section className="bg-surface rounded-card border border-hairline shadow-card overflow-hidden">
        <div className="p-5 border-b border-hairline flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className={`${TYPOGRAPHY_SCALE.cardTitle} text-ink`}>
              Manufacturing setup & stock parameters
            </h2>
            <p className="text-[14px] leading-[22px] text-secondary mt-1">
              Configure foam grade, saw station kerf, perimeter skin trim, and bun dimensions. All dimensions snap to 1/16 in.
            </p>
          </div>

          <div className="flex items-center space-x-3 shrink-0">
            <button
              type="button"
              onClick={onLoadSample}
              className="btn-secondary inline-flex items-center space-x-2 cursor-pointer whitespace-nowrap"
            >
              <RotateCcw className="w-4 h-4 stroke-[1.5]" />
              <span>Load sample (Job #4821)</span>
            </button>

            {onContinueToOptimization && (
              <button
                type="button"
                onClick={onContinueToOptimization}
                className="btn-primary inline-flex items-center space-x-2 cursor-pointer whitespace-nowrap"
              >
                <span>Continue to optimization</span>
                <ArrowRight className="w-4 h-4 stroke-[1.5]" />
              </button>
            )}
          </div>
        </div>

        {/* Card Body: 12-Column Grid */}
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
            {/* Foam Grade (3 cols) */}
            <div className="md:col-span-3">
              <label
                htmlFor="setup-grade"
                className={`block mb-1.5 ${TYPOGRAPHY_SCALE.labelUppercase}`}
              >
                Foam grade
              </label>
              <select
                id="setup-grade"
                value={selectedGrade}
                onChange={(e) => onSelectGrade(e.target.value)}
                className="w-full h-10 rounded-control border border-strong bg-surface px-3 text-[14px] font-medium text-ink"
              >
                {grades.map((g) => (
                  <option key={g.code} value={g.code}>
                    {g.code} — {g.name} ({g.density_pcf} PCF)
                  </option>
                ))}
              </select>
            </div>

            {/* Machine Profile (4 cols) */}
            <div className="md:col-span-4">
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="setup-machine"
                  className={TYPOGRAPHY_SCALE.labelUppercase}
                >
                  Machine profile
                </label>
                {activeMachine && (
                  <span className="text-[11.5px] font-mono text-secondary">
                    {activeMachine.cut_type === 'free' ? 'Waterjet / CNC' : 'Guillotine'} · Max H: {activeMachine.max_cut_height} in · Kerf: {formatFraction16th(activeMachine.kerf)}
                  </span>
                )}
              </div>
              <select
                id="setup-machine"
                value={selectedMachineId}
                onChange={(e) => onSelectMachine(e.target.value)}
                className="w-full h-10 rounded-control border border-strong bg-surface px-3 text-[14px] font-medium text-ink"
              >
                {machines.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.cut_type === 'free' ? 'Free Contour' : 'Guillotine'})
                  </option>
                ))}
                <option value="auto" disabled>
                  Auto Machine Assignment (planned, not yet available)
                </option>
              </select>
            </div>

            {/* Skin Trim per Face (2 cols) */}
            <div className="md:col-span-2">
              <label
                htmlFor="setup-trim"
                className={`block mb-1.5 ${TYPOGRAPHY_SCALE.labelUppercase}`}
              >
                Skin trim / face
              </label>
              <div className="relative flex items-center">
                <input
                  id="setup-trim"
                  type="number"
                  step="0.0625"
                  min="0"
                  max="4"
                  value={skinTrim}
                  onChange={(e) => {
                    const raw = parseFloat(e.target.value);
                    onChangeSkinTrim(isNaN(raw) ? 0 : Math.max(0, Math.round(raw * 16) / 16));
                    onInputModified();
                  }}
                  className="w-full h-10 rounded-control border border-strong bg-surface pl-3 pr-9 text-[13px] font-mono tabular-nums text-ink text-right"
                />
                <span className="absolute right-3 text-[12px] font-mono text-muted pointer-events-none">
                  in
                </span>
              </div>
            </div>

            {/* Blade Kerf Allowance (3 cols) */}
            <div className="md:col-span-3">
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="setup-kerf"
                  className={TYPOGRAPHY_SCALE.labelUppercase}
                >
                  Blade kerf
                </label>
                <span className="text-[11.5px] font-mono text-secondary">
                  {formatFraction16th(kerf)}
                </span>
              </div>
              <div className="relative flex items-center">
                <input
                  id="setup-kerf"
                  type="number"
                  step="0.0625"
                  min="0.0625"
                  max="1"
                  value={kerf}
                  onChange={(e) => {
                    const raw = parseFloat(e.target.value);
                    onChangeKerf(isNaN(raw) ? 0.0625 : snap16(raw));
                    onInputModified();
                  }}
                  className="w-full h-10 rounded-control border border-strong bg-surface pl-3 pr-9 text-[13px] font-mono tabular-nums text-ink text-right"
                />
                <span className="absolute right-3 text-[12px] font-mono text-muted pointer-events-none">
                  in
                </span>
              </div>
            </div>
          </div>

          {/* Inline Validation Banner if needed */}
          {(trimWarning || kerfWarning) && (
            <div className="flex items-center space-x-2 px-3 py-2 rounded-control bg-status-warning-tint border border-status-warning text-ink text-[13px]">
              <AlertCircle className="w-4 h-4 stroke-[1.5] text-status-warning shrink-0" />
              <span>{trimWarning || kerfWarning}</span>
            </div>
          )}

          {/* Live Usable Interior Readout & Mixed Grades Switch */}
          <div className="pt-3 border-t border-hairline flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3 text-[13px] text-secondary">
              <span>Live usable interior (nominal − 2 × trim):</span>
              <span className="font-mono font-medium text-ink bg-raised px-2.5 py-1 rounded-sm border border-hairline tabular-nums">
                {usableL.toFixed(2)} in × {usableW.toFixed(2)} in × {usableH.toFixed(2)} in
              </span>
              <span className="text-[12px] text-muted font-mono">
                ({((usableL * usableW * usableH) / 1728).toFixed(1)} cu ft usable)
              </span>
            </div>

            <div className="flex items-center space-x-4">
              {/* Objective Selector */}
              <div className="flex items-center space-x-2">
                <span className="text-[12px] text-secondary">Objective:</span>
                <select
                  aria-label="Optimization Objective"
                  value={machineObjective}
                  onChange={(e) => {
                    onSelectMachineObjective(e.target.value as any);
                    onInputModified();
                  }}
                  className="h-8 rounded-control border border-strong bg-surface px-2.5 text-[12.5px] font-medium text-ink"
                >
                  <option value="lowest_cost">Lowest cost</option>
                  <option value="best_yield">Best yield</option>
                  <option value="lowest_time">Lowest saw time</option>
                </select>
              </div>

              {/* Mixed Grades Toggle */}
              <label className="inline-flex items-center space-x-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={allowMixedGrades}
                  onChange={(e) => onToggleMixedGrades(e.target.checked)}
                  className="w-4 h-4 rounded-sm border-strong text-cocoa focus:ring-cocoa"
                />
                <span className="text-[13px] text-secondary">Mixed grades</span>
              </label>
            </div>
          </div>
        </div>
      </section>

      {/* Section 2: Available Raw Bun Blocks Table */}
      <section className="bg-surface rounded-card border border-hairline shadow-card overflow-hidden">
        <div className="p-5 border-b border-hairline flex items-center justify-between">
          <div>
            <h3 className={`${TYPOGRAPHY_SCALE.cardTitle} text-ink`}>
              Available foam blocks
            </h3>
            <p className="text-[13px] text-secondary mt-1">
              {totalBlocksCount} total block{totalBlocksCount === 1 ? '' : 's'} in stock ({blocks.length} size profile{blocks.length === 1 ? '' : 's'})
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              onAddBlock();
              onInputModified();
            }}
            className="btn-secondary inline-flex items-center space-x-2 cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[1.5]" />
            <span>Add block</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="h-10 bg-raised border-b border-hairline">
                <th className={`px-4 ${TYPOGRAPHY_SCALE.labelUppercase}`}>Block ID</th>
                <th className={`px-4 ${TYPOGRAPHY_SCALE.labelUppercase}`}>Grade</th>
                <th className={`px-4 text-right ${TYPOGRAPHY_SCALE.labelUppercase}`}>Length (in)</th>
                <th className={`px-4 text-right ${TYPOGRAPHY_SCALE.labelUppercase}`}>Width (in)</th>
                <th className={`px-4 text-right ${TYPOGRAPHY_SCALE.labelUppercase}`}>Height (in)</th>
                <th className={`px-4 text-right ${TYPOGRAPHY_SCALE.labelUppercase}`}>Usable interior (in)</th>
                <th className={`px-4 text-right ${TYPOGRAPHY_SCALE.labelUppercase}`}>Qty</th>
                <th className={`px-4 text-right ${TYPOGRAPHY_SCALE.labelUppercase}`}>Remove</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline text-[13px]">
              {blocks.map((b, idx) => {
                const uL = Math.max(0, b.nominal_length - 2 * skinTrim);
                const uW = Math.max(0, b.nominal_width - 2 * skinTrim);
                const uH = Math.max(0, b.nominal_height - 2 * skinTrim);

                return (
                  <tr key={b.id || idx} className="h-11 hover:bg-row-hover transition-colors">
                    <td className="px-4 font-mono text-ink font-medium">
                      {b.id || `bun-${idx + 1}`}
                    </td>
                    <td className="px-4">
                      {allowMixedGrades ? (
                        <select
                          aria-label={`Block ${idx + 1} grade`}
                          value={b.grade}
                          onChange={(e) => {
                            onUpdateBlock(idx, { grade: e.target.value });
                            onInputModified();
                          }}
                          className="h-8 rounded-control border border-strong bg-surface px-2 text-[12.5px] font-mono text-ink"
                        >
                          {grades.map((g) => (
                            <option key={g.code} value={g.code}>
                              {g.code}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="font-mono text-[12.5px] text-secondary">
                          {b.grade}
                        </span>
                      )}
                    </td>
                    <td className="px-4 text-right">
                      <div className="inline-flex items-center justify-end relative">
                        <input
                          type="number"
                          step="0.0625"
                          min="1"
                          aria-label={`Block ${idx + 1} length`}
                          value={b.nominal_length}
                          onChange={(e) => {
                            onUpdateBlock(idx, {
                              nominal_length: snap16(parseFloat(e.target.value) || 1),
                            });
                            onInputModified();
                          }}
                          className="w-24 h-8 rounded-control border border-strong bg-surface pl-2 pr-6 font-mono text-[12.5px] tabular-nums text-right text-ink"
                        />
                        <span className="absolute right-2 text-[11px] font-mono text-muted pointer-events-none">
                          in
                        </span>
                      </div>
                    </td>
                    <td className="px-4 text-right">
                      <div className="inline-flex items-center justify-end relative">
                        <input
                          type="number"
                          step="0.0625"
                          min="1"
                          aria-label={`Block ${idx + 1} width`}
                          value={b.nominal_width}
                          onChange={(e) => {
                            onUpdateBlock(idx, {
                              nominal_width: snap16(parseFloat(e.target.value) || 1),
                            });
                            onInputModified();
                          }}
                          className="w-24 h-8 rounded-control border border-strong bg-surface pl-2 pr-6 font-mono text-[12.5px] tabular-nums text-right text-ink"
                        />
                        <span className="absolute right-2 text-[11px] font-mono text-muted pointer-events-none">
                          in
                        </span>
                      </div>
                    </td>
                    <td className="px-4 text-right">
                      <div className="inline-flex items-center justify-end relative">
                        <input
                          type="number"
                          step="0.0625"
                          min="1"
                          aria-label={`Block ${idx + 1} height`}
                          value={b.nominal_height}
                          onChange={(e) => {
                            onUpdateBlock(idx, {
                              nominal_height: snap16(parseFloat(e.target.value) || 1),
                            });
                            onInputModified();
                          }}
                          className="w-24 h-8 rounded-control border border-strong bg-surface pl-2 pr-6 font-mono text-[12.5px] tabular-nums text-right text-ink"
                        />
                        <span className="absolute right-2 text-[11px] font-mono text-muted pointer-events-none">
                          in
                        </span>
                      </div>
                    </td>
                    <td className="px-4 text-right font-mono text-[12.5px] tabular-nums text-secondary">
                      {uL.toFixed(1)} × {uW.toFixed(1)} × {uH.toFixed(1)}
                    </td>
                    <td className="px-4 text-right">
                      <input
                        type="number"
                        min="1"
                        aria-label={`Block ${idx + 1} quantity`}
                        value={b.quantity}
                        onChange={(e) => {
                          onUpdateBlock(idx, {
                            quantity: Math.max(1, parseInt(e.target.value) || 1),
                          });
                          onInputModified();
                        }}
                        className="w-16 h-8 rounded-control border border-strong bg-surface px-2 font-mono text-[12.5px] tabular-nums text-right text-ink"
                      />
                    </td>
                    <td className="px-4 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          onRemoveBlock(idx);
                          onInputModified();
                        }}
                        disabled={blocks.length <= 1}
                        title={
                          blocks.length <= 1
                            ? 'At least one stock block is required'
                            : 'Remove block row'
                        }
                        aria-label={`Remove block ${idx + 1}`}
                        className="p-1.5 rounded-control text-secondary hover:text-status-error disabled:opacity-40 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4 stroke-[1.5]" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Section 3: Parts Demand Table */}
      <section className="bg-surface rounded-card border border-hairline shadow-card overflow-hidden">
        <div className="p-5 border-b border-hairline flex items-center justify-between">
          <div>
            <h3 className={`${TYPOGRAPHY_SCALE.cardTitle} text-ink`}>
              Parts demand schedule
            </h3>
            <p className="text-[13px] text-secondary mt-1">
              Running total: <strong className="font-mono text-ink">{totalPieces}</strong> pieces across <strong className="font-mono text-ink">{parts.length}</strong> SKU{parts.length === 1 ? '' : 's'}
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              onAddPart();
              onInputModified();
            }}
            className="btn-secondary inline-flex items-center space-x-2 cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[1.5]" />
            <span>Add part</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="h-10 bg-raised border-b border-hairline">
                <th className={`px-4 ${TYPOGRAPHY_SCALE.labelUppercase}`}>SKU / Name</th>
                <th className={`px-4 ${TYPOGRAPHY_SCALE.labelUppercase}`}>Swatch</th>
                <th className={`px-4 ${TYPOGRAPHY_SCALE.labelUppercase}`}>Grade</th>
                <th className={`px-4 text-right ${TYPOGRAPHY_SCALE.labelUppercase}`}>Length (in)</th>
                <th className={`px-4 text-right ${TYPOGRAPHY_SCALE.labelUppercase}`}>Width (in)</th>
                <th className={`px-4 text-right ${TYPOGRAPHY_SCALE.labelUppercase}`}>Height (in)</th>
                <th className={`px-4 text-right ${TYPOGRAPHY_SCALE.labelUppercase}`}>Qty</th>
                <th className={`px-4 ${TYPOGRAPHY_SCALE.labelUppercase}`}>Rotation rule</th>
                <th className={`px-4 text-right ${TYPOGRAPHY_SCALE.labelUppercase}`}>Remove</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline text-[13px]">
              {parts.map((p, idx) => {
                const paletteColor = p.color_hex || DATA_PALETTE[idx % DATA_PALETTE.length];
                const patternLabel = PART_PATTERN_LABELS[idx % PART_PATTERN_LABELS.length];

                return (
                  <tr key={p.id} className="h-11 hover:bg-row-hover transition-colors">
                    <td className="px-4">
                      <div className="flex items-center space-x-2">
                        <input
                          type="text"
                          aria-label={`Part ${idx + 1} SKU`}
                          value={p.sku}
                          onChange={(e) => {
                            onUpdatePart(idx, { sku: e.target.value, name: e.target.value });
                            onInputModified();
                          }}
                          className="w-36 h-8 rounded-control border border-strong bg-surface px-2.5 text-[13px] font-medium text-ink"
                        />
                      </div>
                    </td>
                    <td className="px-4">
                      <div className="flex items-center space-x-2">
                        <select
                          aria-label={`Part ${idx + 1} color swatch`}
                          value={paletteColor}
                          onChange={(e) => {
                            onUpdatePart(idx, { color_hex: e.target.value });
                            onInputModified();
                          }}
                          className="h-8 rounded-control border border-strong bg-surface px-2 text-[12px] font-mono text-ink"
                        >
                          {DATA_PALETTE.map((hex, cIdx) => (
                            <option key={hex} value={hex}>
                              #{cIdx + 1} {PART_PATTERN_LABELS[cIdx]}
                            </option>
                          ))}
                        </select>
                        <span
                          className="w-4 h-4 rounded-sm border border-strong shrink-0"
                          style={{ backgroundColor: paletteColor }}
                          title={`Swatch ${patternLabel}`}
                        />
                      </div>
                    </td>
                    <td className="px-4">
                      {allowMixedGrades ? (
                        <select
                          aria-label={`Part ${idx + 1} grade`}
                          value={p.grade}
                          onChange={(e) => {
                            onUpdatePart(idx, { grade: e.target.value });
                            onInputModified();
                          }}
                          className="h-8 rounded-control border border-strong bg-surface px-2 text-[12.5px] font-mono text-ink"
                        >
                          {grades.map((g) => (
                            <option key={g.code} value={g.code}>
                              {g.code}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="font-mono text-[12.5px] text-secondary">
                          {p.grade}
                        </span>
                      )}
                    </td>
                    <td className="px-4 text-right">
                      <div className="inline-flex items-center justify-end relative">
                        <input
                          type="number"
                          step="0.0625"
                          min="0.0625"
                          aria-label={`Part ${idx + 1} length`}
                          value={p.length}
                          onChange={(e) => {
                            onUpdatePart(idx, {
                              length: snap16(parseFloat(e.target.value) || 1),
                            });
                            onInputModified();
                          }}
                          className="w-20 h-8 rounded-control border border-strong bg-surface pl-2 pr-6 font-mono text-[12.5px] tabular-nums text-right text-ink"
                        />
                        <span className="absolute right-2 text-[11px] font-mono text-muted pointer-events-none">
                          in
                        </span>
                      </div>
                    </td>
                    <td className="px-4 text-right">
                      <div className="inline-flex items-center justify-end relative">
                        <input
                          type="number"
                          step="0.0625"
                          min="0.0625"
                          aria-label={`Part ${idx + 1} width`}
                          value={p.width}
                          onChange={(e) => {
                            onUpdatePart(idx, {
                              width: snap16(parseFloat(e.target.value) || 1),
                            });
                            onInputModified();
                          }}
                          className="w-20 h-8 rounded-control border border-strong bg-surface pl-2 pr-6 font-mono text-[12.5px] tabular-nums text-right text-ink"
                        />
                        <span className="absolute right-2 text-[11px] font-mono text-muted pointer-events-none">
                          in
                        </span>
                      </div>
                    </td>
                    <td className="px-4 text-right">
                      <div className="inline-flex items-center justify-end relative">
                        <input
                          type="number"
                          step="0.0625"
                          min="0.0625"
                          aria-label={`Part ${idx + 1} height`}
                          value={p.height}
                          onChange={(e) => {
                            onUpdatePart(idx, {
                              height: snap16(parseFloat(e.target.value) || 1),
                            });
                            onInputModified();
                          }}
                          className="w-20 h-8 rounded-control border border-strong bg-surface pl-2 pr-6 font-mono text-[12.5px] tabular-nums text-right text-ink"
                        />
                        <span className="absolute right-2 text-[11px] font-mono text-muted pointer-events-none">
                          in
                        </span>
                      </div>
                    </td>
                    <td className="px-4 text-right">
                      <input
                        type="number"
                        min="1"
                        aria-label={`Part ${idx + 1} quantity`}
                        value={p.quantity}
                        onChange={(e) => {
                          onUpdatePart(idx, {
                            quantity: Math.max(1, parseInt(e.target.value) || 1),
                          });
                          onInputModified();
                        }}
                        className="w-16 h-8 rounded-control border border-strong bg-surface px-2 font-mono text-[12.5px] tabular-nums text-right text-ink"
                      />
                    </td>
                    <td className="px-4">
                      <select
                        aria-label={`Part ${idx + 1} rotation rule`}
                        value={p.orientation_mode}
                        onChange={(e) => {
                          onUpdatePart(idx, {
                            orientation_mode: e.target.value as OrientationMode,
                          });
                          onInputModified();
                        }}
                        className="h-8 rounded-control border border-strong bg-surface px-2 text-[12.5px] text-ink"
                      >
                        <option value="rise-locked">Rise-locked (Z fixed)</option>
                        <option value="free-in-plane">Free-in-plane (XY)</option>
                        <option value="any">Any 3D rotation</option>
                      </select>
                    </td>
                    <td className="px-4 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          onRemovePart(idx);
                          onInputModified();
                        }}
                        disabled={parts.length <= 1}
                        title={
                          parts.length <= 1
                            ? 'At least one part SKU is required'
                            : 'Remove part row'
                        }
                        aria-label={`Remove part ${idx + 1}`}
                        className="p-1.5 rounded-control text-secondary hover:text-status-error disabled:opacity-40 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4 stroke-[1.5]" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
