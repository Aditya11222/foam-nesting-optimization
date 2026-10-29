import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  scoreRemnant,
  groupAndRankRemnants,
  computeRemnantScoringExplanation,
  DEFAULT_REMNANT_SCORING_CONFIG,
} from '../remnantScoring.ts';
import type { RemnantOutput, PartItem } from '../../types.ts';

const mockParts: PartItem[] = [
  {
    id: 'p-1',
    sku: 'Cushion-Standard',
    name: 'Standard Seat Cushion',
    grade: 'HR-40',
    length: 24.0,
    width: 24.0,
    height: 6.0,
    quantity: 10,
    orientation_mode: 'rise-locked',
  },
  {
    id: 'p-2',
    sku: 'Bolster-Core',
    name: 'Cylindrical Core Bolster',
    grade: 'HR-40',
    length: 30.0,
    width: 12.0,
    height: 5.0,
    quantity: 10,
    orientation_mode: 'rise-locked',
  },
];

function makeRemnant(overrides: Partial<RemnantOutput>): RemnantOutput {
  const l = overrides.length ?? 36.0;
  const w = overrides.width ?? 30.0;
  const h = overrides.height ?? 12.0;
  return {
    id: overrides.id || 'rem-1',
    code: overrides.code || 'REM-01',
    grade: 'HR-40',
    x: 0,
    y: 0,
    z: 0,
    length: l,
    width: w,
    height: h,
    volume: l * w * h,
    usability_score: overrides.usability_score ?? 0.5,
    retained: true,
    storage_location: 'Bay R-01',
    ...overrides,
  };
}

