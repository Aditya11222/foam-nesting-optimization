import type { PlacedPart, RemnantOutput, CutStep } from '../types';

export function computeBlockMetrics(
  nominalDims: [number, number, number],
  usableDims: [number, number, number],
  placedParts: PlacedPart[],
  usableRemnants: RemnantOutput[],
  cuts: CutStep[],
  _kerf: number
) {
  const [nx, ny, nz] = nominalDims;
  const [ux, uy, uz] = usableDims;
  const grossVol = nx * ny * nz;
  const usableVol = ux * uy * uz;
  const skinTrimLoss = Math.max(0, grossVol - usableVol);

  const partsVol = placedParts.reduce((sum, p) => sum + p.length * p.width * p.height, 0);
  const remnantsVol = usableRemnants.reduce((sum, r) => sum + r.volume, 0);

  // Compute kerf loss from actual cuts
  let kerfVol = 0;
  for (const cut of cuts) {
    if (cut.cut_type === 'skin_trim') continue;
    const [tdx, tdy, tdz] = cut.target_piece_dims;
    let cutArea = 0;
    if (cut.axis === 'Z') cutArea = tdx * tdy;
    else if (cut.axis === 'X') cutArea = tdy * tdz;
    else cutArea = tdx * tdz;

    kerfVol += cutArea * cut.kerf_in;
  }

  const maxAvailableLoss = Math.max(0, usableVol - partsVol - remnantsVol);
  kerfVol = Math.min(kerfVol, maxAvailableLoss);
  const unrecoverableScrap = Math.max(0, usableVol - partsVol - remnantsVol - kerfVol);

  const grossUtil = grossVol > 0 ? (partsVol / grossVol) * 100 : 0;
  const netUtil = usableVol > 0 ? (partsVol / usableVol) * 100 : 0;
  const recoveryUtil = grossVol > 0 ? ((partsVol + remnantsVol) / grossVol) * 100 : 0;

  return {
    gross_volume: Math.round(grossVol * 100) / 100,
    usable_volume: Math.round(usableVol * 100) / 100,
    skin_trim_loss_volume: Math.round(skinTrimLoss * 100) / 100,
    parts_volume: Math.round(partsVol * 100) / 100,
    usable_remnants_volume: Math.round(remnantsVol * 100) / 100,
    kerf_loss_volume: Math.round(kerfVol * 100) / 100,
    unrecoverable_scrap_volume: Math.round(unrecoverableScrap * 100) / 100,
    gross_utilization_pct: Math.round(grossUtil * 10) / 10,
    net_utilization_pct: Math.round(netUtil * 10) / 10,
    material_recovery_pct: Math.round(recoveryUtil * 10) / 10,
  };
}

export function estimateSawTimeMinutes(cuts: CutStep[], feedRateIpm: number = 60.0): number {
  let totalTravelInches = 0.0;
  for (const cut of cuts) {
    const [tdx, tdy, tdz] = cut.target_piece_dims;
    if (cut.axis === 'Z') {
      totalTravelInches += Math.max(tdx, tdy);
    } else if (cut.axis === 'X') {
      totalTravelInches += Math.max(tdy, tdz);
    } else {
      totalTravelInches += Math.max(tdx, tdz);
    }
  }

  const cuttingTime = totalTravelInches / Math.max(10.0, feedRateIpm);
  const handlingTime = cuts.length * 0.5; // 30s per cut setup/handling
  return Math.round((cuttingTime + handlingTime) * 10) / 10;
}
