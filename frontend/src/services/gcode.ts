/**
 * G-Code Generation, Path Simulation, and Multi-Block ZIP Export Service for Tatras NestPro.
 * Implements deterministic RS-274 dialect output matching the backend engine.
 */

import type {
  OptimizationResult,
  BlockLayout,
  MachineProfile,
  GCodeFilePayload,
  GCodeExportResponse,
  GCodeButtonState,
} from '../types';

export const SAFETY_DEMO_TEXT = 'DEMO OUTPUT: NOT VALIDATED ON A REAL MACHINE. REVIEW AND DRY-RUN BEFORE USE.';

/**
 * Evaluates whether the "Generate G-Code" action button is enabled and returns the exact diagnostic reason.
 */
export function computeGCodeButtonState(
  result: OptimizationResult | null,
  isOptimizing: boolean,
  isStale: boolean,
  machine?: MachineProfile,
  allowUnplacedExport = false
): GCodeButtonState {
  if (isOptimizing) {
    return {
      isEnabled: false,
      reason: 'Optimization in progress — please wait before generating G-code',
    };
  }

  if (!result) {
    return {
      isEnabled: false,
      reason: 'Run optimization to produce a cutting plan before generating G-code',
    };
  }

  if (isStale) {
    return {
      isEnabled: false,
      reason: 'Results are stale — re-run optimization to update cutting sequence',
    };
  }

  if (result.validation && !result.validation.is_valid) {
    const firstErr = result.validation.errors?.[0] || 'Physical constraint validation failed';
    return {
      isEnabled: false,
      reason: `Validation failed: ${firstErr}`,
    };
  }

  const targetMachine = machine || result.machine;
  if (targetMachine && targetMachine.gcode_supported === false) {
    return {
      isEnabled: false,
      reason: `${targetMachine.name} is a manual saw: no G-code output`,
    };
  }

  const unplacedCount =
    result.unplaced_parts?.length ||
    Math.max(0, result.total_parts_demanded - result.total_parts_placed);

  if (unplacedCount > 0 && !allowUnplacedExport) {
    return {
      isEnabled: true, // Button can be clicked to prompt "export placed parts only" confirmation
      reason: `Job has ${unplacedCount} unplaced items (requires placed-only confirmation)`,
    };
  }

  return {
    isEnabled: true,
  };
}

/**
 * Pure TypeScript path verification checker simulating coordinate travel against the block envelope.
 */