describe('Remnant Recommendation Scoring & Grouping Service', () => {
  it('marks a 1.8 in thin slab as not reusable after 3-day aging loss', () => {
    // 1.8 in thick: after -2 in aging loss, effective thickness is 0 (or below 3 in minimum)
    const thinSlab = makeRemnant({
      id: 'rem-thin',
      code: 'REM-THIN',
      length: 48.0,
      width: 24.0,
      height: 1.81,
    });

    const res = scoreRemnant(thinSlab, mockParts);
    assert.equal(res.tier, 'not_reusable');
    assert.ok(res.reason.includes('falls below') || res.reason.includes('falls to 0'));
    assert.ok(res.compositeScore < 20);
  });

  it('awards higher score to block-like pieces than long thin strips of equal volume', () => {
    // Block-like: 24 x 24 x 12 = 6,912 cu in
    const blockRemnant = makeRemnant({
      id: 'rem-block',
      code: 'REM-BLOCK',
      length: 24.0,
      width: 24.0,
      height: 12.0,
    });

    // Thin strip: 96 x 6 x 12 = 6,912 cu in (same volume, but long thin aspect ratio)
    const stripRemnant = makeRemnant({
      id: 'rem-strip',
      code: 'REM-STRIP',
      length: 96.0,
      width: 6.0,
      height: 12.0,
    });

    const scoreBlock = scoreRemnant(blockRemnant, mockParts);
    const scoreStrip = scoreRemnant(stripRemnant, mockParts);

    assert.ok(
      scoreBlock.compositeScore > scoreStrip.compositeScore,
      `Block score (${scoreBlock.compositeScore}) must exceed thin strip score (${scoreStrip.compositeScore})`
    );
    assert.ok(scoreBlock.factorBreakdown.compactness > scoreStrip.factorBreakdown.compactness);
  });

  it('raises score significantly when remnant fits active demand SKUs', () => {
    // Remnant that comfortably fits both cushions
    const largeFittingRemnant = makeRemnant({
      id: 'rem-fit',
      code: 'REM-FIT',
      length: 40.0,
      width: 40.0,
      height: 16.0,
    });

    // Remnant that fits 0 parts because it is too short
    const nonFittingRemnant = makeRemnant({
      id: 'rem-nofit',
      code: 'REM-NOFIT',
      length: 15.0,
      width: 15.0,
      height: 10.0,
    });

    const resFit = scoreRemnant(largeFittingRemnant, mockParts);
    const resNoFit = scoreRemnant(nonFittingRemnant, mockParts);

    assert.ok(resFit.fitPartCount >= 2);
    assert.equal(resNoFit.fitPartCount, 0);
    assert.ok(resFit.compositeScore > resNoFit.compositeScore);
  });

  it('partitions and sorts remnants with Recommended group first, sorted by score desc', () => {
    const list: RemnantOutput[] = [
      makeRemnant({ id: 'r1', code: 'R1', length: 18.0, width: 18.0, height: 6.0 }), // low priority (effH=4.0 > 3.0, but fits 0 cushions)
      makeRemnant({ id: 'r2', code: 'R2', length: 48.0, width: 40.0, height: 20.0 }), // recommended high
      makeRemnant({ id: 'r3', code: 'R3', length: 30.0, width: 30.0, height: 10.0 }), // recommended medium
      makeRemnant({ id: 'r4', code: 'R4', length: 48.0, width: 20.0, height: 2.5 }), // not reusable (<3" thk after aging)
    ];

    const grouped = groupAndRankRemnants(list, mockParts);

    assert.equal(grouped.recommended.length, 2);
    assert.equal(grouped.lowPriority.length, 1);
    assert.equal(grouped.notReusable.length, 1);

    // Recommended group ordered descending
    assert.ok(grouped.recommended[0].compositeScore >= grouped.recommended[1].compositeScore);
    assert.equal(grouped.recommended[0].remnant.code, 'R2');

    // Totals
    assert.equal(grouped.recommendedTotals.count, 2);
    assert.ok(grouped.recommendedTotals.volumeCuFt > 0);
  });

  it('generates real-value explanatory reason strings for every tier', () => {
    const rem = makeRemnant({ length: 42.0, width: 30.0, height: 14.0 });
    const res = scoreRemnant(rem, mockParts);

    assert.ok(res.reason.length > 10);
    assert.ok(res.reason.includes('Fits') || res.reason.includes('effective size'));
    assert.ok(!res.reason.includes('NaN'));
    assert.ok(!res.reason.includes('undefined'));
  });

  it('verifies explainability factor weights sum to 100 and adapt to custom config', () => {
    const list = [makeRemnant({ id: 'r1', length: 48, width: 40, height: 20 })];
    const grouped = groupAndRankRemnants(list, mockParts);
    const expDefault = computeRemnantScoringExplanation(grouped.allScored, mockParts);

    assert.equal(expDefault.totalWeightPct, 100);
    assert.equal(expDefault.factors.length, 6);
    assert.ok(expDefault.formulaText.includes('0.25'));

    // Custom test config with modified weights
    const customConfig = {
      ...DEFAULT_REMNANT_SCORING_CONFIG,
      factor_weights: {
        aging_usable_volume: 0.30,
        minimum_useful_size: 0.20,
        demand_fit: 0.30,
        compactness: 0.05,
        grade_demand: 0.10,
        freshness: 0.05,
      },
    };
    const expCustom = computeRemnantScoringExplanation(grouped.allScored, mockParts, customConfig);
    assert.equal(expCustom.totalWeightPct, 100);
    assert.ok(expCustom.formulaText.includes('0.3 × AgingVol'));
    assert.ok(expCustom.formulaText.includes('0.05 × Compactness'));
  });

  it('evaluates whether demand match is required following config flag in both states', () => {
    const list = [makeRemnant({ id: 'r1', length: 48, width: 40, height: 20 })];
    const grouped = groupAndRankRemnants(list, mockParts);

    // State 1: require_demand_match_for_recommended: true
    const configRequired = {
      ...DEFAULT_REMNANT_SCORING_CONFIG,
      require_demand_match_for_recommended: true,
    };
    const expRequired = computeRemnantScoringExplanation(grouped.allScored, mockParts, configRequired);
    assert.equal(expRequired.matchingRequirement.isRequired, true);
    assert.ok(expRequired.matchingRequirement.badgeText.includes('YES'));
    assert.ok(expRequired.matchingRequirement.ruleDescription.includes('AND at least 1 matching part type'));

    // State 2: require_demand_match_for_recommended: false
    const configOptional = {
      ...DEFAULT_REMNANT_SCORING_CONFIG,
      require_demand_match_for_recommended: false,
    };
    const expOptional = computeRemnantScoringExplanation(grouped.allScored, mockParts, configOptional);
    assert.equal(expOptional.matchingRequirement.isRequired, false);
    assert.ok(expOptional.matchingRequirement.badgeText.includes('NO'));
    assert.ok(expOptional.matchingRequirement.ruleDescription.includes('NOT required'));
  });

  it('renders sections 2.1 to 2.3 without section 2.4 zero-match content', () => {
    const rFit = makeRemnant({ id: 'r-fit', code: 'REM-FIT', length: 48, width: 40, height: 20 });
    const rNoFit = makeRemnant({ id: 'r-nofit', code: 'REM-NOFIT', length: 15, width: 15, height: 10 });

    const grouped = groupAndRankRemnants([rFit, rNoFit], mockParts);
    const exp = computeRemnantScoringExplanation(grouped.allScored, mockParts);

    // Sections 2.1 to 2.3 are present and valid
    assert.equal(exp.factors.length, 6);
    assert.equal(exp.totalWeightPct, 100);
    assert.ok(exp.demandMatching.totalDemandedSKUs > 0);
    assert.equal(exp.matchingRequirement.totalCount, 2);

    // Section 2.4 zero-match analysis is removed
    assert.strictEqual((exp as unknown as Record<string, unknown>).zeroMatchAnalysis, undefined);
  });

  it('asserts that per-remnant breakdown values match table row values and points sum to composite score', () => {
    const list = [
      makeRemnant({ id: 'r1', code: 'REM-1', length: 48, width: 40, height: 20 }),
      makeRemnant({ id: 'r2', code: 'REM-2', length: 9, width: 80, height: 12 }),
      makeRemnant({ id: 'r3', code: 'REM-3', length: 106, width: 80, height: 1.5 }),
    ];

    const grouped = groupAndRankRemnants(list, mockParts);

    grouped.allScored.forEach((sr) => {
      // 1. Matched part names length equals fitPartCount
      assert.equal(sr.matchedPartNames.length, sr.fitPartCount);

      // 2. Points sum to compositeScore within rounding tolerance
      const pointsSum =
        sr.factorPoints.agingUsableVolume +
        sr.factorPoints.minimumUsefulSize +
        sr.factorPoints.demandFit +
        sr.factorPoints.compactness +
        sr.factorPoints.gradeDemand +
        sr.factorPoints.freshness;

      if (sr.tier !== 'not_reusable') {
        assert.ok(
          Math.abs(Math.round(pointsSum) - sr.compositeScore) <= 1,
          `Points sum ${pointsSum} should match compositeScore ${sr.compositeScore}`
        );
      }

      // 3. Group transition requirement string is populated and non-empty
      assert.ok(sr.groupTransitionRequirement.length > 5);
      assert.ok(sr.groupTransitionRequirementEs.length > 5);
    });
  });

  it('assigns honest general stock reason to high-scoring zero-match remnants and respects policy toggle', () => {
    // Large block: 60 x 60 x 30" (108,000 cu in), but demand has only giant parts that do not fit
    const giantParts: PartItem[] = [
      { id: 'p-giant', sku: 'GIANT-1', name: 'Giant Part', grade: 'HR-40', length: 100, width: 100, height: 50, quantity: 1, orientation_mode: 'rise-locked' }
    ];
    const largeBlock = makeRemnant({
      id: 'r-large',
      code: 'REM-LRG',
      length: 60.0,
      width: 60.0,
      height: 30.0,
      volume: 108000.0,
    });

    // Default policy: demand match required
    const resDefault = scoreRemnant(largeBlock, giantParts);
    assert.ok(resDefault.compositeScore >= 50);
    assert.equal(resDefault.fitPartCount, 0);
    assert.equal(resDefault.tier, 'low_priority');
    assert.ok(resDefault.reason.includes('retained as general stock'));
    assert.ok(!resDefault.reason.includes('narrow or thin'));

    // Threshold-only policy: demand match optional
    const configThresholdOnly = {
      ...DEFAULT_REMNANT_SCORING_CONFIG,
      require_demand_match_for_recommended: false,
    };
    const resOptional = scoreRemnant(largeBlock, giantParts, configThresholdOnly);
    assert.equal(resOptional.tier, 'recommended');
    assert.ok(resOptional.reason.includes('effective size'));
  });
});
