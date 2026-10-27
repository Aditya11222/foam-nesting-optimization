import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  isSixteenthInch,
  computeUsableDimensions,
  evaluateStockSufficiency,
  recommendMachine,
  recommendObjective,
  evaluateManualMachine,
  recommendStrategy,
  evaluateBestMeasuredStrategy,
  validateScreen1Inputs,
} from '../recommender.ts';
import type { MachineProfile, BlockInput, PartItem, OptimizationResult } from '../../types.ts';

const mockMachines: MachineProfile[] = [
  {
    id: 'saw-short',
    name: 'Short Clearance Saw',
    cut_type: 'guillotine',
    max_cut_height: 36.0,
    kerf: 0.125,
    automation: 'manual',
    preferred_direction: 'X',
    hourly_rate: 40.0,
    feed_rate_ipm: 60.0,
  },
  {
    id: 'saw-tall-speed',
    name: 'Tall High-Speed Saw',
    cut_type: 'guillotine',
    max_cut_height: 52.0,
    kerf: 0.125,
    automation: 'CNC',
    preferred_direction: 'X',
    hourly_rate: 70.0,
    feed_rate_ipm: 140.0,
  },
  {
    id: 'saw-tall-thin-kerf',
    name: 'Tall Precision Kerf Saw',
    cut_type: 'guillotine',
    max_cut_height: 50.0,
    kerf: 0.0625,
    automation: 'rotating',
    preferred_direction: 'Z',
    hourly_rate: 80.0,
    feed_rate_ipm: 90.0,
  },
];