export function verifyGCodePathClient(
  gcodeText: string,
  block: BlockLayout,
  machine: MachineProfile
): { passed: boolean; message: string; simulatedCutsCount: number } {
  if (!gcodeText.includes(SAFETY_DEMO_TEXT)) {
    return {
      passed: false,
      message: 'Safety check failed: Mandatory DEMO output disclaimer missing from file header.',
      simulatedCutsCount: 0,
    };
  }

  if (!gcodeText.includes('G20') || !gcodeText.includes('G90')) {
    return {
      passed: false,
      message: 'Dialect check failed: G20 (inch) or G90 (absolute) setup code missing.',
      simulatedCutsCount: 0,
    };
  }

  if (!gcodeText.includes('M30')) {
    return {
      passed: false,
      message: 'Program end check failed: M30 termination code missing.',
      simulatedCutsCount: 0,
    };
  }

  const maxX = block.nominal_length + 0.125;
  const maxY = block.nominal_width + 0.125;
  const safeRetractLimit = Math.max(block.nominal_height, machine.max_cut_height) + (machine.safe_z || 2.0) + 2.0;

  let currX = 0;
  let currY = 0;
  let currZ = 0;

  const lines = gcodeText.split('\n');
  const stepPattern = /\( --- Step (\d+):/i;
  const detectedSteps: number[] = [];
  let currentStepNum: number | null = null;

  const coordXRe = /[Xx]([-+]?\d*\.?\d+)/;
  const coordYRe = /[Yy]([-+]?\d*\.?\d+)/;
  const coordZRe = /[Zz]([-+]?\d*\.?\d+)/;

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx].trim();
    if (!line) continue;

    const stepMatch = line.match(stepPattern);
    if (stepMatch) {
      currentStepNum = parseInt(stepMatch[1], 10);
      detectedSteps.push(currentStepNum);
      continue;
    }

    if (line.startsWith('(') && line.endsWith(')')) {
      continue;
    }

    if (line.includes('G0') || line.includes('G00') || line.includes('G1') || line.includes('G01')) {
      const mx = line.match(coordXRe);
      const my = line.match(coordYRe);
      const mz = line.match(coordZRe);

      if (mx) currX = parseFloat(mx[1]);
      if (my) currY = parseFloat(my[1]);
      if (mz) currZ = parseFloat(mz[1]);

      if (currX < -0.0625 || currY < -0.0625 || currZ < -0.0625) {
        return {
          passed: false,
          message: `Line ${idx + 1} (Step #${currentStepNum || 0}): Negative coordinate (${currX.toFixed(4)}, ${currY.toFixed(4)}, ${currZ.toFixed(4)}) outside origin boundary.`,
          simulatedCutsCount: detectedSteps.length,
        };
      }

      if (currX > maxX) {
        return {
          passed: false,
          message: `Line ${idx + 1} (Step #${currentStepNum || 0}): X coordinate ${currX.toFixed(4)}" exceeds nominal block length (${block.nominal_length}").`,
          simulatedCutsCount: detectedSteps.length,
        };
      }

      if (currY > maxY) {
        return {
          passed: false,
          message: `Line ${idx + 1} (Step #${currentStepNum || 0}): Y coordinate ${currY.toFixed(4)}" exceeds nominal block width (${block.nominal_width}").`,
          simulatedCutsCount: detectedSteps.length,
        };
      }

      if (currZ > safeRetractLimit) {
        return {
          passed: false,
          message: `Line ${idx + 1} (Step #${currentStepNum || 0}): Z coordinate ${currZ.toFixed(4)}" exceeds maximum clearance limit (${safeRetractLimit.toFixed(4)}").`,
          simulatedCutsCount: detectedSteps.length,
        };
      }
    }
  }

  const expectedCutCount = block.cuts?.length || 0;
  if (detectedSteps.length !== expectedCutCount) {
    return {
      passed: false,
      message: `Step count mismatch: G-code contains ${detectedSteps.length} steps, but validated sequence contains ${expectedCutCount} steps.`,
      simulatedCutsCount: detectedSteps.length,
    };
  }

  return {
    passed: true,
    message: `Path check passed: All ${detectedSteps.length} steps verified within block envelope (${block.nominal_length.toFixed(1)}" × ${block.nominal_width.toFixed(1)}" × ${block.nominal_height.toFixed(1)}").`,
    simulatedCutsCount: detectedSteps.length,
  };
}

/**
 * Generates a deterministic .nc file for a single block in client TypeScript.
 */
