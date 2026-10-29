# Usable Remnant Recommendation Scoring Specification

> **Honest Engineering Disclaimer**: The remnant recommendation score is an **explainable, rule-based demo heuristic**, not a model learned from historical warehouse scrap re-use. Production oxidation aging models, warehouse bay inventory integration, and machine-learning re-nesting likelihood remain planned roadmap items.

---

## 1. Physical & Operational Context

In flexible polyurethane foam fabrication:
1. **Oxidation & Skin Degradation**: Cut surfaces exposed to ambient humidity and UV light oxidize rapidly. Production findings require skimming approximately **1.0 in on every exposed face** after roughly 2 to 3 days in staging before a piece can be re-cut into clean cushions.
2. **Effective Dimensions**: At a default staging delay of 3 days, effective usable dimensions are computed as:
   $$\text{Effective Dimension} = \max(0, \text{Actual Dimension} - 2.0\text{ in per axis})$$
3. **Minimum Useful Thickness**: Thin slabs (e.g. 1.8 in thick) drop to $\le 0\text{ in}$ or below the **3.0 in minimum usable thickness** required for standard seat/back cushions after skin trim. Such pieces cannot yield standard cushions and must drop to **Not Reusable**.
4. **Geometric Geometry**: Long, thin slivers and narrow strips score lower than compact, block-like remnants of equivalent volume because they rarely accommodate standard part footprints.

---

## 2. Configuration (`config/remnant_scoring_config.json`)

The single source of truth for all parameters, weights, and thresholds is `config/remnant_scoring_config.json`:

```json
{
  "aging_days_default": 3,
  "aging_trim_per_face_inches": 1.0,
  "minimum_useful_thickness_inches": 3.0,
  "minimum_useful_plan_area_sq_inches": 100.0,
  "recommended_score_threshold": 50.0,
  "low_priority_score_threshold": 20.0,
  "require_demand_match_for_recommended": true,
  "factor_weights": {
    "aging_usable_volume": 0.25,
    "minimum_useful_size": 0.20,
    "demand_fit": 0.25,
    "compactness": 0.10,
    "grade_demand": 0.10,
    "freshness": 0.10
  }
}
```

---

## 3. Scoring Rubric (0 to 100)

The composite usability score combines 6 explainable factors:

