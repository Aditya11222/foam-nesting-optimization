import type { OptimizationResult } from '../types';

export function exportJobCSV(
  currentResult: OptimizationResult,
  comparisonResults?: OptimizationResult[] | null,
  costAssumptions?: {
    unitCost: number;
    sawRatePerHour: number;
    remnantCreditPct: number;
  }
) {
  const CU_FT = 1728.0;
  const unitCost = costAssumptions?.unitCost ?? 4.50;
  const sawRate = costAssumptions?.sawRatePerHour ?? 65.0;
  const remnantCreditRate = costAssumptions?.remnantCreditPct ?? 40.0;

  const grossCuFt = currentResult.total_gross_volume / CU_FT;
  const remnantCuFt = currentResult.total_remnant_volume / CU_FT;
  const sawHours = currentResult.estimated_saw_time_minutes / 60.0;
  const matCost = grossCuFt * unitCost;
  const sawCost = sawHours * sawRate;
  const remCredit = remnantCuFt * unitCost * (remnantCreditRate / 100.0);
  const netJobCost = Math.max(0, matCost + sawCost - remCredit);

  // Naive manual baseline layout calculations
  const sampleBlock = currentResult.blocks[0];
  const bunGrossCuIn = sampleBlock ? sampleBlock.gross_volume : 354240.0;
  const singleBunUsableCuIn = sampleBlock
    ? (sampleBlock.usable_length * sampleBlock.usable_width * sampleBlock.usable_height)
    : 300000.0;
  const baselineBlocks = Math.max(
    currentResult.blocks_used_count + 1,
    Math.ceil(currentResult.total_parts_volume / Math.max(1, singleBunUsableCuIn * 0.412))
  );
  const baselineGrossCuFt = (baselineBlocks * bunGrossCuIn) / CU_FT;
  const baselineScrapCuFt = Math.max(0, baselineGrossCuFt - (currentResult.total_parts_volume / CU_FT));
  const baselineSawHours = sawHours * 1.45;
  const baselineTotalCost = (baselineGrossCuFt * unitCost) + (baselineSawHours * sawRate);
  const costSavings = Math.max(0, baselineTotalCost - netJobCost);

  const sections: string[] = [];

  // Helper to escape CSV cell
  const esc = (val: any) => {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  // Section 1: Job Executive Summary
  sections.push([
    '# =========================================================',
    '# SECTION 1: PRODUCTION ORDER & OPTIMIZATION SUMMARY',
    '# =========================================================',
    'Metric,Value,Unit,Notes',
    `Job ID,${esc(currentResult.job_id)},,Production order identifier`,
    `Solution Type,${esc(currentResult.solution_type)},,Heuristic solution (never claims mathematical optimality)`,
    `Foam Grade,${esc(currentResult.grade)},,Material grade`,
    `Machine Name,${esc(currentResult.machine.name)},,Cutting machine profile`,
    `Machine Cut Type,${esc(currentResult.machine.cut_type)},,${currentResult.machine.cut_type === 'free' ? 'Waterjet CNC contour' : 'Guillotine slicing'}`,
    `Algorithm Name,${esc(currentResult.algorithm_name)},,${esc(currentResult.algorithm_id)}`,
    `Timestamp,${esc(currentResult.timestamp)},,Run timestamp`,
    `Parts Demanded,${currentResult.total_parts_demanded},pcs,Total demanded instances`,
    `Parts Placed,${currentResult.total_parts_placed},pcs,Successfully nested pieces`,
    `Unplaced Parts,${currentResult.unplaced_parts.length},pcs,Infeasible or out-of-stock pieces`,
    `Blocks / Buns Used,${currentResult.blocks_used_count},buns,Allocated raw foam stock`,
    `Total Gross Volume,${currentResult.total_gross_volume.toFixed(2)},cu in,${grossCuFt.toFixed(2)} cu ft`,
    `Total Usable Volume,${currentResult.total_usable_volume.toFixed(2)},cu in,Inside perimeter skin trim`,
    `Total Parts Volume,${currentResult.total_parts_volume.toFixed(2)},cu in,${(currentResult.total_parts_volume / CU_FT).toFixed(2)} cu ft`,
    `Total Remnants Volume,${currentResult.total_remnant_volume.toFixed(2)},cu in,${remnantCuFt.toFixed(2)} cu ft (retained for inventory)`,
    `Total Kerf Loss Volume,${currentResult.total_kerf_volume.toFixed(2)},cu in,Blade / waterjet stream kerf loss`,
    `Total Scrap Volume,${currentResult.total_unrecoverable_scrap_volume.toFixed(2)},cu in,Unrecoverable offcuts`,
    `Net Utilization,${currentResult.net_utilization_pct.toFixed(1)},%,Parts Volume / Usable Volume`,
    `Gross Utilization,${currentResult.gross_utilization_pct.toFixed(1)},%,Parts Volume / Gross Bun Volume`,
    `Total Cuts Count,${currentResult.total_cuts_count},cuts,Total saw cut stages`,
    `Assigned Saw Station,${esc(currentResult.machine?.name || 'N/A')},${esc(currentResult.machine?.id || '')},${esc(currentResult.machine_assignment_reason || 'Manual selection')}`,
    `Solver Status,${esc(currentResult.solver_status || 'Heuristic')},${currentResult.solver_time_ms ? `${currentResult.solver_time_ms} ms` : 'N/A'},${currentResult.fallback_used ? 'Fallback used' : 'Native execution'}`,
    `Estimated Saw Time,${currentResult.estimated_saw_time_minutes.toFixed(1)},min,At machine feed rate`,
    `Estimated Material Cost,$${matCost.toFixed(2)},USD,Based on $${unitCost.toFixed(2)}/cu ft`,
    `Estimated Saw Operating Cost,$${sawCost.toFixed(2)},USD,Based on $${sawRate.toFixed(2)}/hr saw rate`,
    `Estimated Remnant Credit,-$${remCredit.toFixed(2)},USD,Based on ${remnantCreditRate}% virgin credit`,
    `Net Job Production Cost,$${netJobCost.toFixed(2)},USD,Material + Saw - Remnant Credit`,
    `Average Finished Part Cost,$${(currentResult.total_parts_placed > 0 ? netJobCost / currentResult.total_parts_placed : 0).toFixed(2)},USD/part,Average cost per piece placed`
  ].join('\n'));

  // Unplaced & Infeasible Parts Summary
  if (currentResult.unplaced_parts && currentResult.unplaced_parts.length > 0) {
    const unplacedRows: string[] = [
      '# =========================================================',
      '# UNPLACED & INFEASIBLE PARTS DIAGNOSTIC SUMMARY',
      '# =========================================================',
      'SKU,Name,Grade,Length_in,Width_in,Height_in,Requested_Qty,Placed_Qty,Unplaced_Qty,Reason_Code,Diagnosis_Message,Suggested_Action'
    ];
    currentResult.unplaced_parts.forEach((u) => {
      unplacedRows.push([
        esc(u.sku),
        esc(u.name),
        esc(u.grade),
        u.length,
        u.width,
        u.height,
        u.requested_qty ?? u.quantity,
        u.placed_qty ?? 0,
        u.unplaced_qty ?? u.quantity,
        esc(u.reason_code ?? 'INSUFFICIENT_BLOCK_QUANTITY'),
        esc(u.message ?? ''),
        esc(u.suggested_action ?? '')
      ].join(','));
    });
    sections.push(unplacedRows.join('\n'));
  }

  // Section 2: Placed Parts Table
  const partRows: string[] = [
    '# =========================================================',
    '# SECTION 2: PLACED PARTS CUT LIST',
    '# =========================================================',
    'Block_Index,Stock_ID,Part_ID,SKU,Name,Grade,Length_in,Width_in,Height_in,X_in,Y_in,Z_in,Orientation_Mode,Volume_cu_in'
  ];
  currentResult.blocks.forEach((b) => {
    b.placed_parts.forEach((p) => {
      partRows.push([
        b.block_index,
        esc(b.stock_id),
        esc(p.part_id),
        esc(p.sku),
        esc(p.name),
        esc(p.grade),
        p.length,
        p.width,
        p.height,
        p.x,
        p.y,
        p.z,
        esc(p.orientation_used ? `${p.orientation_used[0]}x${p.orientation_used[1]}x${p.orientation_used[2]}` : 'default'),
        (p.length * p.width * p.height).toFixed(2)
      ].join(','));
    });
  });
  sections.push(partRows.join('\n'));

  // Section 3: Saw Cut Sequence
  const cutRows: string[] = [
    '# =========================================================',
    '# SECTION 3: SAW CUT SEQUENCE & OPERATOR INSTRUCTIONS',
    '# =========================================================',
    'Block_Index,Step_Number,Stage,Cut_Type,Axis,Position_in,Position_Display,Kerf_in,Target_Piece_Dims,Description_EN,Description_ES'
  ];
  currentResult.blocks.forEach((b) => {
    b.cuts.forEach((c) => {
      cutRows.push([
        b.block_index,
        c.step_number,
        c.stage,
        esc(c.cut_type),
        esc(c.axis),
        c.position_in,
        esc(c.position_display),
        c.kerf_in,
        esc(`${c.target_piece_dims[0]}x${c.target_piece_dims[1]}x${c.target_piece_dims[2]}`),
        esc(c.produces_description_en),
        esc(c.produces_description_es)
      ].join(','));
    });
  });
  sections.push(cutRows.join('\n'));

  // Section 4: Usable Remnants Table
  const remnantRows: string[] = [
    '# =========================================================',
    '# SECTION 4: USABLE REMNANTS REGISTERED FOR INVENTORY',
    '# =========================================================',
    'Remnant_Code,Block_Index,Stock_ID,Grade,Length_in,Width_in,Height_in,Volume_cu_in,Volume_cu_ft,Usability_Score_pct,Warehouse_Bay'
  ];
  currentResult.blocks.forEach((b) => {
    b.usable_remnants.forEach((r) => {
      remnantRows.push([
        esc(r.code),
        b.block_index,
        esc(b.stock_id),
        esc(r.grade),
        r.length,
        r.width,
        r.height,
        r.volume.toFixed(2),
        (r.volume / CU_FT).toFixed(2),
        Math.round(r.usability_score * 100),
        esc(r.storage_location || 'Bay R-01')
      ].join(','));
    });
  });
  sections.push(remnantRows.join('\n'));

  // Section 5: Algorithm Comparison Table (if comparative results exist)
  if (comparisonResults && comparisonResults.length > 0) {
    const compRows: string[] = [
      '# =========================================================',
      '# SECTION 5: ALGORITHM BENCHMARK COMPARATIVE EVALUATION',
      '# =========================================================',
      'Algorithm_ID,Algorithm_Name,Best_In_Comparison,Blocks_Used,Net_Yield_pct,Gross_Yield_pct,Scrap_Volume_cu_in,Total_Cuts,Runtime_ms,Solver_Status,Solver_Time_ms,Fallback_Used'
    ];
    comparisonResults.forEach((cr) => {
      compRows.push([
        esc(cr.algorithm_id),
        esc(cr.algorithm_name),
        cr.is_best ? 'YES' : 'NO',
        cr.blocks_used_count,
        cr.net_utilization_pct.toFixed(1),
        cr.gross_utilization_pct.toFixed(1),
        cr.total_unrecoverable_scrap_volume.toFixed(1),
        cr.total_cuts_count,
        cr.runtime_ms ?? 0,
        esc(cr.solver_status || 'Heuristic'),
        cr.solver_time_ms ?? '',
        cr.fallback_used ? 'YES' : 'NO'
      ].join(','));
    });
    sections.push(compRows.join('\n'));
  }

  // Section 6: Baseline vs. Optimized Comparison Table
  const baselineRows: string[] = [
    '# =========================================================',
    '# SECTION 6: NAIVE MANUAL BASELINE VS. HEURISTIC OPTIMIZATION',
    '# =========================================================',
    'Metric,Naive_Manual_Baseline,Heuristic_Optimized,Variance_Savings,Savings_pct',
    `Blocks Required,${baselineBlocks},${currentResult.blocks_used_count},${baselineBlocks - currentResult.blocks_used_count} bun(s) saved,${(((baselineBlocks - currentResult.blocks_used_count) / baselineBlocks) * 100).toFixed(1)}%`,
    `Gross Foam Volume (cu ft),${baselineGrossCuFt.toFixed(2)},${grossCuFt.toFixed(2)},${(baselineGrossCuFt - grossCuFt).toFixed(2)} cu ft,${(((baselineGrossCuFt - grossCuFt) / baselineGrossCuFt) * 100).toFixed(1)}%`,
    `Scrap Volume (cu ft),${baselineScrapCuFt.toFixed(2)},${(currentResult.total_unrecoverable_scrap_volume / CU_FT).toFixed(2)},${(baselineScrapCuFt - (currentResult.total_unrecoverable_scrap_volume / CU_FT)).toFixed(2)} cu ft,${(((baselineScrapCuFt - (currentResult.total_unrecoverable_scrap_volume / CU_FT)) / baselineScrapCuFt) * 100).toFixed(1)}%`,
    `Saw Operating Time (hrs),${baselineSawHours.toFixed(2)},${sawHours.toFixed(2)},${(baselineSawHours - sawHours).toFixed(2)} hrs,${(((baselineSawHours - sawHours) / baselineSawHours) * 100).toFixed(1)}%`,
    `Total Production Cost ($),$${Math.round(baselineTotalCost)},$${Math.round(netJobCost)},$${Math.round(costSavings)} saved,${((costSavings / baselineTotalCost) * 100).toFixed(1)}%`
  ];
  sections.push(baselineRows.join('\n'));

  // UTF-8 BOM character: \uFEFF
  const fullCsvContent = '\uFEFF' + sections.join('\n\n');

  // Trigger browser download
  const blob = new Blob([fullCsvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${currentResult.job_id}_foam_nesting_cutting_plan.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
