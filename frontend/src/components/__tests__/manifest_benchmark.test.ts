import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { OptimizationResult, MachineProfile, AlgorithmInfo } from '../../types.ts';
import {
  rankAndMarkBestResult,
  calculateMetricBadges,
  calculateEfficiency,
  generateBenchmarkSummary,
  isSingleCompatibleMachine,
} from '../../services/comparison.ts';

const mockResult: OptimizationResult = {
  job_id: 'JOB-4821',
  grade: 'HR-40',
  algorithm_id: 'ortools_block_assignment',
  algorithm_name: 'OR-Tools Block Assignment',
  solution_type: 'guillotine_3d',
  timestamp: new Date().toISOString(),
  machine: {
    id: 'saw-g2',
    name: 'Guillotine Saw Station 2',
    cut_type: 'guillotine',
    max_cut_height: 48,
    kerf: 0.125,
    automation: 'rotating',
    preferred_direction: 'X',
    hourly_rate: 65,
    feed_rate_ipm: 120,
  },
  total_parts_demanded: 16,
  total_parts_placed: 16,
  unplaced_parts: [],
  blocks_used_count: 2,
  blocks: [
    {
      block_index: 1,
      stock_id: 'bun-1',
      stock_type: 'bun',
      grade: 'HR-40',
      nominal_length: 108,
      nominal_width: 80,
      nominal_height: 41,
      usable_length: 106,
      usable_width: 78,
      usable_height: 39,
      skin_trim_loss_volume: 32000,
      placed_parts: [
        {
          part_id: 'p1',
          sku: 'CUSH-A',
          name: 'Cushion A',
          grade: 'HR-40',
          x: 1,
          y: 1,
          z: 1,
          length: 24,
          width: 18,
          height: 4,
          orientation_used: [24, 18, 4],
          color_hex: '#3b82f6',
        },
        {
          part_id: 'p2',
          sku: 'CUSH-A',
          name: 'Cushion A',
          grade: 'HR-40',
          x: 25,
          y: 1,
          z: 1,
          length: 24,
          width: 18,
          height: 4,
          orientation_used: [24, 18, 4],
          color_hex: '#3b82f6',
        },
      ],
      usable_remnants: [],
      cuts: [],
      gross_volume: 354240,
      usable_volume: 322452,
      parts_volume: 3456,
      kerf_loss_volume: 500,
      unrecoverable_scrap_volume: 20000,
      gross_utilization_pct: 75.0,
      net_utilization_pct: 82.0,
      material_recovery_pct: 85.0,
    },
  ],
  total_gross_volume: 708480,
  total_usable_volume: 644904,
  total_parts_volume: 500000,
  total_kerf_volume: 20000,
  total_remnant_volume: 80000,
  total_unrecoverable_scrap_volume: 44904,
  gross_utilization_pct: 70.5,
  net_utilization_pct: 78.4,
  total_cuts_count: 24,
  estimated_saw_time_minutes: 14.5,
  runtime_ms: 350,
  validation: {
    is_valid: true,
    errors: [],
    warnings: [],
    volume_reconciliation: {
      total_gross_volume: 708480,
      total_usable_volume: 644904,
      total_skin_trim_volume: 63576,
      total_parts_volume: 500000,
      total_remnants_volume: 80000,
      total_kerf_volume: 20000,
      total_scrap_volume: 44904,
      reconciliation_delta: 0,
    },
  },
};

const mockBFD: OptimizationResult = {
  ...mockResult,
  algorithm_id: 'best_fit_decreasing',
  algorithm_name: 'Best-Fit Decreasing (BFD)',
  net_utilization_pct: 74.3,
  blocks_used_count: 2,
  total_cuts_count: 28,
  runtime_ms: 80,
};

describe('Screen 2 Placement Manifest & Benchmark Verification', () => {
  test('Placement manifest calculates placed and requested quantities accurately', () => {
    const partsCount = mockResult.blocks.reduce(
      (acc, b) => acc + b.placed_parts.length,
      0
    );
    assert.strictEqual(partsCount, 2);
    assert.strictEqual(mockResult.total_parts_placed, 16);
  });

  test('Benchmark ranking assigns Best overall to top heuristic under objective', () => {
    const ranked = rankAndMarkBestResult([mockBFD, mockResult]);
    const best = ranked.find((r) => r.is_best);
    assert.ok(best);
    assert.strictEqual(best.algorithm_id, 'ortools_block_assignment');
    assert.strictEqual(best.net_utilization_pct, 78.4);
  });

  test('Benchmark badges correctly award Best overall and Fastest to distinct rows', () => {
    const ranked = rankAndMarkBestResult([mockBFD, mockResult]);
    const badges = calculateMetricBadges(ranked);

    // ortools is best overall (78.4% vs 74.3%)
    assert.strictEqual(badges['ortools_block_assignment'].isBestOverall, true);
    assert.strictEqual(badges['ortools_block_assignment'].isFastest, false);

    // BFD is fastest (80ms vs 350ms)
    assert.strictEqual(badges['best_fit_decreasing'].isFastest, true);
    assert.strictEqual(badges['best_fit_decreasing'].isBestOverall, false);
  });

  test('Calculates efficiency points per second relative to baseline', () => {
    const ranked = rankAndMarkBestResult([mockBFD, mockResult]);
    const bfdEfficiency = calculateEfficiency(mockBFD, ranked);
    const ortoolsEfficiency = calculateEfficiency(mockResult, ranked);

    assert.strictEqual(bfdEfficiency, 'Baseline');
    assert.ok(ortoolsEfficiency.includes('pts/s') || ortoolsEfficiency.includes('pts'));
  });

  test('Generates honest factual summary without claiming optimality', () => {
    const ranked = rankAndMarkBestResult([mockBFD, mockResult]);
    const summary = generateBenchmarkSummary(ranked);

    assert.ok(summary.includes('OR-Tools Block Assignment'));
    assert.ok(summary.includes('Best-Fit Decreasing (BFD)'));
    assert.ok(summary.includes('Best among the tested heuristics, not proven optimal.'));
    assert.strictEqual(summary.includes('provably optimal'), false);
    assert.strictEqual(summary.includes('mathematically optimal'), false);
  });

  test('Detects when a machine has only 1 compatible algorithm', () => {
    const guillotineMachine: MachineProfile = {
      id: 'g1',
      name: 'Guillotine G1',
      cut_type: 'guillotine',
      max_cut_height: 48,
      kerf: 0.125,
      automation: 'manual',
      preferred_direction: 'X',
      hourly_rate: 65,
      feed_rate_ipm: 100,
    };

    const algos: AlgorithmInfo[] = [
      {
        id: 'free_contour',
        name: 'Free-Contour Nesting',
        description: 'Free',
        speed_tag: 'Fast',
        supported_cut_types: ['free'],
      },
      {
        id: 'bfd',
        name: 'Best-Fit Decreasing',
        description: 'BFD',
        speed_tag: 'Fast',
        supported_cut_types: ['guillotine'],
      },
    ];

    const isSingle = isSingleCompatibleMachine(guillotineMachine, algos);
    assert.strictEqual(isSingle, true);
  });
});

