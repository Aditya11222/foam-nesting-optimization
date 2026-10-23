export type OrientationMode = 'rise-locked' | 'free-in-plane' | 'any';

export interface FoamGrade {
  code: string;
  name: string;
  density_pcf: number;
  ild_firmness: number;
  color_hex: string;
  description?: string;
}

export interface MachineProfile {
  id: string;
  name: string;
  cut_type: 'guillotine' | 'free';
  max_cut_height: number;
  kerf: number;
  automation: 'manual' | 'rotating' | 'CNC';
  preferred_direction: string;
}

export interface PartItem {
  id: string;
  sku: string;
  name: string;
  grade: string;
  length: number;
  width: number;
  height: number;
  quantity: number;
  orientation_mode: OrientationMode;
  color_hex?: string;
}

export interface PlacedPart {
  part_id: string;
  sku: string;
  name: string;
  grade: string;
  x: number;
  y: number;
  z: number;
  length: number;
  width: number;
  height: number;
  orientation_used: [number, number, number];
  color_hex: string;
}

export interface RemnantOutput {
  id: string;
  code: string;
  x: number;
  y: number;
  z: number;
  length: number;
  width: number;
  height: number;
  grade: string;
  volume: number;
  usability_score: number;
  retained: boolean;
  storage_location: string;
}

export interface CutStep {
  step_number: number;
  stage: number;
  cut_type: 'skin_trim' | 'horizontal_slab' | 'vertical_rip' | 'crosscut';
  axis: 'X' | 'Y' | 'Z';
  position_in: number;
  position_display: string;
  kerf_in: number;
  target_piece_dims: [number, number, number];
  produces_description_en: string;
  produces_description_es: string;
  remnant_prompt_en?: string;
  remnant_prompt_es?: string;
}

export interface BlockLayout {
  block_index: number;
  stock_id: string;
  stock_type: 'bun' | 'remnant';
  grade: string;
  nominal_length: number;
  nominal_width: number;
  nominal_height: number;
  usable_length: number;
  usable_width: number;
  usable_height: number;
  skin_trim_loss_volume: number;
  placed_parts: PlacedPart[];
  usable_remnants: RemnantOutput[];
  cuts: CutStep[];
  gross_volume: number;
  usable_volume: number;
  parts_volume: number;
  kerf_loss_volume: number;
  unrecoverable_scrap_volume: number;
  gross_utilization_pct: number;
  net_utilization_pct: number;
  material_recovery_pct: number;
}

export interface OptimizationResult {
  job_id: string;
  grade: string;
  solution_type: string;
  timestamp: string;
  machine: MachineProfile;
  total_parts_demanded: number;
  total_parts_placed: number;
  unplaced_parts: PartItem[];
  blocks_used_count: number;
  blocks: BlockLayout[];
  total_gross_volume: number;
  total_usable_volume: number;
  total_parts_volume: number;
  total_kerf_volume: number;
  total_remnant_volume: number;
  total_unrecoverable_scrap_volume: number;
  gross_utilization_pct: number;
  net_utilization_pct: number;
  total_cuts_count: number;
  estimated_saw_time_minutes: number;
}

export interface RemnantAgingStatus {
  remnant_id: string;
  code: string;
  grade: string;
  cut_date: string;
  evaluation_date: string;
  age_days: number;
  is_degraded: boolean;
  degradation_days_threshold: number;
  original_dims: [number, number, number];
  effective_dims: [number, number, number];
  original_volume: number;
  effective_volume: number;
  volume_loss_pct: number;
  usability_score: number;
  storage_location: string;
  recommendation_en: string;
  recommendation_es: string;
}
