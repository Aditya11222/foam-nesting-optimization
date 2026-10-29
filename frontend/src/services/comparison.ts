import type { OptimizationResult, MachineProfile, AlgorithmInfo } from '../types.ts';
import { isAlgorithmCompatibleWithMachine } from './compatibility.ts';

/**
 * Separates results into applicable for this machine vs not applicable.
 */
export function partitionComparisonResults(results: OptimizationResult[]): {
  applicable: OptimizationResult[];
  inapplicable: OptimizationResult[];
} {
  const applicable: OptimizationResult[] = [];
  const inapplicable: OptimizationResult[] = [];

  for (const r of results) {
    if (r.comparison_status === 'NOT_APPLICABLE') {
      inapplicable.push(r);
    } else {
      applicable.push(r);
    }
  }

  return { applicable, inapplicable };
}

/**
 * Checks if a machine has only 1 compatible algorithm available.
 */
export function isSingleCompatibleMachine(
  machine: MachineProfile | undefined,
  algorithms: AlgorithmInfo[]
): boolean {
  if (!machine) return false;
  const compatibleCount = algorithms.filter((a) =>
    isAlgorithmCompatibleWithMachine(a.id, machine.cut_type, algorithms)
  ).length;
  return compatibleCount === 1;
}

/**
 * Ranks completed heuristics and assigns `is_best = true` to exactly one winning heuristic.
 *
 * Tie-breaker rules:
 * 1. Highest net utilization %
 * 2. Fewer blocks used count
 * 3. Fewer cuts count
 * 4. Lower runtime ms
 *
 * Ineligible results (FAILED, NOT_APPLICABLE, TIMED_OUT, CANCELLED, or 0% yield) never receive is_best.
 */
export function rankAndMarkBestResult(results: OptimizationResult[]): OptimizationResult[] {
  const eligible = results.filter(
    (r) =>
      (r.comparison_status === 'COMPLETED' || r.comparison_status === 'FALLBACK' || !r.comparison_status) &&
      r.net_utilization_pct > 0
  );

  if (eligible.length === 0) {
    return results.map((r) => ({ ...r, is_best: false }));
  }

  const sorted = [...eligible].sort((a, b) => {
    // 1. Highest net utilization %
    if (b.net_utilization_pct !== a.net_utilization_pct) {
      return b.net_utilization_pct - a.net_utilization_pct;
    }
    // 2. Fewer blocks used count
    if (a.blocks_used_count !== b.blocks_used_count) {
      return a.blocks_used_count - b.blocks_used_count;
    }
    // 3. Fewer cuts count
    if (a.total_cuts_count !== b.total_cuts_count) {
      return a.total_cuts_count - b.total_cuts_count;
    }
    // 4. Lower runtime ms
    return a.runtime_ms - b.runtime_ms;
  });

  const winnerId = sorted[0].algorithm_id;

  return results.map((r) => ({
    ...r,
    is_best: r.algorithm_id === winnerId,
  }));
}

export interface MetricBadges {
  isBestOverall: boolean;
  isHighestYield: boolean;
  isLowestCost: boolean;
  isFastest: boolean;
}

/**
 * Computes honest badges:
 * - "Best overall" for winner under net utilization & tie-breakers
 * - "Highest yield" where a row achieves maximum net yield (if distinct from Best overall)
 * - "Lowest cost" where a row achieves minimum blocks / cost (if distinct from Best overall)
 * - "Fastest" where a row achieves lowest runtime ms (if distinct from Best overall)
 */
