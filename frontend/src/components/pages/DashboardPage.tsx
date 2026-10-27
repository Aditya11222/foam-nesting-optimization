import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Layers,
  Sparkles,
  ArrowRight,
  FolderKanban,
  CheckCircle2,
  Package,
  TrendingUp,
  Clock,
  Trash2,
  Database,
  Sliders
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from 'recharts';
import type { SavedJob, OptimizationResult, ActivityLogItem } from '../../types';

interface DashboardPageProps {
  savedJobs: SavedJob[];
  currentJobName: string;
  currentResult: OptimizationResult | null;
  onNavigateOptimization: (job?: SavedJob) => void;
  onLoadSample: () => void;
  onClearDemoData: () => void;
  activityLog: ActivityLogItem[];
  retainedRemnantsCount: number;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  savedJobs,
  currentJobName,
  currentResult,
  onNavigateOptimization,
  onLoadSample,
  onClearDemoData,
  activityLog,
  retainedRemnantsCount,
}) => {
  const { t } = useTranslation();
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Latest valid result: prefer active currentResult, fallback to most recently saved job result
  const latestResultJob = savedJobs.find((j) => j.latest_result != null);
  const activeResult = currentResult || latestResultJob?.latest_result || null;
  const activeJobTitle = currentResult ? currentJobName : (latestResultJob?.name || 'Latest Job');

  // Hero KPI: Net Usable Yield
  const heroYield = activeResult ? activeResult.net_utilization_pct : null;

  // Supporting KPIs
  const jobsSavedCount = savedJobs.length;
  const jobsOptimizedCount = savedJobs.filter((j) => j.status === 'Optimized' || j.latest_result != null).length + (currentResult ? 1 : 0);
  const totalPartsPlaced = savedJobs.reduce(
    (acc, j) => acc + (j.parts_placed_count || 0),
    currentResult ? currentResult.total_parts_placed : 0
  );

  // Yield-by-job chart data
  const yieldChartData = savedJobs
    .filter((j) => j.yield_pct != null || j.latest_result != null)
    .map((j) => ({
      name: j.name.length > 14 ? `${j.name.slice(0, 12)}…` : j.name,
      yield: Number((j.yield_pct || j.latest_result?.net_utilization_pct || 0).toFixed(1)),
      fullName: j.name,
    }));

  if (currentResult && !yieldChartData.some((d) => d.fullName === currentJobName)) {
    yieldChartData.unshift({
      name: currentJobName.length > 14 ? `${currentJobName.slice(0, 12)}…` : currentJobName,
      yield: Number(currentResult.net_utilization_pct.toFixed(1)),
      fullName: currentJobName,
    });
  }

  const isEmpty = savedJobs.length === 0 && !currentResult;

  return (
    <div className="flex-1 overflow-y-auto p-6 lg:p-8 space-y-6 max-w-7xl mx-auto w-full">
      {/* Top Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-xl lg:text-2xl font-black text-slate-900 tracking-tight flex items-center space-x-2">
            <span>{t('nav_dashboard')}</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
              Overview
            </span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Real-time session summary across foam nesting projects, stock recovery, and recent cutting runs.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          {/* Persistence Note */}
          <div className="flex items-center space-x-1.5 text-xs text-slate-500 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg shadow-2xs">
            <Database className="w-3.5 h-3.5 text-slate-400" />
            <span>{t('saved_in_browser_demo')}</span>
          </div>

          <button
            type="button"
            onClick={() => setShowClearConfirm(true)}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-red-700 hover:bg-red-50 border border-slate-200 rounded-lg transition cursor-pointer"
            title="Clear demo data and reset local state"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{t('clear_demo_data')}</span>
          </button>
        </div>
      </div>

      {/* Empty State */}
      {isEmpty ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center max-w-xl mx-auto shadow-sm space-y-5 my-8">
          <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto shadow-xs">
            <Sliders className="w-7 h-7" />
          </div>
          <div className="space-y-2">
            <h2 className="text-lg font-bold text-slate-900">No session results or saved jobs yet.</h2>
            <p className="text-xs text-slate-500 leading-relaxed">
              Start by loading the sample job or creating a custom bun cut plan to populate KPIs and metrics.
            </p>
          </div>
          <div className="flex items-center justify-center space-x-3 pt-2">
            <button
              type="button"
              onClick={onLoadSample}
              className="inline-flex items-center space-x-2 px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs transition cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              <span>{t('load_sample')}</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigateOptimization()}
              className="inline-flex items-center space-x-2 px-4 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg shadow-2xs transition cursor-pointer"
            >
              <span>{t('start_new_job')}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Hero KPI + Supporting KPI Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {/* Hero Card: Net Usable Yield */}
            <div className="md:col-span-2 p-5 rounded-2xl bg-linear-to-br from-blue-700 via-blue-600 to-indigo-700 text-white flex flex-col justify-between shadow-sm relative overflow-hidden">
              <div className="flex items-center justify-between text-blue-100">
                <span className="text-xs font-semibold tracking-wider uppercase opacity-90">
                  {t('hero_kpi_yield')}
                </span>
                <span className="p-1.5 rounded-lg bg-white/10 backdrop-blur-xs">
                  <TrendingUp className="w-4 h-4 text-white" />
                </span>
              </div>
              <div className="my-3">
                <div className="text-4xl lg:text-5xl font-black tracking-tight">
                  {heroYield != null ? `${heroYield.toFixed(1)}%` : '—'}
                </div>
                <p className="text-xs text-blue-100/90 mt-1 font-medium">
                  {activeResult ? `Latest Run: ${activeJobTitle}` : 'Run optimization to record yield'}
                </p>
              </div>
              <div className="text-[10px] text-blue-200 border-t border-white/15 pt-2 flex items-center justify-between">
                <span>Material volume converted into ordered parts</span>
                <span className="font-semibold">{activeResult?.total_cuts_count || 0} cuts</span>
              </div>
            </div>

            {/* Supporting KPI 1: Jobs Saved */}
            <div className="p-4 rounded-xl border border-slate-200 bg-white flex flex-col justify-between shadow-2xs">
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-xs font-semibold text-slate-700">{t('kpi_jobs_saved')}</span>
                <FolderKanban className="w-4 h-4 text-slate-400" />
              </div>
              <div className="my-2">
                <div className="text-2xl font-bold text-slate-900">{jobsSavedCount}</div>
                <span className="text-[11px] text-slate-500">In browser storage</span>
              </div>
              <div className="text-[10px] text-slate-400 border-t border-slate-100 pt-1.5">
                Saved projects
              </div>
            </div>

            {/* Supporting KPI 2: Jobs Optimized */}
            <div className="p-4 rounded-xl border border-slate-200 bg-white flex flex-col justify-between shadow-2xs">
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-xs font-semibold text-slate-700">{t('kpi_jobs_optimized')}</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              </div>
              <div className="my-2">
                <div className="text-2xl font-bold text-slate-900">{jobsOptimizedCount}</div>
                <span className="text-[11px] text-emerald-600 font-medium">Valid solutions</span>
              </div>
              <div className="text-[10px] text-slate-400 border-t border-slate-100 pt-1.5">
                Completed runs
              </div>
            </div>

            {/* Supporting KPI 3: Total Parts Placed */}
            <div className="p-4 rounded-xl border border-slate-200 bg-white flex flex-col justify-between shadow-2xs">
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-xs font-semibold text-slate-700">{t('kpi_parts_placed')}</span>
                <Package className="w-4 h-4 text-blue-500" />
              </div>
              <div className="my-2">
                <div className="text-2xl font-bold text-slate-900">{totalPartsPlaced}</div>
                <span className="text-[11px] text-slate-500">Pieces produced</span>
              </div>
              <div className="text-[10px] text-slate-400 border-t border-slate-100 pt-1.5">
                Demanded components
              </div>
            </div>

            {/* Supporting KPI 4: Remnants Retained */}
            <div className="p-4 rounded-xl border border-slate-200 bg-white flex flex-col justify-between shadow-2xs">
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-xs font-semibold text-slate-700">{t('kpi_remnants_retained')}</span>
                <Layers className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="my-2">
                <div className="text-2xl font-bold text-slate-900">
                  {retainedRemnantsCount + (activeResult ? activeResult.blocks.flatMap((b) => b.usable_remnants).length : 0)}
                </div>
                <span className="text-[11px] text-emerald-600 font-medium">Usable blocks</span>
              </div>
              <div className="text-[10px] text-slate-400 border-t border-slate-100 pt-1.5">
                Stocked in vault
              </div>
            </div>
          </div>

          {/* Middle Row: Latest Result Card + Yield by Job Chart */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Latest Result Card */}
            <div className="p-5 rounded-xl border border-slate-200 bg-white shadow-2xs space-y-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center space-x-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>{t('latest_result_card')}</span>
                  </h2>
                  <span className="text-[10px] font-mono text-slate-400">
                    {activeResult ? activeResult.job_id : 'No run yet'}
                  </span>
                </div>

                {activeResult ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4 text-xs">
                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                      <span className="text-[10px] text-slate-400 block font-medium">Job Name</span>
                      <span className="font-bold text-slate-800 truncate block" title={activeJobTitle}>
                        {activeJobTitle}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                      <span className="text-[10px] text-slate-400 block font-medium">Algorithm</span>
                      <span className="font-bold text-slate-800 truncate block">
                        {activeResult.algorithm_name}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                      <span className="text-[10px] text-slate-400 block font-medium">Machine</span>
                      <span className="font-bold text-slate-800 truncate block">
                        {activeResult.machine.name}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                      <span className="text-[10px] text-slate-400 block font-medium">Net Yield</span>
                      <span className="font-bold text-emerald-700 block">
                        {activeResult.net_utilization_pct}%
                      </span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                      <span className="text-[10px] text-slate-400 block font-medium">Buns Used</span>
                      <span className="font-bold text-slate-800 block">
                        {activeResult.blocks_used_count} of {activeResult.blocks.length}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                      <span className="text-[10px] text-slate-400 block font-medium">Status</span>
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        {activeResult.validation.is_valid ? 'Valid (Yield Certified)' : 'Invalid'}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 py-6 text-center">
                    No active solution in current session. Run optimization to evaluate.
                  </p>
                )}
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[11px] text-slate-400 italic">
                  * {t('cost_disclaimer')}
                </span>
                <button
                  type="button"
                  onClick={() => onNavigateOptimization(latestResultJob)}
                  className="inline-flex items-center space-x-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-lg transition cursor-pointer shadow-xs"
                >
                  <span>{t('open_in_optimization')}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Yield by Job Bar Chart */}
            <div className="p-5 rounded-xl border border-slate-200 bg-white shadow-2xs space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  {t('yield_by_job')}
                </h2>
                <span className="text-[10px] text-slate-400">
                  {yieldChartData.length} recorded run(s)
                </span>
              </div>

              {yieldChartData.length > 0 ? (
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={yieldChartData} margin={{ top: 15, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                      <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748B' }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#64748B' }} />
                      <Tooltip
                        formatter={(val: any) => [`${val}%`, 'Net Usable Yield']}
                        contentStyle={{ backgroundColor: '#FFFFFF', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '11px' }}
                      />
                      <Bar dataKey="yield" radius={[4, 4, 0, 0]}>
                        {yieldChartData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={index === 0 ? '#2563EB' : '#3B82F6'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-56 flex items-center justify-center text-xs text-slate-400">
                  No optimization runs with yield data yet.
                </div>
              )}
            </div>
          </div>

          {/* Bottom Row: Recent Activity Log */}
          <div className="p-5 rounded-xl border border-slate-200 bg-white shadow-2xs space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center space-x-2">
                <Clock className="w-4 h-4 text-slate-500" />
                <span>{t('recent_activity')}</span>
              </h2>
              <span className="text-[10px] text-slate-400">Last 30 actions</span>
            </div>

            {activityLog.length === 0 ? (
              <div className="py-4 text-center text-xs text-slate-400">
                No activity logged yet.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 max-h-56 overflow-y-auto text-xs">
                {activityLog.map((act) => (
                  <div key={act.id} className="py-2.5 flex items-center justify-between">
                    <div className="flex items-center space-x-2.5">
                      <span className={`w-2 h-2 rounded-full ${
                        act.type === 'run' ? 'bg-blue-600' :
                        act.type === 'save' ? 'bg-emerald-600' :
                        act.type === 'inventory' ? 'bg-amber-600' : 'bg-slate-400'
                      }`} />
                      <span className="font-semibold text-slate-800">{act.title}</span>
                      {act.job_id && (
                        <span className="font-mono text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.2 rounded">
                          {act.job_id}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center space-x-3 text-slate-400 text-[11px]">
                      {act.yield_pct != null && (
                        <span className="text-emerald-700 font-bold">{act.yield_pct}% yield</span>
                      )}
                      <span>{new Date(act.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Clear Demo Data Confirmation Modal */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl max-w-sm w-full p-5 space-y-4">
            <h3 className="font-bold text-slate-900 text-sm">{t('clear_demo_data')}</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              {t('clear_demo_confirm')}
            </p>
            <div className="flex justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setShowClearConfirm(false)}
                className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onClearDemoData();
                  setShowClearConfirm(false);
                }}
                className="px-3.5 py-1.5 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-xs transition cursor-pointer"
              >
                Clear Data
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
