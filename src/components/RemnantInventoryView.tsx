import React, { useEffect, useState } from 'react';
import { Archive, AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { OptimizationResult, RemnantAgingStatus } from '../types';
import { fetchRemnantAging } from '../api';

interface RemnantInventoryViewProps {
  result: OptimizationResult;
}

export const RemnantInventoryView: React.FC<RemnantInventoryViewProps> = ({
  result,
}) => {
  const [agingList, setAgingList] = useState<RemnantAgingStatus[]>([]);

  useEffect(() => {
    fetchRemnantAging()
      .then(setAgingList)
      .catch((err) => console.error('Failed to load remnant aging:', err));
  }, []);

  const newRemnants = result.blocks.flatMap((b) =>
    b.usable_remnants.map((r) => ({ ...r, blockIndex: b.block_index }))
  );

  return (
    <div className="space-y-6">
      {/* Newly Generated Remnants from Current Job */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-[11.5px] leading-[16px] font-semibold uppercase tracking-[0.06em] text-secondary flex items-center gap-2">
            <Archive className="w-4 h-4 text-sage stroke-[1.5]" />
            <span>
              Newly Retained Offcuts from Current Job ({newRemnants.length})
            </span>
          </h4>
        </div>

        {newRemnants.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {newRemnants.map((r) => (
              <div
                key={r.id}
                className="p-4 rounded-card border border-sage/35 bg-sage-tint/45 flex flex-col justify-between gap-2"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[13px] font-semibold text-ink">
                    {r.code}
                  </span>
                  <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-surface text-sage border border-sage/30">
                    {r.storage_location}
                  </span>
                </div>
                <div className="text-[13px] text-ink font-mono tabular-nums">
                  Dims: <strong>{r.length}&quot; × {r.width}&quot; × {r.height}&quot;</strong> (
                  {Math.round(r.volume).toLocaleString()} in³)
                </div>
                <div className="flex items-center justify-between text-[12px] text-secondary">
                  <span>From Bun #{r.blockIndex}</span>
                  <span className="font-mono">
                    Usability: {Math.round(r.usability_score * 100)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-4 rounded-control bg-raised border border-hairline text-[13px] text-secondary">
            No offcuts exceeded the minimum salvageable remnant threshold (1,500 in³) in this run.
          </div>
        )}
      </div>

      {/* Warehouse Remnant Aging & Oxidation Monitor */}
      <div className="space-y-3">
        <h4 className="text-[11.5px] leading-[16px] font-semibold uppercase tracking-[0.06em] text-secondary">
          Warehouse Rack Remnant Aging &amp; UV/Oxidation Trim Status
        </h4>

        <div className="overflow-x-auto border border-hairline rounded-card bg-surface">
          <table className="w-full text-left border-collapse text-[13px] leading-[20px]">
            <thead>
              <tr className="bg-raised border-b border-hairline text-secondary h-10">
                <th className="px-4 text-[11.5px] uppercase tracking-[0.06em] font-semibold">
                  Remnant Code
                </th>
                <th className="px-4 text-[11.5px] uppercase tracking-[0.06em] font-semibold">
                  Grade
                </th>
                <th className="px-4 text-[11.5px] uppercase tracking-[0.06em] font-semibold">
                  Rack Location
                </th>
                <th className="px-4 text-right text-[11.5px] uppercase tracking-[0.06em] font-semibold">
                  Age
                </th>
                <th className="px-4 text-right text-[11.5px] uppercase tracking-[0.06em] font-semibold">
                  Original Dims (in)
                </th>
                <th className="px-4 text-right text-[11.5px] uppercase tracking-[0.06em] font-semibold">
                  Effective Usable Dims (in)
                </th>
                <th className="px-4 text-[11.5px] uppercase tracking-[0.06em] font-semibold">
                  Oxidation Status &amp; Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {agingList.map((rem) => (
                <tr key={rem.remnant_id} className="h-11 hover:bg-row-hover transition-colors">
                  <td className="px-4 font-mono font-semibold text-ink">
                    {rem.code}
                  </td>
                  <td className="px-4">
                    <span className="px-2 py-0.5 rounded bg-cocoa-tint text-cocoa font-mono text-[12px] font-medium">
                      {rem.grade}
                    </span>
                  </td>
                  <td className="px-4 font-mono text-secondary">
                    {rem.storage_location}
                  </td>
                  <td className="px-4 text-right font-mono font-medium text-ink tabular-nums">
                    {rem.age_days} d
                  </td>
                  <td className="px-4 text-right font-mono text-secondary tabular-nums">
                    {rem.original_dims[0]}&quot; × {rem.original_dims[1]}&quot; ×{' '}
                    {rem.original_dims[2]}&quot;
                  </td>
                  <td className="px-4 text-right font-mono font-semibold text-ink tabular-nums">
                    {rem.effective_dims[0]}&quot; × {rem.effective_dims[1]}&quot; ×{' '}
                    {rem.effective_dims[2]}&quot;
                    {rem.volume_loss_pct > 0 && (
                      <span className="ml-1.5 text-[11px] text-status-warning font-normal">
                        (-{rem.volume_loss_pct}%)
                      </span>
                    )}
                  </td>
                  <td className="px-4">
                    <div className="flex items-center gap-1.5">
                      {rem.is_degraded ? (
                        <AlertTriangle className="w-3.5 h-3.5 text-status-warning shrink-0 stroke-[1.75]" />
                      ) : (
                        <CheckCircle2 className="w-3.5 h-3.5 text-status-success shrink-0 stroke-[1.75]" />
                      )}
                      <span
                        className={
                          rem.is_degraded
                            ? 'text-status-warning font-medium'
                            : 'text-secondary'
                        }
                      >
                        {rem.recommendation_en}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