export function generateBlockGCodeClient(
  jobId: string,
  jobName: string,
  customerRef: string | undefined,
  grade: string,
  algorithmName: string,
  block: BlockLayout,
  machine: MachineProfile,
  totalBlocksCount = 1,
  timestampStr?: string
): GCodeFilePayload {
  if (machine.gcode_supported === false) {
    throw new Error(`Machine '${machine.name}' is manual and does not support G-code export.`);
  }

  if (block.nominal_height > (machine.max_cut_height + 0.0625)) {
    throw new Error(`Block height (${block.nominal_height}") exceeds machine throat limit (${machine.max_cut_height}").`);
  }

  const feed = machine.feed_rate_ipm || 100.0;
  const rapidFeed = machine.rapid_rate_ipm || 300.0;
  const safeZ = Math.round((block.nominal_height + (machine.safe_z || 2.0)) * 16.0) / 16.0;

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const timeIso = timestampStr || now.toISOString();

  const safeJobId = jobId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeMachineId = machine.id.replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `foam-nesting_${safeJobId}_${safeMachineId}_block${block.block_index}_${dateStr}.nc`;

  const trimX = Math.max(0, (block.nominal_length - block.usable_length) / 2.0);
  const trimY = Math.max(0, (block.nominal_width - block.usable_width) / 2.0);
  const trimZ = Math.max(0, (block.nominal_height - block.usable_height) / 2.0);

  const lines: string[] = [];
  let totalCutLengthIn = 0;

  const fmt = (v: number) => v.toFixed(4);

  // Header
  lines.push('(======================================================================)');
  lines.push('( TATRAS NESTPRO — FOAM NESTING & CUTTING OPTIMIZATION                 )');
  lines.push(`( ${SAFETY_DEMO_TEXT}                        )`);
  lines.push('( NOT PROVEN SAFE FOR PRODUCTION OPERATIONS.                           )');
  lines.push('(======================================================================)');
  lines.push(`( Project: Tatras NestPro Foam Nesting Optimization )`);
  lines.push(`( Job ID: ${jobId} )`);
  lines.push(`( Job Name: ${jobName} )`);
  if (customerRef && customerRef.trim()) {
    lines.push(`( Customer Reference: ${customerRef.trim()} )`);
  }
  lines.push(`( Foam Grade: ${grade} )`);
  lines.push(`( Machine: ${machine.name} [${machine.id}] )`);
  lines.push(`( Dialect: ${machine.gcode_dialect || 'generic_rs274'} (RS-274 / ISO Generic) )`);
  lines.push(`( Units: ${(machine.units || 'inches').toUpperCase()} (All coordinates snapped to 1/16" precision) )`);
  lines.push(`( Cutting Feed Rate: ${feed.toFixed(1)} IPM | Rapid Rate: ${rapidFeed.toFixed(1)} IPM )`);
  lines.push(`( Blade/Beam Kerf: ${fmt(machine.kerf)}" )`);
  lines.push(`( Block: Block ${block.block_index} of ${totalBlocksCount} (Stock ID: ${block.stock_id}) )`);
  lines.push(`( Nominal Stock Dims: ${fmt(block.nominal_length)}" x ${fmt(block.nominal_width)}" x ${fmt(block.nominal_height)}" )`);
  lines.push(`( Usable Interior Dims: ${fmt(block.usable_length)}" x ${fmt(block.usable_width)}" x ${fmt(block.usable_height)}" )`);
  lines.push(`( Skin Trim: ${fmt(trimX)}" (X), ${fmt(trimY)}" (Y), ${fmt(trimZ)}" (Z) per face )`);
  lines.push(`( Algorithm: ${algorithmName} )`);
  lines.push(`( Work Coordinate Origin: Block front-left-bottom corner (X0 Y0 Z0) )`);
  lines.push(`( Generated: ${timeIso} )`);
  lines.push('(======================================================================)');
  lines.push('');

  // Setup
  lines.push('( --- Program Setup --- )');
  lines.push('G20 (Programming in inches)');
  lines.push('G90 (Absolute distance mode)');
  lines.push('G17 (XY circular/plane selection)');
  lines.push('G94 (Feedrate mode: units per minute)');
  lines.push(`G00 Z${fmt(safeZ)} (Rapid to safe clearance height)`);
  lines.push('G00 X0.0000 Y0.0000 (Rapid to block origin)');
  lines.push('');

  const partsMap = new Map((block.placed_parts || []).map((p) => [p.part_id, p]));

  // Cuts
  (block.cuts || []).forEach((step) => {
    lines.push(`( --- Step ${step.step_number}: Stage ${step.stage} — ${step.produces_description_en} --- )`);

    if (step.cut_type === 'skin_trim') {
      lines.push(`( Action: Trim crust skin ~${fmt(trimZ)}" from raw stock faces )`);
      lines.push(`( Usable Interior: ${fmt(block.usable_length)}" x ${fmt(block.usable_width)}" x ${fmt(block.usable_height)}" )`);
      lines.push(`G00 Z${fmt(safeZ)}`);
      lines.push(`G00 X0.0000 Y${fmt(trimY)}`);
      lines.push(`G01 Z${fmt(Math.max(0.0625, trimZ))} F${feed.toFixed(1)}`);
      lines.push(`G01 X${fmt(block.nominal_length)} F${feed.toFixed(1)}`);
      totalCutLengthIn += block.nominal_length;
      lines.push(`G00 Z${fmt(safeZ)}`);
    } else if (step.cut_type === 'horizontal_slab') {
      const cutZ = Math.round((trimZ + step.position_in) * 16.0) / 16.0;
      lines.push(`( Action: Horizontal slab cut at height ${fmt(cutZ)}" from base )`);
      lines.push(`G00 Z${fmt(safeZ)}`);
      lines.push(`G00 X0.0000 Y${fmt(trimY)}`);
      lines.push(`G01 Z${fmt(cutZ)} F${feed.toFixed(1)}`);
      lines.push(`G01 X${fmt(block.nominal_length)} F${feed.toFixed(1)}`);
      totalCutLengthIn += block.nominal_length;
      lines.push(`G00 Z${fmt(safeZ)}`);
    } else if (step.cut_type === 'vertical_rip') {
      const cutX = Math.round((trimX + step.position_in) * 16.0) / 16.0;
      lines.push(`( Action: Vertical rip cut along length at X=${fmt(cutX)}" )`);
      lines.push(`G00 Z${fmt(safeZ)}`);
      lines.push(`G00 X${fmt(cutX)} Y0.0000`);
      lines.push(`G01 Z0.0000 F${feed.toFixed(1)}`);
      lines.push(`G01 Y${fmt(block.nominal_width)} F${feed.toFixed(1)}`);
      totalCutLengthIn += block.nominal_width;
      lines.push(`G00 Z${fmt(safeZ)}`);
    } else if (step.cut_type === 'crosscut') {
      const cutY = Math.round((trimY + step.position_in) * 16.0) / 16.0;
      lines.push(`( Action: Crosscut perpendicular at Y=${fmt(cutY)}" )`);
      lines.push(`G00 Z${fmt(safeZ)}`);
      lines.push(`G00 X0.0000 Y${fmt(cutY)}`);
      lines.push(`G01 Z0.0000 F${feed.toFixed(1)}`);
      lines.push(`G01 X${fmt(block.nominal_length)} F${feed.toFixed(1)}`);
      totalCutLengthIn += block.nominal_length;
      lines.push(`G00 Z${fmt(safeZ)}`);
    } else if (step.cut_type === 'contour_path') {
      const targetPart = step.target_part_id ? partsMap.get(step.target_part_id) : undefined;
      const halfKerf = machine.kerf / 2.0;

      let px = 0;
      let py = 0;
      let pz = 0;
      let pl = 0;
      let pw = 0;
      let partDesc = 'Contour piece';

      if (targetPart) {
        px = Math.round((trimX + targetPart.x - halfKerf) * 16.0) / 16.0;
        py = Math.round((trimY + targetPart.y - halfKerf) * 16.0) / 16.0;
        pz = Math.round((trimZ + targetPart.z) * 16.0) / 16.0;
        pl = Math.round((targetPart.length + machine.kerf) * 16.0) / 16.0;
        pw = Math.round((targetPart.width + machine.kerf) * 16.0) / 16.0;
        partDesc = `${targetPart.sku} (${targetPart.length}x${targetPart.width}x${targetPart.height}")`;
      } else {
        const [tdx, tdy] = step.target_piece_dims || [20, 10, 4];
        px = Math.round((trimX + step.position_in - halfKerf) * 16.0) / 16.0;
        py = Math.round(trimY * 16.0) / 16.0;
        pz = Math.round(trimZ * 16.0) / 16.0;
        pl = Math.round((tdx + machine.kerf) * 16.0) / 16.0;
        pw = Math.round((tdy + machine.kerf) * 16.0) / 16.0;
      }

      const x0 = Math.max(0, px);
      const y0 = Math.max(0, py);
      const x1 = Math.min(block.nominal_length, px + pl);
      const y1 = Math.min(block.nominal_width, py + pw);

      lines.push(`( Action: Contour cut for ${partDesc} with toolpath kerf offset )`);
      lines.push(`G00 Z${fmt(safeZ)}`);
      lines.push(`G00 X${fmt(x0)} Y${fmt(y0)}`);
      lines.push(`G01 Z${fmt(pz)} F${feed.toFixed(1)}`);
      lines.push(`G01 X${fmt(x1)} Y${fmt(y0)} F${feed.toFixed(1)}`);
      lines.push(`G01 X${fmt(x1)} Y${fmt(y1)} F${feed.toFixed(1)}`);
      lines.push(`G01 X${fmt(x0)} Y${fmt(y1)} F${feed.toFixed(1)}`);
      lines.push(`G01 X${fmt(x0)} Y${fmt(y0)} F${feed.toFixed(1)}`);
      totalCutLengthIn += 2.0 * (pl + pw);
      lines.push(`G00 Z${fmt(safeZ)}`);
    }

    if (step.remnant_prompt_en) {
      lines.push(`( ${step.remnant_prompt_en} )`);
    }
    lines.push('');
  });

  // Offcut remnants
  if (block.usable_remnants && block.usable_remnants.length > 0) {
    lines.push('( --- Keep-Offcut Usable Remnants --- )');
    block.usable_remnants.forEach((r) => {
      lines.push(
        `( REMNANT: ${r.length.toFixed(1)}x${r.width.toFixed(1)}x${r.height.toFixed(1)} in, Grade ${r.grade}, Code ${r.code}, Store Bay ${r.storage_location || 'Bay R-04'} placeholder )`
      );
    });
    lines.push('');
  }

  // Footer
  const estCuttingMin = totalCutLengthIn / Math.max(1.0, feed);
  const estTotalMin = estCuttingMin * 1.25;

  lines.push('( --- Program Termination --- )');
  lines.push(`G00 Z${fmt(safeZ)} (Retract to safe Z clearance)`);
  lines.push('G00 X0.0000 Y0.0000 (Return to table work origin)');
  lines.push('M30 (Program termination and reset)');
  lines.push('');
  lines.push(`( SUMMARY ESTIMATE: Total Programmed Cuts: ${block.cuts?.length || 0} )`);
  lines.push(`( SUMMARY ESTIMATE: Total Linear Cut Length: ${totalCutLengthIn.toFixed(1)} inches )`);
  lines.push(`( SUMMARY ESTIMATE: Estimated Feed Time: ${estCuttingMin.toFixed(1)} min (estimate) )`);
  lines.push(`( SUMMARY ESTIMATE: Estimated Total Cycle Time: ${estTotalMin.toFixed(1)} min (estimate) )`);

  const content = lines.join('\n') + '\n';
  const check = verifyGCodePathClient(content, block, machine);

  return {
    block_index: block.block_index,
    stock_id: block.stock_id,
    filename,
    content,
    line_count: lines.length,
    cut_count: block.cuts?.length || 0,
    estimated_cut_length_in: Math.round(totalCutLengthIn * 100) / 100,
    estimated_time_minutes: Math.round(estTotalMin * 10) / 10,
    path_check_passed: check.passed,
    path_check_message: check.message,
  };
}

