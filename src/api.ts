import type {
  FoamGrade,
  MachineProfile,
  OptimizationResult,
  OptimizationRequest,
  AlgorithmInfo,
  RemnantAgingStatus,
} from './types';
import { FOAM_GRADES, MACHINES, ALGORITHMS, SAMPLE_JOBS, DEFAULT_REMNANTS } from './engine/data';
import { computeEffectiveRemnantDims } from './engine/remnantAging';
import { runOptimization, compareAllAlgorithms } from './engine/optimizerService';

export async function fetchGrades(): Promise<FoamGrade[]> {
  return [...FOAM_GRADES];
}

export async function fetchMachines(): Promise<MachineProfile[]> {
  return [...MACHINES];
}

export async function fetchAlgorithms(): Promise<AlgorithmInfo[]> {
  return [...ALGORITHMS];
}

export async function fetchSampleJobs(): Promise<any[]> {
  return [...SAMPLE_JOBS];
}

export async function fetchRemnantAging(): Promise<RemnantAgingStatus[]> {
  const now = new Date();
  return DEFAULT_REMNANTS.map((r) => computeEffectiveRemnantDims(r, now));
}

export async function optimizeJob(payload: OptimizationRequest): Promise<OptimizationResult> {
  return runOptimization(payload);
}

export async function compareAlgorithms(payload: OptimizationRequest): Promise<OptimizationResult[]> {
  return compareAllAlgorithms(payload);
}
