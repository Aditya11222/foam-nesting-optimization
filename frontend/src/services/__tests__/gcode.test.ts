import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  computeGCodeButtonState,
  generateBlockGCodeClient,
  verifyGCodePathClient,
  createSimpleZipBlob,
  SAFETY_DEMO_TEXT,
} from '../gcode.ts';
import type { OptimizationResult, BlockLayout, MachineProfile } from '../../types.ts';

const mockCNC: MachineProfile = {
  id: 'saw-g2',
  name: 'Saw Station 2 — Vertical Slicer',
  cut_type: 'guillotine',
  max_cut_height: 52.0,
  kerf: 0.125,
  automation: 'rotating',
  preferred_direction: 'Z',
  hourly_rate: 50.0,
  feed_rate_ipm: 90.0,
  rapid_rate_ipm: 300.0,
  safe_z: 2.0,
  origin: 'block_corner_front_left_bottom',
  gcode_supported: true,
  gcode_dialect: 'generic_rs274',
  units: 'inches',
  support_level: 'fully_supported',
};

const mockManual: MachineProfile = {
  id: 'saw-vert-man',
  name: 'Vertical Band Saw (Manual)',
  cut_type: 'guillotine',
  max_cut_height: 40.0,
  kerf: 0.125,
  automation: 'manual',
  preferred_direction: 'Z',
  hourly_rate: 40.0,
  feed_rate_ipm: 50.0,
  rapid_rate_ipm: 0.0,
  safe_z: 0.0,
  origin: 'block_corner_front_left_bottom',
  gcode_supported: false,
  gcode_dialect: 'generic_rs274',
  units: 'inches',
  support_level: 'basic_heuristic',
};

const mockBlock: BlockLayout = {
  block_index: 1,
  stock_id: 'bun-hr40-01',
  stock_type: 'bun',
  grade: 'HR-40',
  nominal_length: 108.0,
  nominal_width: 82.0,
  nominal_height: 40.0,
  usable_length: 106.0,
  usable_width: 80.0,
  usable_height: 38.0,
  skin_trim_loss_volume: 29248.0,
  placed_parts: [
    {
      part_id: 'p-1',
      sku: 'Cushion A',
      name: 'Sofa Cushion A',
      grade: 'HR-40',
      x: 0.0,
      y: 0.0,
      z: 0.0,
      length: 24.0,
      width: 24.0,
      height: 6.0,
      orientation_used: [24.0, 24.0, 6.0],
      color_hex: '#ef4444',
    },
  ],
  usable_remnants: [
    {
      id: 'rem-1',
      code: 'REM-HR40-01',
      x: 24.0,
      y: 24.0,
      z: 0.0,
      length: 30.0,
      width: 40.0,
      height: 20.0,
      grade: 'HR-40',
      volume: 24000.0,
      usability_score: 0.85,
      retained: true,
      storage_location: 'Bay R-12',
    },
  ],
  cuts: [
    {
      step_number: 1,
      stage: 0,
      cut_type: 'skin_trim',
      axis: 'Z',
      position_in: 1.0,
      position_display: '1"',
      kerf_in: 0.125,
      target_piece_dims: [108.0, 82.0, 40.0],
      produces_description_en: 'Trim crust skin from raw bun.',
      produces_description_es: 'Retirar corteza.',
    },
    {
      step_number: 2,
      stage: 1,
      cut_type: 'horizontal_slab',
      axis: 'Z',
      position_in: 6.0,
      position_display: '6"',
      kerf_in: 0.125,
      target_piece_dims: [106.0, 80.0, 6.0],
      produces_description_en: 'Horizontal slab cut.',
      produces_description_es: 'Corte horizontal.',
    },
  ],
  gross_volume: 354240.0,
  usable_volume: 322240.0,
  parts_volume: 3456.0,
  kerf_loss_volume: 1200.0,
  unrecoverable_scrap_volume: 293584.0,
  gross_utilization_pct: 1.0,
  net_utilization_pct: 1.1,
  material_recovery_pct: 7.8,
};

const mockResult: OptimizationResult = {
  job_id: 'JOB-4821',
  grade: 'HR-40',
  algorithm_id: 'ortools_block_assignment',
  algorithm_name: '3D OR-Tools Block Assignment Solver',
  solution_type: 'heuristic solution',
  timestamp: new Date().toISOString(),
  machine: mockCNC,
  total_parts_demanded: 1,
  total_parts_placed: 1,
  unplaced_parts: [],
  unplaced_summary: [],
  blocks_used_count: 1,
  blocks: [mockBlock],
  total_gross_volume: 354240.0,
  total_usable_volume: 322240.0,
  total_parts_volume: 3456.0,
  total_kerf_volume: 1200.0,
  total_remnant_volume: 24000.0,
  total_unrecoverable_scrap_volume: 293584.0,
  gross_utilization_pct: 1.0,
  net_utilization_pct: 1.1,
  total_cuts_count: 2,
  estimated_saw_time_minutes: 5.0,
  runtime_ms: 120.0,
  validation: {
    is_valid: true,
    errors: [],
    warnings: [],
    volume_reconciliation: {},
  },
  is_best: true,
};

