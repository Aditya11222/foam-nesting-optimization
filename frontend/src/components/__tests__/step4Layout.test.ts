import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { computeCostReconciliation } from '../../services/costReconciliation.ts';

describe('Step 4 Layout & Chart Structure Tests', () => {
  const step4Path = resolve(process.cwd(), 'src/components/DashboardStep4.tsx');
  const fileContent = readFileSync(step4Path, 'utf-8');

  test('Cost Component Breakdown is removed from Step 4', () => {
    // Assert that the old chart 5 and its data selector are gone
    assert.ok(
      !fileContent.includes('costBreakdownBarData'),
      'costBreakdownBarData selector must be deleted'
    );
    assert.ok(
      !fileContent.includes("t('cost_component_breakdown')"),
      'cost_component_breakdown i18n key must not be rendered'
    );
    assert.ok(
      !fileContent.includes('Chart 5: Cost Component Breakdown'),
      'Chart 5 section must be removed'
    );
  });

  test('Grid implements three vertical columns with flex column inside each', () => {
    // Grid container with responsive classes: 3 cols (>1200px), 2 cols (801-1200px), 1 col (<=800px)
    assert.ok(
      fileContent.includes('min-[1201px]:grid-cols-3') && fileContent.includes('grid-cols-1'),
      'Must contain 3-column responsive grid container'
    );

    // Column 1 has Volume Breakdown
    assert.ok(
      fileContent.includes('Column 1: Volume Breakdown'),
      'Column 1 must contain Volume Breakdown'
    );

    // Column 2 has Efficiency vs Baseline and Per-Block Utilization
    assert.ok(
      fileContent.includes('Column 2: Efficiency vs Baseline + Per-Block Utilization'),
      'Column 2 must contain Efficiency vs Baseline and Per-Block'
    );

    // Column 3 has Baseline vs. Optimized and Machine Efficiency
    assert.ok(
      fileContent.includes('Column 3: Baseline vs. Optimized + Machine Efficiency Trade-offs'),
      'Column 3 must contain Baseline vs. Optimized and Machine Efficiency'
    );
  });

  test('Baseline vs. Optimized cost reconciliation passes strictly', () => {
    const report = computeCostReconciliation(
      4.50, // unitCost
      65.0, // sawRatePerHour
      615.0, // baselineGrossCuFt
      270.0, // baselineScrapCuFt
      3, // baselineBlocks
      0.5, // baselineSawHours
      615.0 * 4.50 + 0.5 * 65.0, // baselineTotalCost
      40.0, // optScrapCuFt
      1845.0, // optMaterialCost
      24.3, // optSawCost
      55.2, // optRemnantCredit
      1814.1, // optNetJobCost
      2, // blocksUsed
      48, // partsPlaced
      48 // partsDemanded
    );

    assert.equal(report.isFullyReconciled, true);
    assert.equal(report.optimizedReconciled, true);
    assert.ok(report.componentRows.length >= 3);
  });

  test('Per-Block Utilization presentation updates adhere to rules', () => {
    // Assert warm volume colors are used
    assert.ok(
      fileContent.includes('fill={VOLUME_COLORS.parts}') &&
      fileContent.includes('fill={VOLUME_COLORS.remnants}') &&
      fileContent.includes('fill={VOLUME_COLORS.scrap}') &&
      fileContent.includes('fill={VOLUME_COLORS.trim}') &&
      fileContent.includes('fill={VOLUME_COLORS.kerf}'),
      'Per-block utilization must use all 5 VOLUME_COLORS'
    );

    // Direct labels on segments
    assert.ok(
      fileContent.includes('LabelList') && fileContent.includes('value < 6'),
      'Must use LabelList with 6% threshold for direct segment labels'
    );

    // Dynamic data-driven caption
    assert.ok(
      fileContent.includes('volumeReport.perBlockCaption'),
      'Must render data-driven perBlockCaption'
    );
  });

  test('Machine Efficiency Trade-offs presentation updates adhere to rules', () => {
    // Unit-mixing bug eliminated
    assert.ok(
      !fileContent.includes('cu in x100') && !fileContent.includes('pulg³ x100'),
      'Must not scale kerf loss artificially (e.g. cu in x100) to fit a single unit-mixed axis'
    );
    assert.ok(
      !fileContent.includes('2400.0') && !fileContent.includes('1200.0'),
      'Must not use invented/hardcoded 2400 or 1200 fallback numbers'
    );

    // Computes machine efficiency report from real comparison
    assert.ok(
      fileContent.includes('computeMachineEfficiency(currentResult, comparisonResults)'),
      'Must use computeMachineEfficiency service'
    );

    // Uses Cocoa and Taupe design tokens
    assert.ok(
      fileContent.includes('#78350F') && fileContent.includes('#A8A29E'),
      'Must use Cocoa (#78350F) and Taupe (#A8A29E) design tokens'
    );
  });
});
