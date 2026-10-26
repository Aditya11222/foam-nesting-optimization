import React, { useState, useEffect, useRef } from 'react';
import { BarChart3, Play } from 'lucide-react';
import { SCENE_TOKENS, TYPOGRAPHY_SCALE } from '../tokens';

/**
 * 600ms easeOut count-up hook triggered once per new value.
 * Respects prefers-reduced-motion: reduce.
 */
export function useCountUp(target: number, decimals: number = 1, durationMs: number = 600): string {
  const [displayValue, setDisplayValue] = useState<number>(target);
  const prevTargetRef = useRef<number>(target);

  useEffect(() => {
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReduced || prevTargetRef.current === target) {
      setDisplayValue(target);
      prevTargetRef.current = target;
      return;
    }

    const startValue = prevTargetRef.current;
    prevTargetRef.current = target;
    let startTime: number | null = null;
    let rafId: number;

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const progress = Math.min(1, elapsed / durationMs);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = startValue + (target - startValue) * eased;
      setDisplayValue(current);

      if (progress < 1) {
        rafId = requestAnimationFrame(animate);
      } else {
        setDisplayValue(target);
      }
    };

    rafId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafId);
  }, [target, durationMs]);

  return displayValue.toFixed(decimals);
}

/**
 * Purposeful Foam Block Slicing Loader:
 * Isometric foam bun SVG with a sweeping Terracotta cut line,
 * paired with algorithm name and elapsed seconds in IBM Plex Mono.
 */
export const FoamSlicingLoader: React.FC<{
  algorithmName: string;
  elapsedSeconds: number;
}> = ({ algorithmName, elapsedSeconds }) => {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center justify-center py-6 px-4 bg-raised/60 border border-hairline rounded-control text-center space-y-3"
    >
      <svg
        width="64"
        height="52"
        viewBox="0 0 64 52"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {/* Isometric Foam Bun Base */}
        <polygon
          points="32,4 58,15 58,37 32,48 6,37 6,15"
          fill={SCENE_TOKENS.bunShell}
          stroke={SCENE_TOKENS.bunEdge}
          strokeWidth="1.5"
        />
        {/* Top Face */}
        <polygon
          points="32,4 58,15 32,26 6,15"
          fill={SCENE_TOKENS.skinTrimFill}
          stroke={SCENE_TOKENS.bunEdge}
          strokeWidth="1"
        />
        {/* Vertical Spine */}
        <line
          x1="32"
          y1="26"
          x2="32"
          y2="48"
          stroke={SCENE_TOKENS.bunEdge}
          strokeWidth="1"
          strokeDasharray="2 2"
        />
        {/* Sweeping Terracotta Slicing Line */}
        <g className="slice-sweep-line">
          <line
            x1="4"
            y1="12"
            x2="60"
            y2="12"
            stroke={SCENE_TOKENS.cutPlaneFill}
            strokeWidth="2"
          />
          <circle cx="6" cy="12" r="2" fill={SCENE_TOKENS.cutPlaneFill} />
          <circle cx="58" cy="12" r="2" fill={SCENE_TOKENS.cutPlaneFill} />
        </g>
      </svg>

      <div className="space-y-1">
        <div className={`${TYPOGRAPHY_SCALE.monoData} font-medium text-ink`}>
          {algorithmName}, {elapsedSeconds.toFixed(1)} s
        </div>
        <div className="text-[12px] text-secondary">
          Evaluating 3D guillotine slicing tree and kerf allowances...
        </div>
      </div>
    </div>
  );
};

/**
 * Warm Skeleton Placeholder for KPI blocks, tables, and charts
 */
export const WarmSkeleton: React.FC<{ className?: string }> = ({
  className = 'h-6 w-full',
}) => {
  return <div className={`skeleton-warm ${className}`} aria-hidden="true" />;
};

/**
 * Inline 3-dot progress indicator for active button loading states
 */
export const InlineProgressDots: React.FC = () => (
  <span className="inline-flex items-center space-x-1" aria-hidden="true">
    <span className="w-1.5 h-1.5 rounded-full bg-current opacity-90 animate-pulse" />
    <span
      className="w-1.5 h-1.5 rounded-full bg-current opacity-60 animate-pulse"
      style={{ animationDelay: '150ms' }}
    />
    <span
      className="w-1.5 h-1.5 rounded-full bg-current opacity-30 animate-pulse"
      style={{ animationDelay: '300ms' }}
    />
  </span>
);

/**
 * Step 4 Empty State Placeholder
 */
export const Step4Placeholder: React.FC<{ onRunOptimization?: () => void }> = ({
  onRunOptimization,
}) => {
  return (
    <div className="bg-surface rounded-card border border-hairline shadow-card p-8 text-center">
      <div className="w-10 h-10 rounded-control bg-raised text-secondary flex items-center justify-center mx-auto mb-3 border border-hairline">
        <BarChart3 className="w-5 h-5 stroke-[1.5]" />
      </div>
      <h3 className={TYPOGRAPHY_SCALE.cardTitle + ' text-ink'}>
        Results, Cost Analytics & Shop-Floor Execution
      </h3>
      <p className="text-[14px] leading-[22px] text-secondary mt-1 max-w-md mx-auto">
        Run an optimization heuristic to generate volume reconciliation charts, cost estimates, and printable saw traveler sheets.
      </p>
      {onRunOptimization && (
        <div className="mt-4">
          <button
            type="button"
            onClick={onRunOptimization}
            className="btn-primary inline-flex items-center space-x-2 cursor-pointer"
          >
            <Play className="w-4 h-4 stroke-[1.5]" />
            <span>Run optimization</span>
          </button>
        </div>
      )}
    </div>
  );
};
