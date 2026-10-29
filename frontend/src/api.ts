import type {
  FoamGrade,
  MachineProfile,
  OptimizationResult,
  OptimizationRequest,
  AlgorithmInfo,
  RemnantAgingStatus,
  GCodeExportResponse,
  IncompatibleAlgorithmMachineError,
} from './types';

export class OptimizationApiError extends Error {
  status: number;
  incompatibleData?: IncompatibleAlgorithmMachineError;

  constructor(message: string, status: number, incompatibleData?: IncompatibleAlgorithmMachineError) {
    super(message);
    this.name = 'OptimizationApiError';
    this.status = status;
    this.incompatibleData = incompatibleData;
  }
}

const env = typeof import.meta !== 'undefined' ? (import.meta as any).env : undefined;
const API_BASE = env?.VITE_API_BASE_URL || (env?.PROD ? '/api' : 'http://localhost:8000/api');

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

export async function optimizeJob(payload: OptimizationRequest, signal?: AbortSignal): Promise<OptimizationResult> {
  const res = await fetch(`${API_BASE}/optimize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Client': 'web' },
    body: JSON.stringify(payload),
    signal,
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    if (
      res.status === 422 &&
      errorData.detail &&
      typeof errorData.detail === 'object' &&
      errorData.detail.code === 'ALGORITHM_MACHINE_INCOMPATIBLE'
    ) {
      throw new OptimizationApiError(
        errorData.detail.message || 'Selected machine and algorithm are incompatible.',
        422,
        errorData.detail as IncompatibleAlgorithmMachineError
      );
    }
    const message = typeof errorData.detail === 'string'
      ? errorData.detail
      : (errorData.detail?.message || 'Optimization failed');
    throw new OptimizationApiError(message, res.status);
  }
  return res.json();
}

export async function compareAlgorithms(payload: OptimizationRequest, signal?: AbortSignal): Promise<OptimizationResult[]> {
  const res = await fetch(`${API_BASE}/optimize/compare`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
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

