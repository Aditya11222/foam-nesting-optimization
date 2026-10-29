import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { OptimizationResult } from '../../types.ts';
import { computeEfficiencyVsBaseline } from '../efficiencyBaseline.ts';

const mockBaseResult: OptimizationResult = {
  job_id: 'JOB-4821',
  grade: 'HR-40',
  algorithm_id: 'best_fit_decreasing',
  algorithm_name: 'Best-Fit Decreasing (BFD)',
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
  total_parts_demanded: 154,
  total_parts_placed: 154,
  unplaced_parts: [],
  blocks_used_count: 2,
  blocks: [],
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
  runtime_ms: 120,
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

describe('Efficiency vs Baseline Comparison Service Tests', () => {
  test('Correctly computes net usable yield delta against 41.2% baseline', () => {
    const report = computeEfficiencyVsBaseline(
      mockBaseResult,
      615.0, // baselineGrossCuFt (3 buns)
      250.0, // baselineScrapCuFt
      3,     // baselineBlocks
      0.35,  // baselineSawHours
      2800.0,// baselineTotalCost
      1800.0,// optNetJobCost
      410.0, // optGrossCuFt (2 buns)
      80.0   // optScrapCuFt
    );

    const yieldMetric = report.metrics.find((m) => m.key === 'net_yield');
    assert.ok(yieldMetric);
    assert.strictEqual(yieldMetric.baselineValue, 41.2);
    assert.strictEqual(yieldMetric.selectedValue, 78.4);
    assert.strictEqual(yieldMetric.delta, 37.2);
    assert.strictEqual(yieldMetric.deltaDisplay, '+37.2 pts');
    assert.strictEqual(yieldMetric.isImprovement, true);
    assert.strictEqual(yieldMetric.isWorse, false);
  });

  test('Labels worse yield with the word "worse" in rosewood formatting rule', () => {
    const poorResult: OptimizationResult = {
      ...mockBaseResult,
      net_utilization_pct: 38.0,
    };
    const report = computeEfficiencyVsBaseline(
      poorResult,
      615.0,
      250.0,
      3,
      0.35,
      2800.0,
      2900.0,
      410.0,
      80.0
    );

    const yieldMetric = report.metrics.find((m) => m.key === 'net_yield');
    assert.ok(yieldMetric);
    assert.strictEqual(yieldMetric.isImprovement, false);
    assert.strictEqual(yieldMetric.isWorse, true);
    assert.strictEqual(yieldMetric.deltaDisplay, '-3.2 pts worse');
  });

  test('Correctly computes blocks used reduction and scrap reduction', () => {
    const report = computeEfficiencyVsBaseline(
      mockBaseResult,
      615.0,
      250.0,
      3,
      0.35,
      2800.0,
      1800.0,
      410.0,
      80.0
    );

    const blocksMetric = report.metrics.find((m) => m.key === 'blocks_used');
    assert.ok(blocksMetric);
    assert.strictEqual(blocksMetric.delta, -1);
    assert.strictEqual(blocksMetric.deltaDisplay, '-1 bun');
    assert.strictEqual(blocksMetric.isImprovement, true);

    const scrapMetric = report.metrics.find((m) => m.key === 'scrap_pct');
    assert.ok(scrapMetric);
    assert.strictEqual(scrapMetric.isImprovement, true);
    assert.ok(scrapMetric.deltaDisplay.includes('%'));
  });

  test('Computes batch cost efficiency score percentage from real numbers', () => {
    const report = computeEfficiencyVsBaseline(
      mockBaseResult,
      615.0,
      250.0,
      3,
      0.35,
      2500.0, // baseline
      1500.0, // optimized -> 40% reduction
      410.0,
      80.0
    );

    assert.strictEqual(report.efficiencyScorePct, 40.0);
    assert.strictEqual(report.efficiencyScoreDisplay, '+40.0%');
    assert.ok(report.efficiencyScoreTooltip.includes('Formula:'));
  });

  test('Generates transparent data-driven summary without claiming optimality', () => {
    const report = computeEfficiencyVsBaseline(
      mockBaseResult,
      615.0,
      250.0,
      3,
      0.35,
      2500.0,
      1500.0,
      410.0,
      80.0
    );

    assert.ok(report.summaryText.includes('1 fewer bun'));
    assert.ok(report.summaryText.includes('+37.2 yield points'));
    assert.strictEqual(report.summaryText.includes('optimal'), false);
  });

  test('Detects and flags unplaced parts in comparison report', () => {
    const unplacedResult: OptimizationResult = {
      ...mockBaseResult,
      total_parts_demanded: 154,
      total_parts_placed: 150,
    };
    const report = computeEfficiencyVsBaseline(
      unplacedResult,
      615.0,
      250.0,
      3,
      0.35,
      2500.0,
      1500.0,
      410.0,
      80.0
    );

    assert.strictEqual(report.hasUnplaced, true);
    assert.strictEqual(report.unplacedCount, 4);
    assert.strictEqual(report.demandedCount, 154);
  });
});

