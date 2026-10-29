import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Info,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ArrowRight,
  FileCode2,
} from 'lucide-react';
import type { PartItem } from '../types';
import {
  computeRemnantScoringExplanation,
  DEFAULT_REMNANT_SCORING_CONFIG,
  type RemnantScoringResult,
} from '../services/remnantScoring';

const STORAGE_KEY = 'tatras_remnant_scoring_explanation_expanded';

interface RemnantScoringExplanationBlockProps {
  scoredRemnants: RemnantScoringResult[];
  activeParts: PartItem[];
  isStale?: boolean;
  selectedRemnantCode?: string | null;
  onCloseBreakdown?: () => void;
}

export const RemnantScoringExplanationBlock: React.FC<RemnantScoringExplanationBlockProps> = ({
  scoredRemnants,
  activeParts,
  isStale = false,
  selectedRemnantCode = null,
  onCloseBreakdown,
}) => {
  const { i18n } = useTranslation();
  const isEs = i18n.language?.startsWith('es');
  const breakdownPanelRef = React.useRef<HTMLDivElement>(null);

  // Persistence of expanded state in localStorage (collapsed by default)
  const [isExpanded, setIsExpanded] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(isExpanded));
    } catch {
      // Ignore storage errors
    }
  }, [isExpanded]);

  // When a remnant is selected for breakdown, auto-expand and scroll to panel
  useEffect(() => {
    if (selectedRemnantCode) {
      setIsExpanded(true);
      setTimeout(() => {
        breakdownPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 50);
    }
  }, [selectedRemnantCode]);

  // Derive all data from single source of truth
  const explanation = useMemo(() => {
    return computeRemnantScoringExplanation(scoredRemnants, activeParts, DEFAULT_REMNANT_SCORING_CONFIG);
  }, [scoredRemnants, activeParts]);

  const selectedRemnantResult = useMemo(() => {
    if (!selectedRemnantCode) return null;
    return scoredRemnants.find((sr) => sr.remnant.code === selectedRemnantCode) || null;
  }, [selectedRemnantCode, scoredRemnants]);

  if (scoredRemnants.length === 0) {
    return (
      <div className="p-4 border border-slate-200 rounded-xl bg-slate-50/50 text-xs text-slate-400 text-center">
        {isEs
          ? 'No hay remanentes registrados en el resultado de optimización activo para explicar.'
          : 'No usable remnants recorded in the active optimization result to explain.'}
      </div>
    );
  }

  const {
    factors,
    totalWeightPct,
    formulaText,
    formulaTextEs,
    activeSettings,
    demandMatching,
    matchingRequirement,
  } = explanation;

  return (
    <div
      className={`border border-slate-200 rounded-xl bg-slate-50/50 transition-all ${
        isStale ? 'opacity-80 ring-1 ring-amber-300' : ''
      }`}
    >
      {/* 1. Header (Always Visible, Clickable Toggle) */}
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        className="w-full p-4 flex flex-wrap items-center justify-between gap-3 text-left hover:bg-slate-100/60 transition rounded-xl cursor-pointer select-none"
        aria-expanded={isExpanded}
      >
        <div className="flex items-center space-x-2.5">
          <span className="p-1.5 rounded-lg bg-blue-100 text-blue-700">
            <HelpCircle className="w-4 h-4" />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                {isEs ? 'Cómo se Califican las Recomendaciones' : 'How Recommendations Are Scored'}
              </h4>
              <span className="inline-flex items-center text-[10px] font-semibold text-slate-600 bg-white border border-slate-200 px-2 py-0.5 rounded-full">
                {isEs
                  ? 'Heurística demo basada en reglas, no aprendida de historial'
                  : 'Rule-based demo heuristic, not learned from production history'}
              </span>
            </div>
            {!isExpanded && (
              <p className="text-[11px] text-slate-500 mt-0.5">
                {isEs
                  ? 'Rúbrica transparente de 6 factores • Envejecimiento (-2"/eje) • Demanda • Compacidad • Umbral: ≥ 50 pts'
                  : '6-factor transparent rubric • Aging (-2"/axis) • Demand fit • Compactness • Threshold: ≥ 50 pts'}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center space-x-2 text-xs font-semibold text-blue-600">
          <span>{isExpanded ? (isEs ? 'Ocultar Detalles' : 'Hide Details') : (isEs ? 'Ver Detalles' : 'Show Details')}</span>
          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {/* 2. Collapsible Body (3 Sections) */}
      {isExpanded && (
        <div className="p-5 pt-1 border-t border-slate-200 space-y-6">
          {/* Stale Warning Banner if Stale */}
          {isStale && (
            <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                {isEs
                  ? 'Entradas modificadas — vuelva a ejecutar la optimización para actualizar los remanentes.'
                  : 'Inputs modified — re-run optimization to refresh the scoring breakdown.'}
              </span>
            </div>
          )}

          {/* Per-Remnant Detailed Score Breakdown Panel */}
          {selectedRemnantResult && (
            <div
              ref={breakdownPanelRef}
              className="p-4 bg-linear-to-b from-blue-50/90 to-white border-2 border-blue-400 rounded-xl space-y-3.5 shadow-sm transition-all"
            >
              <div className="flex flex-wrap items-center justify-between border-b border-blue-200 pb-2.5 gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2 py-0.5 rounded-md bg-blue-600 text-white font-mono text-xs font-bold shadow-2xs">
                    {selectedRemnantResult.remnant.code}
                  </span>
                  <span className="text-xs font-bold text-slate-800">
                    {isEs ? 'Desglose Detallado de Puntuación' : 'Detailed Score Breakdown'}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full font-bold text-[10px] uppercase border ${
                      selectedRemnantResult.tier === 'recommended'
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                        : selectedRemnantResult.tier === 'low_priority'
                        ? 'bg-slate-100 text-slate-700 border-slate-300'
                        : 'bg-amber-100 text-amber-800 border-amber-300'
                    }`}
                  >
                    {selectedRemnantResult.tier}
                  </span>
                  <span className="font-mono text-xs font-extrabold text-blue-900 bg-blue-100 px-2 py-0.5 rounded border border-blue-300">
                    {selectedRemnantResult.compositeScore} / 100 pts
                  </span>
                </div>

                {onCloseBreakdown && (
                  <button
                    type="button"
                    onClick={onCloseBreakdown}
                    aria-label="Close score breakdown"
                    className="px-2 py-1 text-[11px] font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 rounded transition cursor-pointer flex items-center space-x-1"
                  >
                    <span>✕</span>
                    <span>{isEs ? 'Cerrar Desglose' : 'Close Breakdown'}</span>
                  </button>
                )}
              </div>

              {/* Remnant Dims & Aging Strip */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">
                    {isEs ? 'Dimensiones Nominales' : 'Nominal Dimensions'}
                  </span>
                  <span className="font-mono font-bold text-slate-800">
                    {selectedRemnantResult.remnant.length}&quot; × {selectedRemnantResult.remnant.width}&quot; × {selectedRemnantResult.remnant.height}&quot;
                  </span>
                  <span className="text-slate-400 text-[10px] block font-mono">
                    ({(selectedRemnantResult.remnant.volume / 1728.0).toFixed(2)} ft³)
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">
                    {isEs ? 'Dimensiones Efectivas (3 días, -2"/eje)' : 'Effective Dims (3d, -2"/axis)'}
                  </span>
                  <span className="font-mono font-bold text-emerald-800">
                    {selectedRemnantResult.effectiveDims[0].toFixed(1)}&quot; × {selectedRemnantResult.effectiveDims[1].toFixed(1)}&quot; × {selectedRemnantResult.effectiveDims[2].toFixed(1)}&quot;
                  </span>
                  <span className="text-emerald-600 text-[10px] block font-mono">
                    ({selectedRemnantResult.effectiveVolumeCuFt.toFixed(2)} ft³ útil)
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">
                    {isEs ? 'Grado y Ubicación' : 'Grade & Bay'}
                  </span>
                  <span className="font-semibold text-slate-800">
                    {selectedRemnantResult.remnant.grade} • {selectedRemnantResult.remnant.storage_location || 'Bay R-04'}
                  </span>
                </div>
              </div>

              {/* Rationale & Transition Requirements */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                {/* Left: Why + Group Transition */}
                <div className="space-y-2.5">
                  <div className="p-3 bg-white rounded-lg border border-slate-200 space-y-1">
                    <span className="text-[10px] uppercase font-bold text-slate-500 block">
                      {isEs ? 'Razón de Clasificación (Por qué):' : 'Classification Reason (Why):'}
                    </span>
                    <p className="text-slate-800 leading-snug">{selectedRemnantResult.reason}</p>
                  </div>

                  <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-lg space-y-1">
                    <span className="text-[10px] uppercase font-bold text-amber-900 block flex items-center space-x-1">
                      <ArrowRight className="w-3 h-3 text-amber-700 shrink-0" />
                      <span>{isEs ? 'Qué Cambiaría su Grupo:' : 'What Would Change Its Group:'}</span>
                    </span>
                    <p className="text-amber-900 font-medium leading-snug">
                      {isEs
                        ? selectedRemnantResult.groupTransitionRequirementEs
                        : selectedRemnantResult.groupTransitionRequirement}
                    </p>
                  </div>

                  {/* Matched Part Types */}
                  <div className="p-3 bg-white rounded-lg border border-slate-200 space-y-1.5">
                    <span className="text-[10px] uppercase font-bold text-slate-500 block">
                      {isEs ? 'Tipos de Pieza que Caben:' : 'Fitted Part Types:'}{' '}
                      <strong className="text-slate-800 font-mono">
                        ({selectedRemnantResult.fitPartCount} / {selectedRemnantResult.totalPartTypes})
                      </strong>
                    </span>
                    {selectedRemnantResult.matchedPartNames.length > 0 ? (
                      <ul className="space-y-1 text-[11px] text-slate-700">
                        {selectedRemnantResult.matchedPartNames.map((name, i) => (
                          <li key={i} className="flex items-center space-x-1.5 text-emerald-800 font-medium">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span>{name}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-[11px] text-slate-400 italic">
                        {isEs
                          ? '0 tipos de pieza en la orden actual caben en las dimensiones efectivas.'
                          : '0 part types in the active demand fit inside post-aging dimensions.'}
                      </p>
                    )}
                  </div>
                </div>

                {/* Right: Detailed Points Per Factor Table */}
                <div className="p-3 bg-white rounded-lg border border-slate-200 space-y-2">
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">
                    {isEs ? 'Puntos Aportados por Factor:' : 'Points Contributed by Factor:'}
                  </span>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-[11px] border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 text-slate-400 font-bold text-[10px] uppercase">
                          <th className="py-1">{isEs ? 'Factor' : 'Factor'}</th>
                          <th className="py-1 text-center">{isEs ? 'Valor' : 'Value'}</th>
                          <th className="py-1 text-center">{isEs ? 'Peso' : 'Weight'}</th>
                          <th className="py-1 text-right">{isEs ? 'Puntos' : 'Points'}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono">
                        <tr>
                          <td className="py-1 font-sans text-slate-700">{isEs ? 'Volumen Útil' : 'Aging Usable Vol'}</td>
                          <td className="py-1 text-center text-slate-600">{selectedRemnantResult.factorBreakdown.agingUsableVolume}%</td>
                          <td className="py-1 text-center text-slate-400">× 0.25</td>
                          <td className="py-1 text-right font-bold text-blue-700">{selectedRemnantResult.factorPoints.agingUsableVolume} pts</td>
                        </tr>
                        <tr>
                          <td className="py-1 font-sans text-slate-700">{isEs ? 'Tamaño Mínimo' : 'Min Useful Size'}</td>
                          <td className="py-1 text-center text-slate-600">{selectedRemnantResult.factorBreakdown.minimumUsefulSize}%</td>
                          <td className="py-1 text-center text-slate-400">× 0.20</td>
                          <td className="py-1 text-right font-bold text-emerald-700">{selectedRemnantResult.factorPoints.minimumUsefulSize} pts</td>
                        </tr>
                        <tr>
                          <td className="py-1 font-sans text-slate-700">{isEs ? 'Ajuste Demanda' : 'Demand Fit'}</td>
                          <td className="py-1 text-center text-slate-600">{selectedRemnantResult.factorBreakdown.demandFit}%</td>
                          <td className="py-1 text-center text-slate-400">× 0.25</td>
                          <td className="py-1 text-right font-bold text-purple-700">{selectedRemnantResult.factorPoints.demandFit} pts</td>
                        </tr>
                        <tr>
                          <td className="py-1 font-sans text-slate-700">{isEs ? 'Compacidad' : 'Compactness'}</td>
                          <td className="py-1 text-center text-slate-600">{selectedRemnantResult.factorBreakdown.compactness}%</td>
                          <td className="py-1 text-center text-slate-400">× 0.10</td>
                          <td className="py-1 text-right font-bold text-amber-700">{selectedRemnantResult.factorPoints.compactness} pts</td>
                        </tr>
                        <tr>
                          <td className="py-1 font-sans text-slate-700">{isEs ? 'Grado' : 'Grade Demand'}</td>
                          <td className="py-1 text-center text-slate-600">{selectedRemnantResult.factorBreakdown.gradeDemand}%</td>
                          <td className="py-1 text-center text-slate-400">× 0.10</td>
                          <td className="py-1 text-right font-bold text-cyan-700">{selectedRemnantResult.factorPoints.gradeDemand} pts</td>
                        </tr>
                        <tr>
                          <td className="py-1 font-sans text-slate-700">{isEs ? 'Frescura' : 'Freshness'}</td>
                          <td className="py-1 text-center text-slate-600">{selectedRemnantResult.factorBreakdown.freshness}%</td>
                          <td className="py-1 text-center text-slate-400">× 0.10</td>
                          <td className="py-1 text-right font-bold text-pink-700">{selectedRemnantResult.factorPoints.freshness} pts</td>
                        </tr>
                        <tr className="border-t border-slate-200 font-bold text-slate-900 bg-slate-50">
                          <td colSpan={3} className="py-1.5 font-sans">{isEs ? 'Puntuación Compuesta:' : 'Composite Usability Score:'}</td>
                          <td className="py-1.5 text-right font-extrabold text-blue-900 text-xs">
                            {selectedRemnantResult.compositeScore} / 100
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================
              Section 2.1: How the Usability Score is Calculated
              ======================================================== */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
              <h5 className="text-xs font-bold text-slate-800 flex items-center space-x-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-600" />
                <span>
                  {isEs
                    ? '2.1 Cómo se calcula la puntuación de usabilidad (0-100)'
                    : '2.1 How the Usability Score is Calculated (0 to 100)'}
                </span>
              </h5>
              <span className="text-[10px] font-mono text-slate-500">
                {isEs ? 'Suma de pesos: ' : 'Weights total: '}
                <strong className={totalWeightPct === 100 ? 'text-emerald-700' : 'text-rose-700'}>
                  {totalWeightPct}%
                </strong>
              </span>
            </div>

            {/* Stacked Proportional Bar of Weights */}
            <div className="space-y-1">
              <div className="h-3 w-full rounded-md overflow-hidden flex bg-slate-200">
                {factors.map((f) => (
                  <div
                    key={f.key}
                    style={{ width: `${f.weightPct}%`, backgroundColor: f.color }}
                    className="h-full transition-all"
                    title={`${isEs ? f.nameEs : f.name}: ${f.weightPct}%`}
                  />
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-600">
                {factors.map((f) => (
                  <span key={f.key} className="flex items-center space-x-1">
                    <span className="w-2 h-2 rounded-xs" style={{ backgroundColor: f.color }} />
                    <span>
                      {isEs ? f.nameEs : f.name} ({f.weightPct}%)
                    </span>
                  </span>
                ))}
              </div>
            </div>

            {/* Compact Factors Table */}
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-left text-xs bg-white border-collapse min-w-[700px]">
                <thead className="bg-slate-100 text-slate-700 font-bold text-[11px] uppercase tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="py-2 px-3">{isEs ? 'Factor' : 'Factor'}</th>
                    <th className="py-2 px-3">{isEs ? 'Qué Mide' : 'What It Measures'}</th>
                    <th className="py-2 px-2 text-center w-20">{isEs ? 'Peso (%)' : 'Weight (%)'}</th>
                    <th className="py-2 px-3">{isEs ? 'Regla en una línea' : 'Rule in One Line'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {factors.map((f) => (
                    <tr key={f.key} className="hover:bg-slate-50 transition">
                      <td className="py-2 px-3 font-semibold text-slate-900 flex items-center space-x-1.5">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: f.color }} />
                        <span>{isEs ? f.nameEs : f.name}</span>
                      </td>
                      <td className="py-2 px-3 text-slate-600 text-[11px]">{isEs ? f.measureEs : f.measure}</td>
                      <td className="py-2 px-2 text-center font-mono font-bold text-slate-800">{f.weightPct}%</td>
                      <td className="py-2 px-3 text-slate-600 text-[11px]">{isEs ? f.ruleSummaryEs : f.ruleSummary}</td>
                    </tr>
                  ))}
                  <tr className="bg-slate-50 font-bold border-t border-slate-200 text-slate-900">
                    <td colSpan={2} className="py-2 px-3 text-right">
                      {isEs ? 'Total de pesos:' : 'Total Weights:'}
                    </td>
                    <td className="py-2 px-2 text-center font-mono text-emerald-800 font-bold">{totalWeightPct}%</td>
                    <td className="py-2 px-3 text-slate-500 font-normal italic text-[10px]">
                      {isEs ? 'Suma normalizada exactamente al 100%' : 'Normalized sum equals exactly 100%'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Formula as Plain Text */}
            <div className="p-2.5 bg-slate-900 text-slate-100 rounded-lg text-[11px] font-mono leading-relaxed overflow-x-auto">
              <span className="text-slate-400 font-sans font-semibold mr-2">{isEs ? 'Fórmula:' : 'Formula:'}</span>
              <span>{isEs ? formulaTextEs : formulaText}</span>
            </div>

            {/* Active Settings Chips */}
            <div className="space-y-1.5 pt-1">
              <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider block">
                {isEs ? 'Parámetros Activos de Configuración:' : 'Active Configuration Settings:'}
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-md bg-white border border-slate-200 text-slate-700 text-[11px] shadow-2xs font-mono">
                  <span className="text-slate-400 font-sans font-medium">{isEs ? 'Reutilización:' : 'Reuse Age:'}</span>
                  <strong>{activeSettings.agingDays}d</strong>
                  <span className="text-slate-400 font-sans">(-{activeSettings.totalAxisReduction}&quot;/axis)</span>
                </span>
                <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-md bg-white border border-slate-200 text-slate-700 text-[11px] shadow-2xs font-mono">
                  <span className="text-slate-400 font-sans font-medium">{isEs ? 'Espesor Mín:' : 'Min Thickness:'}</span>
                  <strong>{activeSettings.minThickness}&quot;</strong>
                </span>
                <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-md bg-white border border-slate-200 text-slate-700 text-[11px] shadow-2xs font-mono">
                  <span className="text-slate-400 font-sans font-medium">{isEs ? 'Área Mín:' : 'Min Plan Area:'}</span>
                  <strong>{activeSettings.minPlanArea} in²</strong>
                </span>
                <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-md bg-white border border-slate-200 text-slate-700 text-[11px] shadow-2xs font-mono">
                  <span className="text-slate-400 font-sans font-medium">{isEs ? 'Umbral Recomendado:' : 'Recommended Threshold:'}</span>
                  <strong className="text-emerald-700">≥ {activeSettings.recommendedScoreThreshold} pts</strong>
                </span>
                <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-md bg-white border border-slate-200 text-slate-700 text-[11px] shadow-2xs font-mono">
                  <span className="text-slate-400 font-sans font-medium">{isEs ? 'Umbral Baja Prioridad:' : 'Low Priority Threshold:'}</span>
                  <strong className="text-amber-700">&lt; {activeSettings.lowPriorityScoreThreshold} pts</strong>
                </span>
                <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-md bg-slate-100 text-slate-500 text-[10px] italic">
                  <FileCode2 className="w-3 h-3 text-slate-400" />
                  <span>Configurable in {activeSettings.configSourceFile}</span>
                </span>
              </div>
            </div>
          </div>

          {/* ========================================================
              Section 2.2: How Demand Matching (fits_part_types) Works
              ======================================================== */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
              <h5 className="text-xs font-bold text-slate-800 flex items-center space-x-1.5">
                <span className="w-2 h-2 rounded-full bg-purple-600" />
                <span>
                  {isEs
                    ? '2.2 Cómo funciona el ajuste a demanda (fits_part_types)'
                    : '2.2 How Demand Matching (fits_part_types) Works'}
                </span>
              </h5>
              <span className="text-[10px] font-mono text-slate-500">
                {demandMatching.totalDemandedSKUs} {isEs ? 'SKUs únicos demandados' : 'unique demanded SKUs'}
              </span>
            </div>

            {/* Generated Explanation Text */}
            <div className="p-3 bg-white border border-slate-200 rounded-lg text-[11px] text-slate-700 space-y-1.5 leading-relaxed">
              <p>
                <strong>{isEs ? 'Alcance de Demanda:' : 'Demand Scope:'}</strong>{' '}
                {isEs ? demandMatching.scopeTextEs : demandMatching.scopeText}
              </p>
              <p>
                <strong>{isEs ? 'Dimensiones Efectivas:' : 'Effective Dimensions:'}</strong>{' '}
                {isEs ? demandMatching.effectiveDimsRuleEs : demandMatching.effectiveDimsRule}
              </p>
              <p>
                <strong>{isEs ? 'Rotaciones Evaluadas:' : 'Rotations Evaluated:'}</strong>{' '}
                {isEs ? demandMatching.rotationRulesSummaryEs : demandMatching.rotationRulesSummary}
              </p>
              <p>
                <strong>{isEs ? 'Corte de Sierra (Kerf):' : 'Saw Kerf Allowance:'}</strong>{' '}
                {isEs ? demandMatching.kerfHandlingRuleEs : demandMatching.kerfHandlingRule}
              </p>
            </div>

            {/* Demand Reference Table */}
            {demandMatching.hasDemand ? (
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-left text-xs bg-white border-collapse min-w-[600px]">
                  <thead className="bg-slate-100 text-slate-700 font-bold text-[11px] uppercase tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-3">{isEs ? 'SKU de Pieza' : 'Part SKU'}</th>
                      <th className="py-2 px-3">{isEs ? 'Nombre' : 'Part Name'}</th>
                      <th className="py-2 px-3 font-mono">{isEs ? 'Dimensiones (L×W×H)' : 'Dimensions (L×W×H)'}</th>
                      <th className="py-2 px-3">{isEs ? 'Regla de Rotación' : 'Rotation Rule'}</th>
                      <th className="py-2 px-2 text-right">{isEs ? 'Cantidad Demanda' : 'Demanded Qty'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {demandMatching.demandedParts.map((p) => (
                      <tr key={p.sku} className="hover:bg-slate-50 transition">
                        <td className="py-2 px-3 font-mono font-bold text-slate-900">{p.sku}</td>
                        <td className="py-2 px-3 text-slate-700">{p.name}</td>
                        <td className="py-2 px-3 font-mono text-[11px] text-slate-800">
                          {p.length}&quot; × {p.width}&quot; × {p.height}&quot;
                        </td>
                        <td className="py-2 px-3 text-[11px]">
                          <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 font-mono text-[10px]">
                            {p.rotationRule}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-right font-mono font-semibold text-slate-900">{p.quantity} pcs</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-3 bg-white border border-slate-200 rounded-lg text-xs text-amber-800">
                {isEs
                  ? 'No hay demanda activa: la comprobación de ajuste no puede elevar la puntuación (aporta 50% neutral).'
                  : 'No current demand: matching cannot raise any score (demand fit defaults to neutral 50%).'}
              </div>
            )}
          </div>

          {/* ========================================================
              Section 2.3: Is a Matching Part Type Required?
              ======================================================== */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
              <h5 className="text-xs font-bold text-slate-800 flex items-center space-x-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-600" />
                <span>
                  {isEs
                    ? '2.3 ¿Se requiere al menos un tipo de pieza coincidente para "Recomendado"?'
                    : '2.3 Is a Matching Part Type Required for "Recommended"?'}
                </span>
              </h5>
              <span className="text-[10px] font-mono text-slate-500">
                {isEs ? 'Regla de recomendación' : 'Tier gating rule'}
              </span>
            </div>

            <div className="p-4 bg-white border border-slate-200 rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <span
                    className={`inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-wide border ${
                      matchingRequirement.isRequired
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                        : 'bg-slate-100 text-slate-700 border-slate-300'
                    }`}
                  >
                    {matchingRequirement.isRequired ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <Info className="w-3.5 h-3.5 text-slate-500" />
                    )}
                    <span>{isEs ? matchingRequirement.badgeTextEs : matchingRequirement.badgeText}</span>
                  </span>
                  <span className="text-xs font-semibold text-slate-800">
                    {isEs ? matchingRequirement.ruleDescriptionEs : matchingRequirement.ruleDescription}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500">
                  {isEs
                    ? 'La regla se rige por el indicador de configuración require_demand_match_for_recommended en remnant_scoring_config.json.'
                    : 'Gated by the require_demand_match_for_recommended configuration flag in remnant_scoring_config.json.'}
                </p>
              </div>

              <div className="text-right shrink-0">
                <div className="text-xs font-mono font-bold text-slate-800">
                  {isEs ? matchingRequirement.countLineEs : matchingRequirement.countLine}
                </div>
                <div className="text-[10px] text-slate-400">
                  {matchingRequirement.matchingCount} / {matchingRequirement.totalCount} {isEs ? 'con ajuste' : 'matching demand'}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
