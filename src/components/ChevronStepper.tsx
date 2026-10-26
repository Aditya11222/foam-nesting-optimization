import React from 'react';
import { Check, ChevronRight } from 'lucide-react';

export interface StepItem {
  id: number;
  label: string;
  description: string;
}

interface ChevronStepperProps {
  steps: StepItem[];
  activeStep: number;
  maxReachableStep: number;
  onStepClick: (stepId: number) => void;
}

export const ChevronStepper: React.FC<ChevronStepperProps> = ({
  steps,
  activeStep,
  maxReachableStep,
  onStepClick,
}) => {
  return (
    <nav
      aria-label="Optimization Workflow Progress"
      className="bg-surface border-b border-hairline px-6 py-3 overflow-x-auto no-print"
    >
      <ol className="max-w-workbench mx-auto flex items-center justify-between min-w-[680px] gap-4">
        {steps.map((step, idx) => {
          const isActive = step.id === activeStep;
          const isCompleted = step.id < activeStep || (step.id <= maxReachableStep && step.id < activeStep);
          const isReachable = step.id <= maxReachableStep;

          return (
            <React.Fragment key={step.id}>
              <li className="flex-1 min-w-0">
                <button
                  type="button"
                  disabled={!isReachable}
                  onClick={() => isReachable && onStepClick(step.id)}
                  title={
                    isReachable
                      ? `${step.label} — ${step.description}`
                      : 'Run optimization first to unlock this step'
                  }
                  aria-current={isActive ? 'step' : undefined}
                  className={`w-full flex items-center space-x-3 px-3 py-2 rounded-control text-left transition duration-150 ${
                    isActive
                      ? 'bg-cocoa-tint/70 border border-strong cursor-pointer'
                      : isReachable
                      ? 'hover:bg-raised/70 border border-transparent cursor-pointer'
                      : 'opacity-40 cursor-not-allowed border border-transparent'
                  }`}
                >
                  {/* Numbered Circle / Sage Check */}
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-[12px] font-mono font-medium shrink-0 transition ${
                      isActive
                        ? 'bg-cocoa text-surface ring-2 ring-cocoa-tint'
                        : isCompleted
                        ? 'bg-sage-tint text-sage border border-sage'
                        : 'bg-surface text-secondary border border-strong'
                    }`}
                  >
                    {isCompleted ? (
                      <Check className="w-3.5 h-3.5 stroke-[2]" />
                    ) : (
                      step.id
                    )}
                  </span>

                  {/* Step Title & Subtitle */}
                  <div className="min-w-0 flex-1">
                    <div
                      className={`text-[14px] leading-[20px] truncate ${
                        isActive ? 'font-semibold text-ink' : 'font-medium text-ink'
                      }`}
                    >
                      {step.label}
                    </div>
                    <div className="text-[12px] leading-[16px] text-secondary truncate">
                      {step.description}
                    </div>
                  </div>
                </button>
              </li>

              {idx < steps.length - 1 && (
                <li aria-hidden="true" className="text-muted shrink-0">
                  <ChevronRight className="w-4 h-4 stroke-[1.5]" />
                </li>
              )}
            </React.Fragment>
          );
        })}
      </ol>
    </nav>
  );
};
