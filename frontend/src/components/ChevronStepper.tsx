import React from 'react';
import { Check, ChevronRight } from 'lucide-react';

export interface StepItem {
  id: number;
  label: string;
  description?: string;
}

interface ChevronStepperProps {
  steps: StepItem[];
  activeStep: number;
  maxReachableStep?: number;
  onStepClick: (stepId: number) => void;
}

export const ChevronStepper: React.FC<ChevronStepperProps> = ({
  steps,
  activeStep,
  maxReachableStep = 4,
  onStepClick,
}) => {
  return (
    <nav
      aria-label="Optimization Workflow Steps"
      className="w-full bg-white border-b border-slate-200 px-4 py-2 select-none overflow-x-auto shadow-2xs"
    >
      <div className="flex items-center min-w-[720px] max-w-7xl mx-auto space-x-1 sm:space-x-2">
        {steps.map((step, idx) => {
          const isCompleted = step.id < activeStep;
          const isActive = step.id === activeStep;
          const isClickable = step.id <= maxReachableStep;

          return (
            <React.Fragment key={step.id}>
              {/* Step Segment */}
              <button
                type="button"
                onClick={() => isClickable && onStepClick(step.id)}
                disabled={!isClickable}
                className={`flex-1 flex items-center px-3 py-2 rounded-lg text-left transition border ${
                  isActive
                    ? 'bg-blue-50/90 border-blue-200 text-blue-900 shadow-2xs'
                    : isCompleted
                    ? 'bg-slate-50/70 hover:bg-slate-100/90 border-slate-200/80 text-slate-800 cursor-pointer'
                    : 'bg-white border-transparent text-slate-400 cursor-not-allowed opacity-60'
                }`}
              >
                {/* Status Badge */}
                <div className="mr-2.5 shrink-0">
                  {isCompleted ? (
                    <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs ring-1 ring-emerald-300">
                      <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                    </div>
                  ) : isActive ? (
                    <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs ring-2 ring-blue-300 shadow-xs">
                      {step.id}
                    </div>
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center font-semibold text-xs">
                      {step.id}
                    </div>
                  )}
                </div>

                {/* Step Title & Subtitle */}
                <div className="flex flex-col min-w-0">
                  <span
                    className={`text-xs font-semibold truncate ${
                      isActive
                        ? 'text-blue-900 font-bold'
                        : isCompleted
                        ? 'text-slate-800'
                        : 'text-slate-400'
                    }`}
                  >
                    {step.label}
                  </span>
                  {step.description && (
                    <span className="text-[10px] text-slate-400 truncate hidden xl:inline">
                      {step.description}
                    </span>
                  )}
                </div>
              </button>

              {/* Chevron arrow connector between steps */}
              {idx < steps.length - 1 && (
                <div className="text-slate-300 shrink-0 px-0.5">
                  <ChevronRight className="w-4 h-4" />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </nav>
  );
};
