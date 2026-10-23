import type { FoamGrade, MachineProfile, OptimizationResult, RemnantAgingStatus } from './types';

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

export async function optimizeJob(payload: any): Promise<OptimizationResult> {
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
