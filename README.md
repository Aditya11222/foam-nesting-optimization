# Tatras NestPro — 3D Foam Nesting & Cutting Optimization

Tatras NestPro is an industrial polyurethane foam bun nesting, guillotine slicing, and cutting optimization platform built in React, TypeScript, Tailwind CSS, Three.js (`@react-three/fiber` / `@react-three/drei`), and Recharts.

---

## 1. Implemented vs. Placeholder Features

### Implemented (Full End-to-End Flow)
- **Step 1 — Setup & Data Import**:
  - Foam grade selector (`HR-40`, `HR-30`, `VE-50`) with automatic block/part synchronization and an optional `"Mixed Grades"` toggle.
  - Machine profile selector (`Guillotine`, `Waterjet`, `Wire`, `CNC`, `Auto`) with cut-type badges, max cut height, and automatic kerf sync.
  - Skin trim per face and blade kerf inputs in inches snapped to `1/16"`, inline validation, and live usable interior readout (`Nominal - 2 × Trim`).
  - Editable Available Blocks and Parts Demand tables with orientation rules (`rise-locked`, `free-in-plane`, `any`), SKU color swatches + non-color pattern tags, and `"Load Sample"` preset (Job #4821, 154 pieces).
- **Step 2 — Algorithm Selection & Placement**:
  - 6 algorithms (`Best-Fit Decreasing`, `First-Fit Decreasing`, `Simulated Annealing`, `OR-Tools Block Assignment`, `OR-Tools Pattern Selection`, `Free Nesting`) with machine compatibility enforcement.
  - `"Run Optimization"` and `"Compare All Algorithms"` with animated isometric foam-bun slicing loader (`FoamSlicingLoader`) and elapsed timer.
  - Cached per-algorithm results, benchmark comparison table with `"Best in this comparison"` badge + heuristic footnote, and a single grouped collapsible panel for any unplaced parts.
  - Input staleness detection (`Stale` banner + badge) that disables 3D generation and CSV export until re-run.
- **Step 3 — 3D Cutting Plan & Visualization**:
  - Interactive Three.js / React-Three-Fiber scene on a warm `#F3EDE4` background with hemisphere + directional lighting and soft contact shadows.
  - Translucent outer bun shell (`0.18` opacity), `#E2D3BF` skin-trim crust layer with dashed outline, matte `MeshStandardMaterial` parts (`0.85` roughness, `0.12"` visual seam gap), sage-grey remnants, and hatched warm-grey scrap boxes.
  - Animated `450ms` Terracotta (`#C07A55`) cut plane with floating monospace label, docked 4-zone HUD (Layer chips, Camera view presets `Isometric / Top / Front / Side / Reset`, Cut Stepper with keyboard arrow support, and SKU Legend), plus Ordered Cut List and Retained Remnants tables below.
- **Step 4 — Results, Analytics & Shop-Floor Execution**:
  - 9 KPI cards (1 Hero KPI: `Waste Reduced vs. Shop Baseline` + 8 supporting KPIs) with `Newsreader` display numerals and `useCountUp` animation.
  - Collapsible editable Cost & Baseline Assumptions panel (`$/cu ft` per grade, saw rate `$/hr`, cycle seconds per cut, remnant reuse credit `%`, shop baseline yield `%`).
  - 5 Recharts visualizations (`Volume Breakdown`, `Algorithm Yield Comparison`, `Shop Baseline vs. Optimized`, `Per-Bun Interior Utilization`, `Estimated Job Cost Breakdown`).
  - 4 execution tabs: **Saw Operator Station** (with `48px` touch `"Confirm cut"` buttons), **Planned vs. Actual Variance Table** (editable actuals with live delta columns, labelled `"demo: not saved"`), **Printable Traveler**, and **Remnants & Aging**.
  - **UTF-8 with BOM (`\uFEFF`) CSV Export** containing all 6 reconciled sections (`SUMMARY`, `PARTS_PLACED`, `CUT_SEQUENCE`, `REMNANTS`, `ALGORITHM_COMPARISON`, `BASELINE_VS_OPTIMIZED`).

### Placeholders (Visibly Disabled by Design)
- **Generate G-Code** button in the page header — disabled with `"planned, not yet available"` tooltip.
- **Global Navigation Modules** (`Dashboard`, `Projects`, `Inventory`, `Reports`) — disabled with `"planned, not yet available"` tooltip (`Optimization` is active).

---

## 2. Switching Between Mock and HTTP Adapters

By default, the frontend runs on the deterministic local TypeScript optimization engine (`src/api.ts` + `src/engine/packer.ts`) so that every volume figure (`parts + remnants + trim + kerf + scrap = gross bun volume`) reconciles offline and displays a `"Demo data"` indicator.

To connect to the FastAPI backend (`/backend/app/main.py`):
1. Set `VITE_API_URL` in your `.env` file (e.g. `VITE_API_URL=http://localhost:8000/api`) and wire the fetch calls in `src/api.ts` to:
   - `GET ${VITE_API_URL}/algorithms`
   - `POST ${VITE_API_URL}/optimize`
   - `POST ${VITE_API_URL}/optimize/compare`

---

## 3. Design Token Reference (`src/tokens.ts` & `src/index.css`)

### Color Palette (Warm Workbench — Light Mode Only)
| Token | CSS Variable | Hex / Value | Purpose |
| :--- | :--- | :--- | :--- |
| `canvas` | `--color-canvas` | `#F6F1EA` | Oat page canvas background with 2.5% SVG paper grain |
| `surface` | `--color-surface` | `#FFFDF9` | Cream white card & table surface |
| `raised` | `--color-raised` | `#F0E8DD` | Muted fill / table headers / secondary buttons |
| `row-hover` | `--color-row-hover` | `#F8F2E9` | Table row hover state |
| `hairline` | `--color-border-hairline` | `#E7DDD0` | 1px card & table dividers |
| `strong` | `--color-border-strong` | `#D8CAB9` | Form input borders |
| `ink` | `--color-ink` | `#2B2118` | Espresso primary text |
| `secondary` | `--color-text-secondary` | `#6B5B4D` | Secondary labels & metadata |
| `muted` | `--color-text-muted` | `#9A8B7C` | Non-essential hints & unit suffixes |
| `cocoa` | `--color-cocoa` | `#7A5C45` | Brand primary actions & active indicators |
| `terracotta` | `--color-terracotta` | `#C07A55` | Single highlight per view (best badge, active cut plane, hero delta) |
| `sage` | `--color-sage` | `#7D8F7A` | Support accent, completed steps & remnants |
| `status-success` | `--color-status-success` | `#6F8A6B` on `#E8EFE5` | Validated / Optimized status |
| `status-warning` | `--color-status-warning` | `#BD8B2F` on `#F7EDD6` | Stale / Oxidation warning |
| `status-error` | `--color-status-error` | `#A64B42` on `#F4E3DF` | Unplaced / Validation error |

### Part & Chart Data Palette (`DATA_PALETTE`)
`#7A5C45` (Cocoa), `#C07A55` (Terracotta), `#7D8F7A` (Sage), `#C9A55C` (Ochre), `#5F8A8B` (Slate Teal), `#8A7F9E` (Muted Plum).

### Typography Scale
- **UI (`Instrument Sans`)**: `14px/22px` body, `16px/24px` (`600`) card titles, `11.5px/16px` (`600`, uppercase, `+0.06em`) labels.
- **Display (`Newsreader`)**: `28px/36px` page title, `40px/44px` hero KPI, `24px/32px` supporting KPIs (`tabular-nums`).
- **Data (`IBM Plex Mono`)**: `12px–13px/20px` dimensions, IDs, cut sequences, and right-aligned table numerals (`tabular-nums`).

### Spacing & Radius Scale
- **4px Base Scale**: `4px`, `8px`, `12px`, `16px`, `20px` (card inner padding), `24px` (page padding & section gap), `32px`, `48px`.
- **Radius**: `14px` (`rounded-card`) on cards, `10px` (`rounded-control`) on inputs and buttons.
