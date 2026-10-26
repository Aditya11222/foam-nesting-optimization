import type {
  PartItem,
  PlacedPart,
  RemnantOutput,
  BlockLayout,
  OptimizationResult,
  MachineProfile,
} from '../types';
import { snapTo16th, SIXTEENTH_INCH } from './units';
import { getPermittedOrientations } from './orientation';
import { SlicingNode } from './slicingTree';
import { computeBlockMetrics, estimateSawTimeMinutes } from './metrics';
import { generateOperatorCutSequence, type RawCut } from './cutSequencer';
import { validateOptimizationResult } from './validator';
import { buildUnplacedSummary, type CandidateStockInfo } from './unplacedHelper';

const MIN_REMNANT_VOLUME = 1500.0; // in^3

export interface PackingOptions {
  leafSelection?: 'best_fit' | 'first_fit';
  splitPolicy?: 'standard' | 'min_residual';
  algorithmId: string;
  algorithmName: string;
  jobId: string;
  targetGrade: string;
  machine: MachineProfile;
  kerf: number;
}

export function executePacking(
  itemsToPlace: PartItem[],
  candidateStocks: CandidateStockInfo[],
  options: PackingOptions
): OptimizationResult {
  const {
    leafSelection = 'best_fit',
    splitPolicy = 'standard',
    algorithmId,
    algorithmName,
    jobId,
    targetGrade,
    machine,
    kerf = 0.125,
  } = options;

  let unplacedItems = [...itemsToPlace];
  const blocksOutput: BlockLayout[] = [];
  let blockIndex = 1;
  let stockPointer = 0;
  const allCandidateStocks = [...candidateStocks];

  while (unplacedItems.length > 0 && stockPointer < allCandidateStocks.length) {
    const currentStock = allCandidateStocks[stockPointer];
    stockPointer++;

    const { stockType, stockId, nominalDims, usableDims } = currentStock;
    const [ux, uy, uz] = usableDims;

    const rootNode = new SlicingNode(0, 0, 0, ux, uy, uz, null, `root_${blockIndex}`);
    const placedInThisBlock: PlacedPart[] = [];
    const rawCutsInThisBlock: RawCut[] = [];
    const stillUnplaced: PartItem[] = [];

    for (const item of unplacedItems) {
      const allowedOrients = getPermittedOrientations(
        item.length,
        item.width,
        item.height,
        item.orientation_mode
      );

      let bestLeaf: SlicingNode | null = null;
      let chosenOrient: [number, number, number] | null = null;
      let bestMetric = Number.POSITIVE_INFINITY;

      const freeLeaves = rootNode.getFreeLeaves();

      for (const orient of allowedOrients) {
        const [ox, oy, oz] = orient;
        for (const leaf of freeLeaves) {
          if (leaf.canFit(ox, oy, oz)) {
            const residualVol = leaf.volume - ox * oy * oz;
            if (leafSelection === 'best_fit') {
              if (residualVol < bestMetric) {
                bestMetric = residualVol;
                bestLeaf = leaf;
                chosenOrient = orient;
              }
            } else {
              // first_fit
              bestLeaf = leaf;
              chosenOrient = orient;
              break;
            }
          }
        }
        if (leafSelection === 'first_fit' && bestLeaf !== null) {
          break;
        }
      }

      if (bestLeaf && chosenOrient) {
        let currentTarget: SlicingNode = bestLeaf;
        const [ox, oy, oz] = chosenOrient;

        let axesOrder: { axis: 'X' | 'Y' | 'Z'; partDim: number }[];

        if (splitPolicy === 'min_residual') {
          const residuals: { axis: 'X' | 'Y' | 'Z'; partDim: number; leftover: number }[] = [
            { axis: 'X', partDim: ox, leftover: currentTarget.dx - ox },
            { axis: 'Y', partDim: oy, leftover: currentTarget.dy - oy },
            { axis: 'Z', partDim: oz, leftover: currentTarget.dz - oz },
          ];
          residuals.sort((a, b) => b.leftover - a.leftover);
          axesOrder = residuals.map((r) => ({ axis: r.axis, partDim: r.partDim }));
        } else {
          axesOrder = [
            { axis: 'Z', partDim: oz },
            { axis: 'X', partDim: ox },
            { axis: 'Y', partDim: oy },
          ];
        }

        for (const { axis, partDim } of axesOrder) {
          const currDim = axis === 'X' ? currentTarget.dx : axis === 'Y' ? currentTarget.dy : currentTarget.dz;
          const currPos = axis === 'X' ? currentTarget.x : axis === 'Y' ? currentTarget.y : currentTarget.z;

          if (currDim > partDim + kerf + SIXTEENTH_INCH) {
            const [leftChild] = currentTarget.split(axis, partDim, kerf);
            rawCutsInThisBlock.push({
              axis,
              coord: currPos + partDim,
              kerf,
              piece_dims: [currentTarget.dx, currentTarget.dy, currentTarget.dz],
              part_name: item.sku,
            });
            currentTarget = leftChild;
          }
        }

        const placed: PlacedPart = {
          part_id: item.id,
          sku: item.sku,
          name: item.name,
          grade: item.grade,
          x: currentTarget.x,
          y: currentTarget.y,
          z: currentTarget.z,
          length: ox,
          width: oy,
          height: oz,
          orientation_used: chosenOrient,
          color_hex: item.color_hex || '#7A5C45',
        };

        currentTarget.placedPart = placed;
        placedInThisBlock.push(placed);
      } else {
        stillUnplaced.push(item);
      }
    }

    unplacedItems = stillUnplaced;

    // Extract remnants from remaining free leaves
    const remnantsInThisBlock: RemnantOutput[] = [];
    let remIdx = 1;
    for (const leaf of rootNode.getFreeLeaves()) {
      if (leaf.volume >= MIN_REMNANT_VOLUME) {
        leaf.isRemnant = true;
        const remCode = `REM-${targetGrade}-B${blockIndex}-${remIdx}`;
        const remOut: RemnantOutput = {
          id: `rem-${Math.random().toString(36).substring(2, 9)}`,
          code: remCode,
          x: leaf.x,
          y: leaf.y,
          z: leaf.z,
          length: leaf.dx,
          width: leaf.dy,
          height: leaf.dz,
          grade: targetGrade,
          volume: Math.round(leaf.volume * 100) / 100,
          usability_score: Math.round(Math.min(1.0, leaf.volume / (36.0 * 36.0 * 20.0)) * 100) / 100,
          retained: true,
          storage_location: `Bay R-${10 + remIdx}`,
        };
        leaf.remnantInfo = remOut;
        remnantsInThisBlock.push(remOut);
        remIdx++;
      }
    }

    const cuts = generateOperatorCutSequence(
      nominalDims,
      usableDims,
      rawCutsInThisBlock,
      remnantsInThisBlock,
      kerf
    );

    const metrics = computeBlockMetrics(
      nominalDims,
      usableDims,
      placedInThisBlock,
      remnantsInThisBlock,
      cuts,
      kerf
    );

    const layout: BlockLayout = {
      block_index: blockIndex,
      stock_id: stockId,
      stock_type: stockType,
      grade: targetGrade,
      nominal_length: nominalDims[0],
      nominal_width: nominalDims[1],
      nominal_height: nominalDims[2],
      usable_length: usableDims[0],
      usable_width: usableDims[1],
      usable_height: usableDims[2],
      skin_trim_loss_volume: metrics.skin_trim_loss_volume,
      placed_parts: placedInThisBlock,
      usable_remnants: remnantsInThisBlock,
      cuts,
      gross_volume: metrics.gross_volume,
      usable_volume: metrics.usable_volume,
      parts_volume: metrics.parts_volume,
      kerf_loss_volume: metrics.kerf_loss_volume,
      unrecoverable_scrap_volume: metrics.unrecoverable_scrap_volume,
      gross_utilization_pct: metrics.gross_utilization_pct,
      net_utilization_pct: metrics.net_utilization_pct,
      material_recovery_pct: metrics.material_recovery_pct,
      assigned_machine_id: machine.id,
      assigned_machine_name: machine.name,
    };

    blocksOutput.push(layout);
    blockIndex++;

    if (placedInThisBlock.length === 0) {
      if (stockType === 'remnant') {
        blocksOutput.pop();
        blockIndex--;
        continue;
      } else {
        break;
      }
    }

    // Add extra bun if more items remain and stocks exhausted (up to limit of 20 blocks)
    if (unplacedItems.length > 0 && stockPointer >= allCandidateStocks.length && blockIndex <= 20) {
      const extraNom: [number, number, number] = [108.0, 82.0, 40.0];
      const extraUsable: [number, number, number] = [
        snapTo16th(Math.max(1.0, 108.0 - 2.0)),
        snapTo16th(Math.max(1.0, 82.0 - 2.0)),
        snapTo16th(Math.max(1.0, 40.0 - 2.0)),
      ];
      allCandidateStocks.push({
        stockType: 'bun',
        stockId: `bun-auto-${blockIndex}`,
        nominalDims: extraNom,
        usableDims: extraUsable,
      });
    }
  }

  const totalGross = blocksOutput.reduce((sum, b) => sum + b.gross_volume, 0);
  const totalUsable = blocksOutput.reduce((sum, b) => sum + b.usable_volume, 0);
  const totalPartsVol = blocksOutput.reduce((sum, b) => sum + b.parts_volume, 0);
  const totalKerf = blocksOutput.reduce((sum, b) => sum + b.kerf_loss_volume, 0);
  const totalRemnantVol = blocksOutput.reduce(
    (sum, b) => sum + b.usable_remnants.reduce((rSum, r) => rSum + r.volume, 0),
    0
  );
  const totalScrap = blocksOutput.reduce((sum, b) => sum + b.unrecoverable_scrap_volume, 0);

  const aggGrossUtil = totalGross > 0 ? (totalPartsVol / totalGross) * 100 : 0;
  const aggNetUtil = totalUsable > 0 ? (totalPartsVol / totalUsable) * 100 : 0;

  const allCuts = blocksOutput.flatMap((b) => b.cuts);
  const sawTime = estimateSawTimeMinutes(allCuts, machine.feed_rate_ipm || 60.0);
  const allPlacedItems = blocksOutput.flatMap((b) => b.placed_parts);

  const unplacedSummaryList = buildUnplacedSummary(
    itemsToPlace,
    allPlacedItems,
    allCandidateStocks,
    machine,
    targetGrade
  );

  const result: OptimizationResult = {
    job_id: jobId,
    grade: targetGrade,
    algorithm_id: algorithmId,
    algorithm_name: algorithmName,
    solution_type: 'heuristic solution',
    timestamp: new Date().toISOString(),
    machine,
    total_parts_demanded: itemsToPlace.length,
    total_parts_placed: allPlacedItems.length,
    unplaced_parts: unplacedSummaryList,
    unplaced_summary: unplacedSummaryList,
    blocks_used_count: blocksOutput.length,
    blocks: blocksOutput,
    total_gross_volume: Math.round(totalGross * 100) / 100,
    total_usable_volume: Math.round(totalUsable * 100) / 100,
    total_parts_volume: Math.round(totalPartsVol * 100) / 100,
    total_kerf_volume: Math.round(totalKerf * 100) / 100,
    total_remnant_volume: Math.round(totalRemnantVol * 100) / 100,
    total_unrecoverable_scrap_volume: Math.round(totalScrap * 100) / 100,
    gross_utilization_pct: Math.round(aggGrossUtil * 10) / 10,
    net_utilization_pct: Math.round(aggNetUtil * 10) / 10,
    total_cuts_count: allCuts.length,
    estimated_saw_time_minutes: sawTime,
    runtime_ms: 15.0,
    validation: {
      is_valid: true,
      errors: [],
      warnings: [],
      volume_reconciliation: {
        total_gross_volume: Math.round(totalGross * 100) / 100,
        total_usable_volume: Math.round(totalUsable * 100) / 100,
        total_skin_trim_volume: Math.round((totalGross - totalUsable) * 100) / 100,
        total_parts_volume: Math.round(totalPartsVol * 100) / 100,
        total_remnants_volume: Math.round(totalRemnantVol * 100) / 100,
        total_kerf_volume: Math.round(totalKerf * 100) / 100,
        total_scrap_volume: Math.round(totalScrap * 100) / 100,
        reconciliation_delta: 0,
      },
    },
  };

  result.validation = validateOptimizationResult(result);
  return result;
}
