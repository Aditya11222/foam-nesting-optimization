import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Clock, AlertTriangle, CheckCircle, Package } from 'lucide-react';
import type { RemnantAgingStatus } from '../types';
import { fetchRemnantAging } from '../api';

export const RemnantInventoryView: React.FC = () => {
  const { t, i18n } = useTranslation();
  const currentLang = i18n.language;

  const [remnants, setRemnants] = useState<RemnantAgingStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [thresholdDays, setThresholdDays] = useState(3);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await fetchRemnantAging();
      setRemnants(data);
    } catch (e) {
      console.error(e);
      // Fallback synthetic demonstration data
      setRemnants([
        {
          remnant_id: 'rem-hr40-01',
          code: 'REM-HR40-01',
          grade: 'HR-40',
          cut_date: '2026-10-22',
          evaluation_date: '2026-10-23',
          age_days: 1,
          is_degraded: false,
          degradation_days_threshold: 3,
          original_dims: [48.0, 40.0, 24.0],
          effective_dims: [48.0, 40.0, 24.0],
          original_volume: 46080.0,
          effective_volume: 46080.0,
          volume_loss_pct: 0.0,
          usability_score: 0.88,
          storage_location: 'Bay R-04',
          recommendation_en: 'Fresh remnant (1d old). 2d before oxidation skin trim takes effect.',
          recommendation_es: 'Remanente fresco (1d). 2d antes de requerir recorte por oxidación.',
        },
        {
          remnant_id: 'rem-hr40-02',
          code: 'REM-HR40-02',
          grade: 'HR-40',
          cut_date: '2026-10-18',
          evaluation_date: '2026-10-23',
          age_days: 5,
          is_degraded: true,
          degradation_days_threshold: 3,
          original_dims: [60.0, 32.0, 20.0],
          effective_dims: [58.0, 30.0, 18.0],
          original_volume: 38400.0,
          effective_volume: 31320.0,
          volume_loss_pct: 18.4,
          usability_score: 0.53,
          storage_location: 'Bay R-12',
          recommendation_en: 'Aged 5d (>=3d): Oxidized skin trim (-2"/axis) applied. Prioritize for cutting.',
          recommendation_es: 'Envejecido 5d (>=3d): Corteza oxidada aplicada (-2"/eje). Priorizar para corte.',
        },
        {
          remnant_id: 'rem-hr30-01',
          code: 'REM-HR30-01',
          grade: 'HR-30',
          cut_date: '2026-10-21',
          evaluation_date: '2026-10-23',
          age_days: 2,
          is_degraded: false,
          degradation_days_threshold: 3,
          original_dims: [40.0, 30.0, 18.0],
          effective_dims: [40.0, 30.0, 18.0],
          original_volume: 21600.0,
          effective_volume: 21600.0,
          volume_loss_pct: 0.0,
          usability_score: 0.82,
          storage_location: 'Bay R-02',
          recommendation_en: 'Fresh remnant (2d old). 1d remaining inside optimal window.',
          recommendation_es: 'Remanente fresco (2d). 1d restante en ventana óptima.',
        },
        {
          remnant_id: 'rem-ve50-01',
          code: 'REM-VE50-01',
          grade: 'VE-50',
          cut_date: '2026-10-17',
          evaluation_date: '2026-10-23',
          age_days: 6,
          is_degraded: true,
          degradation_days_threshold: 3,
          original_dims: [50.0, 40.0, 16.0],
          effective_dims: [48.0, 38.0, 14.0],
          original_volume: 32000.0,
          effective_volume: 25536.0,
          volume_loss_pct: 20.2,
          usability_score: 0.46,
          storage_location: 'Bay R-08',
          recommendation_en: 'Aged 6d: Oxidized skin trim (-2"/axis) applied.',
          recommendation_es: 'Envejecido 6d: Corteza oxidada aplicada (-2"/eje).',
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [thresholdDays]);

  return (
    <div className="flex-1 flex flex-col p-6 bg-slate-950 text-slate-100 overflow-y-auto">
      {/* Header card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl mb-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2 text-sky-400 text-xs font-bold uppercase tracking-widest">
              <Package className="w-4 h-4" />
              <span>Domain Rules Demo (Section 3)</span>
            </div>
            <h1 className="text-2xl font-black text-white mt-1">
              {t('remnant_inventory_header')}
            </h1>
            <p className="text-sm text-slate-400 mt-1 max-w-3xl leading-relaxed">
              {t('remnant_subtitle')}
            </p>
          </div>

          <div className="flex items-center space-x-3 bg-slate-800/80 px-4 py-2.5 rounded-xl border border-slate-700">
            <Clock className="w-4 h-4 text-sky-400" />
            <span className="text-xs text-slate-300 font-medium">Degradation Threshold:</span>
            <div className="flex items-center space-x-1.5 font-mono text-xs">
              {[2, 3, 4].map((d) => (
                <button
                  key={d}
                  onClick={() => setThresholdDays(d)}
                  className={`px-2.5 py-1 rounded font-bold transition-all ${
                    thresholdDays === d
                      ? 'bg-sky-500 text-white shadow'
                      : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                  }`}
                >
                  {d} days
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Remnant inventory table */}
      {loading ? (
        <div className="p-8 text-center text-slate-400">Loading remnant inventory...</div>
      ) : (
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-850 text-slate-400 border-b border-slate-800 uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3.5 px-4">Remnant Code</th>
                <th className="py-3.5 px-3">Grade</th>
                <th className="py-3.5 px-3">Cut Date & Age</th>
                <th className="py-3.5 px-3">Status</th>
                <th className="py-3.5 px-3">Nominal Dims</th>
                <th className="py-3.5 px-3">Effective Usable Dims</th>
                <th className="py-3.5 px-3">Vol Loss</th>
                <th className="py-3.5 px-3">Usability</th>
                <th className="py-3.5 px-4">Location & Recommendation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {remnants.map((r) => (
                <tr
                  key={r.remnant_id}
                  className={`hover:bg-slate-800/40 transition-colors ${
                    r.is_degraded ? 'bg-amber-950/10' : ''
                  }`}
                >
                  <td className="py-3.5 px-4 font-mono font-bold text-slate-200">
                    {r.code}
                  </td>
                  <td className="py-3.5 px-3">
                    <span className="px-2 py-0.5 rounded font-mono font-semibold bg-slate-800 text-sky-300 border border-slate-700">
                      {r.grade}
                    </span>
                  </td>
                  <td className="py-3.5 px-3">
                    <div className="text-slate-300 font-mono">{r.cut_date}</div>
                    <div className="text-[10px] text-slate-500">
                      {r.age_days} {t('age_days').toLowerCase()} ago
                    </div>
                  </td>
                  <td className="py-3.5 px-3">
                    {r.is_degraded ? (
                      <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 text-[10px] font-bold">
                        <AlertTriangle className="w-3 h-3" />
                        <span>{t('oxidized_degraded')}</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold">
                        <CheckCircle className="w-3 h-3" />
                        <span>{t('fresh_window')}</span>
                      </span>
                    )}
                  </td>
                  <td className="py-3.5 px-3 font-mono text-slate-400">
                    {r.original_dims[0]}"×{r.original_dims[1]}"×{r.original_dims[2]}"
                  </td>
                  <td className="py-3.5 px-3 font-mono font-bold text-sky-300">
                    {r.effective_dims[0]}"×{r.effective_dims[1]}"×{r.effective_dims[2]}"
                  </td>
                  <td className="py-3.5 px-3 font-mono font-semibold">
                    {r.volume_loss_pct > 0 ? (
                      <span className="text-rose-400">−{r.volume_loss_pct}%</span>
                    ) : (
                      <span className="text-slate-500">0%</span>
                    )}
                  </td>
                  <td className="py-3.5 px-3">
                    <div className="flex items-center space-x-2">
                      <div className="w-12 bg-slate-800 rounded-full h-1.5 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            r.usability_score > 0.7 ? 'bg-emerald-500' : 'bg-amber-500'
                          }`}
                          style={{ width: `${r.usability_score * 100}%` }}
                        ></div>
                      </div>
                      <span className="font-mono text-slate-300 font-bold">
                        {r.usability_score}
                      </span>
                    </div>
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="font-semibold text-slate-300">{r.storage_location}</div>
                    <div className="text-[11px] text-slate-400 italic">
                      {currentLang === 'es' ? r.recommendation_es : r.recommendation_en}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      )}
    </div>
  );
};
