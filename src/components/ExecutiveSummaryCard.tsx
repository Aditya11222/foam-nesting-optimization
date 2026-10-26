import React from 'react';
import {
  PieChart,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Clock,
  Scissors,
  Box,
} from 'lucide-react';
import type { OptimizationResult } from '../types';
import { useCountUp } from './HelperComponents';

interface ExecutiveSummaryCardProps {
  currentResult: OptimizationResult | null;
  totalAvailableBlocks: number;
  onGoToStep4: () => void;
}

export const ExecutiveSummaryCard: React.FC<ExecutiveSummaryCardProps> = ({
  currentResult,
  totalAvailableBlocks,
  onGoToStep4,
}) => {
  const grossVol = currentResult?.total_gross_volume || 0;
  const usableVol = currentResult?.total_usable_volume || 0;
  const partsVol = currentResult?.total_parts_volume || 0;
  const remVol = currentResult?.total_remnant_volume || 0;
  const kerfVol = currentResult?.total_kerf_volume || 0;
  const scrapVol = currentResult?.total_unrecoverable_scrap_volume || 0;
  const skinTrimVol = Math.max(0, grossVol - usableVol);

  const netYieldPct = currentResult?.net_utilization_pct || 0;
  const recoveryPct =
    grossVol > 0 ? Math.round(((partsVol + remVol) / grossVol) * 1000) / 10 : 0;

  const animatedNetYield = useCountUp(netYieldPct, 1, 600);
  const animatedRecovery = useCountUp(recoveryPct, 1, 600);
  const animatedCuts = useCountUp(currentResult?.total_cuts_count || 0, 0, 500);

  return (
    <div className="bg-surface rounded-card border border-hairline shadow-card flex flex-col h-full min-h-[620px] lg:h-[720px] overflow-hidden">
      {/* Card Header */}
      <div className="px-5 py-4 border-b border-hairline flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-control bg-cocoa-tint text-cocoa border border-hairline flex items-center justify-center">
            <PieChart className="w-4 h-4 stroke-[1.5]" />
          </div>
          <div>
            <h2 className="text-[16px] leading-[24px] font-semibold text-ink">
              Optimization Executive Summary
            </h2>
          </div>
        </div>

        {currentResult && (
          <div className="flex items-center gap-1.5">
            <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-raised text-secondary border border-hairline">
              Heuristic solution
            </span>
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold border ${
                currentResult.validation?.is_valid
                  ? 'bg-status-success-bg text-status-success border-status-success/30'
                  : 'bg-status-error-bg text-status-error border-status-error/30'
              }`}
            >
              {currentResult.validation?.is_valid ? (
                <>
                  <CheckCircle2 className="w-3 h-3 stroke-[1.75]" />
                  <span>Verified</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-3 h-3 stroke-[1.75]" />
                  <span>Issues</span>
                </>
              )}
            </span>
          </div>
        )}
      </div>

      {/* Card Body */}
      <div className="p-5 flex-1 flex flex-col justify-between gap-4 overflow-y-auto">
        {currentResult ? (
          <>
            <div className="space-y-4">
              {/* Hero KPI: Net Usable Yield */}
              <div className="p-4 rounded-card bg-raised/70 border border-hairline">
                <div className="flex items-center justify-between">
                  <span className="text-[11.5px] leading-[16px] font-semibold uppercase tracking-[0.06em] text-secondary">
                    Net Usable Yield (Interior)
                  </span>
                  <span className="text-[11px] font-mono text-muted">
                    Gross Bun: {currentResult.gross_utilization_pct}%
                  </span>
                </div>
                <div className="mt-1 flex items-baseline justify-between">
                  <div className="font-display text-[40px] leading-[44px] font-normal text-ink tabular-nums">
                    {animatedNetYield}%
                  </div>
                  <div className="text-right">
                    <span className="text-[11.5px] leading-[16px] uppercase tracking-[0.06em] text-secondary block">
                      Material Recovery
                    </span>
                    <span className="font-display text-[24px] leading-[32px] font-normal text-sage tabular-nums">
                      {animatedRecovery}%
                    </span>
                  </div>
                </div>
                <div className="mt-2 pt-2 border-t border-hairline flex items-center justify-between text-[12px] text-secondary">
                  <span>Parts Placed: {currentResult.total_parts_placed} / {currentResult.total_parts_demanded} pcs</span>
                  <span className="font-mono text-[11px] text-muted">
                    Parts + Retained Remnants
                  </span>
                </div>
              </div>

              {/* Supporting Operational KPIs (24/32 scale) */}
              <div className="grid grid-cols-3 gap-2">
                <div className="p-3 rounded-control bg-surface border border-hairline">
                  <div className="flex items-center gap-1.5 text-secondary mb-1">
                    <Box className="w-3.5 h-3.5 stroke-[1.5]" />
                    <span className="text-[11.5px] leading-[16px] uppercase tracking-[0.06em] font-medium">
                      Buns Used
                    </span>
                  </div>
                  <div className="font-display text-[24px] leading-[32px] text-ink tabular-nums">
                    {currentResult.blocks_used_count}
                    <span className="text-[14px] text-muted font-sans">
                      /{totalAvailableBlocks}
                    </span>
                  </div>
                </div>

                <div className="p-3 rounded-control bg-surface border border-hairline">
                  <div className="flex items-center gap-1.5 text-secondary mb-1">
                    <Scissors className="w-3.5 h-3.5 stroke-[1.5]" />
                    <span className="text-[11.5px] leading-[16px] uppercase tracking-[0.06em] font-medium">
                      Total Cuts
                    </span>
                  </div>
                  <div className="font-display text-[24px] leading-[32px] text-ink tabular-nums">
                    {animatedCuts}
                  </div>
                </div>

                <div className="p-3 rounded-control bg-surface border border-hairline">
                  <div className="flex items-center gap-1.5 text-secondary mb-1">
                    <Clock className="w-3.5 h-3.5 stroke-[1.5]" />
                    <span className="text-[11.5px] leading-[16px] uppercase tracking-[0.06em] font-medium">
                      Saw Time
                    </span>
                  </div>
                  <div className="font-display text-[24px] leading-[32px] text-ink tabular-nums">
                    {currentResult.estimated_saw_time_minutes}
                    <span className="text-[13px] text-secondary font-mono ml-0.5">
                      m
                    </span>
                  </div>
                </div>
              </div>

              {/* Volume Reconciliation Table */}
              <div className="rounded-control border border-hairline overflow-hidden bg-surface">
                <div className="bg-raised h-10 px-4 border-b border-hairline flex items-center justify-between">
                  <span className="text-[11.5px] leading-[16px] font-semibold uppercase tracking-[0.06em] text-secondary">
                    Volume Reconciliation
                  </span>
                  <span className="text-[11.5px] font-mono text-secondary">
                    cu in (in³) / cu ft
                  </span>
                </div>
                <div className="divide-y divide-hairline text-[13px] leading-[20px]">
                  <div className="h-11 px-4 flex items-center justify-between hover:bg-row-hover transition-colors">
                    <span className="text-ink font-medium">Gross Bun Volume</span>
                    <div className="text-right font-mono tabular-nums">
                      <span className="font-semibold text-ink">
                        {Math.round(grossVol).toLocaleString()}
                      </span>
                      <span className="text-muted text-[11px] ml-1.5">
                        ({(grossVol / 1728).toFixed(1)} ft³)
                      </span>
                    </div>
                  </div>

                  <div className="h-11 px-4 flex items-center justify-between bg-cocoa-tint/35 hover:bg-row-hover transition-colors">
                    <span className="font-semibold text-ink">
                      Placed Parts ({currentResult.total_parts_placed}/
                      {currentResult.total_parts_demanded})
                    </span>
                    <div className="text-right font-mono tabular-nums">
                      <span className="font-semibold text-cocoa">
                        {Math.round(partsVol).toLocaleString()}
                      </span>
                      <span className="text-secondary text-[11px] ml-1.5">
                        ({(partsVol / 1728).toFixed(1)} ft³)
                      </span>
                    </div>
                  </div>

                  <div className="h-11 px-4 flex items-center justify-between bg-sage-tint/40 hover:bg-row-hover transition-colors">
                    <span className="font-medium text-ink">
                      Retained Remnants
                    </span>
                    <div className="text-right font-mono tabular-nums">
                      <span className="font-semibold text-sage">
                        {Math.round(remVol).toLocaleString()}
                      </span>
                      <span className="text-secondary text-[11px] ml-1.5">
                        ({(remVol / 1728).toFixed(1)} ft³)
                      </span>
                    </div>
                  </div>

                  <div className="h-11 px-4 flex items-center justify-between hover:bg-row-hover transition-colors">
                    <span className="text-secondary">Skin Trim Crust Loss</span>
                    <div className="text-right font-mono tabular-nums text-status-warning">
                      -{Math.round(skinTrimVol).toLocaleString()}
                      <span className="text-muted text-[11px] ml-1.5">
                        ({(skinTrimVol / 1728).toFixed(1)} ft³)
                      </span>
                    </div>
                  </div>

                  <div className="h-11 px-4 flex items-center justify-between hover:bg-row-hover transition-colors">
                    <span className="text-secondary">Saw Blade Kerf Loss</span>
                    <div className="text-right font-mono tabular-nums text-secondary">
                      -{Math.round(kerfVol).toLocaleString()}
                      <span className="text-muted text-[11px] ml-1.5">
                        ({(kerfVol / 1728).toFixed(1)} ft³)
                      </span>
                    </div>
                  </div>

                  <div className="h-11 px-4 flex items-center justify-between hover:bg-row-hover transition-colors">
                    <span className="text-secondary">Unrecoverable Scrap</span>
                    <div className="text-right font-mono tabular-nums font-medium text-status-error">
                      {Math.round(scrapVol).toLocaleString()}
                      <span className="text-muted text-[11px] ml-1.5">
                        ({(scrapVol / 1728).toFixed(1)} ft³)
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <p className="text-[11px] text-muted font-mono">
                Reconciled: Parts + Remnants + Trim + Kerf + Scrap = 100% Gross Bun Volume. Figures are estimated, demo assumptions.
              </p>
            </div>

            {/* Action Footer */}
            <button
              type="button"
              onClick={onGoToStep4}
              className="btn-secondary w-full h-10 px-4 rounded-control text-[13px] font-medium flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>View Operator Cut Sheets &amp; Analytics</span>
              <ArrowRight className="w-4 h-4 stroke-[1.5]" />
            </button>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
            <div className="w-10 h-10 rounded-full bg-raised border border-hairline flex items-center justify-center text-secondary mb-3">
              <PieChart className="w-5 h-5 stroke-[1.5]" />
            </div>
            <p className="text-[14px] font-semibold text-ink">
              No Optimization Results Yet
            </p>
            <p className="text-[13px] text-secondary mt-1 max-w-[240px]">
              Run an optimization or compare algorithms in the left panel to compute material yield and volume reconciliation.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