/**
 * Generates GCodeExportResponse for all blocks in an OptimizationResult.
 */
export function generateJobGCodeClient(
  result: OptimizationResult,
  machine?: MachineProfile,
  jobName?: string,
  customerRef?: string
): GCodeExportResponse {
  const targetMachine = machine || result.machine;
  const files: GCodeFilePayload[] = (result.blocks || []).map((b) =>
    generateBlockGCodeClient(
      result.job_id,
      jobName || `Job #${result.job_id}`,
      customerRef,
      result.grade,
      result.algorithm_name,
      b,
      targetMachine,
      result.blocks.length
    )
  );

  const totalCuts = files.reduce((acc, f) => acc + f.cut_count, 0);
  const allPassed = files.every((f) => f.path_check_passed);

  return {
    job_id: result.job_id,
    machine_id: targetMachine.id,
    machine_name: targetMachine.name,
    dialect: targetMachine.gcode_dialect || 'generic_rs274',
    warning_banner: SAFETY_DEMO_TEXT,
    files,
    total_cuts: totalCuts,
    all_passed: allPassed,
    timestamp: new Date().toISOString(),
  };
}

// =========================================================================
// Standard Zero-Dependency PKZip Builder
// =========================================================================

const CRC32_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC32_TABLE[i] = c;
}

