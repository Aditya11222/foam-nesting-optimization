import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ALGORITHM_COMPATIBILITY,
  isAlgorithmCompatibleWithMachine,
  getIncompatibilityReason,
  getRecommendedCompatibleAlgorithm,
  getCompatibleAlgorithmsForMachine,
} from '../compatibility.ts';
import type { MachineProfile, AlgorithmInfo, IncompatibleAlgorithmMachineError } from '../../types.ts';
import { OptimizationApiError } from '../../api.ts';

const mockGuillotineMachine: MachineProfile = {
  id: 'saw-g2',
  name: 'Saw Station 2 — Vertical Slicer',
  cut_type: 'guillotine',
  max_cut_height: 52.0,
  kerf: 0.125,
  automation: 'rotating',
  preferred_direction: 'Z',
};

const mockFreeMachine: MachineProfile = {
  id: 'saw-wire-cnc',
  name: 'Fast-Wire Contour Cutter (CNC)',
  cut_type: 'free',
  max_cut_height: 48.0,
  kerf: 0.0625,
  automation: 'CNC',
  preferred_direction: 'X',
};

const mockAlgorithms: AlgorithmInfo[] = [
  {
    id: 'best_fit_decreasing',
    name: 'Best-Fit Decreasing (BFD)',
    description: 'BFD packing',
    speed_tag: 'Fast',
    supported_cut_types: ['guillotine'],
  },
  {
    id: 'first_fit_decreasing',
    name: 'First-Fit Decreasing (FFD)',
    description: 'FFD packing',
    speed_tag: 'Fast',
    supported_cut_types: ['guillotine'],
  },
  {
    id: 'simulated_annealing',
    name: 'Simulated Annealing (SA)',
    description: 'SA search',
    speed_tag: 'Iterative',
    supported_cut_types: ['guillotine'],
  },
  {
    id: 'ortools_block_assignment',
    name: 'OR-Tools Block Assignment',
    description: 'CP-SAT allocation',
    speed_tag: 'Balanced',
    supported_cut_types: ['guillotine'],
  },
  {
    id: 'ortools_pattern_selection',
    name: 'OR-Tools Pattern Selection',
    description: 'Pattern pool',
    speed_tag: 'Fast',
    supported_cut_types: ['guillotine'],
  },
  {
    id: 'free_nesting_heuristic',
    name: '3D Free Contour Nesting (Waterjet CNC)',
    description: '3D maximal empty box',
    speed_tag: 'Fast',
    supported_cut_types: ['free'],
  },
];

