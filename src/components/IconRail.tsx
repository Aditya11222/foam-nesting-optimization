import React from 'react';
import { Sliders, Cpu, Layers, BarChart3 } from 'lucide-react';

interface IconRailProps {
  activeStep: number;
  maxReachableStep: number;
  onSelectStep: (step: number) => void;
}

const RAIL_STEPS = [
  { id: 1, label: '1. Setup & Data Import', icon: Sliders },
  { id: 2, label: '2. Algorithm Selection & Placement', icon: Cpu },
  { id: 3, label: '3. Cutting Plan & 3D Visualization', icon: Layers },
  { id: 4, label: '4. Results & Execution', icon: BarChart3 },
];

export const IconRail: React.FC<IconRailProps> = ({
  activeStep,
  maxReachableStep,
  onSelectStep,
}) => {
  return (
    <aside
      aria-label="Workflow Step Shortcuts"
      className="hidden md:flex w-14 bg-surface border-r border-hairline flex-col items-center py-4 space-y-3 shrink-0 select-none no-print"
    >
      {RAIL_STEPS.map((step) => {
        const Icon = step.icon;
        const isActive = activeStep === step.id;
        const isReachable = step.id <= maxReachableStep;

        return (
          <button
            key={step.id}
            type="button"
            disabled={!isReachable}
            onClick={() => isReachable && onSelectStep(step.id)}
            title={
              isReachable
                ? step.label
                : `${step.label} — Run optimization first to unlock`
            }
            aria-label={step.label}
            aria-current={isActive ? 'step' : undefined}
            className={`w-10 h-10 rounded-control flex items-center justify-center transition duration-150 ${
              isActive
                ? 'bg-cocoa-tint text-cocoa border border-strong font-semibold cursor-pointer'
                : isReachable
                ? 'text-secondary hover:bg-raised hover:text-ink cursor-pointer'
                : 'text-muted opacity-40 cursor-not-allowed'
            }`}
          >
            <Icon className="w-4 h-4 stroke-[1.5]" />
          </button>
        );
      })}
    </aside>
  );
};
