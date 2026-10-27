import type {
  FoamGrade,
  MachineProfile,
  OptimizationResult,
  OptimizationRequest,
  AlgorithmInfo,
  RemnantAgingStatus,
  GCodeExportResponse,
} from './types';

const API_BASE = import.meta.env.VITE_API_BASE_URL || (import.meta.env.PROD ? '/api' : 'http://localhost:8000/api');

export async function fetchGrades(): Promise<FoamGrade[]> {
  const res = await fetch(`${API_BASE}/grades`);
  if (!res.ok) throw new Error('Failed to load grades');
  return res.json();
}

export async function fetchMachines(): Promise<MachineProfile[]> {
  const res = await fetch(`${API_BASE}/machines`);
  if (!res.ok) throw new Error('Failed to load machines');
  return res.json();
}

export async function fetchAlgorithms(): Promise<AlgorithmInfo[]> {
  const res = await fetch(`${API_BASE}/algorithms`);
  if (!res.ok) throw new Error('Failed to load algorithms');
  return res.json();
}

export async function fetchSampleJobs(): Promise<any[]> {
  const res = await fetch(`${API_BASE}/jobs/samples`);
  if (!res.ok) throw new Error('Failed to load sample jobs');
  return res.json();
}

export async function fetchRemnantAging(): Promise<RemnantAgingStatus[]> {
  const res = await fetch(`${API_BASE}/inventory/remnants/aging`);
  if (!res.ok) throw new Error('Failed to load remnant aging');
  return res.json();
}

export async function optimizeJob(payload: OptimizationRequest): Promise<OptimizationResult> {
  const res = await fetch(`${API_BASE}/optimize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Optimization failed');
  }
  return res.json();
}

export async function compareAlgorithms(payload: OptimizationRequest): Promise<OptimizationResult[]> {
  const res = await fetch(`${API_BASE}/optimize/compare`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Algorithm comparison failed');
  }
  return res.json();
}

export async function exportGCode(payload: {
  result?: OptimizationResult;
  job_id?: string;
  machine_id?: string;
  job_name?: string;
  customer_ref?: string;
  allow_unplaced_export?: boolean;
}): Promise<GCodeExportResponse> {
  const res = await fetch(`${API_BASE}/gcode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || 'G-code export failed');
  }
  return res.json();
}