describe('G-Code Button Gating State', () => {
  it('Disabled when optimizing', () => {
    const state = computeGCodeButtonState(mockResult, true, false, mockCNC);
    assert.equal(state.isEnabled, false);
    assert.match(state.reason!, /optimization/i);
  });

  it('Disabled when result is missing', () => {
    const state = computeGCodeButtonState(null, false, false, mockCNC);
    assert.equal(state.isEnabled, false);
    assert.match(state.reason!, /run optimization/i);
  });

  it('Disabled when inputs are stale', () => {
    const state = computeGCodeButtonState(mockResult, false, true, mockCNC);
    assert.equal(state.isEnabled, false);
    assert.match(state.reason!, /stale/i);
  });

  it('Disabled when validation failed', () => {
    const invalidResult: OptimizationResult = {
      ...mockResult,
      validation: {
        is_valid: false,
        errors: ['Part overlaps bounding box'],
        warnings: [],
        volume_reconciliation: {},
      },
    };
    const state = computeGCodeButtonState(invalidResult, false, false, mockCNC);
    assert.equal(state.isEnabled, false);
    assert.match(state.reason!, /validation failed/i);
  });

  it('Disabled when manual machine selected', () => {
    const state = computeGCodeButtonState(mockResult, false, false, mockManual);
    assert.equal(state.isEnabled, false);
    assert.match(state.reason!, /manual saw: no g-code output/i);
  });

  it('Enabled with automated CNC machine and valid result', () => {
    const state = computeGCodeButtonState(mockResult, false, false, mockCNC);
    assert.equal(state.isEnabled, true);
  });
});

describe('G-Code Generator and Path Simulator', () => {
  it('Produces valid .nc with safety disclaimer, G20, G90, and M30', () => {
    const payload = generateBlockGCodeClient(
      'JOB-4821',
      'Sample job #4821',
      'Acme',
      'HR-40',
      'Test Algo',
      mockBlock,
      mockCNC,
      1,
      '2026-10-27T10:00:00Z'
    );
    assert.equal(payload.path_check_passed, true);
    assert.ok(payload.content.includes(SAFETY_DEMO_TEXT));
    assert.ok(payload.content.includes('G20'));
    assert.ok(payload.content.includes('G90'));
    assert.ok(payload.content.includes('M30'));
    assert.ok(payload.content.includes('REMNANT: 30.0x40.0x20.0 in'));
    assert.equal(payload.cut_count, 2);
  });

  it('Path simulator detects missing safety warning', () => {
    const payload = generateBlockGCodeClient(
      'JOB-4821',
      'Sample job #4821',
      'Acme',
      'HR-40',
      'Test Algo',
      mockBlock,
      mockCNC,
      1,
      '2026-10-27T10:00:00Z'
    );
    const tampered = payload.content.replace(SAFETY_DEMO_TEXT, 'REMOVED');
    const check = verifyGCodePathClient(tampered, mockBlock, mockCNC);
    assert.equal(check.passed, false);
    assert.match(check.message, /Mandatory DEMO output disclaimer missing/i);
  });

  it('Path simulator detects out-of-bounds coordinates', () => {
    const payload = generateBlockGCodeClient(
      'JOB-4821',
      'Sample job #4821',
      'Acme',
      'HR-40',
      'Test Algo',
      mockBlock,
      mockCNC,
      1,
      '2026-10-27T10:00:00Z'
    );
    const tampered = payload.content.replace('X108.0000', 'X999.0000');
    const check = verifyGCodePathClient(tampered, mockBlock, mockCNC);
    assert.equal(check.passed, false);
    assert.match(check.message, /exceeds nominal block length/i);
  });

  it('Produces a non-empty PKZip Blob for multiple files', async () => {
    const zipBlob = createSimpleZipBlob([
      { name: 'block1.nc', content: 'G20\nM30\n' },
      { name: 'block2.nc', content: 'G20\nM30\n' },
    ]);
    assert.ok(zipBlob.size > 0);
    const buffer = await zipBlob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    // Standard PK local header signature is 0x50, 0x4b, 0x03, 0x04 ('PK\x03\x04')
    assert.equal(bytes[0], 0x50);
    assert.equal(bytes[1], 0x4b);
    assert.equal(bytes[2], 0x03);
    assert.equal(bytes[3], 0x04);
  });
});
