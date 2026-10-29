import type { OptimizationResult } from '../types.ts';

export const CU_FT_IN_CU_IN = 1728.0;

export interface MachineEfficiencyMetric {
  key: 'kerf' | 'cuts' | 'time';
  name: string;
  nameEs: string;
  unit: string;
  unitEs: string;
  activeValue: number;
  activeDisplay: string;
  otherValue: number | null;
  otherDisplay: string | null;
  deltaPct: number | null;
  deltaDisplay: string;
  deltaDisplayEs: string;
  deltaStatus: 'improvement' | 'worse' | 'neutral' | 'uncompared';
  activeRatio: number;
  otherRatio: number | null;
}

export interface MachineEfficiencyReport {
  activeMachineName: string;
  activeCutType: 'guillotine' | 'free' | string;
  activeKerfThickness: number;
  otherMachineName: string;
  otherCutType: 'guillotine' | 'free' | string;
  hasComparison: boolean;
  metrics: MachineEfficiencyMetric[];
  summaryTextEn: string;
  summaryTextEs: string;
  statusBadgeEn: string;
  statusBadgeEs: string;
}

/**
 * Computes machine efficiency metrics (Kerf volume, cut count, saw time)
 * strictly comparing real empirical results if an alternative machine result
 * exists in comparisonResults. If not run, returns honest uncompared state.
 */
