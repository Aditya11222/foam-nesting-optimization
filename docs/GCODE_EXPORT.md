# CNC G-Code Export Post-Processor (Demo-Grade)

> [!CAUTION]
> **DEMO OUTPUT: NOT VALIDATED ON A REAL MACHINE. REVIEW AND DRY-RUN BEFORE USE.**
> 
> This G-code generation module is an experimental demonstration feature. It has **NOT** been certified, validated, or dry-run on physical industrial machinery, CNC foam saws, wire cutters, waterjet gantries, or machine controllers (e.g., Siemens, Fanuc, Beckhoff, Mach4). 
> 
> Never execute exported programs directly on physical machinery without independent review by a certified CNC programmer/operator, zero-offset verification, and a mandatory air-cut / dry-run.

---

## 1. Overview & Architecture

Tatras NestPro includes a demo-grade CNC G-code post-processor that translates 3D cutting plans into standard RS-274 / ISO 6983 machine instructions.

The post-processor operates strictly downstream of the optimization solver:
1. **Inputs**: Validated optimization result, placed blocks, ordered cut sequences, and target machine specifications (`kerf_in`, `max_cut_dims`, `max_feed_ipm`, `dialect`).
2. **Path Check Simulation**: Pre-flight verification verifying envelope bounds, negative coordinates, and feed rates.
3. **Dual Execution**: Implemented natively in Python (`backend/app/engine/gcode/`) and replicated client-side in TypeScript (`frontend/src/services/gcode.ts`) with zero external dependencies.
4. **Export Formats**: Single-block plain text programs (`.nc`) or multi-block zip archives (`.zip`) packaged with an in-browser binary PKZip encoder.

---

## 2. Dialect Standard & Coordinate Conventions

### Standard Syntax: RS-274 / ISO 6983
Every generated `.nc` program strictly follows generic RS-274 syntax:

```gcode
( ============================================================ )
( TATRAS NESTPRO - DEMO G-CODE POST-PROCESSOR                 )
( DEMO OUTPUT: NOT VALIDATED ON A REAL MACHINE.               )
( REVIEW AND DRY-RUN BEFORE USE.                              )
( Job: Job-172983-Demo                                        )
( Machine: CNC Oscillating Blade Profile Saw                  )
( Block: 1 of 1                                               )
( Generated: 2026-10-27T17:50:00Z                             )
( Units: INCHES | Origin: Block corner X0 Y0 Z0               )
( ============================================================ )
G20 (Units: Inches)
G90 (Absolute distance mode)
G17 (XY Plane selection)
G94 (Feedrate: inches per minute)
G00 Z10.0000 (Safe Z retract)
G00 X0.0000 Y0.0000
...
M30 (Program end and rewind)
```

### Coordinate & Origin System
- **Origin ($X0, Y0, Z0$)**: Bottom-front-left corner of the raw block envelope.
- **Precision**: Snapped to the $1/16''$ ($0.0625''$) manufacturing grid and formatted to 4 decimal places.
- **Safe Clearance**: Default safe retract height $Z = \text{Block Height} + 2.0''$.
- **Rapid Moves (`G00`)**: Tool positioning above material.
- **Linear Cuts (`G01`)**: Cutting moves at the machine's configured cut feed rate (`feed_rate_ipm`).

### Toolpath Logic by Machine Type
- **Guillotine Saws (Horizontal / Vertical / Crosscut)**:
  - Straight through-slicing passes (Z-axis slabbing, X-axis ripping, Y-axis crosscuts).
  - Rapid to approach coordinate $\to$ plunge/engage $\to$ linear through-pass across full dimension $\to$ retract to safe clearance.
- **CNC Waterjet / Contour Cutters**:
  - Closed contour bounding loops offset by kerf / 2.
  - Safe rapid approach to lead-in $\to$ stream engage comment (`M08`) $\to$ contour traversal $\to$ stream shutoff (`M09`) $\to$ safe retract.

---

## 3. Machine Profile Registry & G-Code Support

G-code generation is strictly gated by the machine profile configuration in `backend/data/machines.json`:

