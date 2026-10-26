# Tatras NestPro — Design & Spatial Refinement Plan

This design refinement pass elevates **Tatras NestPro** into a calm, high-precision industrial workbench experience. It replaces the cool slate styling with a warm oat, cream, and cocoa mineral palette, enforces strict typographic and spatial hierarchy, upgrades the 3D cutting visualizer with warm studio lighting and docked HUD controls, and expands Step 4 with interactive cost assumptions, Recharts visualizations, and a Planned vs. Actual variance table while preserving all existing optimization logic and state flows.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following architectural and UX choices incorporate your confirmed selections and govern the visual refinement pass:

- **Confirmed Decision 1 — Step 4 Analytics & Execution Layout**: A unified full-width dashboard beneath the three-card workspace featuring a collapsible cost-assumptions panel, a structured Recharts analytics grid (Volume Breakdown, Algorithm Comparison, Baseline vs. Optimized, Per-Block Utilization, and Cost Breakdown), and tabbed shop-floor execution views (Operator Station, Printable Traveler, Remnant Aging, and Planned vs. Actual Variance).
- **Confirmed Decision 2 — 3D Unrecoverable Scrap Visualization**: A toggleable scrap layer in the 3D Cutting Plan viewport rendering unrecoverable scrap regions as neutral warm-grey boxes with fine diagonal hatch lines so operators can visually verify 100% of block volume reconciliation.
- **Confirmed Decision 3 — Navigation & Icon Rail Separation**: The top navigation bar presents the global module links (`Dashboard`, `Projects`, `Optimization` active, `Inventory`, `Reports` with disabled "planned, not yet available" tooltips on non-active modules), while the left 56px icon rail provides direct step shortcuts and workspace tools with tooltips.

---

## 1. Overview & Core Concept

- **What It Does**: Guides foam fabrication planners and saw operators through a four-step workflow—(1) Setup & Data Import, (2) Algorithm Selection & Placement, (3) 3D Cutting Plan & Visualization, and (4) Results, Cost Analytics & Shop-Floor Execution—powered by a deterministic 3D guillotine slicing and nesting engine.
- **Target Audience / Persona**: Industrial manufacturing planners, CNC/guillotine saw operators, and plant engineers working in bright shop-floor or office environments who need high-contrast, scannable tabular figures and unambiguous spatial cutting diagrams.
- **Key Value**: Eliminates visual clutter and cognitive fatigue through a warm, paper-like surface hierarchy, 1/16-inch fractional and decimal precision, honest volume reconciliation (`parts + remnants + kerf + scrap + skin trim = gross block volume`), and zero-ambiguity readiness states.

---

## 2. User Experience & Visual Design

### Visual Identity & Theme
- **Aesthetic Direction**: Warm paper, oat, and cocoa tones inspired by soft morning light on a clean industrial workbench. Calm, minimal, and trustworthy, with a subtle 2.5% opacity SVG `feTurbulence` paper grain applied exclusively to the page canvas.
- **Color System & Tokens** (`color-scheme: light` enforced):

| Token Category | Token Name | Value | Usage |
| :--- | :--- | :--- | :--- |
| **Neutrals** | `--bg-canvas` | `#F6F1EA` | Oat page background with subtle `160deg` wash (`#FBF7F1` → `#F3EADF` → `#EADCCB`) |
| | `--bg-surface` | `#FFFDF9` | Cream white card and table surface |
| | `--bg-raised` | `#F0E8DD` | Muted fill for inputs, table headers, and segmented tracks |
| | `--border-hairline` | `#E7DDD0` | Standard 1px card, cell, and section dividers |
| | `--border-strong` | `#D8CAB9` | Input borders, secondary button outlines, and active frames |
| **Typography Ink** | `--text-ink` | `#2B2118` | Primary espresso text |
| | `--text-secondary` | `#6B5B4D` | Secondary labels, descriptions, and table headers |
| | `--text-muted` | `#9A8B7C` | Non-essential hints and inline unit suffixes (AA compliant) |
| **Brand & Accent** | `--brand-cocoa` | `#7A5C45` | Primary actions, active step indicators (`#654A36` hover, `#553E2D` pressed, `#F0E6DB` tint) |
| | `--accent-terracotta` | `#C07A55` | Single viewport highlight (`#F7E7DC` tint): best badge, active cut plane, or primary KPI delta |
| | `--support-sage` | `#7D8F7A` | Completed steps, remnant indicators (`#E8EDE5` tint) |
| **Semantic Status** | `--status-success` | `#6F8A6B` | Validated / Optimized badge on `#E8EFE5` tint |
| | `--status-warning` | `#BD8B2F` | Stale inputs / Oxidation warning on `#F7EDD6` tint |
| | `--status-error` | `#A64B42` | Infeasible / Validation error on `#F4E3DF` tint |
| **Data & SKU Palette** | `--data-1..6` | `#7A5C45`, `#C07A55`, `#7D8F7A`, `#C9A55C`, `#5F8A8B`, `#8A7F9E` | Colorblind-aware SKU part meshes and Recharts series (always paired with text labels) |

