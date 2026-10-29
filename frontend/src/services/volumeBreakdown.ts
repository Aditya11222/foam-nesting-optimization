import type { OptimizationResult, BlockLayout } from '../types.ts';

export const CU_FT_IN_CU_IN = 1728.0;

export interface VolumeCategoryItem {
  key: 'parts' | 'remnants' | 'scrap' | 'trim' | 'kerf';
  name: string;
  nameEs: string;
  color: string;
  volumeCuIn: number;
  volumeCuFt: number;
  volumeCuFtDisplay: string;
  sharePct: number;
  sharePctDisplay: string;
  industryMeaning: string;
  industryMeaningEs: string;
}

export interface BlockVolumeBreakdown {
  blockIndex: number;
  blockLabel: string;
  blockLabelEs: string;
  grossVolumeCuFt: number;
  usableVolumeCuFt: number;
  partsCuFt: number;
  remnantsCuFt: number;
  scrapCuFt: number;
  trimCuFt: number;
  kerfCuFt: number;
  partsSharePct: number;
  remnantsSharePct: number;
  scrapSharePct: number;
  trimSharePct: number;
  kerfSharePct: number;
  netYieldPct: number;
}

export interface VolumeBreakdownReport {
  categories: VolumeCategoryItem[];
  partsItem: VolumeCategoryItem;
  remnantsItem: VolumeCategoryItem;
  scrapItem: VolumeCategoryItem;
  trimItem: VolumeCategoryItem;
  kerfItem: VolumeCategoryItem;
  totalGrossCuFt: number;
  totalGrossCuFtDisplay: string;
  totalGrossCuIn: number;
  isReconciled: boolean;
  reconciliationDeltaCuFt: number;
  reconciliationEquation: string;
  reconciliationEquationEs: string;
  hasRoundingDiscrepancy: boolean;
  roundingNote?: string;
  roundingNoteEs?: string;
  netYieldPct: number;
  grossYieldPct: number;
  yieldExplanationEn: string;
  yieldExplanationEs: string;
  largestLossCategory: 'scrap' | 'trim' | 'kerf';
  largestLossName: string;
  largestLossNameEs: string;
  largestLossSharePct: number;
  largestLossCuFt: number;
  estimatedRemnantCreditDollars: number;
  takeawaySentencesEn: string[];
  takeawaySentencesEs: string[];
  perBlockCaptionEn: string;
  perBlockCaptionEs: string;
  blocks: BlockVolumeBreakdown[];
  totalBlocksCount: number;
  unplacedCount: number;
  demandedCount: number;
  placedCount: number;
  hasUnplaced: boolean;
}

export const VOLUME_COLORS = {
  parts: '#2563EB',    // Royal Blue - Finished parts
  remnants: '#15803D', // Sage / Forest Green - Reusable inventory
  scrap: '#DC2626',    // Rosewood / Red - Unrecoverable waste
  trim: '#D97706',     // Warm Amber - Skin trim oxidation crust
  kerf: '#7C3AED',     // Deep Violet - Saw blade cutting kerf
} as const;

/**
 * Computes complete volume decomposition, reconciliation equation,
 * gross vs net yield definitions, and takeaway statements.
 */