| # | Factor | Weight | Formula / Evaluation | Justification |
|---|---|:---:|---|---|
| 1 | **Usable Size After Aging** | 0.25 | $\frac{\text{Eff } L \times \text{Eff } W \times \text{Eff } H}{\text{Actual Volume}} \times 100$ | Directly measures material survived after 2-face skin trim (-2" per axis). |
| 2 | **Minimum Useful Size** | 0.20 | $100$ if $\text{Eff } H \ge 3.0''$ and $\text{Area} \ge 144\text{ in}^2$; scales quadratic below | Disqualifies wafer-thin remnants that cannot yield finished parts. |
| 3 | **Demand Fit** | 0.25 | $\frac{\text{Matching Active SKUs}}{\text{Total Job SKUs}} \times 100$ (evaluating orthogonal in-plane rotations) | Higher score if the remnant can directly fulfill current or saved job sizes. |
| 4 | **Compactness** | 0.10 | $\frac{\min(L, W, H)}{\max(L, W, H)} \times 100$ | Penalizes slivers and long noodles; rewards cuboidal buns. |
| 5 | **Grade Demand** | 0.10 | $100$ if grade matches active / queued demand; $50$ otherwise | Ensures warehouse retains foam grades actively specified by customers. |
| 6 | **Freshness** | 0.10 | $100$ for freshly generated remnants, decaying with inventory age | Fresh remnants oxidize less and maintain higher re-cutting yield. |

$$\text{Composite Score} = \sum (\text{Factor}_i \times \text{Weight}_i) \in [0, 100]$$

---

## 4. Tier Partitioning & Warehouse Actions

1. **Recommended to Add** ($\text{Score} \ge 50$ and $\text{Fit Count} \ge 1$):
   - Displayed first in the table with Sage tint highlighting and a **"Recommended"** pill.
   - Distinct individual warehouse entries preserving unique remnant barcodes (`R-01`, `R-02`, etc.).
   - Header chip displays estimated recovery credit: `Recommended: N pieces, X ft³ ($Y credit) [est]`.
   - Batch action: **"+ Add Recommended Only"** adds only qualified pieces.
2. **Low Priority** ($20 \le \text{Score} < 50$):
   - Displayed second, sorted descending by score (tie-break: effective volume).
   - Calm neutral styling. Can still be manually added to inventory by warehouse operators.
3. **Not Reusable** ($\text{Eff } H < 3.0''$, dimension $\le 0''$, or $\text{Score} < 20$):
   - Muted amber styling with explicit physical reason (e.g. *"Thickness 1.81\" falls below 3.0\" minimum after aging"*).
   - Kept out of automated inventory batches to prevent warehouse clutter.

---

## 5. Verification & Unit Tests

Validated in `frontend/src/services/__tests__/remnantScoring.test.ts`:
- **Aging drop**: A 1.8" slab drops to `not_reusable` due to oxidation trimming.
- **Compactness preference**: A block-like piece ($30'' \times 24'' \times 8''$) significantly outscores a thin strip ($96'' \times 6'' \times 3.5''$) of identical volume.
- **Demand fit boost**: Pieces that match active part dimensions receive a decisive score boost over non-fitting pieces.
- **Partitioning & Sorting**: Recommended tier always precedes low priority and not-reusable tiers, each strictly sorted by composite score descending.
- **Deterministic reasons**: Every row renders transparent, real-value strings explaining its score and effective dimensions.
- **Explainability coverage**: Factor weights normalized to 100%, config gating flag states verified, sections 2.1 to 2.3 validated without extraneous simulations.

---

## 6. Transparent Explainability Block ("How Recommendations Are Scored")

Directly beneath the Recorded Usable Remnants table on Step 4 sits a collapsible, full-width explainability card (`RemnantScoringExplanationBlock.tsx`):
1. **Factor Breakdown Table & Stacked Bar**: Renders all 6 scoring factors with weights summing to 100%, their plain text formula, and configurable settings chips.
2. **Demand Matching Reference**: Lists all unique SKUs in active demand (dimensions, rotation rules, quantities) and clarifies effective dimensions, in-plane/3D rotation logic, and kerf handling.
3. **Tier Gating Policy**: Explicitly answers whether a demand match is required based on `require_demand_match_for_recommended` in `config/remnant_scoring_config.json`.
4. **Per-Remnant Breakdown Action**: Every table row includes a keyboard-accessible `"Score breakdown"` button that expands the block and focuses a dedicated diagnostic panel displaying:
   - Nominal and effective post-aging dimensions (3-day oxidation loss, -2"/axis)
   - Real reason string and group transition requirement ("What would change its group")
   - Exact points contributed per factor (e.g. 19.8 pts for volume, 20.0 pts for size)
   - Names of specific SKUs that fit within the remnant bounding box.

---

## 7. Implementation Status vs. Roadmap Placeholders

| Capability | Status | Description |
|---|---|---|
| **Rule-Based Heuristic Scoring** | **Fully Implemented** | Deterministic 6-factor rubric combining volume, thickness, demand, compactness, grade, and freshness. |
| **Oxidation Aging Trim Model** | **Fully Implemented** | Deterministic 3-day post-aging skin trim ($-2.0''$ per axis, $-1.0''$/face) across all axes. |
| **Configurable Demand Gating** | **Fully Implemented** | Controlled by `require_demand_match_for_recommended` in `config/remnant_scoring_config.json`. |
| **Per-Row Score Breakdown** | **Fully Implemented** | Interactive diagnostic panel detailing factor points, matched part names, and transition requirements. |
| **Cross-Job Inventory Matching** | **Planned (Roadmap)** | Currently demand matching scopes to the active job; matching against multi-job order queues is planned. |
| **ML Scrap Likelihood Model** | **Planned (Roadmap)** | Machine learning models trained on shop-floor scrap recovery history remain a future enhancement. |
| **Automated Bay RFID Tracking** | **Planned (Roadmap)** | Physical bay sensors and automated inventory reconciliation remain demo placeholders. |