export function computeMachineEfficiency(
  currentResult: OptimizationResult,
  comparisonResults?: OptimizationResult[] | null
): MachineEfficiencyReport {
  const currentMachine = currentResult.machine || {
    id: 'saw-g1',
    name: 'Guillotine Saw G1',
    cut_type: 'guillotine',
    kerf: 0.125,
    max_cut_height: 48,
    automation: 'manual' as const,
    preferred_direction: 'x',
  };

  const currentCutType = currentMachine.cut_type || 'guillotine';
  const activeMachineName = currentMachine.name || (currentCutType === 'guillotine' ? 'Guillotine Saw' : 'Waterjet Cutter');
  const activeKerfThickness = (currentMachine as any).kerf ?? (currentCutType === 'guillotine' ? 0.125 : 0.0625);

  // Look for a real run on a different cut type in comparisonResults
  let otherResult: OptimizationResult | null = null;
  if (Array.isArray(comparisonResults) && comparisonResults.length > 0) {
    const candidate = comparisonResults.find((r) => {
      if (!r || !r.machine) return false;
      return (
        r.machine.cut_type !== currentCutType ||
        r.machine.id !== currentMachine.id
      );
    });
    if (candidate) {
      otherResult = candidate;
    }
  }

  const hasComparison = otherResult !== null;
  const otherCutType = hasComparison
    ? (otherResult!.machine?.cut_type || (currentCutType === 'guillotine' ? 'free' : 'guillotine'))
    : (currentCutType === 'guillotine' ? 'free' : 'guillotine');

  const otherMachineName = hasComparison
    ? (otherResult!.machine?.name || (otherCutType === 'free' ? 'CNC Waterjet' : 'Guillotine Saw'))
    : (currentCutType === 'guillotine' ? 'CNC Waterjet' : 'Guillotine Saw');

  // Metric 1: Kerf Volume Loss
  const activeKerfCuIn = currentResult.total_kerf_volume ?? 0;
  const activeKerfCuFt = activeKerfCuIn / CU_FT_IN_CU_IN;
  const otherKerfCuIn = hasComparison ? (otherResult!.total_kerf_volume ?? 0) : null;
  const otherKerfCuFt = otherKerfCuIn !== null ? otherKerfCuIn / CU_FT_IN_CU_IN : null;

  let kerfDeltaPct: number | null = null;
  let kerfDeltaDisplay = `Run on ${otherMachineName} to compare`;
  let kerfDeltaDisplayEs = `Ejecutar en ${otherMachineName} para comparar`;
  let kerfStatus: 'improvement' | 'worse' | 'neutral' | 'uncompared' = 'uncompared';

  if (hasComparison && otherKerfCuIn !== null) {
    kerfDeltaPct = ((otherKerfCuIn - activeKerfCuIn) / Math.max(1, activeKerfCuIn)) * 100;
    if (Math.abs(kerfDeltaPct) < 0.5) {
      kerfStatus = 'neutral';
      kerfDeltaDisplay = 'No difference';
      kerfDeltaDisplayEs = 'Sin diferencia';
    } else if (otherKerfCuIn < activeKerfCuIn) {
      kerfStatus = 'improvement';
      kerfDeltaDisplay = `−${Math.abs(kerfDeltaPct).toFixed(1)}% kerf on ${otherMachineName}`;
      kerfDeltaDisplayEs = `−${Math.abs(kerfDeltaPct).toFixed(1)}% kerf en ${otherMachineName}`;
    } else {
      kerfStatus = 'worse';
      kerfDeltaDisplay = `+${Math.abs(kerfDeltaPct).toFixed(1)}% kerf on ${otherMachineName}`;
      kerfDeltaDisplayEs = `+${Math.abs(kerfDeltaPct).toFixed(1)}% kerf en ${otherMachineName}`;
    }
  }

  // Metric 2: Total Cut Count
  const activeCuts = currentResult.total_cuts_count ?? 0;
  const otherCuts = hasComparison ? (otherResult!.total_cuts_count ?? 0) : null;

  let cutsDeltaPct: number | null = null;
  let cutsDeltaDisplay = `Run on ${otherMachineName} to compare`;
  let cutsDeltaDisplayEs = `Ejecutar en ${otherMachineName} para comparar`;
  let cutsStatus: 'improvement' | 'worse' | 'neutral' | 'uncompared' = 'uncompared';

  if (hasComparison && otherCuts !== null) {
    const diff = otherCuts - activeCuts;
    cutsDeltaPct = ((otherCuts - activeCuts) / Math.max(1, activeCuts)) * 100;
    if (diff === 0) {
      cutsStatus = 'neutral';
      cutsDeltaDisplay = 'Same cut count';
      cutsDeltaDisplayEs = 'Mismo número de cortes';
    } else if (diff < 0) {
      cutsStatus = 'improvement';
      cutsDeltaDisplay = `−${Math.abs(diff)} cuts on ${otherMachineName}`;
      cutsDeltaDisplayEs = `−${Math.abs(diff)} cortes en ${otherMachineName}`;
    } else {
      cutsStatus = 'worse';
      cutsDeltaDisplay = `+${Math.abs(diff)} cuts on ${otherMachineName}`;
      cutsDeltaDisplayEs = `+${Math.abs(diff)} cortes en ${otherMachineName}`;
    }
  }

  // Metric 3: Estimated Saw Time
  const activeSawTime = currentResult.estimated_saw_time_minutes ?? 0;
  const otherSawTime = hasComparison ? (otherResult!.estimated_saw_time_minutes ?? 0) : null;

  let timeDeltaPct: number | null = null;
  let timeDeltaDisplay = `Run on ${otherMachineName} to compare`;
  let timeDeltaDisplayEs = `Ejecutar en ${otherMachineName} para comparar`;
  let timeStatus: 'improvement' | 'worse' | 'neutral' | 'uncompared' = 'uncompared';

  if (hasComparison && otherSawTime !== null) {
    timeDeltaPct = ((otherSawTime - activeSawTime) / Math.max(0.1, activeSawTime)) * 100;
    if (Math.abs(timeDeltaPct) < 0.5) {
      timeStatus = 'neutral';
      timeDeltaDisplay = 'Same saw time';
      timeDeltaDisplayEs = 'Mismo tiempo';
    } else if (otherSawTime < activeSawTime) {
      timeStatus = 'improvement';
      timeDeltaDisplay = `−${Math.abs(timeDeltaPct).toFixed(1)}% time on ${otherMachineName}`;
      timeDeltaDisplayEs = `−${Math.abs(timeDeltaPct).toFixed(1)}% tiempo en ${otherMachineName}`;
    } else {
      timeStatus = 'worse';
      timeDeltaDisplay = `+${Math.abs(timeDeltaPct).toFixed(1)}% time on ${otherMachineName}`;
      timeDeltaDisplayEs = `+${Math.abs(timeDeltaPct).toFixed(1)}% tiempo en ${otherMachineName}`;
    }
  }

  // Scale ratios for bars
  const kerfMax = Math.max(activeKerfCuIn, otherKerfCuIn ?? 0, 1);
  const cutsMax = Math.max(activeCuts, otherCuts ?? 0, 1);
  const timeMax = Math.max(activeSawTime, otherSawTime ?? 0, 1);

  const metrics: MachineEfficiencyMetric[] = [
    {
      key: 'kerf',
      name: 'Kerf Volume Loss',
      nameEs: 'Pérdida de Volumen por Kerf',
      unit: 'ft³ (cu in)',
      unitEs: 'ft³ (pulg³)',
      activeValue: activeKerfCuIn,
      activeDisplay: `${activeKerfCuFt.toFixed(1)} ft³ (${Math.round(activeKerfCuIn).toLocaleString()} cu in)`,
      otherValue: otherKerfCuIn,
      otherDisplay: otherKerfCuIn !== null ? `${otherKerfCuFt!.toFixed(1)} ft³ (${Math.round(otherKerfCuIn).toLocaleString()} cu in)` : null,
      deltaPct: kerfDeltaPct,
      deltaDisplay: kerfDeltaDisplay,
      deltaDisplayEs: kerfDeltaDisplayEs,
      deltaStatus: kerfStatus,
      activeRatio: hasComparison ? activeKerfCuIn / kerfMax : 1.0,
      otherRatio: hasComparison && otherKerfCuIn !== null ? otherKerfCuIn / kerfMax : null,
    },
    {
      key: 'cuts',
      name: 'Total Cut Count',
      nameEs: 'Conteo Total de Cortes',
      unit: 'cuts',
      unitEs: 'cortes',
      activeValue: activeCuts,
      activeDisplay: `${activeCuts.toLocaleString()} cuts`,
      otherValue: otherCuts,
      otherDisplay: otherCuts !== null ? `${otherCuts.toLocaleString()} cuts` : null,
      deltaPct: cutsDeltaPct,
      deltaDisplay: cutsDeltaDisplay,
      deltaDisplayEs: cutsDeltaDisplayEs,
      deltaStatus: cutsStatus,
      activeRatio: hasComparison ? activeCuts / cutsMax : 1.0,
      otherRatio: hasComparison && otherCuts !== null ? otherCuts / cutsMax : null,
    },
    {
      key: 'time',
      name: 'Estimated Saw Time',
      nameEs: 'Tiempo Estimado de Sierra',
      unit: 'minutes',
      unitEs: 'minutos',
      activeValue: activeSawTime,
      activeDisplay: `${Math.round(activeSawTime)} min`,
      otherValue: otherSawTime,
      otherDisplay: otherSawTime !== null ? `${Math.round(otherSawTime)} min` : null,
      deltaPct: timeDeltaPct,
      deltaDisplay: timeDeltaDisplay,
      deltaDisplayEs: timeDeltaDisplayEs,
      deltaStatus: timeStatus,
      activeRatio: hasComparison ? activeSawTime / timeMax : 1.0,
      otherRatio: hasComparison && otherSawTime !== null ? otherSawTime / timeMax : null,
    },
  ];

  // Data-driven summaries
  let summaryTextEn = '';
  let summaryTextEs = '';
  let statusBadgeEn = '';
  let statusBadgeEs = '';

  if (hasComparison) {
    statusBadgeEn = 'Real comparison (empirical runs)';
    statusBadgeEs = 'Comparación real (ejecuciones empíricas)';

    const kerfPhrase = kerfDeltaPct !== null
      ? (kerfDeltaPct < 0 ? `${Math.abs(kerfDeltaPct).toFixed(1)}% less kerf loss` : `${Math.abs(kerfDeltaPct).toFixed(1)}% more kerf loss`)
      : 'similar kerf';
    const kerfPhraseEs = kerfDeltaPct !== null
      ? (kerfDeltaPct < 0 ? `${Math.abs(kerfDeltaPct).toFixed(1)}% menos pérdida por kerf` : `${Math.abs(kerfDeltaPct).toFixed(1)}% más pérdida por kerf`)
      : 'kerf similar';

    const cutsPhrase = (otherCuts !== null && activeCuts !== null)
      ? (otherCuts < activeCuts ? `${activeCuts - otherCuts} fewer cuts` : `${otherCuts - activeCuts} additional cuts`)
      : 'similar cuts';
    const cutsPhraseEs = (otherCuts !== null && activeCuts !== null)
      ? (otherCuts < activeCuts ? `${activeCuts - otherCuts} cortes menos` : `${otherCuts - activeCuts} cortes adicionales`)
      : 'cortes similares';

    const timePhrase = timeDeltaPct !== null
      ? (timeDeltaPct < 0 ? `${Math.abs(timeDeltaPct).toFixed(1)}% faster runtime` : `+${Math.abs(timeDeltaPct).toFixed(1)}% runtime`)
      : 'similar runtime';
    const timePhraseEs = timeDeltaPct !== null
      ? (timeDeltaPct < 0 ? `${Math.abs(timeDeltaPct).toFixed(1)}% más rápido` : `+${Math.abs(timeDeltaPct).toFixed(1)}% más tiempo`)
      : 'tiempo similar';

    summaryTextEn = `Empirical comparison between ${activeMachineName} and ${otherMachineName}: ${otherMachineName} resulted in ${kerfPhrase}, ${cutsPhrase}, and ${timePhrase}.`;
    summaryTextEs = `Comparación empírica entre ${activeMachineName} y ${otherMachineName}: ${otherMachineName} resultó en ${kerfPhraseEs}, ${cutsPhraseEs} y ${timePhraseEs}.`;
  } else {
    statusBadgeEn = 'Awaiting alternative machine run';
    statusBadgeEs = 'Esperando ejecución de máquina alternativa';

    const cutDesc = currentCutType === 'guillotine'
      ? 'straight through-cuts with 0.125″ blade kerf'
      : 'continuous contouring with 0.0625″ stream kerf';
    const cutDescEs = currentCutType === 'guillotine'
      ? 'cortes directos con kerf de sierra de 0.125″'
      : 'contorno continuo con kerf de chorro de 0.0625″';

    summaryTextEn = `Active run uses ${activeMachineName} (${cutDesc}). Run optimization on ${otherMachineName} to measure empirical kerf and speed trade-offs.`;
    summaryTextEs = `La ejecución activa utiliza ${activeMachineName} (${cutDescEs}). Ejecute la optimización en ${otherMachineName} para medir las compensaciones empíricas de kerf y velocidad.`;
  }

  return {
    activeMachineName,
    activeCutType: currentCutType,
    activeKerfThickness,
    otherMachineName,
    otherCutType,
    hasComparison,
    metrics,
    summaryTextEn,
    summaryTextEs,
    statusBadgeEn,
    statusBadgeEs,
  };
}