export function calculateMetricBadges(results: OptimizationResult[]): Record<string, MetricBadges> {
  const eligible = results.filter(
    (r) =>
      (r.comparison_status === 'COMPLETED' || r.comparison_status === 'FALLBACK' || !r.comparison_status) &&
      r.net_utilization_pct > 0
  );

  const badges: Record<string, MetricBadges> = {};
  results.forEach((r) => {
    badges[r.algorithm_id] = {
      isBestOverall: false,
      isHighestYield: false,
      isLowestCost: false,
      isFastest: false,
    };
  });

  if (eligible.length === 0) return badges;

  // Best Overall
  const bestOverall = eligible.find((r) => r.is_best) || eligible[0];
  badges[bestOverall.algorithm_id].isBestOverall = true;

  // Highest Yield
  const highestYield = [...eligible].sort((a, b) => b.net_utilization_pct - a.net_utilization_pct)[0];
  if (highestYield && highestYield.algorithm_id !== bestOverall.algorithm_id) {
    badges[highestYield.algorithm_id].isHighestYield = true;
  }

  // Lowest Cost (approximated by fewest blocks used, then fewest cuts)
  const lowestCost = [...eligible].sort((a, b) => {
    if (a.blocks_used_count !== b.blocks_used_count) return a.blocks_used_count - b.blocks_used_count;
    return a.total_cuts_count - b.total_cuts_count;
  })[0];
  if (lowestCost && lowestCost.algorithm_id !== bestOverall.algorithm_id) {
    badges[lowestCost.algorithm_id].isLowestCost = true;
  }

  // Fastest
  const fastest = [...eligible].sort((a, b) => a.runtime_ms - b.runtime_ms)[0];
  if (fastest && fastest.algorithm_id !== bestOverall.algorithm_id) {
    badges[fastest.algorithm_id].isFastest = true;
  }

  return badges;
}

/**
 * Computes efficiency: yield points gained per second of runtime relative to the fastest heuristic.
 */
export function calculateEfficiency(r: OptimizationResult, allResults: OptimizationResult[]): string {
  const eligible = allResults.filter(
    (x) =>
      (x.comparison_status === 'COMPLETED' || x.comparison_status === 'FALLBACK' || !x.comparison_status) &&
      x.net_utilization_pct > 0
  );
  if (eligible.length <= 1) return '—';

  const fastest = [...eligible].sort((a, b) => a.runtime_ms - b.runtime_ms)[0];
  if (r.algorithm_id === fastest.algorithm_id) {
    return 'Baseline';
  }

  const deltaYield = r.net_utilization_pct - fastest.net_utilization_pct;
  const deltaTimeSec = Math.max(0.001, (r.runtime_ms - fastest.runtime_ms) / 1000.0);

  if (deltaTimeSec < 0.05) {
    return deltaYield > 0 ? `+${deltaYield.toFixed(1)} pts (<0.05s)` : 'Equal';
  }

  const rate = deltaYield / deltaTimeSec;
  return rate >= 0 ? `+${rate.toFixed(1)} pts/s` : `${rate.toFixed(1)} pts/s`;
}

/**
 * Generates honest one-paragraph summary from real benchmark numbers.
 */
export function generateBenchmarkSummary(results: OptimizationResult[]): string {
  const eligible = results.filter(
    (r) =>
      (r.comparison_status === 'COMPLETED' || r.comparison_status === 'FALLBACK' || !r.comparison_status) &&
      r.net_utilization_pct > 0
  );

  if (eligible.length === 0) {
    return 'No completed heuristic solutions available to benchmark.';
  }

  const sortedByYield = [...eligible].sort((a, b) => b.net_utilization_pct - a.net_utilization_pct);
  const best = sortedByYield[0];
  const fastest = [...eligible].sort((a, b) => a.runtime_ms - b.runtime_ms)[0];

  if (best.algorithm_id === fastest.algorithm_id) {
    return `${best.algorithm_name} delivers the highest net yield (${best.net_utilization_pct.toFixed(1)}%) while also running fastest (${(best.runtime_ms / 1000).toFixed(2)}s) using ${best.blocks_used_count} blocks. Best among the tested heuristics, not proven optimal.`;
  }

  const yieldDelta = (best.net_utilization_pct - fastest.net_utilization_pct).toFixed(1);
  const timeDelta = ((best.runtime_ms - fastest.runtime_ms) / 1000).toFixed(2);
  const sign = Number(yieldDelta) >= 0 ? '+' : '';

  return `${best.algorithm_name} yields ${sign}${yieldDelta} percentage points over ${fastest.algorithm_name} (${best.net_utilization_pct.toFixed(1)}% vs ${fastest.net_utilization_pct.toFixed(1)}%) in ${sign}${timeDelta}s additional solve time using ${best.blocks_used_count} blocks (${best.total_cuts_count} cuts). Best among the tested heuristics, not proven optimal.`;
}
