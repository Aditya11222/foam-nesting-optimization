# Tatras NestPro: 3D Foam Slicing & Nesting Optimizer

Tatras NestPro is a high-performance 3D polyurethane foam slicing and nesting optimizer designed for industrial saw operators and production planners. It optimizes the conversion of large raw flexible foam buns into finished three-dimensional cushions, bolster cores, corner cubes, support pads, and back wedges with maximum material recovery, operator safety, and strict volume conservation.

The application features a single-page, light-themed, interactive worker interface (no complex multi-step wizards) integrating a FastAPI backend engine with a React 19 + Tailwind CSS + Three.js + Recharts frontend.

---

## 1. Quick Start

### Prerequisites
- Python 3.10+ (with virtual environment in `.venv`)
- Node.js 18+ & npm

### Starting the Application Locally

1. **Activate Python Virtual Environment & Run Tests**:
   ```bash
   cd foam-nesting-optimization
   .venv\Scripts\activate
   pytest backend/tests
   ```

2. **Launch the FastAPI Backend Daemon** (port 8000):
   ```bash
   uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
   ```

3. **Launch the Vite Frontend Dev Server** (port 5173):
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
   Open `http://127.0.0.1:5173` in your browser.

---

## 2. Core Worker Flow (4 Main Steps)

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                   TATRAS NESTPRO                                       │
├─────────────────────┬──────────────────────────────────────────────────────────────────┤
│ STEP 1: INPUT       │ STEP 2: OPTIMIZE & EVALUATE                                      │
│ • Foam Grade Sync   │ • Algorithm Selection (BFD, FFD, SA, Free Nesting)               │
│ • Machine Profile   │ • Real-time Solve (<35ms heuristic, <3s SA)                      │
│ • Stock Bun Dims    │ • Benchmark Comparison Table (Yield, Scrap, Cuts, Runtime)       │
│ • 1/16" Snap Parts  │ • Heuristic Solution Transparency & Validation Banner            │
│ • Rise Orientation  ├──────────────────────────────────────────────────────────────────┤
│ • Remnant Retention │ STEP 3: 3D CUTTING PLAN                                          │
│                     │ • Interactive Light Three.js 3D Block Viewer                     │
│                     │ • Orthogonal Guillotine Cut Planes & CNC Contour Mesh Highlights │
│                     │ • Step-by-Step Operator Saw Sequencer Slider                     │
│                     ├──────────────────────────────────────────────────────────────────┤
│                     │ STEP 4: EXECUTE & TRACK DASHBOARD                                │
│                     │ • Financial Cost Model ($/cu ft per grade, saw $/hr, remnant %)  │
│                     │ • Executive KPI Cards (Waste Reduced, Cost Saved, Job Cost)      │
│                     │ • Naive Manual Baseline vs. Heuristic Comparison                 │
│                     │ • 6 Light-Themed Recharts Visualizations                         │
│                     │ • Planned vs. Actual Floor Execution Tracking Table              │
│                     │ • Recorded Usable Remnants Inventory Table                       │
│                     │ • Multi-Section CSV Export (UTF-8 BOM)                           │
└─────────────────────┴──────────────────────────────────────────────────────────────────┘
```

---

## 3. Optimization Algorithms & Waterjet Profiling

The optimization engine features 4 pluggable algorithms registered in `backend/app/optimizer/registry.py`:

| Algorithm ID | Name | Cut Type | Mechanism & Characteristics | Speed |
|---|---|---|---|---|
| `best_fit_decreasing` | **Best-Fit Decreasing (BFD)** | Guillotine | Sorts parts by volume descending; places into the tightest-fitting candidate remnant box. Employs rigid $Z \to X \to Y$ orthogonal slicing. | Ultra-fast (~10–20 ms) |
| `first_fit_decreasing` | **First-Fit Decreasing (FFD)** | Guillotine | Sorts by largest dimension; places into the first fitting volume and executes **Min-Residual Axis Splitting** to preserve large, contiguous 3D remnant boxes. **Outperforms BFD on multi-part jobs.** | Fast (~12–25 ms) |
| `simulated_annealing` | **Simulated Annealing (SA)** | Guillotine | Metaheuristic neighborhood search exploring part orderings and rotation configurations within a bounded time budget (default: 3.0s). Seeded with BFD. | Configurable (~1–3 s) |
| `free_nesting_heuristic` | **3D Free Contour Nesting** | Free / Non-Guillotine | 3D maximal-empty-box anchor-point placement for CNC waterjet profilers (`saw-wj`). Accounts for stream kerf (`0.0625"`), enforces machine throat clearance limits (`36.0"`), and outputs sequential contour toolpaths. | Fast (~15–35 ms) |

### Benchmark on Proposal Job #4821 (154 Demanded Parts across 5 SKUs)

```
===================================================================================================================
BENCHMARK COMPARISON TABLE -- PROPOSAL JOB #4821 (154 TOTAL DEMANDED PARTS)
===================================================================================================================
Algorithm                              | Net Util % | Blocks | Scrap (cu ft) | Cuts  | Runtime (ms) | Status / Notes
-------------------------------------------------------------------------------------------------------------------
Best-Fit Decreasing (BFD)              | 43.9%      | 3      | 24.2 cu ft    | 207   | 11.0 ms      | VALID
First-Fit Decreasing (FFD)             | 65.8%      | 2      | 59.4 cu ft    | 261   | 15.3 ms      | VALID [BEST IN COMPARISON]
Simulated Annealing (SA)               | 43.9%      | 3      | 24.2 cu ft    | 207   | 609.4 ms     | VALID
OR-Tools Block Assignment + Slicing    | 56.2%      | 1*     | 21.1 cu ft    | 132   | 4058.5 ms    | VALID (CP-SAT optimal allocation)
OR-Tools Pattern Selection (Fixed Pool)| 21.9%      | 6      | 53.7 cu ft    | 259   | 796.5 ms     | VALID (exact demand covered)
===================================================================================================================
*Detailed analysis and multi-job benchmarks available in docs/BENCHMARK_ORTOOLS.md.
Disclaimer: CP-SAT proves mathematical optimality only for the volume/pattern allocation model. Physical layouts remain heuristic solutions.
```

---

## 4. Manufacturing Constraints & Strict Validation

Every result is run through `backend/app/optimizer/validator.py`:

1. **Units & Snapping (1/16")**:
   - All input dimensions snap to `0.0625"` increments (`round(v * 16) / 16`). Non-positive or sub-1/16" values are flagged inline.
