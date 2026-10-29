import rawCompatibility from '../../../config/algorithm_compatibility.json' with { type: 'json' };
import type { MachineCutType, MachineProfile, AlgorithmInfo } from '../types.ts';

export const ALGORITHM_COMPATIBILITY: Record<string, string[]> = rawCompatibility;

/**
 * Checks if an algorithm is compatible with a machine's cut type.
 */
export function isAlgorithmCompatibleWithMachine(
  algorithmId: string,
  cutType: MachineCutType | string,
  algorithms?: AlgorithmInfo[]
): boolean {
  // If algorithm list from backend is provided and has supported_cut_types, use it;
  // otherwise fallback to the shared config map.
  const fromAlgoList = algorithms?.find((a) => a.id === algorithmId)?.supported_cut_types;
  const supported = fromAlgoList && fromAlgoList.length > 0 ? fromAlgoList : ALGORITHM_COMPATIBILITY[algorithmId];
  if (!supported) return false;
  return supported.includes(cutType);
}

/**
 * Returns a human-friendly one-line reason why an algorithm is incompatible with a machine.
 */
export function getIncompatibilityReason(
  algorithmId: string,
  machine: MachineProfile | undefined,
  algorithms?: AlgorithmInfo[]
): string | null {
  if (!machine) return null;
  const compatible = isAlgorithmCompatibleWithMachine(algorithmId, machine.cut_type, algorithms);
  if (compatible) return null;

  const fromAlgoList = algorithms?.find((a) => a.id === algorithmId)?.supported_cut_types;
  const supported = fromAlgoList && fromAlgoList.length > 0 ? fromAlgoList : ALGORITHM_COMPATIBILITY[algorithmId];

  if (supported?.includes('free') && machine.cut_type === 'guillotine') {
    return `Needs a waterjet / wire / CNC machine. Current machine: ${machine.name} (guillotine).`;
  }
  if (supported?.includes('guillotine') && machine.cut_type === 'free') {
    return `Guillotine-only algorithm. Current machine is a contour cutter: ${machine.name} (${machine.cut_type}).`;
  }
  return `Incompatible with ${machine.name} (${machine.cut_type}). Supported: ${supported?.join(', ') || 'none'}.`;
}

/**
 * Returns the recommended compatible algorithm for a given machine.
 */
export function getRecommendedCompatibleAlgorithm(
  machine: MachineProfile | undefined,
  currentAlgorithmId: string,
  algorithms?: AlgorithmInfo[]
): string {
  if (!machine) return currentAlgorithmId;
  if (isAlgorithmCompatibleWithMachine(currentAlgorithmId, machine.cut_type, algorithms)) {
    return currentAlgorithmId;
  }
  if (machine.cut_type === 'free') {
    return 'free_nesting_heuristic';
  }
  return 'ortools_block_assignment';
}

/**
 * Filters the algorithm list down strictly to algorithms that are supported by the machine's cut type.
 * Incompatible algorithms and missing package algorithms are completely omitted.
 */
export function getCompatibleAlgorithmsForMachine(
  machine: MachineProfile | undefined,
  algorithms: AlgorithmInfo[]
): AlgorithmInfo[] {
  if (!machine) return algorithms.filter((a) => a.available !== false);
  return algorithms.filter((a) => {
    if (a.available === false) return false;
    return isAlgorithmCompatibleWithMachine(a.id, machine.cut_type, algorithms);
  });
}
