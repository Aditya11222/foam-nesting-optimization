import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CheckCircle2,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Check,
} from 'lucide-react';
import type { OptimizationResult, BlockLayout } from '../types';

interface OperatorStationViewProps {
  result: OptimizationResult;
}

export const OperatorStationView: React.FC<OperatorStationViewProps> = ({
  result,
}) => {
  const { i18n } = useTranslation();
  const isEs = i18n.language === 'es';

  const [selectedBlockIdx, setSelectedBlockIdx] = useState<number>(0);
  const [completedSteps, setCompletedSteps] = useState<Record<string, boolean>>({});

  const activeBlock: BlockLayout | undefined =
    result.blocks[selectedBlockIdx] || result.blocks[0];

  if (!activeBlock) {
    return (
      <div className="p-6 text-center text-[13px] text-secondary">
        No cutting instructions generated for this block.
      </div>
    );
  }

  const toggleStepDone = (blockIndex: number, stepNum: number) => {
    const key = `${blockIndex}-${stepNum}`;
    setCompletedSteps((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const completedCount = activeBlock.cuts.filter(
    (c) => completedSteps[`${activeBlock.block_index}-${c.step_number}`]
  ).length;

  return (
    <div className="space-y-4">
      {/* Block Selector Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-raised p-4 rounded-control border border-hairline">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-secondary">
            {isEs ? 'Seleccionar Bloque:' : 'Select Block:'}
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            {result.blocks.map((b, idx) => (
              <button
                key={b.block_index}
                type="button"
                onClick={() => setSelectedBlockIdx(idx)}
                className={`h-9 px-3 rounded-control text-[13px] font-medium transition cursor-pointer ${
                  idx === selectedBlockIdx
                    ? 'btn-primary'
                    : 'btn-secondary'
                }`}
              >
                Block #{b.block_index} ({b.cuts.length} cuts)
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3 text-[13px] text-secondary">
          <span className="font-mono text-[12px] text-secondary">
            Confirmed: <strong className="text-ink">{completedCount} / {activeBlock.cuts.length}</strong>
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={selectedBlockIdx <= 0}
              onClick={() => setSelectedBlockIdx((p) => Math.max(0, p - 1))}
              className="w-8 h-8 rounded-control border border-hairline bg-surface flex items-center justify-center disabled:opacity-40 cursor-pointer"
              aria-label="Previous Block"
            >
              <ChevronLeft className="w-4 h-4 stroke-[1.5]" />
            </button>
            <span className="font-mono text-[12px] font-medium text-ink">
              {activeBlock.stock_id} ({activeBlock.nominal_length}&quot;×
              {activeBlock.nominal_width}&quot;×{activeBlock.nominal_height}&quot;)
            </span>
            <button
              type="button"
              disabled={selectedBlockIdx >= result.blocks.length - 1}
              onClick={() =>
                setSelectedBlockIdx((p) => Math.min(result.blocks.length - 1, p + 1))
              }
              className="w-8 h-8 rounded-control border border-hairline bg-surface flex items-center justify-center disabled:opacity-40 cursor-pointer"
              aria-label="Next Block"
            >
              <ChevronRight className="w-4 h-4 stroke-[1.5]" />
            </button>
          </div>
        </div>
      </div>

      {/* Cut Sequence List */}
      <div className="divide-y divide-hairline border border-hairline rounded-card overflow-hidden bg-surface">
        {activeBlock.cuts.map((cut) => {
          const stepKey = `${activeBlock.block_index}-${cut.step_number}`;
          const isDone = !!completedSteps[stepKey];
          const desc = isEs ? cut.produces_description_es : cut.produces_description_en;
          const remPrompt = isEs ? cut.remnant_prompt_es : cut.remnant_prompt_en;

          return (
            <div
              key={cut.step_number}
              className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors ${
                isDone ? 'bg-status-success-bg/35' : 'hover:bg-row-hover'
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`mt-0.5 w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-mono font-semibold border shrink-0 ${
                    isDone
                      ? 'bg-status-success text-surface border-status-success'
                      : 'bg-raised text-ink border-strong'
                  }`}
                >
                  {isDone ? <CheckCircle2 className="w-4 h-4 stroke-[1.75]" /> : cut.step_number}
                </div>

                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-[0.06em] bg-raised text-secondary border border-hairline">
                      Stage {cut.stage}: {cut.cut_type.replace('_', ' ')}
                    </span>
                    <span className="font-mono text-[12px] font-semibold text-cocoa bg-cocoa-tint px-2.5 py-0.5 rounded border border-cocoa/25">
                      Axis {cut.axis} @ {cut.position_display}
                    </span>
                    <span className="text-[12px] text-muted font-mono">
                      Kerf: {cut.kerf_in}&quot;
                    </span>
                  </div>

                  <p className="text-[14px] leading-[22px] text-ink font-medium mt-1.5">
                    {desc}
                  </p>

                  {remPrompt && (
                    <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-sage-tint border border-sage/30 text-ink text-[12px] font-medium">
                      <Bookmark className="w-3.5 h-3.5 text-sage stroke-[1.5]" />
                      <span>{remPrompt}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0">
                <div className="text-left sm:text-right">
                  <span className="text-[11px] uppercase tracking-[0.06em] text-secondary block">
                    Target Envelope
                  </span>
                  <span className="text-[13px] font-mono font-semibold text-ink tabular-nums">
                    {cut.target_piece_dims[0]}&quot; × {cut.target_piece_dims[1]}&quot; ×{' '}
                    {cut.target_piece_dims[2]}&quot;
                  </span>
                </div>

                {/* 48px Touch-Friendly Shop-Floor Action Button */}
                <button
                  type="button"
                  onClick={() => toggleStepDone(activeBlock.block_index, cut.step_number)}
                  className={`h-12 px-4 rounded-control text-[13px] font-semibold inline-flex items-center gap-2 cursor-pointer transition ${
                    isDone
                      ? 'bg-status-success-bg text-status-success border border-status-success/40'
                      : 'btn-secondary'
                  }`}
                >
                  <Check className="w-4 h-4 stroke-[1.75]" />
                  <span>{isDone ? (isEs ? 'Confirmado' : 'Confirmed') : (isEs ? 'Confirmar corte' : 'Confirm cut')}</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
