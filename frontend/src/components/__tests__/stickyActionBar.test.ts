import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { computeStickyBarState } from '../../services/recommender.ts';
import type { OptimizationResult } from '../../types.ts';

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
  total_parts_demanded: 154,
  total_parts_placed: 154,
  unplaced_parts: [],
  blocks_used_count: 2,
  blocks: [],
  total_gross_volume: 700000,
  total_usable_volume: 640000,
  total_parts_volume: 540000,
  total_kerf_volume: 20000,
  total_remnant_volume: 80000,
  total_unrecoverable_scrap_volume: 20000,
  gross_utilization_pct: 77.1,
  net_utilization_pct: 84.4,
  total_cuts_count: 24,
  estimated_saw_time_minutes: 14.5,
  runtime_ms: 320,
  validation: {
    is_valid: true,
    errors: [],
    warnings: [],
    volume_reconciliation: {
      total_gross_volume: 700000,
      total_usable_volume: 640000,
      total_skin_trim_volume: 60000,
      total_parts_volume: 540000,
      total_remnants_volume: 80000,
      total_kerf_volume: 20000,
      total_scrap_volume: 20000,
      reconciliation_delta: 0,
    },
  },
};

describe('StickyActionBar State & Tooltip Tests', () => {
  test('Disabled when optimization is in progress', () => {
    const state = computeStickyBarState(mockResult, true, false, 'step2');
    assert.strictEqual(state.isDisabled, true);
    assert.ok(state.tooltipMessage.includes('solving heuristics'));
  });

  test('Disabled when inputs are stale', () => {
    const state = computeStickyBarState(mockResult, false, true, 'step2');
    assert.strictEqual(state.isDisabled, true);
    assert.ok(state.tooltipMessage.includes('Inputs have been modified'));
  });

  test('Disabled when result is missing', () => {
    const state = computeStickyBarState(null, false, false, 'step2');
    assert.strictEqual(state.isDisabled, true);
    assert.ok(state.tooltipMessage.includes('No optimization result available'));
  });

  test('Disabled when result validation failed', () => {
    const invalidResult: OptimizationResult = {
      ...mockResult,
      validation: { ...mockResult.validation, is_valid: false, errors: ['Part overlaps bounding box'] },
    };
    const state = computeStickyBarState(invalidResult, false, false, 'step2');
    assert.strictEqual(state.isDisabled, true);
    assert.ok(state.tooltipMessage.includes('failed geometric validation'));
  });

  test('Enabled with valid result', () => {
    const state = computeStickyBarState(mockResult, false, false, 'step2');
    assert.strictEqual(state.isDisabled, false);
    assert.strictEqual(state.tooltipMessage, '');
    assert.strictEqual(state.primaryLabel, 'Generate 3D Cutting Plan & Visualization');
    assert.strictEqual(state.secondaryLabel, 'Back to inputs');
  });

  test('Step 3 mode labels switch to forward execution', () => {
    const state = computeStickyBarState(mockResult, false, false, 'step3');
    assert.strictEqual(state.isDisabled, false);
    assert.strictEqual(state.primaryLabel, 'Proceed to Results & Execution');
    assert.strictEqual(state.secondaryLabel, 'Back to algorithm');
  });
});
