"""
Machine and optimization strategy registry.
Guillotine is fully implemented.
Free (waterjet/CNC contour nesting) is registered as a stub returning a clear 'not implemented' status.
"""

from typing import Dict, Any, Callable
from ..domain.models import MachineCutType, MachineProfile


class StrategyNotImplementedError(NotImplementedError):
    pass


class OptimizationStrategyRegistry:
    def __init__(self):
        self._strategies: Dict[MachineCutType, Callable] = {}
        self._register_defaults()

    def _register_defaults(self):
        # Guillotine is registered when guillotine module is loaded
        pass

    def register(self, cut_type: MachineCutType, solver_func: Callable):
        self._strategies[cut_type] = solver_func

    def get_strategy(self, machine: MachineProfile) -> Callable:
        if machine.cut_type == MachineCutType.FREE:
            raise StrategyNotImplementedError(
                f"Machine '{machine.name}' has cut_type '{machine.cut_type.value}' (waterjet/CNC contour). "
                "Non-guillotine free nesting is registered as a future capability and is not implemented in the MVP. "
                "Please select a guillotine saw profile."
            )
        
        solver = self._strategies.get(machine.cut_type)
        if not solver:
            raise ValueError(f"No optimization solver registered for cut_type: {machine.cut_type}")
        return solver


registry = OptimizationStrategyRegistry()
