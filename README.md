# Tatras NestPro: 3D Foam Nesting & Cutting Optimization

A production-grade prototype web application that computes high-yield cutting layouts for rectangular polyurethane foam parts from large raw blocks ("buns") and inventory remnants, minimizing unrecoverable waste, and guiding saw operators through step-by-step 3D visual instructions.

Built as an interactive demo for **Tatras Data** based on the client solution proposal (*Draft 1.4 — adds dynamic re-planning for rush orders*).

---

## 1. Quick Start

### Prerequisites
- Python 3.11+ (Python 3.14 supported)
- Node.js 18+ (tested on Node v24, npm v11)

### Start the Backend (FastAPI)
```bash
# From workspace root
py -m venv .venv
.\.venv\Scripts\activate
pip install -r backend/requirements.txt

# Run server on port 8000
python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload
```
- API Health: [http://127.0.0.1:8000/api/health](http://127.0.0.1:8000/api/health)
- Swagger Docs: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)

### Start the Frontend (Vite + React + Three.js)
```bash
# In a new terminal
cd frontend
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```
- Open [http://127.0.0.1:5173/](http://127.0.0.1:5173/) in your browser.

### Run the Backend Test Suite
```bash
$env:PYTHONPATH="backend"
.\.venv\Scripts\pytest.exe -v backend/tests
```
All **22/22 unit and API integration tests** pass 100% green.

---

## 2. Solution Architecture

```
foam-nesting-optimization/
├── docs/
│   └── ALGORITHM.md             # Plain-language explanation of 3D guillotine nesting
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app with CORS and API router mounts
│   │   ├── domain/
│   │   │   ├── units.py         # 1/16" snapping, validation, mixed fraction formatting
│   │   │   ├── models.py        # Pydantic v2 schemas: Grade, Part, Bun, Remnant, Machine
│   │   │   ├── orientation.py   # Rise constraints & duplicate orientation collapsing
│   │   │   └── remnant_aging.py # Oxidation degradation model (-2"/axis after 2-3 days)
│   │   ├── optimizer/
│   │   │   ├── slicing_tree.py  # 3D Guillotine Slicing Tree (k-d tree structure)
│   │   │   ├── guillotine.py    # Best-Fit Decreasing 3D Guillotine placement engine
│   │   │   ├── cut_sequencer.py # Translates slicing tree into saw-operator cut steps
│   │   │   ├── metrics.py       # Transparent volume, scrap, and utilization calculations
│   │   │   └── registry.py      # Strategy registry (guillotine vs free waterjet stub)
│   │   ├── repositories/
│   │   │   ├── base.py          # Abstract Base Classes (ready for PostgreSQL)
│   │   │   └── json_repo.py     # In-memory & JSON persistence implementation
│   │   └── api/
│   │       ├── routes_optimize.py   # /api/optimize, /api/jobs/samples
│   │       ├── routes_inventory.py  # /api/inventory/buns, remnants, aging
│   │       ├── routes_machines.py   # /api/machines
│   │       ├── routes_grades.py     # /api/grades
│   │       └── stubs.py             # SyteLine & ML scoring stub interfaces
│   ├── data/                    # Synthetic sample files (no real/confidential ERP data)
│   │   ├── grades.json          # HR-40, HR-30, VE-50, CM-28, FT-35
│   │   ├── machines.json        # Horizontal/vertical guillotine & waterjet CNC stub
│   │   ├── inventory.json       # Stock buns and age-tracked remnants
│   │   └── sample_jobs.json     # Proposal Job #4821 (Acme Bedding SO-10592)
│   ├── tests/                   # 22 Comprehensive pytest test cases
│   └── requirements.txt
└── frontend/
    ├── src/
    │   ├── components/
    │   │   ├── ThreeBlockView.tsx        # React Three Fiber 3D block & cut-plane viewer
    │   │   ├── PlannerView.tsx           # Production Planner UI (Proposal Figure 2)
    │   │   ├── OperatorStationView.tsx   # Touchscreen Saw Operator UI (Proposal Figure 3)
    │   │   └── RemnantInventoryView.tsx  # Remnant Oxidation Aging demo panel
    │   ├── api.ts               # Backend client with automatic offline fallback
    │   ├── types.ts             # TypeScript interfaces matching backend models
    │   ├── i18n.ts              # English and Spanish message catalogues
    │   ├── App.tsx              # Application shell with view and language routing
    │   └── index.css            # Tailwind directives & print media styles
    ├── tailwind.config.js
    └── package.json
```

---

## 3. Domain Rules & Manufacturing Constraints Enforced

Every constraint specified in Section 3 of the client proposal is strictly validated and enforced:

1. **Units & Snapping (1/16")**:
   - All dimensions snap strictly to `0.0625"` increments (`round(v * 16) / 16`).
   - Rejects non-positive or sub-1/16" values with clear errors.
   - Formatted as clean mixed fractions for operators (e.g., `22"`, `12 1/8"`, `1/16"`).

2. **Mandatory Skin Trim (~1" Per Face)**:
   - Polyurethane buns have hard crusty skin on all 6 faces.
   - Usable dimensions = nominal − 2 × trim per axis (default 1.0", configurable).
   - Parts are placed **only** in the usable volume. Blocks with usable dimension $\le 0$ are rejected.

3. **Kerf Allowance (1/8")**:
   - Every cut plane consumes blade thickness (default `0.125"` for guillotine saws).
   - Enforced structurally across all slicing tree node splits.

4. **Foam Rise Direction & Anisotropy (Z Axis)**:
   - Chemical foaming expands vertically along Z.
   - Permitted orientation sets:
     - `rise-locked` (default): Height locked to vertical Z; allows 2 rotations in XY plane.
     - `free-in-plane`: Rotate about Z only.
     - `any`: All 6 Cartesian permutations.
   - Duplicate dimensions collapse automatically (cubes have 1 orientation; square sections have 3 under `any` or 1 under `rise-locked`).

5. **Strict Grade Segregation**:
   - Samples 5 distinct grades (`HR-40`, `HR-30`, `VE-50`, `CM-28`, `FT-35`).
   - Raw buns, remnants, and parts belong to a single grade. Cross-grade nesting is prohibited and raises a `GradeMismatchError`.

6. **Machine Profiles & Fleet**:
   - Guillotine saws (horizontal and vertical) are fully supported.
   - Free cutting (waterjet/CNC contour) is registered in the strategy registry and returns a clean `501 Not Implemented` with an explanatory message.
   - Machine cut-height limits are strictly verified against stock dimensions.

7. **Remnant Aging & Degradation (Finding from Proposal)**:
   - Remnants oxidize on shop floor racks. After 2–3 days in storage, an offcut loses an additional 1" per face (−2"/axis) before reuse.
   - Modeled via `compute_effective_remnant_dims` and demonstrated in the interactive Remnant Inventory panel with dynamic degradation threshold sliders (2, 3, 4 days).

8. **Honest Utilization Reporting**:
   - 3D cutting-stock problems are NP-hard; solutions are explicitly designated as `"heuristic solution"`.
   - Utilization is transparently reported as both Gross Bun Yield and Net Usable Yield, without claiming false global optimality.

---

## 4. User Interface Surfaces

### 4.1 Planner Web Application (Proposal Figure 2)
- **Required Parts Grid**: Shows part SKU, dimensions, quantities, color coding, and orientation tags (`2↑`, `free`, `any`).
- **Interactive 3D Nesting Layout**: Three.js view showing colored parts inside the post-trim usable block, block pagination (`1`, `2`, `3`), and camera controls.
- **Yield Summary**: Real-time Net/Gross yield, scrap volume, usable remnant volume, total cut count, and estimated saw time.
- **Predicted Remnants**: Lists salvageable offcuts tagged for storage with dimensions and usability scores.
- **Dynamic Rush Order Simulation**: Click `+ Simulate Rush Order` to fold 8 urgent cushions into the active plan and watch the engine re-solve on demand.
- **Export Cut Sheet**: Generates a clean printable/PDF saw cut sheet.

### 4.2 Saw Operator Touchscreen (Proposal Figure 3)
- **High-Contrast Touchscreen Layout**: Large buttons and fonts designed for shop-floor tablets.
- **Step-by-Step 3D Cut Plane**: Highlights the exact cut plane in translucent glowing magenta at that exact step.
- **Dimensioned Instruction Card**: Cut type, cut height from base (`22 in`), fence setting, feed direction, resulting pieces, and kerf allowance.
- **Keep Offcut Callouts**: Highlights when an offcut should be saved: `⚠ Keep offcut: Retain as usable remnant 28×40×40 — Tag & store in Bay R-12`.
- **Sequence Strip**: Clickable numbered step bubbles (`1 ✓`, `2 ✓`, `3 (active)`, `4`, `5`...) for rapid jump or review.

### 4.3 Remnant Inventory & Degradation Panel
- Demonstrates time-dependent oxidation decay.
- Compares nominal dimensions vs. effective usable dimensions after applying the −2"/axis oxidation trim.
- Interactive aging threshold adjustment (2, 3, or 4 days).

### 4.4 Bilingual Support (English & Spanish)
- One-click toggle in the header switchable per user.
- Spanish terminology tailored for shop-floor operators (*Corte Horizontal*, *Corte Longitudinal*, *Corte Transversal*, *Desorillado*, *Espesor de corte*, *Guardar remanente*).

---

## 5. Status: Implemented vs. Stubbed

| Feature | Status | Details |
|---|---|---|
| 3D Guillotine Slicing Tree | **Implemented** | Recursive orthogonal through-edge cuts (k-d tree). |
| Best-Fit Decreasing Placement | **Implemented** | Volume-descending sorting, multi-orientation trial. |
| 1/16" Snapping & Validation | **Implemented** | Snapped to `0.0625"`; rejects non-positive or sub-1/16" inputs. |
| Mandatory Skin Trim (~1") | **Implemented** | Parts placed strictly in post-trim usable interior. |
| Kerf Allowance (1/8") | **Implemented** | Consumed on every cut plane. |
| Foam Rise Anisotropy (Z) | **Implemented** | `rise-locked`, `free-in-plane`, `any`, duplicate collapsing. |
| Grade Segregation | **Implemented** | 5 sample grades; independent solving per grade. |
| Saw Operator Cut Sequencer | **Implemented** | Bilingual step-by-step instructions with 3D cut planes. |
| Remnant Aging Degradation | **Implemented for Demo** | Model function + Remnant Inventory panel. |
| Rush Order Re-planning | **Implemented** | Add part / rush order button folds demand dynamically. |
| Free Cutting (Waterjet/CNC) | **Stubbed** | Registered in strategy registry; returns clean HTTP 501. |
| SyteLine ERP Integration | **Stubbed** | Interface stubs provided in `stubs.py`. |
| ML Remnant Usability Scoring | **Stubbed** | Interface stubs provided in `stubs.py` (rule-based scoring active). |
| PostgreSQL Storage | **Interface Ready** | Abstract repository pattern ready to swap in PostgreSQL. |
