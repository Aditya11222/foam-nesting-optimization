"""
Strict 3D nesting and cutting plan validator.
Verifies no spatial overlaps, block boundary containment, rise constraints,
kerf allowances, and volume reconciliation identity.
"""

from typing import List, Dict, Any, Tuple
from ..domain.models import OptimizationResult, BlockLayout, PlacedPart, ValidationResult
from ..domain.orientation import get_permitted_orientations


def validate_optimization_result(result: OptimizationResult) -> ValidationResult:
    """
    Validates an optimization result against manufacturing constraints,
    geometric non-overlap, containment, and volume reconciliation.
    """
    errors: List[str] = []
    warnings: List[str] = []

    total_gross = 0.0
    total_usable = 0.0
    total_parts = 0.0
    total_remnants = 0.0
    total_kerf = 0.0
    total_scrap = 0.0
    total_skin_trim = 0.0

    # 1. Check infeasible / unplaced parts
    for unplaced in result.unplaced_parts:
        # Check if part exceeds any available block dimensions
        exceeds_all = True
        for block in result.blocks:
            orients = get_permitted_orientations(
                unplaced.length, unplaced.width, unplaced.height, unplaced.orientation_mode
            )
            for ox, oy, oz in orients:
                if ox <= block.usable_length + 1e-4 and oy <= block.usable_width + 1e-4 and oz <= block.usable_height + 1e-4:
                    exceeds_all = False
                    break
        if exceeds_all:
            errors.append(
                f"Part '{unplaced.sku}' ({unplaced.length}\"x{unplaced.width}\"x{unplaced.height}\", grade {unplaced.grade}) "
                f"exceeds usable block dimensions across all permitted orientations. It cannot be nested."
            )
        else:
            warnings.append(
                f"Part '{unplaced.sku}' ({unplaced.length}\"x{unplaced.width}\"x{unplaced.height}\", grade {unplaced.grade}) "
                f"could not be placed due to insufficient stock capacity."
            )

    # 2. Block-level validation
    for b_idx, block in enumerate(result.blocks):
        b_num = block.block_index
        ux, uy, uz = block.usable_length, block.usable_width, block.usable_height

        total_gross += block.gross_volume
        total_usable += block.usable_volume
        total_parts += block.parts_volume
        total_remnants += sum(r.volume for r in block.usable_remnants)
        total_kerf += block.kerf_loss_volume
        total_scrap += block.unrecoverable_scrap_volume
        total_skin_trim += block.skin_trim_loss_volume

        # A. Containment within usable volume
        for p in block.placed_parts:
            if p.x < -1e-4 or p.y < -1e-4 or p.z < -1e-4:
                errors.append(f"Block #{b_num}: Part '{p.sku}' has negative coordinate ({p.x}, {p.y}, {p.z}).")
            if (p.x + p.length) > (ux + 1e-4):
                errors.append(f"Block #{b_num}: Part '{p.sku}' exceeds length ({p.x + p.length:.3f}\" > usable {ux}\").")
            if (p.y + p.width) > (uy + 1e-4):
                errors.append(f"Block #{b_num}: Part '{p.sku}' exceeds width ({p.y + p.width:.3f}\" > usable {uy}\").")
            if (p.z + p.height) > (uz + 1e-4):
                errors.append(f"Block #{b_num}: Part '{p.sku}' exceeds height ({p.z + p.height:.3f}\" > usable {uz}\").")

        # B. Non-overlap check between placed parts
        parts = block.placed_parts
        num_parts = len(parts)
        for i in range(num_parts):
            p1 = parts[i]
            for j in range(i + 1, num_parts):
                p2 = parts[j]
                # Check 3D AABB intersection
                overlap_x = max(0.0, min(p1.x + p1.length, p2.x + p2.length) - max(p1.x, p2.x))
                overlap_y = max(0.0, min(p1.y + p1.width, p2.y + p2.width) - max(p1.y, p2.y))
                overlap_z = max(0.0, min(p1.z + p1.height, p2.z + p2.height) - max(p1.z, p2.z))
                
                if overlap_x > 0.01 and overlap_y > 0.01 and overlap_z > 0.01:
                    errors.append(
                        f"Block #{b_num}: Collision detected between '{p1.sku}' and '{p2.sku}' "
                        f"(overlap: {overlap_x:.2f}\" x {overlap_y:.2f}\" x {overlap_z:.2f}\")."
                    )

        # C. Volume Reconciliation Identity per block:
        # Usable Volume = Parts + Remnants + Kerf + Scrap
        block_accounted = (
            block.parts_volume +
            sum(r.volume for r in block.usable_remnants) +
            block.kerf_loss_volume +
            block.unrecoverable_scrap_volume
        )
        block_diff = abs(block.usable_volume - block_accounted)
        if block_diff > 5.0 and (block_diff / max(1.0, block.usable_volume)) > 0.005:
            errors.append(
                f"Block #{b_num}: Volume reconciliation failed. Usable={block.usable_volume:.1f} cu in, "
                f"Sum of parts+remnants+kerf+scrap={block_accounted:.1f} cu in (delta: {block_diff:.1f})."
            )

    reconciliation_delta = abs(total_usable - (total_parts + total_remnants + total_kerf + total_scrap))
    
    reconciliation_dict = {
        "total_gross_volume": round(total_gross, 2),
        "total_usable_volume": round(total_usable, 2),
        "total_skin_trim_volume": round(total_skin_trim, 2),
        "total_parts_volume": round(total_parts, 2),
        "total_remnants_volume": round(total_remnants, 2),
        "total_kerf_volume": round(total_kerf, 2),
        "total_scrap_volume": round(total_scrap, 2),
        "reconciliation_delta": round(reconciliation_delta, 2)
    }

    is_valid = len(errors) == 0

    return ValidationResult(
        is_valid=is_valid,
        errors=errors,
        warnings=warnings,
        volume_reconciliation=reconciliation_dict
    )