function computeCRC32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = CRC32_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Creates a standard uncompressed PKZip Blob containing multiple files.
 * Zero external libraries required.
 */
export function createSimpleZipBlob(files: Array<{ name: string; content: string }>): Blob {
  const encoder = new TextEncoder();
  const fileEntries: Array<{
    nameBytes: Uint8Array;
    contentBytes: Uint8Array;
    crc: number;
    offset: number;
  }> = [];

  let currentOffset = 0;
  const localHeadersAndData: Uint8Array[] = [];

  for (const f of files) {
    const nameBytes = encoder.encode(f.name);
    const contentBytes = encoder.encode(f.content);
    const crc = computeCRC32(contentBytes);

    // Local file header: 30 bytes + name length + content length
    const header = new Uint8Array(30 + nameBytes.length);
    const view = new DataView(header.buffer);

    view.setUint32(0, 0x04034b50, true); // Local file header signature
    view.setUint16(4, 20, true);         // Version needed to extract (2.0)
    view.setUint16(6, 0, true);          // General purpose bit flag
    view.setUint16(8, 0, true);          // Compression method: 0 (stored / uncompressed)
    view.setUint16(10, 0, true);         // Last mod file time
    view.setUint16(12, 0, true);         // Last mod file date
    view.setUint32(14, crc, true);       // CRC-32
    view.setUint32(18, contentBytes.length, true); // Compressed size
    view.setUint32(22, contentBytes.length, true); // Uncompressed size
    view.setUint16(26, nameBytes.length, true);    // File name length
    view.setUint16(28, 0, true);                   // Extra field length
    header.set(nameBytes, 30);

    fileEntries.push({
      nameBytes,
      contentBytes,
      crc,
      offset: currentOffset,
    });

    localHeadersAndData.push(header);
    localHeadersAndData.push(contentBytes);
    currentOffset += header.length + contentBytes.length;
  }

  // Central Directory
  const centralDirStartOffset = currentOffset;
  const centralDirParts: Uint8Array[] = [];

  for (const entry of fileEntries) {
    const cdHeader = new Uint8Array(46 + entry.nameBytes.length);
    const view = new DataView(cdHeader.buffer);

    view.setUint32(0, 0x02014b50, true); // Central file header signature
    view.setUint16(4, 20, true);         // Version made by
    view.setUint16(6, 20, true);         // Version needed to extract
    view.setUint16(8, 0, true);          // General purpose bit flag
    view.setUint16(10, 0, true);         // Compression method: 0 (stored)
    view.setUint16(12, 0, true);         // File last mod time
    view.setUint16(14, 0, true);         // File last mod date
    view.setUint32(16, entry.crc, true); // CRC-32
    view.setUint32(20, entry.contentBytes.length, true); // Compressed size
    view.setUint32(24, entry.contentBytes.length, true); // Uncompressed size
    view.setUint16(28, entry.nameBytes.length, true);    // File name length
    view.setUint16(30, 0, true);                         // Extra field length
    view.setUint16(32, 0, true);                         // File comment length
    view.setUint16(34, 0, true);                         // Disk number start
    view.setUint16(36, 0, true);                         // Internal file attributes
    view.setUint32(38, 0, true);                         // External file attributes
    view.setUint32(42, entry.offset, true);              // Relative offset of local header
    cdHeader.set(entry.nameBytes, 46);

    centralDirParts.push(cdHeader);
    currentOffset += cdHeader.length;
  }

  const centralDirSize = currentOffset - centralDirStartOffset;

  // End of central directory record (EOCD): 22 bytes
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true); // EOCD signature
  eocdView.setUint16(4, 0, true);          // Number of this disk
  eocdView.setUint16(6, 0, true);          // Disk where central directory starts
  eocdView.setUint16(8, files.length, true);  // Number of central directory records on this disk
  eocdView.setUint16(10, files.length, true); // Total number of central directory records
  eocdView.setUint32(12, centralDirSize, true); // Size of central directory
  eocdView.setUint32(16, centralDirStartOffset, true); // Offset of start of central directory
  eocdView.setUint16(20, 0, true);         // Comment length

  return new Blob([...localHeadersAndData, ...centralDirParts, eocd] as unknown as BlobPart[], {
    type: 'application/zip',
  });
}