- **Typography & Hierarchy**:
  - **UI Sans**: `Instrument Sans` (`14px` base, `1.5` line-height, weights `400`, `500`, `600`).
  - **Display Serif**: `Newsreader` (regular `400` weight, optical sizing, `tabular-nums`) reserved strictly for the page title (`28px/36px`) and KPI numerals (`40px/44px` hero, `24px/32px` supporting).
  - **Data Mono**: `IBM Plex Mono` (`12px–13px`, `tabular-nums`) for all dimensions, fractional readouts, part IDs, cut sequences, and right-aligned numeric table columns.
  - **Labels**: `11.5px/16px` uppercase with `+0.06em` tracking in secondary text (`#6B5B4D`).
- **Spacing & Alignment Scale**:
  - Strict 4px scale (`4, 8, 12, 16, 24, 32, 48px` only).
  - `1440px` max content width, `24px` page padding, `16px` card grid gaps (`24px` between major sections), `20px` card internal padding with a `1px` hairline divider below every card header.
  - `40px` standard input and button height (`48px` for operator step confirmation), `10px` control radius, `14px` card radius, and inline right-aligned mono unit suffixes (`in`, `cu ft`).

### Interactive Feedback, 3D Viewport & Motion
- **Purposeful Loaders**:
  - *Optimizing State*: Custom SVG animation of a foam bun with a Terracotta slicing line sweeping across it in a smooth loop, paired with live elapsed seconds in `IBM Plex Mono` and the active algorithm name.
  - *Skeletons*: Warm shimmer placeholders (`#EFE6DA` to `#F7F1E8`, `1.4s` cycle) for tables, KPI blocks, and charts.
  - *KPI Count-Up*: `600ms` `easeOut` numeral interpolation triggered only when a new optimization result arrives.
  - *Reduced Motion*: Full support for `prefers-reduced-motion: reduce`, disabling count-up, sweep animations, and 3D camera transitions in favor of instant state updates.
- **Refined 3D Cutting Plan Viewport**:
  - Warm `#F3EDE4` scene canvas with `HemisphereLight` (sky `#FFF6EA`, ground `#E4D6C3`), soft directional key light, and subtle ground `ContactShadows`.
  - Translucent cream outer bun shell (`opacity: 0.18`, `#B8A794` edges), `#E2D3BF` skin-trim crust layer with dashed inner boundary, matte `MeshStandardMaterial` (`roughness: 0.85`, `metalness: 0`) parts with `1px` darker edge outlines and slight visual inset, sage-grey remnants with dashed edges, and toggleable warm-grey scrap boxes with procedural diagonal hatch texture.
  - Animated Terracotta cut plane (`opacity: 0.22`, `450ms` smooth interpolation) with a floating mono coordinate tag (`Z = 22.000 in` / fractional equivalent), or Terracotta part outline on free-nesting waterjet machines.
  - Docked in-canvas HUD (`16px` inset, non-overlapping): Layer toggle chips (`Trim`, `Parts`, `Remnants`, `Scrap`, `Cut Plane`) at top-left, camera view presets (`Isometric`, `Top`, `Front`, `Side`, `Reset`) at top-right, cut stepper with progress bar and keyboard arrow support at bottom-center, and SKU legend card at bottom-right.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1 — Centralized Design Token Architecture**
  - *Chosen Approach*: Define all color, typography, shadow, and spacing tokens in a single design-token module and CSS custom properties mapped into Tailwind utility classes.
  - *Why*: Guarantees zero stray hex values across components, enforces AA contrast ratios, and keeps Recharts, Three.js materials, and DOM elements visually unified.
- **Decision 2 — Honest Engineering & Cost Modeling**
  - *Chosen Approach*: Provide a collapsible Cost Assumptions drawer with editable demo defaults (cost per cubic foot by grade, saw hourly rate, seconds per cut, remnant reuse credit %) and explicitly badge all cost, baseline, and savings figures as `"estimated, demo assumptions"` and layouts as `"heuristic solution"`.
  - *Why*: Upholds industrial software integrity by never claiming mathematical optimality for NP-hard 3D packing heuristics and clearly distinguishing physical geometry from financial estimates.
- **Decision 3 — Multi-File UTF-8 BOM CSV Export**
  - *Chosen Approach*: Upgrade the CSV export action (enabled only for valid, non-stale results) to generate a complete, unit-labelled, ISO-timestamped export bundle containing `summary`, `parts_placed`, `cut_sequence`, `remnants`, `algorithm_comparison`, and `baseline_vs_optimized` with UTF-8 BOM encoding for direct Excel compatibility.
  - *Why*: Plant engineers and ERP integrators require structured, unit-explicit spreadsheets that open cleanly in spreadsheet software without character encoding corruption.

