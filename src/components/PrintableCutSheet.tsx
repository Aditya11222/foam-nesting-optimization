import React from 'react';
import { Printer } from 'lucide-react';
import type { OptimizationResult } from '../types';

interface PrintableCutSheetProps {
  result: OptimizationResult;
}

export const PrintableCutSheet: React.FC<PrintableCutSheetProps> = ({
  result,
}) => {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-raised p-4 rounded-control border border-hairline no-print">
        <div>
          <h4 className="text-[14px] font-semibold text-ink">
            Shop-Floor Printable Cut Manifest
          </h4>
          <p className="text-[12px] text-secondary">
            Formatted for standard 8.5&quot; × 11&quot; industrial clipboard travelers (heuristic layout)
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="btn-primary h-10 px-4 rounded-control text-[13px] font-medium inline-flex items-center gap-2 cursor-pointer"
        >
          <Printer className="w-4 h-4 stroke-[1.5]" />
          <span>Print Traveler Sheet</span>
        </button>
      </div>

      {/* Traveler Document */}
      <div className="bg-surface border border-strong rounded-card p-6 space-y-6">
        <div className="border-b-2 border-ink pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-[22px] leading-[28px] font-normal tracking-tight text-ink">
              TATRAS NESTPRO — PRODUCTION CUT TRAVELER
            </h2>
            <p className="text-[12px] font-mono text-secondary mt-1">
              Job ID: {result.job_id} | Grade: {result.grade} | Heuristic:{' '}
              {result.algorithm_name}
            </p>
          </div>
          <div className="text-[12px] font-mono text-left sm:text-right text-ink">
            <div>Machine: {result.machine.name}</div>
            <div>
              Net Yield: <strong>{result.net_utilization_pct}%</strong> | Buns:{' '}
              <strong>{result.blocks_used_count}</strong>
            </div>
          </div>
        </div>

        {result.blocks.map((block) => (
          <div key={block.block_index} className="space-y-3 pt-2">
            <div className="bg-raised px-4 py-2.5 rounded-control border border-hairline font-semibold text-[13px] text-ink flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <span>
                BUN #{block.block_index} — Stock: {block.stock_id} (
                {block.nominal_length}&quot; × {block.nominal_width}&quot; ×{' '}
                {block.nominal_height}&quot;)
              </span>
              <span className="font-mono text-[12px] text-secondary">
                Usable Interior: {block.usable_length}&quot; × {block.usable_width}&quot; ×{' '}
                {block.usable_height}&quot; | Net Yield: {block.net_utilization_pct}%
              </span>
            </div>

            <div className="overflow-x-auto border border-hairline rounded-control">
              <table className="w-full text-left border-collapse text-[13px] leading-[20px]">
                <thead>
                  <tr className="bg-raised border-b border-hairline text-secondary h-10">
                    <th className="px-4 border-r border-hairline w-16 text-[11.5px] uppercase tracking-[0.06em] font-semibold">
                      Step
                    </th>
                    <th className="px-4 border-r border-hairline w-32 text-[11.5px] uppercase tracking-[0.06em] font-semibold">
                      Axis / Fence
                    </th>
                    <th className="px-4 border-r border-hairline text-[11.5px] uppercase tracking-[0.06em] font-semibold">
                      Operator Instruction
                    </th>
                    <th className="px-4 w-32 text-right text-[11.5px] uppercase tracking-[0.06em] font-semibold">
                      Sign-off
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {block.cuts.map((c) => (
                    <tr key={c.step_number} className="h-11 hover:bg-row-hover">
                      <td className="px-4 border-r border-hairline font-mono font-semibold text-ink tabular-nums">
                        #{c.step_number}
                      </td>
                      <td className="px-4 border-r border-hairline font-mono font-semibold text-cocoa tabular-nums">
                        {c.axis} @ {c.position_display}
                      </td>
                      <td className="px-4 border-r border-hairline text-ink">
                        {c.produces_description_en}
                      </td>
                      <td className="px-4 text-right font-mono text-muted">
                        [ &nbsp;&nbsp;&nbsp;&nbsp; ]
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