describe('Recommender Engine Unit Tests', () => {
  test('1/16" grid precision validation', () => {
    assert.strictEqual(isSixteenthInch(0.0625), true);
    assert.strictEqual(isSixteenthInch(1.125), true);
    assert.strictEqual(isSixteenthInch(40.0), true);
    assert.strictEqual(isSixteenthInch(0.07), false);
    assert.strictEqual(isSixteenthInch(-1.0), false);
  });

  test('Usable interior dimension computation', () => {
    // 108 x 82 x 40 with 1.0" trim -> 106 x 80 x 38
    const usable = computeUsableDimensions(108.0, 82.0, 40.0, 1.0);
    assert.strictEqual(usable.isValid, true);
    assert.strictEqual(usable.length, 106.0);
    assert.strictEqual(usable.width, 80.0);
    assert.strictEqual(usable.height, 38.0);

    // Negative usable dimension
    const invalid = computeUsableDimensions(10.0, 10.0, 5.0, 3.0);
    assert.strictEqual(invalid.isValid, false);
    assert.ok(invalid.error?.includes('non-positive'));
  });

  test('Hard filter: 38" usable block height rejects machines limited below 38"', () => {
    const blocks: BlockInput[] = [
      { nominal_length: 108.0, nominal_width: 82.0, nominal_height: 40.0, grade: 'HR-40', quantity: 1 },
    ];
    const parts: PartItem[] = [
      { id: 'p1', sku: 'P-1', name: 'Pad', grade: 'HR-40', length: 24, width: 24, height: 6, quantity: 4, orientation_mode: 'rise-locked' },
    ];
    const skinTrim = 1.0; // usable height = 38.0"

    const rec = recommendMachine(mockMachines, blocks, parts, skinTrim, 'balanced', 'HR-40');
    assert.ok(rec.recommendedMachine);
    assert.notStrictEqual(rec.recommendedMachine.id, 'saw-short');
    assert.ok(rec.rejectedReasons['saw-short'].includes('Throat clearance (36") is smaller than block usable height (38.0")'));
  });

  test('Objective changes choice on crafted example', () => {
    const blocks: BlockInput[] = [
      { nominal_length: 108.0, nominal_width: 82.0, nominal_height: 40.0, grade: 'HR-40', quantity: 2 },
    ];
    const parts: PartItem[] = [
      { id: 'p1', sku: 'P-1', name: 'Pad', grade: 'HR-40', length: 24, width: 24, height: 6, quantity: 20, orientation_mode: 'rise-locked' },
    ];
    const skinTrim = 1.0;

    // Under minimize_time -> picks tall high-speed saw (140 IPM)
    const recTime = recommendMachine(mockMachines, blocks, parts, skinTrim, 'minimize_time', 'HR-40');
    assert.strictEqual(recTime.recommendedMachine?.id, 'saw-tall-speed');

    // Under maximize_yield -> picks tall precision thin-kerf saw (0.0625" kerf)
    const recYield = recommendMachine(mockMachines, blocks, parts, skinTrim, 'maximize_yield', 'HR-40');
    assert.strictEqual(recYield.recommendedMachine?.id, 'saw-tall-thin-kerf');
  });

  test('No machine qualifies diagnostic message', () => {
    const blocks: BlockInput[] = [
      { nominal_length: 108.0, nominal_width: 82.0, nominal_height: 60.0, grade: 'HR-40', quantity: 1 },
    ];
    const parts: PartItem[] = [
      { id: 'p1', sku: 'P-1', name: 'Huge Block', grade: 'HR-40', length: 20, width: 20, height: 20, quantity: 1, orientation_mode: 'rise-locked' },
    ];
    const skinTrim = 1.0; // usable height = 58.0", all machines are <= 52.0"

    const rec = recommendMachine(mockMachines, blocks, parts, skinTrim, 'balanced', 'HR-40');
    assert.strictEqual(rec.hasNoEligible, true);
    assert.strictEqual(rec.recommendedMachine, null);
    assert.ok(rec.failureMessage?.includes('58.0"'));
  });

  test('Stock sufficiency warning when demand exceeds block volume', () => {
    const blocks: BlockInput[] = [
      { nominal_length: 108.0, nominal_width: 82.0, nominal_height: 40.0, grade: 'HR-40', quantity: 1 },
    ];
    // 50 parts of 30x30x20 = 18,000 * 50 = 900,000 cu in. Usable bun = 106*80*38 = 322,240 cu in.
    const parts: PartItem[] = [
      { id: 'p1', sku: 'P-HEAVY', name: 'Heavy Core', grade: 'HR-40', length: 30, width: 30, height: 20, quantity: 50, orientation_mode: 'rise-locked' },
    ];
    const stock = evaluateStockSufficiency(blocks, parts, 1.0);
    assert.strictEqual(stock.isSufficient, false);
    assert.ok(stock.estimatedMinBlocksNeeded >= 3);
    assert.ok(stock.warningMessage?.includes('Estimated minimum blocks needed:'));
  });

  test('Manual machine validation checks render with real values', () => {
    const blocks: BlockInput[] = [
      { nominal_length: 108.0, nominal_width: 82.0, nominal_height: 40.0, grade: 'HR-40', quantity: 1 },
    ];
    const parts: PartItem[] = [
      { id: 'p1', sku: 'P-1', name: 'Pad', grade: 'HR-40', length: 24, width: 24, height: 6, quantity: 4, orientation_mode: 'rise-locked' },
    ];
    // Manual choice with insufficient throat height (36" < 38")
    const val = evaluateManualMachine(mockMachines[0], blocks, parts, 1.0);
    assert.strictEqual(val.isPass, false);
    assert.strictEqual(val.checks[0].passed, false);
    assert.ok(val.checks[0].message.includes('throat clearance 36" is smaller than block usable height 38.0"'));
  });

  test('Screen 1 validation before Continue to Screen 2', () => {
    const validBlocks: BlockInput[] = [
      { nominal_length: 108.0, nominal_width: 82.0, nominal_height: 40.0, grade: 'HR-40', quantity: 2 },
    ];
    const validParts: PartItem[] = [
      { id: 'p1', sku: 'P1', name: 'Seat', grade: 'HR-40', length: 24.0, width: 24.0, height: 6.0, quantity: 10, orientation_mode: 'rise-locked' },
    ];

    // 1. Valid inputs pass
    const passRes = validateScreen1Inputs(validBlocks, validParts, 1.0, mockMachines[1]);
    assert.strictEqual(passRes.isValid, true);

    // 2. Empty blocks fail
    const emptyBlocksRes = validateScreen1Inputs([], validParts, 1.0, mockMachines[1]);
    assert.strictEqual(emptyBlocksRes.isValid, false);
    assert.strictEqual(emptyBlocksRes.field, 'blocks');

    // 3. Empty parts fail
    const emptyPartsRes = validateScreen1Inputs(validBlocks, [], 1.0, mockMachines[1]);
    assert.strictEqual(emptyPartsRes.isValid, false);
    assert.strictEqual(emptyPartsRes.field, 'parts');

    // 4. Non-1/16" precision fails
    const badGridBlocks: BlockInput[] = [
      { nominal_length: 108.123, nominal_width: 82.0, nominal_height: 40.0, grade: 'HR-40', quantity: 1 },
    ];
    const gridRes = validateScreen1Inputs(badGridBlocks, validParts, 1.0, mockMachines[1]);
    assert.strictEqual(gridRes.isValid, false);
    assert.ok(gridRes.errorMessage?.includes('precision grid'));

    // 5. Block height exceeding machine throat clearance fails
    // usable height = 50 - 2 = 48", machine max = 36"
    const tallBlocks: BlockInput[] = [
      { nominal_length: 108.0, nominal_width: 82.0, nominal_height: 50.0, grade: 'HR-40', quantity: 1 },
    ];
    const throatRes = validateScreen1Inputs(tallBlocks, validParts, 1.0, mockMachines[0]);
    assert.strictEqual(throatRes.isValid, false);
    assert.strictEqual(throatRes.field, 'machine');
    assert.ok(throatRes.errorMessage?.includes('throat clearance'));
  });

  test('Rule-based strategy recommender evaluates features accurately', () => {
    const blocks: BlockInput[] = [
      { nominal_length: 108.0, nominal_width: 82.0, nominal_height: 40.0, grade: 'HR-40', quantity: 3 },
    ];

    // Case 1: Free cut machine (waterjet/contour) -> 3D free nesting heuristic
    const freeMachine: MachineProfile = {
      ...mockMachines[1],
      cut_type: 'free',
    };
    const parts1: PartItem[] = [
      { id: 'p1', sku: 'P1', name: 'Profile', grade: 'HR-40', length: 20, width: 20, height: 10, quantity: 5, orientation_mode: 'any' },
    ];
    const recFree = recommendStrategy(blocks, parts1, freeMachine, 'balanced');
    assert.strictEqual(recFree.ruleStrategyId, 'free_nesting_heuristic');
    assert.ok(recFree.ruleReason.includes('contour toolpaths'));

    // Case 2: Repetitive demand with few SKUs (2 SKUs, 50 pcs) -> ortools_pattern_selection
    const partsRepetitive: PartItem[] = [
      { id: 'p1', sku: 'A', name: 'A', grade: 'HR-40', length: 20, width: 20, height: 5, quantity: 30, orientation_mode: 'rise-locked' },
      { id: 'p2', sku: 'B', name: 'B', grade: 'HR-40', length: 15, width: 15, height: 5, quantity: 20, orientation_mode: 'rise-locked' },
    ];
    const recPattern = recommendStrategy(blocks, partsRepetitive, mockMachines[1], 'balanced');
    assert.strictEqual(recPattern.ruleStrategyId, 'ortools_pattern_selection');
    assert.ok(recPattern.ruleReason.includes('pattern selection'));

    // Case 3: Multi-block load with diverse pieces (4 SKUs, 60 pcs, 3 blocks) -> ortools_block_assignment
    const partsMulti: PartItem[] = [
      { id: 'p1', sku: 'A', name: 'A', grade: 'HR-40', length: 20, width: 20, height: 5, quantity: 15, orientation_mode: 'rise-locked' },
      { id: 'p2', sku: 'B', name: 'B', grade: 'HR-40', length: 15, width: 15, height: 5, quantity: 15, orientation_mode: 'rise-locked' },
      { id: 'p3', sku: 'C', name: 'C', grade: 'HR-40', length: 10, width: 10, height: 5, quantity: 15, orientation_mode: 'rise-locked' },
      { id: 'p4', sku: 'D', name: 'D', grade: 'HR-40', length: 12, width: 12, height: 5, quantity: 15, orientation_mode: 'rise-locked' },
    ];
    const recMulti = recommendStrategy(blocks, partsMulti, mockMachines[1], 'balanced');
    assert.strictEqual(recMulti.ruleStrategyId, 'ortools_block_assignment');
    assert.ok(recMulti.ruleReason.includes('CP-SAT block assignment'));
  });

  test('Benchmark evidence re-evaluation switches to best measured result transparently', () => {
    const mockResults: OptimizationResult[] = [
      {
        job_id: 'JOB-1',
        grade: 'HR-40',
        algorithm_id: 'best_fit_decreasing',
        algorithm_name: 'Best-Fit Decreasing',
        solution_type: 'guillotine_3d',
        timestamp: new Date().toISOString(),
        machine: mockMachines[1],
        total_parts_demanded: 50,
        total_parts_placed: 48,
        unplaced_parts: [],
        blocks_used_count: 2,
        blocks: [],
        total_gross_volume: 700000,
        total_usable_volume: 640000,
        total_parts_volume: 500000,
        total_kerf_volume: 20000,
        total_remnant_volume: 120000,
        total_unrecoverable_scrap_volume: 20000,
        gross_utilization_pct: 71.4,
        net_utilization_pct: 78.1,
        total_cuts_count: 32,
        estimated_saw_time_minutes: 18.5,
        runtime_ms: 120,
        validation: { is_valid: true, errors: [], warnings: [], volume_reconciliation: {} as any },
      },
      {
        job_id: 'JOB-1',
        grade: 'HR-40',
        algorithm_id: 'ortools_block_assignment',
        algorithm_name: 'OR-Tools Block Assignment',
        solution_type: 'guillotine_3d',
        timestamp: new Date().toISOString(),
        machine: mockMachines[1],
        total_parts_demanded: 50,
        total_parts_placed: 50,
        unplaced_parts: [],
        blocks_used_count: 2,
        blocks: [],
        total_gross_volume: 700000,
        total_usable_volume: 640000,
        total_parts_volume: 540000,
        total_kerf_volume: 22000,
        total_remnant_volume: 80000,
        total_unrecoverable_scrap_volume: 18000,
        gross_utilization_pct: 77.1,
        net_utilization_pct: 84.4,
        total_cuts_count: 28,
        estimated_saw_time_minutes: 15.2,
        runtime_ms: 450,
        validation: { is_valid: true, errors: [], warnings: [], volume_reconciliation: {} as any },
      },
    ];

    // Initial rule prior was 'best_fit_decreasing'
    const evaluated = evaluateBestMeasuredStrategy(
      mockResults,
      'maximize_yield',
      'best_fit_decreasing',
      'Fast greedy packing'
    );

    assert.strictEqual(evaluated.isSwitchedFromRule, true);
    assert.strictEqual(evaluated.finalStrategyId, 'ortools_block_assignment');
    assert.ok(evaluated.switchedNotice?.includes('Auto-switched from initial rule pick'));
    assert.ok(evaluated.switchedNotice?.includes('+6.3%'));
    assert.ok(evaluated.measuredEvidence?.includes('84.4%'));
    assert.strictEqual(
      evaluated.wordingDisclaimer,
      'Best among the tested heuristics for this input and objective. Not proven optimal.'
    );
  });
});
