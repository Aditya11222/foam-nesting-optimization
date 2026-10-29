import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  partitionComparisonResults,
  isSingleCompatibleMachine,
  rankAndMarkBestResult,
  calculateMetricBadges,
  calculateEfficiency,
  generateBenchmarkSummary,
} from '../comparison.ts';
import type { OptimizationResult, MachineProfile, AlgorithmInfo } from '../../types.ts';

const mockMachineGuillotine: MachineProfile = {
  id: 'saw-g2',
  name: 'CNC Horizontal Slab Saw',
  type: 'horizontal_slab_saw',
  cut_type: 'guillotine',
  max_block_length: 120,
  max_block_width: 80,
  max_block_height: 50,
  kerf_inches: 0.125,
  hourly_rate: 65,
  min_remnant_length: 24,
  min_remnant_width: 24,
  min_remnant_thickness: 2,
};

const mockMachineWaterjet: MachineProfile = {
  id: 'saw-wj',
  name: 'CNC Abrasive Waterjet Contour Cutter',
  type: 'waterjet',
  cut_type: 'free',
  max_block_length: 120,
  max_block_width: 60,
  max_block_height: 36,
  kerf_inches: 0.04,
  hourly_rate: 120,
  min_remnant_length: 12,
  min_remnant_width: 12,
  min_remnant_thickness: 1,
};

const mockAlgorithms: AlgorithmInfo[] = [
  {
    id: 'best_fit_decreasing',
    name: 'Best-Fit Decreasing',
    description: 'Fast 3D guillotine bin packing',
    time_complexity: 'O(n log n)',
    speed_tag: 'instant',
    supported_cut_types: ['guillotine'],
  },
  {
    id: 'first_fit_decreasing',
    name: 'First-Fit Decreasing',
    description: 'Greedy shelf packing',
    time_complexity: 'O(n log n)',
    speed_tag: 'instant',
    supported_cut_types: ['guillotine'],
  },
  {
    id: 'simulated_annealing',
    name: 'Simulated Annealing',
    description: 'Stochastic metaheuristic',
    time_complexity: 'O(k * n)',
    speed_tag: 'moderate',
    supported_cut_types: ['guillotine'],
  },
  {
    id: 'free_nesting_heuristic',
    name: 'Free 3D Nesting',
    description: 'Contour/free wire nesting',
    time_complexity: 'O(n^2)',
    speed_tag: 'instant',
    supported_cut_types: ['free'],
  },
];

function makeMockResult(overrides: Partial<OptimizationResult>): OptimizationResult {
  return {
    job_id: 'JOB-TEST',
    grade: 'HR-40',
    algorithm_id: overrides.algorithm_id || 'test_algo',
    algorithm_name: overrides.algorithm_name || 'Test Algo',
    solution_type: 'heuristic solution',
    timestamp: new Date().toISOString(),
    machine: mockMachineGuillotine,
    total_parts_demanded: 10,
    total_parts_placed: 10,
    unplaced_parts: [],
    unplaced_summary: [],
    blocks_used_count: overrides.blocks_used_count ?? 1,
    blocks: [],
    total_gross_volume: 100,
    total_usable_volume: 90,
    total_parts_volume: 70,
    total_kerf_volume: 5,
    total_remnant_volume: 10,
    total_unrecoverable_scrap_volume: 5,
    gross_utilization_pct: 70.0,
    net_utilization_pct: overrides.net_utilization_pct ?? 75.0,
    total_cuts_count: overrides.total_cuts_count ?? 10,
    estimated_saw_time_minutes: 5,
    runtime_ms: overrides.runtime_ms ?? 50,
    validation: {
      is_valid: true,
      errors: [],
      warnings: [],
      volume_reconciliation: {
        total_gross_volume: 100,
        total_usable_volume: 90,
        total_skin_trim_volume: 10,
        total_parts_volume: 70,
        total_remnants_volume: 10,
        total_kerf_volume: 5,
        total_scrap_volume: 5,
        reconciliation_delta: 0,
      },
    },
    is_best: false,
    ...overrides,
  };
}