describe('Algorithm-Machine Compatibility Matrix', () => {
  it('loads shared algorithm_compatibility.json configuration', () => {
    assert.ok(ALGORITHM_COMPATIBILITY);
    assert.deepEqual(ALGORITHM_COMPATIBILITY['free_nesting_heuristic'], ['free']);
    assert.deepEqual(ALGORITHM_COMPATIBILITY['best_fit_decreasing'], ['guillotine']);
    assert.deepEqual(ALGORITHM_COMPATIBILITY['ortools_block_assignment'], ['guillotine']);
  });

  it('correctly validates guillotine machine compatibility', () => {
    // Guillotine machine supports guillotine algorithms
    assert.equal(isAlgorithmCompatibleWithMachine('best_fit_decreasing', 'guillotine', mockAlgorithms), true);
    assert.equal(isAlgorithmCompatibleWithMachine('first_fit_decreasing', 'guillotine', mockAlgorithms), true);
    assert.equal(isAlgorithmCompatibleWithMachine('ortools_block_assignment', 'guillotine', mockAlgorithms), true);
    assert.equal(isAlgorithmCompatibleWithMachine('simulated_annealing', 'guillotine', mockAlgorithms), true);

    // Guillotine machine does NOT support free nesting
    assert.equal(isAlgorithmCompatibleWithMachine('free_nesting_heuristic', 'guillotine', mockAlgorithms), false);
  });

  it('correctly validates free/contour machine compatibility', () => {
    // Free machine supports free nesting
    assert.equal(isAlgorithmCompatibleWithMachine('free_nesting_heuristic', 'free', mockAlgorithms), true);

    // Free machine does NOT support guillotine algorithms
    assert.equal(isAlgorithmCompatibleWithMachine('best_fit_decreasing', 'free', mockAlgorithms), false);
    assert.equal(isAlgorithmCompatibleWithMachine('ortools_block_assignment', 'free', mockAlgorithms), false);
  });

  it('generates clear, actionable one-line incompatibility reasons', () => {
    const reasonFreeOnGuillotine = getIncompatibilityReason(
      'free_nesting_heuristic',
      mockGuillotineMachine,
      mockAlgorithms
    );
    assert.ok(reasonFreeOnGuillotine);
    assert.match(reasonFreeOnGuillotine, /Needs a waterjet \/ wire \/ CNC machine/i);
    assert.match(reasonFreeOnGuillotine, /Current machine: Saw Station 2 — Vertical Slicer \(guillotine\)/i);

    const reasonGuillotineOnFree = getIncompatibilityReason(
      'best_fit_decreasing',
      mockFreeMachine,
      mockAlgorithms
    );
    assert.ok(reasonGuillotineOnFree);
    assert.match(reasonGuillotineOnFree, /Guillotine-only algorithm/i);
    assert.match(reasonGuillotineOnFree, /Current machine is a contour cutter: Fast-Wire Contour Cutter \(CNC\) \(free\)/i);

    // Compatible pair returns null reason
    const reasonCompatible = getIncompatibilityReason(
      'best_fit_decreasing',
      mockGuillotineMachine,
      mockAlgorithms
    );
    assert.equal(reasonCompatible, null);
  });

  it('switching machine re-validates and moves to recommended compatible algorithm', () => {
    // If on guillotine with free nesting, moves to compatible guillotine algorithm
    const recForGuillotine = getRecommendedCompatibleAlgorithm(
      mockGuillotineMachine,
      'free_nesting_heuristic',
      mockAlgorithms
    );
    assert.equal(recForGuillotine, 'ortools_block_assignment');

    // If on free machine with guillotine algorithm, moves to free_nesting_heuristic
    const recForFree = getRecommendedCompatibleAlgorithm(
      mockFreeMachine,
      'best_fit_decreasing',
      mockAlgorithms
    );
    assert.equal(recForFree, 'free_nesting_heuristic');

    // If already compatible, keeps the current algorithm
    const recAlreadyCompatible = getRecommendedCompatibleAlgorithm(
      mockGuillotineMachine,
      'first_fit_decreasing',
      mockAlgorithms
    );
    assert.equal(recAlreadyCompatible, 'first_fit_decreasing');
  });

  it('handles structured 422 incompatibility payload correctly without alert', () => {
    const errorPayload: IncompatibleAlgorithmMachineError = {
      code: 'ALGORITHM_MACHINE_INCOMPATIBLE',
      machine_id: 'saw-g1',
      algorithm_id: 'free_nesting_heuristic',
      supported_cut_types: ['free'],
      suggested_algorithms: ['ortools_block_assignment', 'best_fit_decreasing'],
      detail: 'Machine is not compatible',
    };

    const apiError = new OptimizationApiError('Selected machine and algorithm are incompatible.', 422, errorPayload);
    assert.equal(apiError.status, 422);
    assert.ok(apiError.incompatibleData);
    assert.equal(apiError.incompatibleData.code, 'ALGORITHM_MACHINE_INCOMPATIBLE');
    assert.equal(apiError.incompatibleData.machine_id, 'saw-g1');
    assert.equal(apiError.incompatibleData.algorithm_id, 'free_nesting_heuristic');
    assert.deepEqual(apiError.incompatibleData.suggested_algorithms, [
      'ortools_block_assignment',
      'best_fit_decreasing',
    ]);
  });

  it('filters the strategy list strictly by machine cut type and excludes incompatible options entirely', () => {
    // Guillotine machine must only get guillotine algorithms, omitting free_nesting_heuristic
    const forGuillotine = getCompatibleAlgorithmsForMachine(mockGuillotineMachine, mockAlgorithms);
    assert.ok(forGuillotine.length > 0);
    assert.ok(forGuillotine.every((a) => a.id !== 'free_nesting_heuristic'), 'Free nesting must be excluded from guillotine list');
    assert.ok(forGuillotine.some((a) => a.id === 'best_fit_decreasing'));
    assert.ok(forGuillotine.some((a) => a.id === 'first_fit_decreasing'));

    // Free machine must only get free algorithms, omitting all guillotine ones
    const forFree = getCompatibleAlgorithmsForMachine(mockFreeMachine, mockAlgorithms);
    assert.equal(forFree.length, 1);
    assert.equal(forFree[0].id, 'free_nesting_heuristic');

    // Missing package (available === false) must be omitted
    const withUnavailable = [
      ...mockAlgorithms,
      {
        id: 'missing_algo',
        name: 'Missing Algo',
        description: 'Missing package',
        speed_tag: 'slow',
        supported_cut_types: ['guillotine'],
        available: false,
      },
    ];
    const filteredUnavailable = getCompatibleAlgorithmsForMachine(mockGuillotineMachine, withUnavailable);
    assert.ok(filteredUnavailable.every((a) => a.id !== 'missing_algo'));
  });
});
