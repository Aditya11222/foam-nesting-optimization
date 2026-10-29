import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { computeVolumeBreakdown, CU_FT_IN_CU_IN, VOLUME_COLORS } from '../volumeBreakdown.ts';
import type { OptimizationResult, MachineProfile } from '../../types.ts';

const mockMachine: MachineProfile = {
  id: 'm1',
  name: 'CNC Wire Saw',
  cut_type: 'free',
  max_cut_height: 48,
  kerf: 0.125,
  automation: 'CNC',
  preferred_direction: 'x'
};

function createMockResult(overrides: Partial<OptimizationResult> = {}): OptimizationResult {
  const grossCuIn = 709171.2;
  const usableCuIn = 606969.6;
  const partsCuIn = 380846.1;
  const remnantsCuIn = 204288.0;
  const scrapCuIn = 69465.6;
  const kerfCuIn = usableCuIn - (partsCuIn + remnantsCuIn + scrapCuIn);

  return {
    job_id: 'job-101',
    grade: 'HR-40',
    algorithm_id: 'guillotine_first_fit',
    algorithm_name: 'Guillotine First Fit',
    solution_type: 'guillotine',
    timestamp: '2026-10-29T12:00:00Z',
    machine: mockMachine,
    total_parts_demanded: 48,
    total_parts_placed: 48,
    unplaced_parts: [],
    blocks_used_count: 2,
    blocks: [
      {
        block_index: 1,
        stock_id: 'B1',
        stock_type: 'bun',
        grade: 'HR-40',
        nominal_length: 108,
        nominal_width: 76,
        nominal_height: 43.2,
        usable_length: 106,
        usable_width: 74,
        usable_height: 41.2,
        skin_trim_loss_volume: (grossCuIn - usableCuIn) / 2,
        placed_parts: [],
        usable_remnants: [{ id: 'r1', length: 40, width: 30, height: 20, volume: remnantsCuIn / 2, material_grade: 'HR-40', created_from_block_id: 'B1', orientation: 'any', position: [0, 0, 0] }],
        cuts: [],
        gross_volume: grossCuIn / 2,
        usable_volume: usableCuIn / 2,
        parts_volume: partsCuIn / 2,
        kerf_loss_volume: kerfCuIn / 2,
        unrecoverable_scrap_volume: scrapCuIn / 2,
        gross_utilization_pct: 53.7,
        net_utilization_pct: 62.7,
        material_recovery_pct: 82.5
      },
      {
        block_index: 2,
        stock_id: 'B2',
        stock_type: 'bun',
        grade: 'HR-40',
        nominal_length: 108,
        nominal_width: 76,
        nominal_height: 43.2,
        usable_length: 106,
        usable_width: 74,
        usable_height: 41.2,
        skin_trim_loss_volume: (grossCuIn - usableCuIn) / 2,
        placed_parts: [],
        usable_remnants: [{ id: 'r2', length: 40, width: 30, height: 20, volume: remnantsCuIn / 2, material_grade: 'HR-40', created_from_block_id: 'B2', orientation: 'any', position: [0, 0, 0] }],
        cuts: [],
        gross_volume: grossCuIn / 2,
        usable_volume: usableCuIn / 2,
        parts_volume: partsCuIn / 2,
        kerf_loss_volume: kerfCuIn / 2,
        unrecoverable_scrap_volume: scrapCuIn / 2,
        gross_utilization_pct: 53.7,
        net_utilization_pct: 62.7,
        material_recovery_pct: 82.5
      }
    ],
    total_gross_volume: grossCuIn,
    total_usable_volume: usableCuIn,
    total_parts_volume: partsCuIn,
    total_kerf_volume: kerfCuIn,
    total_remnant_volume: remnantsCuIn,
    total_unrecoverable_scrap_volume: scrapCuIn,
    gross_utilization_pct: 53.7,
    net_utilization_pct: 62.7,
    total_cuts_count: 36,
    estimated_saw_time_minutes: 42.5,
    runtime_ms: 185,
    validation: {
      is_valid: true,
      errors: [],
      warnings: [],
      volume_reconciliation: {
        total_gross_volume: grossCuIn,
        total_usable_volume: usableCuIn,
        total_skin_trim_volume: grossCuIn - usableCuIn,
        total_parts_volume: partsCuIn,
        total_remnants_volume: remnantsCuIn,
        total_kerf_volume: kerfCuIn,
        total_scrap_volume: scrapCuIn,
        reconciliation_delta: 0
      }
    },
    ...overrides
  };
}