describe('Compare All Benchmarking Service', () => {
  it('correctly partitions applicable vs not-applicable algorithms', () => {
    const results: OptimizationResult[] = [
      makeMockResult({ algorithm_id: 'bfd', comparison_status: 'COMPLETED' }),
      makeMockResult({ algorithm_id: 'ffd', comparison_status: 'FAILED', status_reason: 'Solver error' }),
      makeMockResult({ algorithm_id: 'free', comparison_status: 'NOT_APPLICABLE', status_reason: 'Requires free cut_type' }),
      makeMockResult({ algorithm_id: 'sa', comparison_status: 'TIMED_OUT' }),
    ];

    const { applicable, inapplicable } = partitionComparisonResults(results);

    assert.equal(applicable.length, 3);
    assert.deepEqual(applicable.map((r) => r.algorithm_id), ['bfd', 'ffd', 'sa']);

    assert.equal(inapplicable.length, 1);
    assert.equal(inapplicable[0].algorithm_id, 'free');
    assert.equal(inapplicable[0].status_reason, 'Requires free cut_type');
  });

  it('detects when machine only has 1 compatible algorithm', () => {
    const isWjSingle = isSingleCompatibleMachine(mockMachineWaterjet, mockAlgorithms);
    assert.equal(isWjSingle, true, 'Waterjet has only 1 compatible algorithm (free_nesting)');

    const isGuillotineSingle = isSingleCompatibleMachine(mockMachineGuillotine, mockAlgorithms);
    assert.equal(isGuillotineSingle, false, 'Guillotine machine has 3 compatible algorithms');
  });

  it('ranks by net utilization % as primary objective', () => {
    const results: OptimizationResult[] = [
      makeMockResult({ algorithm_id: 'algo_a', net_utilization_pct: 78.5 }),
      makeMockResult({ algorithm_id: 'algo_b', net_utilization_pct: 84.2 }),
      makeMockResult({ algorithm_id: 'algo_c', net_utilization_pct: 81.0 }),
    ];

    const ranked = rankAndMarkBestResult(results);
    const best = ranked.find((r) => r.is_best);

    assert.ok(best, 'A best result must be marked');
    assert.equal(best.algorithm_id, 'algo_b', 'Algo B with 84.2% net yield must win');
  });

  it('tie-breaker 1: breaks yield ties with fewer blocks used', () => {
    const results: OptimizationResult[] = [
      makeMockResult({ algorithm_id: 'algo_2blocks', net_utilization_pct: 80.0, blocks_used_count: 2, total_cuts_count: 10 }),
      makeMockResult({ algorithm_id: 'algo_1block', net_utilization_pct: 80.0, blocks_used_count: 1, total_cuts_count: 15 }),
    ];

    const ranked = rankAndMarkBestResult(results);
    const best = ranked.find((r) => r.is_best);

    assert.ok(best);
    assert.equal(best.algorithm_id, 'algo_1block', '1 block must beat 2 blocks on equal yield');
  });

  it('tie-breaker 2: breaks block ties with fewer cuts', () => {
    const results: OptimizationResult[] = [
      makeMockResult({ algorithm_id: 'algo_more_cuts', net_utilization_pct: 80.0, blocks_used_count: 1, total_cuts_count: 20 }),
      makeMockResult({ algorithm_id: 'algo_fewer_cuts', net_utilization_pct: 80.0, blocks_used_count: 1, total_cuts_count: 12 }),
    ];

    const ranked = rankAndMarkBestResult(results);
    const best = ranked.find((r) => r.is_best);

    assert.ok(best);
    assert.equal(best.algorithm_id, 'algo_fewer_cuts', '12 cuts must beat 20 cuts on equal yield and blocks');
  });

  it('tie-breaker 3: breaks cut ties with faster runtime ms', () => {
    const results: OptimizationResult[] = [
      makeMockResult({ algorithm_id: 'algo_slow', net_utilization_pct: 80.0, blocks_used_count: 1, total_cuts_count: 12, runtime_ms: 3200 }),
      makeMockResult({ algorithm_id: 'algo_fast', net_utilization_pct: 80.0, blocks_used_count: 1, total_cuts_count: 12, runtime_ms: 45 }),
    ];

    const ranked = rankAndMarkBestResult(results);
    const best = ranked.find((r) => r.is_best);

    assert.ok(best);
    assert.equal(best.algorithm_id, 'algo_fast', '45 ms runtime must beat 3200 ms on all other equal metrics');
  });

  it('never marks failed, not-applicable, or timed-out rows as best', () => {
    const results: OptimizationResult[] = [
      makeMockResult({ algorithm_id: 'algo_failed', comparison_status: 'FAILED', net_utilization_pct: 95.0 }),
      makeMockResult({ algorithm_id: 'algo_incomp', comparison_status: 'NOT_APPLICABLE', net_utilization_pct: 99.0 }),
      makeMockResult({ algorithm_id: 'algo_timed_out', comparison_status: 'TIMED_OUT', net_utilization_pct: 92.0 }),
      makeMockResult({ algorithm_id: 'algo_valid', comparison_status: 'COMPLETED', net_utilization_pct: 74.0 }),
    ];

    const ranked = rankAndMarkBestResult(results);
    const best = ranked.find((r) => r.is_best);

    assert.ok(best);
    assert.equal(best.algorithm_id, 'algo_valid', 'Only completed result with positive yield is eligible for is_best');
  });

  it('handles complete failure gracefully without marking any best', () => {
    const results: OptimizationResult[] = [
      makeMockResult({ algorithm_id: 'algo_failed_1', comparison_status: 'FAILED', net_utilization_pct: 0 }),
      makeMockResult({ algorithm_id: 'algo_failed_2', comparison_status: 'FAILED', net_utilization_pct: 0 }),
    ];

    const ranked = rankAndMarkBestResult(results);
    const best = ranked.find((r) => r.is_best);

    assert.equal(best, undefined, 'No result marked best if all failed');
  });

  it('correctly calculates honest metric badges (Best overall, Highest yield, Lowest cost, Fastest)', () => {
    const results: OptimizationResult[] = [
      makeMockResult({ algorithm_id: 'bfd', algorithm_name: 'BFD', net_utilization_pct: 40.0, blocks_used_count: 5, total_cuts_count: 200, runtime_ms: 10, is_best: false }),
      makeMockResult({ algorithm_id: 'ffd', algorithm_name: 'FFD', net_utilization_pct: 58.0, blocks_used_count: 4, total_cuts_count: 250, runtime_ms: 15, is_best: true }),
      makeMockResult({ algorithm_id: 'ortools', algorithm_name: 'ORT', net_utilization_pct: 62.0, blocks_used_count: 5, total_cuts_count: 220, runtime_ms: 1000, is_best: false }),
    ];

    const badges = calculateMetricBadges(results);
    assert.equal(badges['ffd'].isBestOverall, true);
    assert.equal(badges['ortools'].isHighestYield, true);
    assert.equal(badges['bfd'].isFastest, true);
  });

  it('calculates efficiency points relative to the fastest baseline', () => {
    const results: OptimizationResult[] = [
      makeMockResult({ algorithm_id: 'bfd', net_utilization_pct: 40.0, runtime_ms: 10 }),
      makeMockResult({ algorithm_id: 'sa', net_utilization_pct: 45.0, runtime_ms: 1010 }),
    ];

    const effBFD = calculateEfficiency(results[0], results);
    const effSA = calculateEfficiency(results[1], results);

    assert.equal(effBFD, 'Baseline');
    assert.ok(effSA.includes('pts/s') || effSA.includes('pts'));
  });

  it('generates transparent factual one-paragraph benchmark summary', () => {
    const results: OptimizationResult[] = [
      makeMockResult({ algorithm_id: 'bfd', algorithm_name: 'BFD', net_utilization_pct: 40.0, blocks_used_count: 5, total_cuts_count: 200, runtime_ms: 10 }),
      makeMockResult({ algorithm_id: 'ffd', algorithm_name: 'FFD', net_utilization_pct: 58.0, blocks_used_count: 4, total_cuts_count: 250, runtime_ms: 15 }),
    ];

    const summary = generateBenchmarkSummary(results);
    assert.ok(summary.includes('FFD'));
    assert.ok(summary.includes('not proven optimal'));
  });
});