| Machine Profile ID | Name | Cut Type | G-Code Supported | Dialect | Max Feed (IPM) |
|---|---|---|:---:|:---:|:---:|
| `saw-horizontal-auto` | Automatic CNC Horizontal Bandsaw | guillotine | **Yes** | RS-274 | 120 |
| `saw-vertical-auto` | Automatic CNC Vertical Bandsaw | guillotine | **Yes** | RS-274 | 150 |
| `saw-cnc-blade` | CNC Oscillating Blade Profile Saw | guillotine | **Yes** | RS-274 | 200 |
| `saw-wj` | 5-Axis Abrasive CNC Waterjet | waterjet | **Yes** | RS-274 | 180 |
| `saw-contour-wire` | CNC Fast-Wire Contour Profiler | contour | **Yes** | RS-274 | 220 |
| `saw-crosscut-auto` | High-Speed Automatic Crosscut Saw | guillotine | **Yes** | RS-274 | 140 |
| `saw-horizontal-manual`| Manual Slabbing Bandsaw | guillotine | **No** (Manual) | — | — |
| `saw-vertical-manual` | Manual Vertical Bandsaw | guillotine | **No** (Manual) | — | — |
| `saw-table` | Manual Sliding Table Saw | guillotine | **No** (Manual) | — | — |
| `saw-crosscut-manual` | Manual Radial Arm Crosscut Saw | guillotine | **No** (Manual) | — | — |
| `saw-manual-bandsaw` | Workshop Vertical Bandsaw | guillotine | **No** (Manual) | — | — |

*When a manual saw is selected, the "Generate G-Code" action button is disabled with an explanatory tooltip: `"<Machine> is a manual saw: no G-code output"`.*

---

## 4. Path Check Pre-Flight Simulation

Before G-code can be exported or downloaded, the generator runs an automated pre-flight path simulation check (`path_check.py` / `verifyGCodePathClient`):

1. **Bounding Box Check**: Verifies all commanded toolpath positions lie within the raw block dimensions $[0, L] \times [0, W] \times [0, H]$.
2. **Machine Stroke Envelope Check**: Ensures travels do not exceed the machine's maximum travel envelopes (`max_cut_length_in`, `max_cut_width_in`, `max_cut_height_in`).
3. **No Negative Travel**: Verifies that no cut moves plunge below $Z=0$ (table surface).
4. **Feed Rate Sanity**: Verifies all `G01` linear feed moves specify a positive feed rate $> 0$ and $\le \text{max\_feed\_ipm}$.
5. **Program Termination**: Ensures proper `M30` program end and spindle/blade/stream disengagement.

If any path check check fails, the UI displays a `Sim Fail` badge with diagnostic errors and **disables** the download buttons until resolved.

---

## 5. Implemented vs. Placeholder Matrix

To maintain absolute transparency, the table below documents what is implemented in this demo release versus what remains placeholder for industrial machine-certified post-processors:

| Capability | Status | Implementation Details |
|---|:---:|---|
| **Verbatim Safety Disclaimers** | **Implemented** | Present in every `.nc` file header, UI modal banner, and gated download checkbox. |
| **RS-274 ISO 6983 Syntax** | **Implemented** | Standard `G20`, `G90`, `G17`, `G94`, `G00`, `G01`, `M30` instructions. |
| **1/16" Manufacturing Grid** | **Implemented** | Deterministic coordinate snapping to $0.0625''$ printed to 4 decimal places. |
| **Guillotine Through-Slicing** | **Implemented** | Planar slicing on Z, X, and Y axes derived from cut sequencer instructions. |
| **Waterjet / Contour Loops** | **Implemented** | Perimeter offset toolpaths with stream on/off state tracking. |
| **Pre-Flight Path Check** | **Implemented** | Collision and boundary violation simulation in Python and TypeScript. |
| **Zero-Dependency Multi-Block ZIP** | **Implemented** | Custom binary PKZip encoder emitting standard multi-file archives. |
| **Modal Preview & Search** | **Implemented** | Line-numbered viewer, search filter, and cut step jump dropdown. |
| **Machine-Specific Post-Processors** | *Placeholder* | Machine-specific M-codes, controller dialects (Heidenhain, Fanuc macro-B), and custom canned cycles. |
| **Feed Rate Acceleration / Deceleration** | *Placeholder* | Jerk-limited S-curve acceleration modeling and corner deceleration profiles. |
| **Blade Deflection Compensation** | *Placeholder* | Dynamic speed reduction based on foam density ($lb/ft^3$) and blade tension. |
| **Automatic Tab / Bridge Generation** | *Placeholder* | Retaining tabs to prevent small cut parts from shifting or ejecting during crosscuts. |
| **Vacuum Hold-Down Zone Control** | *Placeholder* | Dynamic M-code actuation for zoned vacuum table chambers under nested parts. |
| **Physical Controller Certified DNC** | *Placeholder* | Direct RS-232 / Ethernet DNC upload to industrial CNC machine controllers. |

---

## 6. Verification & Test Suite

The G-code generation engine is covered by automated unit and integration tests:
- **Backend Tests**: `backend/tests/test_gcode.py` (8 test cases validating dialects, path check, header safety text, manual machine gating, and API route).
- **Frontend Tests**: `frontend/src/services/__tests__/gcode.test.ts` (button state logic, path check client, ZIP creation, and warning headers).