---

## 4. Technical Architecture & Data Strategy

### Architecture & Component Hierarchy

```
┌────────────────────────────────────────────────────────────────────────────┐
│                   Tatras NestPro Application Shell                         │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ TopNavbar (Wordmark · Nav [Optimization Active / Planned] · EN/ES)   │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│  ┌────────┬─────────────────────────────────────────────────────────────┐  │
│  │        │ Page Header (Job #4821 · Status Pill · Disabled G-Code CTA) │  │
│  │        ├─────────────────────────────────────────────────────────────┤  │
│  │  Icon  │ ChevronStepper (1. Setup → 2. Placement → 3. 3D → 4. Exec)  │  │
│  │  Rail  ├─────────────────────────────────────────────────────────────┤  │
│  │ (56px) │ Step 1 View: SidebarInputs (12-Col Setup & Validation Grid) │  │
│  │        │   ├── Grade & Mixed-Grade Toggle + Machine Profile Selector │  │
│  │        │   ├── Skin Trim & Kerf (1/16" Snap + Live Usable Interior)  │  │
│  │        │   └── Available Blocks Table & Parts Demand Table + Swatches│  │
│  │        ├─────────────────────────────────────────────────────────────┤  │
│  │        │ Steps 2–4 Three-Card Workspace (30% / 40% / 30% Equal Ht)   │  │
│  │        │   ├── [30%] AlgorithmPlacementCard                          │  │
│  │        │   │     ├── Engine Selector, Readiness Line & Slicing Loader│  │
│  │        │   │     ├── Benchmark Comparison Table ("Best" Terracotta)  │  │
│  │        │   │     └── Grouped Unplaced Parts Diagnosis Accordion      │  │
│  │        │   ├── [40%] CuttingPlanCard & ThreeBlockView (R3F / Drei)   │  │
│  │        │   │     ├── Camera Presets (Iso/Top/Front/Side) & Layer HUD │  │
│  │        │   │     ├── 3D Bun, Trim, Parts, Remnants, Scrap & Cut Plane│  │
│  │        │   │     └── Docked Cut Stepper + Below-Canvas Cut/Remnant   │  │
│  │        │   └── [30%] ExecutiveSummaryCard                            │  │
│  │        │         ├── Hero Net Yield KPI (Newsreader 40px Count-Up)   │  │
│  │        │         └── Supporting Volume & Operational Reconciliations │  │
│  │        ├─────────────────────────────────────────────────────────────┤  │
│  │        │ Step 4 Full-Width Analytics & Execution Dashboard           │  │
│  │        │   ├── 9 KPI Summary Strip (Hero Waste Reduced + 8 Metrics)  │  │
│  │        │   ├── Collapsible Cost Inputs Panel (Editable Demo Defaults)│  │
│  │        │   ├── Recharts Analytics Grid (5 Unit-Labelled Charts)      │  │
│  │        │   └── Execution Tabs:                                       │  │
│  │        │         ├── Saw Operator Station (48px Confirm Cut Actions) │  │
│  │        │         ├── Planned vs. Actual Variance Table (Editable)    │  │
│  │        │         ├── Printable Cut Sheet Traveler                    │  │
│  │        │         └── Remnant Inventory & Oxidation Aging Monitor     │  │
│  └────────┴─────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────┘
```

### Interactive Component & State Mapping
- **Input Mutation & Stale Guard**: Modifying foam grade, machine profile, skin trim, blade kerf, block stock, or part demand immediately computes the live usable interior dimensions (`nominal - 2 × trim`), validates 1/16-inch increments inline, transitions the job status badge to `Stale` (`#BD8B2F` on `#F7EDD6`), surfaces a calm inline re-run banner, and disables 3D generation and CSV export with explanatory tooltips until re-run. Switching the selected algorithm dropdown inspects cached results per algorithm without invalidating existing solutions.
- **3D Camera, Layer & Stepper Synchronization**: Selecting a block tab or stepping through cuts (via buttons or Left/Right arrow keys) smoothly interpolates the 3D Terracotta cut plane (`450ms`) to the exact coordinate, updates the floating mono label, and highlights the corresponding row in the ordered cut list below the viewport.
- **Cost & Variance Reactivity**: Adjusting any cost input (material cost/cu ft, saw hourly rate, seconds/cut, remnant reuse value %) dynamically recalculates total job cost, cost per part, baseline vs. optimized savings, and the Cost Breakdown chart in real time. Editing actual quantities or cut times in the Planned vs. Actual table computes live variance deltas labelled `"demo: not saved"`.
