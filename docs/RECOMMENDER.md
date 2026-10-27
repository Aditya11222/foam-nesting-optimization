# Tatras NestPro Recommendation Engine & Guided Workflow

## 1. Overview & Architectural Principles

Tatras NestPro incorporates an intelligent recommendation layer that assists foam fabrication operators, estimators, and saw station managers in selecting optimal cutting machines, priority objectives, and nesting algorithms.

### Core Tenets
1. **Physical and Geometric Transparency**: All recommendations are derived from explicit geometric constraints (usable interior volume, throat clearances, kerf allowances) and measured production benchmark data.
2. **Zero Fake Claims**: Heuristic packings are never presented as mathematically "optimal". All reasoning strings and UI cards strictly disclaim:
   > *"Best among the tested heuristics for this input and objective. Not proven optimal."*
3. **Non-Invasive Engine Isolation**: The recommendation engine sits as an advisory layer outside the core geometric optimizer, geometric validator, and volume-reconciliation identity. It reads inputs and produces structured recommendation choices and explanations without mutating solver internals.
4. **Interactive Autonomy with Manual Override**: Auto-recommendation runs proactively upon input changes while preserving full user autonomy: operators can toggle to Manual mode at any time, select any supported machine or strategy, and effortlessly restore recommended presets with a single click.

---

## 2. Machine Selection Decision Tree & Cost Model

The system evaluates all cutting profiles within the saw fleet against the active job order.

### Fleet Classification
- **Guillotine Saws (Edge-to-Edge Slicing)**:
  - Horizontal Saws (e.g., *Horizontal Splitter S-12*, *Horizontal Splitter S-16*): Horizontal slicing passes, ideal for slab production.
  - Vertical Band Saws (e.g., *Vertical Band Saw V-30*, *Vertical Trim Saw V-40*): Vertical ripping and crosscutting.
  - Multi-Axis / Turntable Guillotine Saws (e.g., *Guillotine Saw Station 2*, *Auto-Index Guillotine G-3*, *High-Speed Guillotine G-5*): Programmable rotating beds for rapid orthogonal 3D block reduction.
- **Free-Path / Contour Saws (Arbitrary 3D & Wire Toolpaths)**:
  - Waterjet Cutters (e.g., *CNC Waterjet Station W-1*, *Multi-Head Waterjet W-2*): Abrasive and pure waterjet cutting for complex 2D/3D parts.
  - Fast-Wire / Oscillating Wire Profilers (e.g., *Fast-Wire Contour Profiler F-1*, *Oscillating Wire Contour Saw O-1*): Zero-kerf and ultra-low kerf contouring.
  - CNC Routers (e.g., *CNC Foam Router R-4*): Multi-axis milling and pocketing.

### Physical Feasibility Hard Filter
Before scoring, machines are evaluated against two mandatory physical filters:
1. **Throat Clearance Check**:
   $$H_{\text{usable}} = H_{\text{nominal}} - 2 \times \text{skin\_trim} \le \text{machine.max\_cut\_height}$$
   If any bun's usable height exceeds the saw's vertical throat opening, the machine is rejected with an explicit diagnostic message (e.g., *"Throat clearance (36\") is smaller than block usable height (38.0\")"*).
2. **Envelope & Cut Type Compatibility**:
   If demanded parts require non-orthogonal contouring or rise-free profiling, guillotine saws are flagged, routing demand toward free-contour profilers.

### Quantitative Scoring & Cost Model
Eligible machines are scored based on the active **Optimization Priority Objective**:
- **Estimated Linear Cut Inches**: Computed from part perimeters, heights, and expected slicing stages.
- **Saw Operation Time**:
  $$\text{SawTime}_{\text{min}} = \frac{\text{LinearCutInches}}{\text{FeedRate}_{\text{IPM}}} + \text{HandlingSetupTime}$$
- **Material Volume Loss**:
  $$\text{KerfLossVolume} = \text{LinearCutInches} \times \text{Kerf} \times \bar{H}$$
- **Total Production Cost ($)**:
  $$\text{TotalCost} = \left(\frac{\text{EstimatedGrossVolume}}{1728} \times \text{FoamCost}_{\text{cu ft}}\right) + \left(\frac{\text{SawTime}_{\text{min}}}{60} \times \text{HourlyRate}\right)$$

### Objective-Specific Ranking
- **`maximize_yield`**: Favors machines with ultra-low kerf (e.g. $0.040" - 0.0625"$) and higher volume recovery.
- **`minimize_time`**: Favors high feed-rate CNC and rotating machines (e.g. $140 - 180\text{ IPM}$).
- **`minimize_cost`**: Minimizes combined material and machine hourly cost.
- **`balanced`**: Normalized multi-factor score:
  $$\text{Score} = 0.40 \times \text{NormYield} + 0.35 \times \text{NormCost} + 0.25 \times \text{NormTime}$$

### Deterministic Tie-Breaking
When candidate scores are within $0.001$:
1. Lower Kerf (minimizes dust and volume loss).
2. Higher Automation Level (`CNC` > `rotating` > `manual`).

---

## 3. Priority Objective Heuristics

