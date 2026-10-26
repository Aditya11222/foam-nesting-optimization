import type { PartItem, PlacedPart, UnplacedPartSummary, MachineProfile } from '../types';
import { getPermittedOrientations } from './orientation';

export interface CandidateStockInfo {
  stockType: 'bun' | 'remnant';
  stockId: string;
  nominalDims: [number, number, number];
  usableDims: [number, number, number];
}

export function buildUnplacedSummary(
  demandedParts: PartItem[],
  placedParts: PlacedPart[],
  candidateStocks: CandidateStockInfo[],
  machine?: MachineProfile,
  targetGrade: string = 'HR-40',
  timedOut: boolean = false
): UnplacedPartSummary[] {
  const placedCounts: Record<string, number> = {};
  for (const p of placedParts) {
    placedCounts[p.sku] = (placedCounts[p.sku] || 0) + 1;
  }

  let maxUx = 0;
  let maxUy = 0;
  let maxUz = 0;
  let matchingStockCount = 0;
  let totalUsableStockVolume = 0;

  for (const stock of candidateStocks) {
    const [ux, uy, uz] = stock.usableDims;
    maxUx = Math.max(maxUx, ux);
    maxUy = Math.max(maxUy, uy);
    maxUz = Math.max(maxUz, uz);
    matchingStockCount++;
    totalUsableStockVolume += ux * uy * uz;
  }

  const singleBlockVol = maxUx > 0 && maxUy > 0 && maxUz > 0 ? maxUx * maxUy * maxUz : 106.0 * 80.0 * 38.0;
  const summaryList: UnplacedPartSummary[] = [];
  const seenSkus = new Set<string>();

  for (const p of demandedParts) {
    if (seenSkus.has(p.sku)) continue;
    seenSkus.add(p.sku);

    const requestedQty = p.quantity;
    const placedQty = placedCounts[p.sku] || 0;
    const unplacedQty = Math.max(0, requestedQty - placedQty);

    if (unplacedQty <= 0) continue;

    const orients = getPermittedOrientations(p.length, p.width, p.height, p.orientation_mode);

    let reasonCode = '';
    let message = '';
    let suggestedAction = '';

    if (matchingStockCount === 0 || (p.grade !== targetGrade && matchingStockCount === 0)) {
      reasonCode = 'NO_MATCHING_GRADE_STOCK';
      message = `No available block stock in inventory matching foam grade '${p.grade}'.`;
      suggestedAction = `Add stock blocks or remnants with grade '${p.grade}' to inventory.`;
    } else if (
      machine &&
      (candidateStocks.some((s) => s.usableDims[2] > machine.max_cut_height) ||
        orients.every((o) => o[2] > machine.max_cut_height))
    ) {
      reasonCode = 'EXCEEDS_MACHINE_MAX_CUT_HEIGHT';
      const minOz = Math.min(...orients.map((o) => o[2]));
      message = `Part or required block height exceeds machine max cut height limit of ${machine.max_cut_height}".`;
      suggestedAction = `Choose a machine with max cut height of at least ${minOz}" (e.g. Saw Station 1 or 2).`;
    } else if (
      !candidateStocks.some((s) =>
        orients.some((o) => o[0] <= s.usableDims[0] + 1e-4 && o[1] <= s.usableDims[1] + 1e-4 && o[2] <= s.usableDims[2] + 1e-4)
      )
    ) {
      reasonCode = 'EXCEEDS_USABLE_DIMENSIONS';
      message = `No permitted orientation fits inside usable block (${maxUx}"x${maxUy}"x${maxUz}").`;
      suggestedAction = `Resize part dimensions or load larger stock blocks.`;
    } else if (timedOut) {
      reasonCode = 'SOLVER_TIMEOUT';
      message = 'Optimization time budget exhausted before complete 3D layout could be found.';
      suggestedAction = 'Increase the time budget in optimization settings or run a faster heuristic (e.g. FFD).';
    } else {
      const totalDemandedVol = demandedParts.reduce((sum, d) => sum + d.length * d.width * d.height * d.quantity, 0);
      if (totalDemandedVol > totalUsableStockVolume) {
        const shortfallVol = totalDemandedVol - totalUsableStockVolume;
        const blocksNeeded = Math.ceil(shortfallVol / (singleBlockVol * 0.7));
        reasonCode = 'INSUFFICIENT_BLOCK_QUANTITY';
        message = `Insufficient stock blocks to fulfill total order volume (${blocksNeeded} additional block(s) needed).`;
        suggestedAction = `Add ${blocksNeeded} more ${p.grade} block(s) to stock.`;
      } else {
        reasonCode = 'GEOMETRY_INFEASIBLE_AFTER_VERIFY';
        message = 'Volume fits within stock capacity, but physical 3D orthogonal guillotine cuts could not pack this item.';
        suggestedAction = 'Add 1 additional block or allow flexible orientation (free-in-plane / any).';
      }
    }

    summaryList.push({
      id: p.id,
      sku: p.sku,
      name: p.name,
      grade: p.grade,
      length: p.length,
      width: p.width,
      height: p.height,
      quantity: unplacedQty,
      orientation_mode: p.orientation_mode,
      color_hex: p.color_hex,
      requested_qty: requestedQty,
      placed_qty: placedQty,
      unplaced_qty: unplacedQty,
      reason_code: reasonCode,
      message,
      suggested_action: suggestedAction,
    });
  }

  return summaryList;
}
