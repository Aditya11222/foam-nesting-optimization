import test from 'node:test';
import assert from 'node:assert/strict';
import { computeMachineEfficiency } from '../machineEfficiency.ts';
import type { OptimizationResult } from '../../types.ts';

const mockGuillotineResult: OptimizationResult = {
  job_id: 'JOB-MOCK-1',
  algorithm_id: 'maxrects',
  grade: 'HR-40',
  total_gross_volume: 354240.0,
  total_usable_volume: 295000.0,
  total_parts_volume: 185000.0,
  total_remnant_volume: 65000.0,
  total_unrecoverable_scrap_volume: 30000.0,
  total_kerf_volume: 15000.0,
  total_cuts_count: 52,
  estimated_saw_time_minutes: 32.5,
  net_utilization_pct: 62.7,
  gross_utilization_pct: 52.2,
  blocks_used_count: 1,
  total_parts_placed: 20,
  total_parts_demanded: 20,
  machine: {
    id: 'saw-g1',
    name: 'Guillotine Saw G1',
    cut_type: 'guillotine',
    kerf: 0.125,
    max_cut_height: 48,
    automation: 'manual',
    preferred_direction: 'x',
  },
  blocks: [],
  unplaced_parts: [],
};

const mockWaterjetResult: OptimizationResult = {
  job_id: 'JOB-MOCK-1',
  algorithm_id: 'maxrects',
  grade: 'HR-40',
  total_gross_volume: 354240.0,
  total_usable_volume: 295000.0,
  total_parts_volume: 192000.0,
  total_remnant_volume: 68000.0,
  total_unrecoverable_scrap_volume: 27500.0,
  total_kerf_volume: 7500.0, // 50% lower kerf
  total_cuts_count: 64,      // 12 more cuts
  estimated_saw_time_minutes: 48.0, // slower
  net_utilization_pct: 65.1,
  gross_utilization_pct: 54.2,
  blocks_used_count: 1,
  total_parts_placed: 20,
  total_parts_demanded: 20,
  machine: {
    id: 'saw-w1',
    name: 'CNC Waterjet W1',
    cut_type: 'free',
    kerf: 0.0625,
    max_cut_height: 48,
    automation: 'CNC',
    preferred_direction: 'any',
  },
  blocks: [],
  unplaced_parts: [],
};

test('computeMachineEfficiency: handles uncompared state with zero fabricated numbers', () => {
  const report = computeMachineEfficiency(mockGuillotineResult, null);

  assert.equal(report.hasComparison, false);
  assert.equal(report.activeMachineName, 'Guillotine Saw G1');
  assert.equal(report.otherMachineName, 'CNC Waterjet');
  assert.match(report.statusBadgeEn, /Awaiting/i);

  // Check metrics
  assert.equal(report.metrics.length, 3);
  const [kerf, cuts, time] = report.metrics;

  assert.equal(kerf.key, 'kerf');
  assert.equal(kerf.activeValue, 15000.0);
  assert.equal(kerf.otherValue, null);
  assert.equal(kerf.deltaStatus, 'uncompared');
  assert.match(kerf.deltaDisplay, /Run on CNC Waterjet to compare/i);

  assert.equal(cuts.key, 'cuts');
  assert.equal(cuts.activeValue, 52);
  assert.equal(cuts.otherValue, null);
  assert.equal(cuts.deltaStatus, 'uncompared');

  assert.equal(time.key, 'time');
  assert.equal(time.activeValue, 32.5);
  assert.equal(time.otherValue, null);
  assert.equal(time.deltaStatus, 'uncompared');

  // Honest caption
  assert.match(report.summaryTextEn, /Active run uses Guillotine Saw G1/i);
  assert.match(report.summaryTextEs, /La ejecución activa utiliza Guillotine Saw G1/i);
});

test('computeMachineEfficiency: computes real comparison when alternative machine has run', () => {
  const report = computeMachineEfficiency(mockGuillotineResult, [mockWaterjetResult]);

  assert.equal(report.hasComparison, true);
  assert.equal(report.activeMachineName, 'Guillotine Saw G1');
  assert.equal(report.otherMachineName, 'CNC Waterjet W1');
  assert.match(report.statusBadgeEn, /Real comparison/i);

  const [kerf, cuts, time] = report.metrics;

  // Kerf: 15,000 active vs 7,500 other (-50% improvement)
  assert.equal(kerf.activeValue, 15000.0);
  assert.equal(kerf.otherValue, 7500.0);
  assert.equal(kerf.deltaStatus, 'improvement');
  assert.match(kerf.deltaDisplay, /−50\.0% kerf on CNC Waterjet W1/);

  // Cuts: 52 active vs 64 other (+12 more cuts, worse)
  assert.equal(cuts.activeValue, 52);
  assert.equal(cuts.otherValue, 64);
  assert.equal(cuts.deltaStatus, 'worse');
  assert.match(cuts.deltaDisplay, /\+12 cuts on CNC Waterjet W1/);

  // Time: 32.5 active vs 48.0 other (+47.7% slower, worse)
  assert.equal(time.activeValue, 32.5);
  assert.equal(time.otherValue, 48.0);
  assert.equal(time.deltaStatus, 'worse');
  assert.match(time.deltaDisplay, /\+47\.7% time on CNC Waterjet W1/);

  // Dynamic summary
  assert.match(report.summaryTextEn, /Empirical comparison between Guillotine Saw G1 and CNC Waterjet W1/i);
  assert.match(report.summaryTextEn, /50\.0% less kerf loss/i);
  assert.match(report.summaryTextEs, /50\.0% menos pérdida por kerf/i);
});