2. **Mandatory Skin Trim (~1" Per Face)**:
   - Parts are placed strictly inside the post-trim usable interior:
     $$\text{Usable Dimension} = \text{Nominal Dimension} - 2 \times \text{trim}$$
3. **Saw & Waterjet Kerf Allowance**:
   - Guillotine saws: blade thickness `0.125"` (1/8").
   - Waterjet profiler: stream kerf `0.0625"` (1/16").
   - Deducted structurally from residual sub-boxes.
4. **Machine Clearance Limits**:
   - Enforces throat clearance limits (e.g. `saw-wj` max throat cut height = `36.0"`). Blocks exceeding throat height are rejected with clear error messages.
5. **Foam Rise Direction & Anisotropy (Z Axis)**:
   - Polyurethane foams expand vertically along the Z axis.
   - Permitted modes: `rise-locked` (vertical height locked to Z), `free-in-plane` (rotation in XY only), `any` (3D rotation).
6. **Grade Synchronization**:
   - Global foam grade selection (`HR-40`, `HR-30`, `VE-50`) synchronizes all block stocks and parts.
   - Includes optional "Advanced: mixed grades" toggle for independent per-grade batching.
7. **No Spatial Collisions & Boundary Check**:
   - Pairwise 3D AABB intersection verification guarantees zero part overlaps.
   - All part bounds $x + l \le \text{usable\_length}$, etc.
8. **Volume Reconciliation Identity**:
   - Strictly enforced across all algorithms:
     $$\text{Parts Volume} + \text{Remnants} + \text{Scrap} + \text{Trim} + \text{Kerf} = \text{Gross Bun Volume}$$

---

## 5. Step 4: Execute & Track Dashboard and CSV Export

Step 4 replaces basic summary metrics with an interactive operational and financial dashboard:

1. **Financial Cost Model (Collapsible Panel)**:
   - Material unit cost ($/cu ft) by grade (defaults: HR-40: $4.50, HR-30: $3.80, VE-50: $6.20).
   - Saw operating machine rate (default: $65.00/hr).
   - Usable remnant recovery credit % (default: 40% of raw foam cost).
   - Live recalculation of all KPIs and charts when inputs change.
2. **Naive Manual Baseline Comparison**:
   - Simulates a single-orientation manual saw operator packing heuristic without 3D residual optimization.
   - Computes baseline blocks, gross volume, scrap, saw time, and total cost to provide realistic financial savings comparisons.
3. **Executive KPI Cards**:
   - **Waste Reduced**: % and cu ft saved vs naive manual layout.
   - **Cost Saved**: $ and % financial reduction.
   - **Total Job Cost**: Net production expenditure (Material + Saw Time - Remnant Credit).
   - **Finished Part Cost**: Average cost per finished piece nested.
   - Labeled clearly: *"Estimated, based on demo assumptions."*
4. **6 Light-Themed Visualizations (Recharts)**:
   - Volume Breakdown (Parts, Remnants, Scrap, Trim, Kerf in cu ft).
   - Algorithm Benchmark Comparison (Net Yield % vs Scrap %).
   - Baseline vs. Optimized (Buns, Material Cost, Scrap Cost, Net Cost).
   - Per-Block Utilization Stacked Bar (% Parts, Remnants, Kerf, Scrap).
   - Cost Component Breakdown (Raw Foam, Saw Time, Remnant Credit).
   - Machine Efficiency Trade-offs (Guillotine vs Waterjet on kerf, cut count, and time).
5. **Shop-Floor Execution Tracking Table**:
   - Planned vs. Actual yield and runtime tracking per block with live variance calculation and status progression (`Pending`, `In Progress`, `Completed`).
   - Recorded Usable Remnants table showing code, dimensions, volume ($ft^3$), usability score %, and warehouse storage bay.
   - Smooth-scroll button returning operator to Step 3 cut sequencer.
6. **Multi-Section CSV Export**:
   - Includes UTF-8 BOM (`\uFEFF`) for seamless Excel and ERP import across 6 distinct sections:
     - Section 1: Production Order & Optimization Summary
     - Section 2: Placed Parts Cut List (SKU, dimensions, coordinates, orientation)
     - Section 3: Saw Cut Sequence & Operator Instructions (English & Spanish)
     - Section 4: Usable Remnants Registered for Inventory
     - Section 5: Algorithm Benchmark Comparative Evaluation
     - Section 6: Naive Manual Baseline vs. Heuristic Optimization

7. **Demo-Grade CNC G-Code Export (RS-274)**:
   - Exports deterministic RS-274 / ISO 6983 G-code programs for CNC horizontal/vertical bandsaws, blade saws, wire cutters, and abrasive waterjets.
   - Snaps all coordinates to the $1/16''$ ($0.0625''$) manufacturing grid formatted to 4 decimal places ($X0, Y0, Z0$ at bottom-front-left raw block corner).
   - Automated pre-flight path simulation verifying toolpath bounds, travel limits, non-negative Z plunges, and feed rates.
   - Built-in modal viewer with line-numbered monospace preview, search filtering, cut step jumping, and clipboard copy.
   - Zero-dependency client-side binary PKZip encoder exporting multi-block zip archives or individual `.nc` files.

---

## 6. G-Code Export: Limitations & Safety Disclaimer

> [!CAUTION]
> **DEMO OUTPUT: NOT VALIDATED ON A REAL MACHINE. REVIEW AND DRY-RUN BEFORE USE.**
> 
> The G-code export post-processor is an experimental demonstration feature. It has **NOT** been certified or dry-run on physical industrial saws, CNC waterjets, or machine controllers. Coordinates must be rigorously inspected, zero-offsets calibrated, and an air-cut / dry-run performed before touching material.

### Implemented vs. Placeholder Matrix

| Feature / Capability | Status | Notes |
|---|:---:|---|
| **Verbatim Header Disclaimer** | **Implemented** | Mandatory header in every exported `.nc` file and UI confirmation checkbox. |
| **Standard RS-274 G-Code** | **Implemented** | Inch mode (`G20`), absolute (`G90`), XY plane (`G17`), feed/min (`G94`), program end (`M30`). |
| **1/16" Grid Snapping** | **Implemented** | Deterministic coordinate snapping to $0.0625''$ printed to 4 decimal places. |
| **Guillotine Through-Slicing** | **Implemented** | Rapid approach, linear slicing passes ($Z, X, Y$), safe retracts above material. |
| **Waterjet / Contour Loops** | **Implemented** | Perimeter offset loops with stream engage (`M08`) and shutoff (`M09`). |
| **Pre-Flight Path Check** | **Implemented** | Enforces bounding box bounds, stroke limits, non-negative $Z$, positive feedrate. |
| **Multi-Block ZIP Archive** | **Implemented** | In-browser binary PKZip encoder without external library dependencies. |
| **Machine Gating** | **Implemented** | Automated saws enabled; manual saws disabled with explanatory tooltip. |
| **Controller-Specific Dialects** | *Placeholder* | Siemens, Fanuc macro-B, and Heidenhain specific canned cycles. |
| **Dynamic Blade Deflection** | *Placeholder* | Real-time feed reduction based on foam grade density and blade tension. |
| **Vacuum Zone Actuation** | *Placeholder* | Automated M-code triggering for compartmentalized vacuum hold-down tables. |
| **Direct DNC Upload** | *Placeholder* | Network socket / serial transmission directly to shop-floor CNC controllers. |

*See [docs/GCODE_EXPORT.md](file:///docs/GCODE_EXPORT.md) for full technical documentation.*

---

## 7. Implementation Status Matrix

| Component / Feature | Status | Details |
|---|---|---|
| **Step 1: Input Sidebar** | **Fully Implemented** | Grade chip sync, multi-block config, machine profile badges, clearance checks, 1/16" snapping, and sample loader. |
| **Step 2: Optimize & Benchmarks** | **Fully Implemented** | Dynamic registry (`/api/algorithms`), Run Optimization, Compare All, best-heuristic badge, and validation reporting. |
| **Step 3: 3D Cutting Plan** | **Fully Implemented** | React-Three-Fiber light scene, skin trim shell, SKU colors, layer toggles, cut stepper, and glowing magenta contour highlights. |
| **Fix A: Grade Synchronization** | **Fully Implemented** | Grade drives blocks, parts, and machine checks; "Advanced: mixed grades" toggle; input edits flag stale state. |
| **Fix B: Waterjet Profiler (`saw-wj`)** | **Fully Implemented** | Non-guillotine 3D maximal-empty-box placement, stream kerf ($0.0625"$), throat clearance limit ($36.0"$), and contour cut steps. |
| **Step 4: Execute & Track Dashboard** | **Fully Implemented** | Cost assumptions panel, naive baseline model, 4 KPI cards, 6 light-themed charts, planned vs actual tracking table, remnants table. |
| **Multi-Section CSV Export** | **Fully Implemented** | Single multi-section CSV with UTF-8 BOM exporting all job summary, parts, cuts, remnants, comparisons, and baseline deltas. |
| **Demo-Grade G-Code Export** | **Fully Implemented** | RS-274 post-processor with pre-flight path simulation, preview modal, safety gating, `.nc` & `.zip` downloads. |
| **Auto Recommender & Guided Flow** | **Fully Implemented** | Rule-based and benchmark evidence recommendations for machine, priority objective, and algorithm. |
| **Volume Reconciliation & Validation** | **Fully Implemented** | Pairwise collision-free verification and strict volume identity conservation tested on all algorithms. |
| **Bilingual Toggle (EN / ES)** | **Fully Implemented** | English strings and complete Spanish catalogues with `[revisión]` placeholders switchable in header. |
| **OR-Tools Block Assignment (ORT-ASSIGN)** | **Fully Implemented** | CP-SAT multi-block bin assignment, remnant prioritization, iterative verify loop with cardinality cuts. |
| **OR-Tools Pattern Selection (ORT-PATTERN)** | **Fully Implemented** | Fixed-pool column generation, exact demand satisfaction, optional overproduction flag, de-duplicated and capped. |
| **Auto (OR-Tools) Machine Selection** | **Fully Implemented** | Station selection dropdown with configurable objective (`lowest_cost`, `best_yield`, `lowest_time`), throat height check, capacity limits. |
| **Comprehensive OR-Tools Benchmark Suite** | **Fully Implemented** | Evaluates Job #4821, 20 synthetic jobs, multi-grade jobs, and volume-vs-geometry challenge in `docs/BENCHMARK_ORTOOLS.md`. |
| **Rush-Order Re-planning with Warm Start** | **Stubbed (Planned)** | Interface stubs provided in `backend/app/engine/ortools/stubs.py`; see `docs/ORTOOLS_ROADMAP.md`. |
| **Dynamic Column Generation (Gilmore-Gomory)**| **Stubbed (Planned)** | Interface stubs provided in `stubs.py`; see `docs/ORTOOLS_ROADMAP.md`. |
| **Multi-Job Machine Scheduling** | **Stubbed (Planned)** | Disjunctive scheduling stubs in `stubs.py`; see `docs/ORTOOLS_ROADMAP.md`. |
| **SyteLine ERP Integration** | **Stubbed** | Interface stubs provided in `backend/app/api/stubs.py`. |
| **ML Remnant Usability Scoring** | **Stubbed** | Rule-based volume scoring active for demo; ML stubs in `stubs.py`. |

---

## 8. Testing & Verification

Run the full pytest suite (66 passing test cases):
```bash
pytest backend/tests
```

Run frontend unit tests:
```bash
cd frontend
node --test --experimental-strip-types src/services/__tests__/recommender.test.ts src/components/__tests__/stickyActionBar.test.ts src/services/__tests__/gcode.test.ts
```

Build the frontend production bundle:
```bash
cd frontend
npm run build
```