The recommender evaluates the economic trade-off between raw foam bun costs and machine operation rates:
- **`maximize_yield`**: Recommended when foam grade cost is high (e.g., Viscoelastic `VE-50` at $\$6.20/\text{cu ft}$) and raw material accounts for $>70\%$ of job costs.
- **`minimize_time`**: Recommended when part demand is large ($>80$ pieces) and machine operation cost dominates.
- **`minimize_cost`**: Recommended when part counts and grade costs are moderate.
- **`balanced`**: Recommended for standard commercial runs where yield, speed, and cost must be co-optimized.

---

## 4. Supply Block Audit & Validation Rules

Before transitioning from Screen 1 to Screen 2, the system performs strict validation checks:
1. **Live Usable Interior Calculation**:
   $$L_{\text{usable}} = L - 2 \times \text{trim}, \quad W_{\text{usable}} = W - 2 \times \text{trim}, \quad H_{\text{usable}} = H - 2 \times \text{trim}$$
   Must all be strictly positive ($> 0$).
2. **1/16\" Fabrication Precision Grid**:
   All nominal dimensions, trims, kerfs, and part dimensions must align to increments of $0.0625\"$ ($1/16\"$):
   $$|16 \times x - \text{round}(16 \times x)| < 10^{-4}$$
3. **Machine Throat Clearance**:
   $$H_{\text{usable}} \le \text{selectedMachine.max\_cut\_height}$$
4. **Stock Sufficiency Estimation**:
   $$\text{EstimatedMinBlocks} = \left\lceil \frac{V_{\text{parts}} \times 1.10}{V_{\text{usable\_block}}} \right\rceil$$
   If available blocks $M < N$, a warning banner alerts the estimator before solve time.
5. **Duplicate Block Row Detection**:
   Identifies duplicate block rows sharing identical dimensions and grade, providing a 1-click **Merge Quantities** action.

---

## 5. Strategy Recommender & Auto-Run Pipeline

### Initial Rule-Based Prior (`recommendStrategy`)
Evaluates problem complexity features:
- **Free Cut Machine** $\to$ `free_nesting_heuristic` (3D contour toolpaths).
- **Repetitive Demand with Few SKUs** ($\le 3$ SKUs, $\ge 30$ pieces) $\to$ `ortools_pattern_selection` (mathematical pattern selection).
- **Multi-Block Load** ($\ge 2$ blocks, $\ge 40$ pieces) $\to$ `ortools_block_assignment` (CP-SAT multi-block assignment with slicing tree).
- **Yield Maximization Priority** ($\le 90$ pieces) $\to$ `simulated_annealing` (metaheuristic neighborhood rotation search).
- **Default Interactive Turnaround** $\to$ `best_fit_decreasing` (fast greedy volume packing).

### Automated Comparative Benchmark & Switching Rules
1. Upon landing on Screen 2 with modified inputs, the recommended strategy auto-runs.
2. An animated sliced-foam progress loader displays live solver activity.
3. Concurrently, a background run executes `compareAlgorithms` across all heuristics.
4. When benchmark data returns, `evaluateBestMeasuredStrategy` re-evaluates all heuristics under the active objective.
5. If another heuristic outperforms the rule prior, the system auto-switches to the measured winner and displays an explanation badge:
   > *"Auto-switched from initial rule pick (Best-Fit Decreasing) to OR-Tools Block Assignment + Slicing: Benchmark measured higher net yield (+6.3%) under the maximize yield objective."*
6. If the initial rule pick remains highest, it is retained and supported by measured comparison figures.

---

## 6. Guided Flow: Screen 1 → Screen 2 → Screen 3

The user journey is structured as a clear linear workflow:
- **Screen 1 (Setup & Data Import)**:
  - Form validation on clicking **"Continue to Algorithm Selection & Placement"**.
  - Prevents advancing if unusable dimensions, grid errors, or throat clearance violations exist.
- **Screen 2 (Algorithm & Placement)**:
  - Automatic solve of recommended strategy.
  - Closed select displays clean algorithm names without truncation.
  - "Why this strategy" card cites rule prior, switched notices, and measured benchmark numbers.
  - **Sticky Action Bar**:
    - **Primary Action**: *"Generate 3D Cutting Plan & Visualization"* (prominent green button).
    - **Secondary Action**: *"Back to inputs"* (returns to Screen 1).
    - Disabled with explicit tooltips while solving, when inputs are stale, or if validation fails.
- **Screen 3 (Cutting Plan & Visualization)**:
  - **Immediate 3D Rendering**: Arriving on Screen 3 renders the interactive 3D cutting plan instantly. **No second button click is ever required**.
  - Cutting Plan Card receives active green elevation ring.
  - Sticky Action Bar transitions to forward execution: **"Proceed to Results & Execution"** (advancing to Screen 4) and **"Back to algorithm"** (returning to Screen 2).
- **Screen 4 (Results & Execution)**:
  - Executive yield/scrap summary, cut sheets, remnant vault, and CSV export.

---

## 7. Internationalization (i18n)

All recommendation reasons, validation messages, and action bar controls are localized:
- **English (`en`)**: Primary production strings.
- **Spanish (`es`)**: Corresponding localized strings with clear annotations for ongoing terminology review.