export function computeVolumeBreakdown(
  result: OptimizationResult,
  unitCostPerCuFt: number = 4.50,
  remnantCreditPct: number = 65.0
): VolumeBreakdownReport {
  const gCuIn = result.total_gross_volume ?? 0;
  const pCuIn = result.total_parts_volume ?? 0;
  const rCuIn = result.total_remnant_volume ?? 0;
  const sCuIn = result.total_unrecoverable_scrap_volume ?? 0;
  const kCuIn = result.total_kerf_volume ?? 0;
  const uCuIn = result.total_usable_volume ?? 0;
  const tCuIn = result.validation?.volume_reconciliation?.total_skin_trim_volume ??
    (result.blocks && result.blocks.length > 0
      ? result.blocks.reduce((acc, b) => acc + (b.skin_trim_loss_volume || 0), 0)
      : Math.max(0, gCuIn - uCuIn));

  const gCuFt = gCuIn / CU_FT_IN_CU_IN;
  const pCuFt = pCuIn / CU_FT_IN_CU_IN;
  const rCuFt = rCuIn / CU_FT_IN_CU_IN;
  const sCuFt = sCuIn / CU_FT_IN_CU_IN;
  const kCuFt = kCuIn / CU_FT_IN_CU_IN;
  const tCuFt = tCuIn / CU_FT_IN_CU_IN;
  const uCuFt = uCuIn / CU_FT_IN_CU_IN;

  const grossDenominator = gCuFt > 0 ? gCuFt : 1;

  const partsShare = (pCuFt / grossDenominator) * 100;
  const remnantsShare = (rCuFt / grossDenominator) * 100;
  const scrapShare = (sCuFt / grossDenominator) * 100;
  const trimShare = (tCuFt / grossDenominator) * 100;
  const kerfShare = (kCuFt / grossDenominator) * 100;

  const partsItem: VolumeCategoryItem = {
    key: 'parts',
    name: 'Parts',
    nameEs: 'Piezas',
    color: VOLUME_COLORS.parts,
    volumeCuIn: pCuIn,
    volumeCuFt: pCuFt,
    volumeCuFtDisplay: `${pCuFt.toFixed(1)} ft³`,
    sharePct: partsShare,
    sharePctDisplay: `${partsShare.toFixed(1)}%`,
    industryMeaning: 'Finished cut parts meeting order requirements',
    industryMeaningEs: 'Piezas cortadas que cumplen con el pedido'
  };

  const remnantsItem: VolumeCategoryItem = {
    key: 'remnants',
    name: 'Remnants',
    nameEs: 'Remanentes',
    color: VOLUME_COLORS.remnants,
    volumeCuIn: rCuIn,
    volumeCuFt: rCuFt,
    volumeCuFtDisplay: `${rCuFt.toFixed(1)} ft³`,
    sharePct: remnantsShare,
    sharePctDisplay: `${remnantsShare.toFixed(1)}%`,
    industryMeaning: 'Reusable offcuts retained for future inventory',
    industryMeaningEs: 'Sobrantes útiles guardados para inventario futuro'
  };

  const scrapItem: VolumeCategoryItem = {
    key: 'scrap',
    name: 'Scrap',
    nameEs: 'Desperdicio',
    color: VOLUME_COLORS.scrap,
    volumeCuIn: sCuIn,
    volumeCuFt: sCuFt,
    volumeCuFtDisplay: `${sCuFt.toFixed(1)} ft³`,
    sharePct: scrapShare,
    sharePctDisplay: `${scrapShare.toFixed(1)}%`,
    industryMeaning: 'Unrecoverable offcuts below remnant threshold',
    industryMeaningEs: 'Recortes no aprovechables bajo el umbral de remanente'
  };

  const trimItem: VolumeCategoryItem = {
    key: 'trim',
    name: 'Skin Trim',
    nameEs: 'Desorillado',
    color: VOLUME_COLORS.trim,
    volumeCuIn: tCuIn,
    volumeCuFt: tCuFt,
    volumeCuFtDisplay: `${tCuFt.toFixed(1)} ft³`,
    sharePct: trimShare,
    sharePctDisplay: `${trimShare.toFixed(1)}%`,
    industryMeaning: 'Oxidized bun skin trimmed (~1" per face)',
    industryMeaningEs: 'Corteza oxidada desbastada (~1" por cara)'
  };

  const kerfItem: VolumeCategoryItem = {
    key: 'kerf',
    name: 'Kerf Loss',
    nameEs: 'Pérdida por Kerf',
    color: VOLUME_COLORS.kerf,
    volumeCuIn: kCuIn,
    volumeCuFt: kCuFt,
    volumeCuFtDisplay: `${kCuFt.toFixed(1)} ft³`,
    sharePct: kerfShare,
    sharePctDisplay: `${kerfShare.toFixed(1)}%`,
    industryMeaning: 'Saw blade cutting width pulverized to foam dust',
    industryMeaningEs: 'Ancho de la hoja de sierra convertido en polvo'
  };

  const categories = [partsItem, remnantsItem, scrapItem, trimItem, kerfItem];

  // Exact unrounded reconciliation check
  const sumUnrounded = pCuFt + rCuFt + sCuFt + tCuFt + kCuFt;
  const delta = Math.abs(sumUnrounded - gCuFt);
  const isReconciled = delta <= 0.05;

  // Formatted displays
  const pDisp = pCuFt.toFixed(1);
  const rDisp = rCuFt.toFixed(1);
  const sDisp = sCuFt.toFixed(1);
  const tDisp = tCuFt.toFixed(1);
  const kDisp = kCuFt.toFixed(1);
  const gDisp = gCuFt.toFixed(1);

  const reconciliationEquation = `${pDisp} + ${rDisp} + ${sDisp} + ${tDisp} + ${kDisp} = ${gDisp} ft³ gross`;
  const reconciliationEquationEs = `${pDisp} + ${rDisp} + ${sDisp} + ${tDisp} + ${kDisp} = ${gDisp} ft³ bruto`;

  // Display rounding check
  const sumOfRounded = Number(pDisp) + Number(rDisp) + Number(sDisp) + Number(tDisp) + Number(kDisp);
  const roundedTotal = Number(gDisp);
  const hasRoundingDiscrepancy = Math.abs(sumOfRounded - roundedTotal) > 0.01;
  const roundingNote = hasRoundingDiscrepancy ? '*Individual values rounded to 1 decimal place' : undefined;
  const roundingNoteEs = hasRoundingDiscrepancy ? '*Valores individuales redondeados a 1 decimal' : undefined;

  // Yield definitions
  const netYieldPct = result.net_utilization_pct ?? (uCuFt > 0 ? (pCuFt / uCuFt) * 100 : 0);
  const grossYieldPct = partsShare;

  const yieldExplanationEn = `Net Usable Yield (${netYieldPct.toFixed(1)}%) measures parts packed into usable foam core after 1" oxidation trim. Gross Yield (${grossYieldPct.toFixed(1)}%) measures parts against the entire purchased raw bun. All categories partition 100% of gross volume.`;
  const yieldExplanationEs = `El rendimiento neto utilizable (${netYieldPct.toFixed(1)}%) mide las piezas dentro del núcleo utilizable tras desorillar 1" de corteza. El rendimiento bruto (${grossYieldPct.toFixed(1)}%) mide las piezas respecto al bloque completo comprado. Las 5 categorías suman el 100% del volumen bruto.`;

  // Largest loss analysis (among scrap, trim, kerf)
  let largestLossCategory: 'scrap' | 'trim' | 'kerf' = 'scrap';
  let largestLossName = 'Scrap';
  let largestLossNameEs = 'Desperdicio';
  let largestLossSharePct = scrapShare;
  let largestLossCuFt = sCuFt;

  if (trimShare > scrapShare && trimShare > kerfShare) {
    largestLossCategory = 'trim';
    largestLossName = 'Skin Trim';
    largestLossNameEs = 'Desorillado';
    largestLossSharePct = trimShare;
    largestLossCuFt = tCuFt;
  } else if (kerfShare > scrapShare && kerfShare > trimShare) {
    largestLossCategory = 'kerf';
    largestLossName = 'Kerf Loss';
    largestLossNameEs = 'Pérdida por Kerf';
    largestLossSharePct = kerfShare;
    largestLossCuFt = kCuFt;
  }

  // Remnant credit calculation
  const remCreditDollars = Math.round(rCuFt * unitCostPerCuFt * (remnantCreditPct / 100.0));

  // Unplaced pieces
  const demanded = result.total_parts_demanded ?? 0;
  const placed = result.total_parts_placed ?? 0;
  const unplaced = Math.max(0, demanded - placed);
  const hasUnplaced = unplaced > 0;

  // Dynamic takeaways
  const takeawaySentencesEn: string[] = [];
  const takeawaySentencesEs: string[] = [];

  takeawaySentencesEn.push(`Parts use ${partsShare.toFixed(1)}% of the gross bun volume (${pDisp} ft³).`);
  takeawaySentencesEs.push(`Las piezas utilizan el ${partsShare.toFixed(1)}% del volumen bruto del bloque (${pDisp} ft³).`);

  if (rCuFt > 0.05) {
    takeawaySentencesEn.push(`Remnants recover another ${remnantsShare.toFixed(1)}% (${rDisp} ft³, est. credit $${remCreditDollars.toLocaleString()}).`);
    takeawaySentencesEs.push(`Los remanentes recuperan otro ${remnantsShare.toFixed(1)}% (${rDisp} ft³, crédito estimado $${remCreditDollars.toLocaleString()}).`);
  } else {
    takeawaySentencesEn.push(`No reusable remnants generated in this run.`);
    takeawaySentencesEs.push(`No se generaron remanentes reutilizables en esta ejecución.`);
  }

  if (largestLossCategory === 'scrap') {
    takeawaySentencesEn.push(`Scrap is ${largestLossSharePct.toFixed(1)}% (${largestLossCuFt.toFixed(1)} ft³), representing the largest process loss.`);
    takeawaySentencesEs.push(`El desperdicio representa el ${largestLossSharePct.toFixed(1)}% (${largestLossCuFt.toFixed(1)} ft³), siendo la mayor merma del proceso.`);
  } else if (largestLossCategory === 'trim') {
    takeawaySentencesEn.push(`Skin Trim is ${largestLossSharePct.toFixed(1)}% (${largestLossCuFt.toFixed(1)} ft³), representing the largest volume reduction (fixed ~1″ face trim).`);
    takeawaySentencesEs.push(`El desorillado representa el ${largestLossSharePct.toFixed(1)}% (${largestLossCuFt.toFixed(1)} ft³), siendo la mayor reducción de volumen (desbaste fijo de ~1").`);
  } else {
    takeawaySentencesEn.push(`Kerf Loss is ${largestLossSharePct.toFixed(1)}% (${largestLossCuFt.toFixed(1)} ft³), representing the largest volume loss (saw blade kerf).`);
    takeawaySentencesEs.push(`La pérdida por kerf representa el ${largestLossSharePct.toFixed(1)}% (${largestLossCuFt.toFixed(1)} ft³), siendo la mayor pérdida de volumen.`);
  }

  if (hasUnplaced) {
    takeawaySentencesEn.push(`${placed} of ${demanded} parts placed (${unplaced} unplaced) — yield calculated on placed pieces.`);
    takeawaySentencesEs.push(`${placed} de ${demanded} piezas ubicadas (${unplaced} sin ubicar) — rendimiento sobre piezas colocadas.`);
  } else {
    takeawaySentencesEn.push(`All ${placed} demanded parts placed successfully (100% order satisfaction).`);
    takeawaySentencesEs.push(`Las ${placed} piezas solicitadas se colocaron exitosamente (100% cumplimiento del pedido).`);
  }

  // Per-block volume calculations
  const blocks: BlockVolumeBreakdown[] = (result.blocks || []).map((b: BlockLayout, idx: number) => {
    const bGrossCuIn = b.gross_volume || 0;
    const bUsableCuIn = b.usable_volume || 0;
    const bPartsCuIn = b.parts_volume || (b.placed_parts && b.placed_parts.length > 0
      ? b.placed_parts.reduce((sum, p) => sum + (p.length * p.width * p.height), 0)
      : (bUsableCuIn * ((b.net_utilization_pct || 0) / 100)));
    const bScrapCuIn = b.unrecoverable_scrap_volume || 0;
    const bKerfCuIn = b.kerf_loss_volume || 0;
    const bTrimCuIn = b.skin_trim_loss_volume ?? Math.max(0, bGrossCuIn - bUsableCuIn);
    const bRemCuIn = (b.usable_remnants || []).reduce((acc, r) => acc + (r.volume || 0), 0);

    const bGrossCuFt = bGrossCuIn / CU_FT_IN_CU_IN;
    const bUsableCuFt = bUsableCuIn / CU_FT_IN_CU_IN;
    const bPartsCuFt = bPartsCuIn / CU_FT_IN_CU_IN;
    const bRemCuFt = bRemCuIn / CU_FT_IN_CU_IN;
    const bScrapCuFt = bScrapCuIn / CU_FT_IN_CU_IN;
    const bTrimCuFt = bTrimCuIn / CU_FT_IN_CU_IN;
    const bKerfCuFt = bKerfCuIn / CU_FT_IN_CU_IN;

    const bDenom = bGrossCuFt > 0 ? bGrossCuFt : 1;

    return {
      blockIndex: b.block_index ?? idx + 1,
      blockLabel: `Block #${b.block_index ?? idx + 1}`,
      blockLabelEs: `Bloque #${b.block_index ?? idx + 1}`,
      grossVolumeCuFt: bGrossCuFt,
      usableVolumeCuFt: bUsableCuFt,
      partsCuFt: bPartsCuFt,
      remnantsCuFt: bRemCuFt,
      scrapCuFt: bScrapCuFt,
      trimCuFt: bTrimCuFt,
      kerfCuFt: bKerfCuFt,
      partsSharePct: (bPartsCuFt / bDenom) * 100,
      remnantsSharePct: (bRemCuFt / bDenom) * 100,
      scrapSharePct: (bScrapCuFt / bDenom) * 100,
      trimSharePct: (bTrimCuFt / bDenom) * 100,
      kerfSharePct: (bKerfCuFt / bDenom) * 100,
      netYieldPct: b.net_utilization_pct ?? (bUsableCuFt > 0 ? (bPartsCuFt / bUsableCuFt) * 100 : 0)
    };
  });

  // Per-block dynamic summary caption
  let perBlockCaptionEn = '';
  let perBlockCaptionEs = '';

  if (blocks.length === 0) {
    perBlockCaptionEn = 'No blocks generated.';
    perBlockCaptionEs = 'No se generaron bloques.';
  } else if (blocks.length === 1) {
    const b = blocks[0];
    perBlockCaptionEn = `Single bun: parts utilize ${b.partsSharePct.toFixed(1)}% of gross volume (${b.netYieldPct.toFixed(1)}% net yield), with ${b.remnantsSharePct > 0 ? `${b.remnantsSharePct.toFixed(1)}% recoverable remnants` : `${b.scrapSharePct.toFixed(1)}% scrap`}.`;
    perBlockCaptionEs = `Bloque único: las piezas utilizan el ${b.partsSharePct.toFixed(1)}% del volumen bruto (${b.netYieldPct.toFixed(1)}% rendimiento neto), con ${b.remnantsSharePct > 0 ? `${b.remnantsSharePct.toFixed(1)}% de remanente recuperable` : `${b.scrapSharePct.toFixed(1)}% de desperdicio`}.`;
  } else {
    const bestYield = [...blocks].sort((a, b) => b.netYieldPct - a.netYieldPct)[0];
    const bestRemnant = [...blocks].sort((a, b) => b.remnantsSharePct - a.remnantsSharePct)[0];

    if (bestRemnant && bestYield && bestRemnant.remnantsSharePct > 5 && bestRemnant.blockIndex !== bestYield.blockIndex) {
      perBlockCaptionEn = `Block #${bestYield.blockIndex} achieves highest net yield at ${bestYield.netYieldPct.toFixed(1)}%. Block #${bestRemnant.blockIndex} yields highest remnant recovery (${bestRemnant.remnantsSharePct.toFixed(1)}% of gross).`;
      perBlockCaptionEs = `El Bloque #${bestYield.blockIndex} logra el mayor rendimiento neto con ${bestYield.netYieldPct.toFixed(1)}%. El Bloque #${bestRemnant.blockIndex} aporta la mayor recuperación de remanentes (${bestRemnant.remnantsSharePct.toFixed(1)}% del bruto).`;
    } else if (bestYield) {
      perBlockCaptionEn = `Block #${bestYield.blockIndex} achieves highest net yield at ${bestYield.netYieldPct.toFixed(1)}%. Trailing blocks absorb remaining demand cuts.`;
      perBlockCaptionEs = `El Bloque #${bestYield.blockIndex} logra el mayor rendimiento neto con ${bestYield.netYieldPct.toFixed(1)}%. Los bloques posteriores absorben los cortes restantes.`;
    }
  }

  return {
    categories,
    partsItem,
    remnantsItem,
    scrapItem,
    trimItem,
    kerfItem,
    totalGrossCuFt: gCuFt,
    totalGrossCuFtDisplay: `${gDisp} ft³`,
    totalGrossCuIn: gCuIn,
    isReconciled,
    reconciliationDeltaCuFt: delta,
    reconciliationEquation,
    reconciliationEquationEs,
    hasRoundingDiscrepancy,
    roundingNote,
    roundingNoteEs,
    netYieldPct,
    grossYieldPct,
    yieldExplanationEn,
    yieldExplanationEs,
    largestLossCategory,
    largestLossName,
    largestLossNameEs,
    largestLossSharePct,
    largestLossCuFt,
    estimatedRemnantCreditDollars: remCreditDollars,
    takeawaySentencesEn,
    takeawaySentencesEs,
    perBlockCaptionEn,
    perBlockCaptionEs,
    blocks,
    totalBlocksCount: blocks.length,
    unplacedCount: unplaced,
    demandedCount: demanded,
    placedCount: placed,
    hasUnplaced
  };
}
