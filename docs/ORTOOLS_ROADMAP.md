# OR-Tools Architecture Roadmap & Future Extensions

This document outlines the planned future optimization capabilities for the **Tatras NestPro** foam nesting engine, detailing where Google OR-Tools (CP-SAT) will be integrated in subsequent phases.

---

## 1. Architectural Philosophy: The Separation of Allocation vs Geometry

In Tatras NestPro:
- **OR-Tools (CP-SAT)**: Mathematical decision-making layer (combinatorial bin allocation, pattern frequency selection, machine assignment, scheduling).
- **Custom Slicing Tree Engine**: 3D spatial layout generation, orthogonal guillotine coordinate trees, kerf tracking, physical clearance, and geometric verification.
- **Three.js Visualizer**: Operator cutting walkthroughs and interactive 3D visual review.

OR-Tools does not solve 3D geometry directly; it solves mathematical models whose proposals are verified or repaired by the geometry engine.

---

## 2. Planned Extensions (Roadmap)

### 2.1 Rush-Order Re-planning with Warm-Start & Fixed Completed Cuts (Planned: Q2)
- **Problem**: When high-priority rush orders arrive on the shop floor while a bun is partially cut on the saw table, restarting the plan scraps valuable foam.
- **Formulation**:
  - Existing cutting tree cuts with status `COMPLETED` are fixed as hard boundary conditions.
  - Remaining uncut residual sub-volumes are extracted as candidate stock nodes.
  - CP-SAT uses a warm-start hint (`AddHint`) with the previous solution and dynamically slots rush parts into remaining unallocated volumes while minimizing operator saw re-orientations.

### 2.2 Advanced Remnant Valuation & Aging Optimization (Planned: Q2)
- **Problem**: Remnants lose value over time, take up warehouse bay footprint, and risk obsolescence.
- **Formulation**:
  - Augments the remnant objective with an exponential holding-cost decay curve:
    $$	ext{DiscountedCost}(r) = 	ext{BaseCost}(r) 	imes e^{-\lambda \cdot 	ext{days\_held}} 	imes 	ext{UsabilityScore}(r)$$
  - CP-SAT prioritizes older, geometrically awkward remnants for matching jobs before they degrade into unrecoverable scrap.

### 2.3 Dynamic Column Generation (Gilmore-Gomory Pricing) (Planned: Q3)
- **Current Status**: The current `ORT-PATTERN` algorithm uses a fixed, de-duplicated candidate pool of up to 300 guillotine cutting patterns.
- **Next Step**: Full column generation where a pricing subproblem (knapsack or constrained slicing tree) iteratively generates high-yield cutting patterns on-the-fly with negative reduced cost, terminating when proven optimal for the continuous LP relaxation.

### 2.4 Multi-Job Disjunctive Shop-Floor Scheduling (Planned: Q3)
- **Problem**: Multiple cutting stations (horizontal saws, vertical slicers, waterjets) run concurrently across shifts.
- **Formulation**:
  - Models machine assignment and job sequencing using CP-SAT interval variables:
    $$	ext{IntervalVar}(	ext{start}, 	ext{duration}, 	ext{end})$$
  - Enforces `NoOverlap` per machine with sequence-dependent setup times for blade changes and foam density changes.
  - Minimizes global makespan ($C_{\max}$) and tardiness against promised ERP dispatch dates.
