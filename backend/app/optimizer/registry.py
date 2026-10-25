"""
Machine and optimization strategy registry.
Maintains backward compatibility for machine cut types (guillotine vs free),
and provides AlgorithmRegistry for nesting algorithms (BFD, FFD, SA, Free Nesting).
"""

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
        self.register(BestFitDecreasingStrategy())
        self.register(FirstFitDecreasingStrategy())
        self.register(SimulatedAnnealingStrategy())
        self.register(FreeNestingStrategy())
        self.register(OrtBlockAssignmentStrategy())
        self.register(OrtPatternSelectionStrategy())

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