describe('volumeBreakdown service', () => {
  test('correctly partitions gross volume into 5 categories totaling 100%', () => {
    const mock = createMockResult();
    const report = computeVolumeBreakdown(mock, 4.50, 65.0);

    assert.equal(report.categories.length, 5);
    const keys = report.categories.map((c) => c.key);
    assert.deepEqual(keys, ['parts', 'remnants', 'scrap', 'trim', 'kerf']);

    const totalShare = report.categories.reduce((acc, c) => acc + c.sharePct, 0);
    assert.ok(Math.abs(totalShare - 100.0) < 0.1);

    assert.equal(report.isReconciled, true);
    assert.ok(report.reconciliationDeltaCuFt < 0.01);
  });

  test('generates exact reconciliation equation string with gross volume', () => {
    const mock = createMockResult();
    const report = computeVolumeBreakdown(mock);

    assert.ok(report.reconciliationEquation.includes('+'));
    assert.ok(report.reconciliationEquation.includes('='));
    assert.ok(report.reconciliationEquation.includes(`${report.totalGrossCuFt.toFixed(1)} ft³ gross`));
    assert.ok(report.reconciliationEquationEs.includes(`${report.totalGrossCuFt.toFixed(1)} ft³ bruto`));
  });

  test('marks isReconciled as false if delta exceeds threshold', () => {
    const mock = createMockResult({
      total_parts_volume: 380846.1 - (50 * CU_FT_IN_CU_IN)
    });
    const report = computeVolumeBreakdown(mock);

    assert.equal(report.isReconciled, false);
    assert.ok(report.reconciliationDeltaCuFt > 10);
  });

  test('identifies largest loss category correctly', () => {
    const mock = createMockResult();
    const report = computeVolumeBreakdown(mock);

    assert.equal(report.largestLossCategory, 'trim');
    assert.equal(report.largestLossName, 'Skin Trim');
    assert.equal(report.largestLossNameEs, 'Desorillado');
    assert.ok(report.takeawaySentencesEn.some((s) => s.includes('Skin Trim is') && s.includes('largest volume reduction')));
  });

  test('distinguishes net usable yield from gross bun yield', () => {
    const mock = createMockResult();
    const report = computeVolumeBreakdown(mock);

    assert.ok(report.netYieldPct > report.grossYieldPct);
    assert.ok(report.yieldExplanationEn.includes('Net Usable Yield'));
    assert.ok(report.yieldExplanationEn.includes('Gross Yield'));
    assert.ok(report.yieldExplanationEs.includes('El rendimiento neto'));
  });

  test('calculates remnant credit correctly', () => {
    const mock = createMockResult();
    const report = computeVolumeBreakdown(mock, 4.50, 65.0);

    assert.equal(report.estimatedRemnantCreditDollars, 346);
  });

  test('generates unplaced parts takeaway sentence when parts are missing', () => {
    const mock = createMockResult({
      total_parts_demanded: 50,
      total_parts_placed: 45
    });
    const report = computeVolumeBreakdown(mock);

    assert.equal(report.hasUnplaced, true);
    assert.equal(report.unplacedCount, 5);
    const unplacedEn = report.takeawaySentencesEn.find((s) => s.includes('45 of 50 parts placed'));
    assert.ok(unplacedEn !== undefined);
    assert.ok(unplacedEn!.includes('yield calculated on placed pieces'));
  });

  test('provides per-block breakdown matching block count', () => {
    const mock = createMockResult();
    const report = computeVolumeBreakdown(mock);

    assert.equal(report.blocks.length, 2);
    assert.equal(report.blocks[0].blockLabel, 'Block #1');
    assert.equal(report.blocks[1].blockLabel, 'Block #2');
    assert.ok(Math.abs(report.blocks[0].grossVolumeCuFt - (report.totalGrossCuFt / 2)) < 0.1);
  });

  test('uses approved color tokens', () => {
    assert.equal(VOLUME_COLORS.parts, '#2563EB');
    assert.equal(VOLUME_COLORS.remnants, '#15803D');
    assert.equal(VOLUME_COLORS.scrap, '#DC2626');
    assert.equal(VOLUME_COLORS.trim, '#D97706');
    assert.equal(VOLUME_COLORS.kerf, '#7C3AED');
  });
});
