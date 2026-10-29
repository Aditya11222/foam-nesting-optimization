"""
Machine and optimization strategy registry.
Maintains backward compatibility for machine cut types (guillotine vs free),
and provides AlgorithmRegistry for nesting algorithms (BFD, FFD, SA, Free Nesting).
"""

import json
from pathlib import Path
from typing import Dict, Any, Callable, List
from ..domain.models import MachineCutType, MachineProfile, AlgorithmInfo
from .strategies import (
    NestingStrategy,
    BestFitDecreasingStrategy,
    FirstFitDecreasingStrategy,
    SimulatedAnnealingStrategy,
)
from .free_nesting import FreeNestingStrategy
from ..engine.ortools.block_assignment import OrtBlockAssignmentStrategy
from ..engine.ortools.pattern_selection import OrtPatternSelectionStrategy


def load_compatibility_config() -> Dict[str, List[str]]:
    """Loads shared algorithm compatibility configuration from config/algorithm_compatibility.json."""
    candidates = [
        Path(__file__).resolve().parent.parent.parent.parent / "config" / "algorithm_compatibility.json",
        Path(__file__).resolve().parent.parent.parent / "config" / "algorithm_compatibility.json",
        Path.cwd() / "config" / "algorithm_compatibility.json",
    ]
    for c in candidates:
        if c.exists():
            try:
                with open(c, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                pass
    return {
        "best_fit_decreasing": ["guillotine"],
        "first_fit_decreasing": ["guillotine"],
        "simulated_annealing": ["guillotine"],
        "ortools_block_assignment": ["guillotine"],
        "ortools_pattern_selection": ["guillotine"],
        "free_nesting_heuristic": ["free"],
    }


class StrategyNotImplementedError(NotImplementedError):
    pass


class OptimizationStrategyRegistry:
    """Legacy registry for MachineCutType compatibility."""
    def __init__(self):
        self._strategies: Dict[MachineCutType, Callable] = {}

    def register(self, cut_type: MachineCutType, solver_func: Callable):
        self._strategies[cut_type] = solver_func

    def get_strategy(self, machine: MachineProfile) -> Callable:
        solver = self._strategies.get(machine.cut_type)
        if not solver:
            raise ValueError(f"No optimization solver registered for cut_type: {machine.cut_type}")
        return solver


class AlgorithmRegistry:
    """Registry managing available 3D nesting algorithms."""
    def __init__(self):
        self._algorithms: Dict[str, NestingStrategy] = {}
        self._register_defaults()

    def _register_defaults(self):
        compat = load_compatibility_config()
        strats = [
            BestFitDecreasingStrategy(),
            FirstFitDecreasingStrategy(),
            SimulatedAnnealingStrategy(),
            FreeNestingStrategy(),
            OrtBlockAssignmentStrategy(),
            OrtPatternSelectionStrategy(),
        ]
        for s in strats:
            if s.info.id in compat:
                s.info.supported_cut_types = compat[s.info.id]
            self.register(s)

    def register(self, strategy: NestingStrategy):
        self._algorithms[strategy.info.id] = strategy

    def get(self, algorithm_id: str) -> NestingStrategy:
        strategy = self._algorithms.get(algorithm_id)
        if not strategy:
            valid_ids = list(self._algorithms.keys())
            raise ValueError(
                f"Unknown algorithm_id '{algorithm_id}'. Supported algorithms: {valid_ids}"
            )
        return strategy

    def list_algorithms(self) -> List[AlgorithmInfo]:
        return [strat.info for strat in self._algorithms.values()]

    def get_all(self) -> List[NestingStrategy]:
        return list(self._algorithms.values())


# Default singleton instances
registry = OptimizationStrategyRegistry()
_free_strat = FreeNestingStrategy()
registry.register(MachineCutType.FREE, _free_strat.solve)

algorithm_registry = AlgorithmRegistry()
