import type { OptimizationResult, ValidationResult } from '../types';
import { getPermittedOrientations } from './orientation';

export function validateOptimizationResult(result: OptimizationResult): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  let totalGross = 0;
  let totalUsable = 0;
  let totalParts = 0;
  let totalRemnants = 0;
  let totalKerf = 0;
  let totalScrap = 0;
  let totalSkinTrim = 0;

  // 1. Check unplaced parts
  for (const unplaced of result.unplaced_parts || []) {
    let exceedsAll = true;
    for (const block of result.blocks) {
      const orients = getPermittedOrientations(
        unplaced.length,
        unplaced.width,
        unplaced.height,
        unplaced.orientation_mode
      );
      for (const [ox, oy, oz] of orients) {
        if (
          ox <= block.usable_length + 1e-4 &&
          oy <= block.usable_width + 1e-4 &&
          oz <= block.usable_height + 1e-4
        ) {
          exceedsAll = false;
          break;
        }
      }
    }

    if (exceedsAll) {
      errors.push(
        `Part '${unplaced.sku}' (${unplaced.length}"x${unplaced.width}"x${unplaced.height}", grade ${unplaced.grade}) exceeds usable block dimensions across all permitted orientations. It cannot be nested.`
      );
    } else {
      warnings.push(
        `Part '${unplaced.sku}' (${unplaced.length}"x${unplaced.width}"x${unplaced.height}", grade ${unplaced.grade}) could not be placed due to insufficient stock capacity.`
      );
    }
  }

  // 2. Block-level validation
  for (const block of result.blocks) {
    const bNum = block.block_index;
    const { usable_length: ux, usable_width: uy, usable_height: uz } = block;

    totalGross += block.gross_volume;
    totalUsable += block.usable_volume;
    totalParts += block.parts_volume;
    totalRemnants += block.usable_remnants.reduce((sum, r) => sum + r.volume, 0);
    totalKerf += block.kerf_loss_volume;
    totalScrap += block.unrecoverable_scrap_volume;
    totalSkinTrim += block.skin_trim_loss_volume;

    // A. Containment
    for (const p of block.placed_parts) {
      if (p.x < -1e-4 || p.y < -1e-4 || p.z < -1e-4) {
        errors.push(`Block #${bNum}: Part '${p.sku}' has negative coordinate (${p.x}, ${p.y}, ${p.z}).`);
      }
      if (p.x + p.length > ux + 1e-4) {
        errors.push(`Block #${bNum}: Part '${p.sku}' exceeds length (${(p.x + p.length).toFixed(3)}" > usable ${ux}").`);
      }
      if (p.y + p.width > uy + 1e-4) {
        errors.push(`Block #${bNum}: Part '${p.sku}' exceeds width (${(p.y + p.width).toFixed(3)}" > usable ${uy}").`);
      }
      if (p.z + p.height > uz + 1e-4) {
        errors.push(`Block #${bNum}: Part '${p.sku}' exceeds height (${(p.z + p.height).toFixed(3)}" > usable ${uz}").`);
      }
    }

    // B. Non-overlap check between placed parts
    const parts = block.placed_parts;
    for (let i = 0; i < parts.length; i++) {
      const p1 = parts[i];
      for (let j = i + 1; j < parts.length; j++) {
        const p2 = parts[j];
        const overlapX = Math.max(0, Math.min(p1.x + p1.length, p2.x + p2.length) - Math.max(p1.x, p2.x));
        const overlapY = Math.max(0, Math.min(p1.y + p1.width, p2.y + p2.width) - Math.max(p1.y, p2.y));
        const overlapZ = Math.max(0, Math.min(p1.z + p1.height, p2.z + p2.height) - Math.max(p1.z, p2.z));

        if (overlapX > 0.01 && overlapY > 0.01 && overlapZ > 0.01) {
          errors.push(
            `Block #${bNum}: Collision detected between '${p1.sku}' and '${p2.sku}' (overlap: ${overlapX.toFixed(2)}" x ${overlapY.toFixed(2)}" x ${overlapZ.toFixed(2)}").`
          );
        }
      }
    }

    // C. Volume Reconciliation Identity: Usable = Parts + Remnants + Kerf + Scrap
    const blockAccounted =
      block.parts_volume +
      block.usable_remnants.reduce((sum, r) => sum + r.volume, 0) +
      block.kerf_loss_volume +
      block.unrecoverable_scrap_volume;
    const blockDiff = Math.abs(block.usable_volume - blockAccounted);
    if (blockDiff > 5.0 && blockDiff / Math.max(1.0, block.usable_volume) > 0.005) {
      errors.push(
        `Block #${bNum}: Volume reconciliation failed. Usable=${block.usable_volume.toFixed(1)} cu in, Sum=${blockAccounted.toFixed(1)} cu in (delta: ${blockDiff.toFixed(1)}).`
      );
    }
  }

  const reconciliationDelta = Math.abs(totalUsable - (totalParts + totalRemnants + totalKerf + totalScrap));

  return {
    is_valid: errors.length === 0,
    errors,
    warnings,
    volume_reconciliation: {
      total_gross_volume: Math.round(totalGross * 100) / 100,
      total_usable_volume: Math.round(totalUsable * 100) / 100,
      total_skin_trim_volume: Math.round(totalSkinTrim * 100) / 100,
      total_parts_volume: Math.round(totalParts * 100) / 100,
      total_remnants_volume: Math.round(totalRemnants * 100) / 100,
      total_kerf_volume: Math.round(totalKerf * 100) / 100,
      total_scrap_volume: Math.round(totalScrap * 100) / 100,
      reconciliation_delta: Math.round(reconciliationDelta * 100) / 100,
    },
  };
}
