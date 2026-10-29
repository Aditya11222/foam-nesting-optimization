import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { computeCostReconciliation, formatCurrencyShort } from '../costReconciliation.ts';

describe('Cost Reconciliation and Baseline vs. Optimized Tests', () => {
  const unitCost = 4.5;
  const sawRatePerHour = 65.0;
  const remnantCreditPct = 40.0;

  // Realistic sample scenario:
  // Baseline: 3 buns (615.0 ft³), 250.0 ft³ scrap, 0.40 saw hours
  // Foam = 615 * 4.5 = 2767.5, Saw = 0.40 * 65 = 26.0, Net = 2793.5
  const baselineGrossCuFt = 615.0;
  const baselineScrapCuFt = 250.0;
  const baselineBlocks = 3;
  const baselineSawHours = 0.40;
  const baselineTotalCost = 615.0 * 4.5 + 0.40 * 65.0; // 2793.5

  // Optimized: 2 buns (410.0 ft³), 80.0 ft³ scrap, 40.0 ft³ remnants, 0.25 saw hours
  // Foam = 410 * 4.5 = 1845.0, Saw = 0.25 * 65 = 16.25
  // Credit = 40.0 * 4.5 * 0.40 = 72.0
  // Net = 1845 + 16.25 - 72.0 = 1789.25
  const optGrossCuFt = 410.0;
  const optScrapCuFt = 80.0;
  const optRemnantsCuFt = 40.0;
  const optSawHours = 0.25;
  const optMaterialCost = optGrossCuFt * unitCost; // 1845.0
  const optSawCost = optSawHours * sawRatePerHour; // 16.25
  const optRemnantCredit = optRemnantsCuFt * unitCost * (remnantCreditPct / 100.0); // 72.0
  const optNetJobCost = optMaterialCost + optSawCost - optRemnantCredit; // 1789.25
  const optimizedBlocksCount = 2;

  test('Strictly reconciles Foam + Saw - Remnant Credit = Net Cost to the cent for both series', () => {
    const report = computeCostReconciliation(
      unitCost,
      sawRatePerHour,
      baselineGrossCuFt,
      baselineScrapCuFt,
      baselineBlocks,
      baselineSawHours,
      baselineTotalCost,
      optScrapCuFt,
      optMaterialCost,
      optSawCost,
      optRemnantCredit,
      optNetJobCost,
      optimizedBlocksCount
    );

    assert.strictEqual(report.isFullyReconciled, true);
    assert.strictEqual(report.baselineReconciled, true);
    assert.strictEqual(report.optimizedReconciled, true);
    assert.strictEqual(report.reconciliationError, undefined);
  });

  test('Flags visible reconciliation error if arithmetic mismatch exceeds 1 cent', () => {
    const faultyBaselineCost = baselineTotalCost + 50.0; // mismatch!
    const report = computeCostReconciliation(
      unitCost,
      sawRatePerHour,
      baselineGrossCuFt,
      baselineScrapCuFt,
      baselineBlocks,
      baselineSawHours,
      faultyBaselineCost,
      optScrapCuFt,
      optMaterialCost,
      optSawCost,
      optRemnantCredit,
      optNetJobCost,
      optimizedBlocksCount
    );

    assert.strictEqual(report.isFullyReconciled, false);
    assert.strictEqual(report.baselineReconciled, false);
    assert.ok(report.reconciliationError?.includes('Reconciliation delta detected'));
  });

  test('Never includes non-dollar categories like "Buns (qty)" in the chart categories', () => {
    const report = computeCostReconciliation(
      unitCost,
      sawRatePerHour,
      baselineGrossCuFt,
      baselineScrapCuFt,
      baselineBlocks,
      baselineSawHours,
      baselineTotalCost,
      optScrapCuFt,
      optMaterialCost,
      optSawCost,
      optRemnantCredit,
      optNetJobCost,
      optimizedBlocksCount
    );

    const categoryNames = report.categories.map((c) => c.category);
    assert.strictEqual(categoryNames.includes('Buns (qty)'), false);
    assert.strictEqual(categoryNames.includes('Buns'), false);
    assert.strictEqual(categoryNames.includes('Blocks (u)'), false);
    // All items should be dollar cost categories
    assert.ok(categoryNames.includes('Foam Cost'));
    assert.ok(categoryNames.includes('Scrap Cost'));
    assert.ok(categoryNames.includes('Saw Time'));
    assert.ok(categoryNames.includes('Remnant Credit'));
    assert.ok(categoryNames.includes('Net Cost'));
  });

  test('Formats direct currency labels with comma thousands separators', () => {
    assert.strictEqual(formatCurrencyShort(1845.2), '$1,845');
    assert.strictEqual(formatCurrencyShort(2793.5), '$2,794');
    assert.strictEqual(formatCurrencyShort(-72.0), '-$72');
    assert.strictEqual(formatCurrencyShort(0), '$0');
  });

  test('Computes real net savings chip and data-driven bun count footnote', () => {
    const report = computeCostReconciliation(
      unitCost,
      sawRatePerHour,
      baselineGrossCuFt,
      baselineScrapCuFt,
      baselineBlocks,
      baselineSawHours,
      baselineTotalCost,
      optScrapCuFt,
      optMaterialCost,
      optSawCost,
      optRemnantCredit,
      optNetJobCost,
      optimizedBlocksCount
    );

    // Saving = 2793.5 - 1789.25 = 1004.25 -> 35.95% -> 35.9%
    assert.ok(report.savingsChipText.includes('Net saving $1,004'));
    assert.ok(report.savingsChipText.includes('35.9%'));
    assert.strictEqual(
      report.bunReductionText,
      'Optimized layout uses 2 buns vs 3 in the baseline'
    );
  });

  test('Hides Remnant Credit category when both series have zero credit', () => {
    const zeroCreditReport = computeCostReconciliation(
      unitCost,
      sawRatePerHour,
      baselineGrossCuFt,
      baselineScrapCuFt,
      baselineBlocks,
      baselineSawHours,
      baselineTotalCost,
      optScrapCuFt,
      optMaterialCost,
      optSawCost,
      0.0, // 0 credit
      optMaterialCost + optSawCost,
      optimizedBlocksCount
    );

    assert.strictEqual(zeroCreditReport.hasRemnantCredit, false);
    const categoryNames = zeroCreditReport.categories.map((c) => c.category);
    assert.strictEqual(categoryNames.includes('Remnant Credit'), false);
  });
});
