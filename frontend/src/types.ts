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
  hourly_rate?: number;
  feed_rate_ipm?: number;
  available_hours_limit?: number;
}

export interface AlgorithmInfo {
  id: string;
  name: string;
  description: string;
  speed_tag: string;
  tag?: string;
  supported_cut_types: string[];
  available?: boolean;
  unavailable_reason?: string;
}

export interface BlockInput {
  id?: string;
  nominal_length: number;
  nominal_width: number;
  nominal_height: number;
  grade: string;
  quantity: number;
  cost?: number;
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
  cut_type: 'skin_trim' | 'horizontal_slab' | 'vertical_rip' | 'crosscut' | 'contour_path';
  axis: 'X' | 'Y' | 'Z';
  position_in: number;
  position_display: string;
  kerf_in: number;
  target_piece_dims: [number, number, number];
  produces_description_en: string;
  produces_description_es: string;
  remnant_prompt_en?: string;
  remnant_prompt_es?: string;
  target_part_id?: string;
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
  assigned_machine_id?: string;
  assigned_machine_name?: string;
}

export interface ValidationResult {
  is_valid: boolean;
  errors: string[];
  warnings: string[];
  volume_reconciliation: {
    total_gross_volume: number;
    total_usable_volume: number;
    total_skin_trim_volume: number;
    total_parts_volume: number;
    total_remnants_volume: number;
    total_kerf_volume: number;
    total_scrap_volume: number;
    reconciliation_delta: number;
  };
}

export interface UnplacedPartSummary extends PartItem {
  requested_qty: number;
  placed_qty: number;
  unplaced_qty: number;
  reason_code: string;
  message: string;
  suggested_action: string;
}

export interface OptimizationResult {
  job_id: string;
  order_id?: string;
  customer?: string;
  grade: string;
  algorithm_id: string;
  algorithm_name: string;
  solution_type: string;
  timestamp: string;
  machine: MachineProfile;
  total_parts_demanded: number;
  total_parts_placed: number;
  unplaced_parts: UnplacedPartSummary[];
  unplaced_summary?: UnplacedPartSummary[];
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
  runtime_ms: number;
  validation: ValidationResult;
  is_best?: boolean;
  solver_status?: string;
  solver_time_ms?: number;
  verify_iterations?: number;
  fallback_used?: boolean;
  machine_assignment_reason?: string;
}

export interface OptimizationRequest {
  job_id: string;
  order_id?: string;
  customer?: string;
  grade: string;
  machine_id?: string;
  parts: PartItem[];
  prefer_remnants_first?: boolean;
  skin_trim_per_face?: number;
  algorithm_id?: string;
  time_budget_seconds?: number;
  seed?: number;
  available_blocks?: BlockInput[];
  kerf?: number;
  machine_objective?: 'lowest_cost' | 'best_yield' | 'lowest_time';
  allow_overproduction?: boolean;
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

export type NavRoute = '/dashboard' | '/projects' | '/optimization' | '/inventory' | '/reports';

export interface SavedJob {
  id: string;
  job_id: string;
  name: string;
  customer_ref?: string;
  grade: string;
  machine_id: string;
  algorithm_id: string;
  parts: PartItem[];
  blocks: BlockInput[];
  skin_trim: number;
  kerf: number;
  machine_objective: 'lowest_cost' | 'best_yield' | 'lowest_time';
  allow_mixed_grades: boolean;
  created_at: string;
  updated_at: string;
  last_optimized_at?: string;
  status: 'Not optimized' | 'Optimized' | 'Stale';
  yield_pct?: number;
  parts_placed_count?: number;
  parts_demanded_count?: number;
  latest_result?: OptimizationResult | null;
  comparison_results?: OptimizationResult[];
}

export interface RemnantInventoryItem {
  id: string;
  remnant_id: string;
  grade: string;
  length: number;
  width: number;
  height: number;
  volume_cu_in: number;
  source_job_id: string;
  source_job_name: string;
  created_at: string;
  status: 'available' | 'reserved' | 'consumed';
}

export interface ActivityLogItem {
  id: string;
  type: 'run' | 'save' | 'create' | 'inventory';
  title: string;
  job_id?: string;
  job_name?: string;
  timestamp: string;
  yield_pct?: number;
}
