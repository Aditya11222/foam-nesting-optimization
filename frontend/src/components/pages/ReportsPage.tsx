import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Printer,
  Download,
  CheckCircle2,
  AlertCircle,
  Database,
  BarChart2,
  DollarSign,
  Layers,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  Cell
} from 'recharts';
import type { SavedJob, OptimizationResult } from '../../types';

interface ReportsPageProps {
  currentJobName: string;
  currentResult: OptimizationResult | null;
  savedJobs: SavedJob[];
  isStale: boolean;
  onExportCSV: () => void;
}

type ReportType = 'summary' | 'comparison' | 'cost' | 'remnants';

export const ReportsPage: React.FC<ReportsPageProps> = ({
  currentJobName,
  currentResult,
  savedJobs,
  isStale,
  onExportCSV,
}) => {
  const { t } = useTranslation();
  const [selectedJobId, setSelectedJobId] = useState<string>('current');
  const [reportType, setReportType] = useState<ReportType>('summary');

  // Resolved job and result
  const activeJob = useMemo(() => {
    if (selectedJobId === 'current') {
      return {
        id: 'current',
        name: currentJobName,
        result: currentResult,
        isStale: isStale,
      };
    }
    const found = savedJobs.find((j) => j.id === selectedJobId);
    return {
      id: found?.id || 'current',
      name: found?.name || 'Untitled Job',
      result: found?.latest_result || null,
      isStale: found?.status === 'Stale',
    };
  }, [selectedJobId, currentJobName, currentResult, isStale, savedJobs]);

  const targetResult = activeJob.result;
  const isReportDisabled = !targetResult || activeJob.isStale;

  const handlePrint = () => {
    window.print();
  };

  // Cost Data
  const matCost = targetResult ? (targetResult.total_usable_volume / 1728) * 4.50 : 0;
  const sawCost = targetResult ? (targetResult.estimated_saw_time_minutes / 60) * 65.0 : 0;
  const remCredit = targetResult ? (targetResult.total_remnant_volume / 1728) * 4.50 * 0.40 : 0;
  const netCost = matCost + sawCost - remCredit;

  const costBreakdownData = [
    { component: 'Raw Foam', amount: Math.round(matCost), color: '#3B82F6' },
    { component: 'Saw Operation', amount: Math.round(sawCost), color: '#6366F1' },
    { component: 'Remnant Credit (-)', amount: Math.round(remCredit), color: '#10B981' },
    { component: 'Net Total Cost', amount: Math.round(netCost), color: '#0F172A' },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-6 lg:p-8 space-y-6 max-w-7xl mx-auto w-full print:p-0 print:max-w-none">
      {/* Page Header (Hidden during browser print) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 print:hidden">
        <div>
          <h1 className="text-xl lg:text-2xl font-black text-slate-900 tracking-tight flex items-center space-x-2">
            <span>{t('report_builder')}</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
              Executive
            </span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Build clean, auditable yield and costing sheets for floor supervisors and procurement auditors.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <div className="hidden sm:flex items-center space-x-1.5 text-xs text-slate-500 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg">
            <Database className="w-3.5 h-3.5 text-slate-400" />
            <span>{t('saved_in_browser_demo')}</span>
          </div>

          {/* Export CSV */}
          <button
            type="button"
            onClick={onExportCSV}
            disabled={isReportDisabled}
            className={`inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border shadow-2xs transition ${
              isReportDisabled
                ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-300 cursor-pointer'
            }`}
            title={isReportDisabled ? t('no_result_report_disabled') : 'Export complete placement manifest to CSV'}
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>

          {/* Print PDF */}
          <button
            type="button"
            onClick={handlePrint}
            disabled={isReportDisabled}
            className={`inline-flex items-center space-x-1.5 px-4 py-1.5 text-xs font-bold rounded-lg transition shadow-xs ${
              isReportDisabled
                ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                : 'bg-slate-900 hover:bg-black text-white cursor-pointer'
            }`}
            title="Open browser print dialog to print or save clean light PDF"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>{t('print_pdf')}</span>
          </button>
        </div>
      </div>

      {/* Report Configuration Selector (Hidden during print) */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-col md:flex-row items-center justify-between gap-4 print:hidden">
        {/* Source Job Selector */}
        <div className="flex items-center space-x-2 text-xs w-full md:w-auto">
          <label className="font-semibold text-slate-600 whitespace-nowrap">
            {t('select_job')}:
          </label>
          <select
            value={selectedJobId}
            onChange={(e) => setSelectedJobId(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-800 text-xs font-medium focus:ring-2 focus:ring-blue-500"
          >
            <option value="current">{t('current_job_option')} ({currentJobName})</option>
            {savedJobs
              .filter((j) => j.latest_result != null)
              .map((j) => (
                <option key={j.id} value={j.id}>
                  {j.name} ({j.job_id} — {j.grade})
                </option>
              ))}
          </select>
        </div>

        {/* Report Type Selector Tabs */}
        <div className="flex items-center space-x-1 overflow-x-auto text-xs w-full md:w-auto">
          {[
            { id: 'summary', label: t('report_summary'), icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
            { id: 'comparison', label: t('report_comparison'), icon: <BarChart2 className="w-3.5 h-3.5" /> },
            { id: 'cost', label: t('report_cost'), icon: <DollarSign className="w-3.5 h-3.5" /> },
            { id: 'remnants', label: t('report_remnants'), icon: <Layers className="w-3.5 h-3.5" /> },
          ].map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setReportType(r.id as ReportType)}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer ${
                reportType === r.id
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <span>{r.icon}</span>
              <span>{r.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Disabled State Banner */}
      {isReportDisabled && (
        <div className="p-6 bg-amber-50 border border-amber-200 rounded-xl flex items-start space-x-3 text-xs text-amber-800 shadow-2xs print:hidden">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-bold block text-sm">Report Unavailable</span>
            <p className="leading-relaxed text-amber-700">
              {t('no_result_report_disabled')}
            </p>
          </div>
        </div>
      )}

      {/* Print Document Container (Clean Light Sheet for Browser Print) */}
      {targetResult && !isReportDisabled && (
        <div className="bg-white border border-slate-200 rounded-xl p-8 shadow-sm space-y-6 print:border-none print:shadow-none print:p-0">
          {/* Document Header */}
          <div className="border-b border-slate-200 pb-4 flex items-center justify-between">
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-mono text-sm font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                  {targetResult.job_id}
                </span>
                <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                  {activeJob.name}
                </h2>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Generated via Tatras NestPro 3D Foam Slicing Optimizer • Model: {targetResult.algorithm_name}
              </p>
            </div>
            <div className="text-right text-xs text-slate-500">
              <div>Date: {new Date().toLocaleDateString()}</div>
              <div className="font-semibold text-slate-700 mt-0.5">Machine: {targetResult.machine.name}</div>
            </div>
          </div>

          {/* Report Content: 1. Executive Summary */}
          {reportType === 'summary' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-xs text-slate-500 block">Net Usable Yield</span>
                  <span className="text-2xl font-black text-emerald-700 mt-1 block">
                    {targetResult.net_utilization_pct}%
                  </span>
                </div>
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-xs text-slate-500 block">Blocks Used</span>
                  <span className="text-2xl font-black text-slate-800 mt-1 block">
                    {targetResult.blocks_used_count} of {targetResult.blocks.length}
                  </span>
                </div>
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-xs text-slate-500 block">Parts Placed</span>
                  <span className="text-2xl font-black text-slate-800 mt-1 block">
                    {targetResult.total_parts_placed} / {targetResult.total_parts_demanded}
                  </span>
                </div>
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-xs text-slate-500 block">Estimated Saw Time</span>
                  <span className="text-2xl font-black text-slate-800 mt-1 block">
                    {Math.round(targetResult.estimated_saw_time_minutes)} min
                  </span>
                </div>
              </div>

              {/* Block Allocation Table */}
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Block Allocation Breakdown
                </h3>
                <table className="w-full text-left text-xs border border-slate-200 rounded-lg overflow-hidden">
                  <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-3">Block #</th>
                      <th className="py-2 px-3">Grade</th>
                      <th className="py-2 px-3 text-right">Parts Placed</th>
                      <th className="py-2 px-3 text-right">Yield (%)</th>
                      <th className="py-2 px-3 text-right">Cuts Count</th>
                      <th className="py-2 px-3 text-right">Remnant Volume</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {targetResult.blocks.map((b) => (
                      <tr key={b.block_index}>
                        <td className="py-2 px-3 font-semibold">Block #{b.block_index}</td>
                        <td className="py-2 px-3">{b.grade}</td>
                        <td className="py-2 px-3 text-right font-medium">{b.placed_parts.length} pcs</td>
                        <td className="py-2 px-3 text-right font-bold text-emerald-700">{b.net_utilization_pct}%</td>
                        <td className="py-2 px-3 text-right">{b.cuts.length}</td>
                        <td className="py-2 px-3 text-right font-mono text-[11px]">
                          {(b.usable_remnants.reduce((sum, r) => sum + r.volume, 0) / 1728).toFixed(2)} ft³
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Report Content: 2. Algorithm Comparison */}
          {reportType === 'comparison' && (
            <div className="space-y-6">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Benchmark Comparison Across Tested Heuristics
              </h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={[
                      { name: 'Baseline', netYield: 41.2, scrapPct: 58.8 },
                      { name: targetResult.algorithm_name.slice(0, 16), netYield: targetResult.net_utilization_pct, scrapPct: Number(((targetResult.total_unrecoverable_scrap_volume / Math.max(1, targetResult.total_gross_volume)) * 100).toFixed(1)) },
                    ]}
                    margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(val) => [`${val}%`]} />
                    <Legend />
                    <Bar dataKey="netYield" name="Net Usable Yield" fill="#2563EB" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="scrapPct" name="Scrap Rate" fill="#EF4444" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="text-xs text-slate-500 italic">
                * Note: Heuristic solutions provide actionable, feasible production bounds without combinatorial explosion.
              </p>
            </div>
          )}

          {/* Report Content: 3. Cost Breakdown */}
          {reportType === 'cost' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Cost Component Breakdown (Estimated Demo Model)
                </h3>
                <span className="font-mono text-xs font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded">
                  Net Expenditure: ${Math.round(netCost).toLocaleString()}
                </span>
              </div>

              <div className="h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={costBreakdownData} margin={{ top: 15, right: 15, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                    <XAxis dataKey="component" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(val) => `$${val}`} />
                    <Tooltip formatter={(val) => [`$${Number(val).toLocaleString()}`, 'Amount']} />
                    <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                      {costBreakdownData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-600 flex justify-between items-center">
                <span>Material: ${Math.round(matCost)} • Sawing: ${Math.round(sawCost)} • Remnant Credit: -${Math.round(remCredit)}</span>
                <span className="italic text-slate-400">* Estimated, demo assumptions</span>
              </div>
            </div>
          )}

          {/* Report Content: 4. Remnants Manifest */}
          {reportType === 'remnants' && (
            <div className="space-y-4">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Retained Reusable Remnants Manifest
              </h3>
              {targetResult.blocks.flatMap((b) => b.usable_remnants).length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  No large remnants retained for this run.
                </div>
              ) : (
                <table className="w-full text-left text-xs border border-slate-200 rounded-lg overflow-hidden">
                  <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-3">Remnant ID</th>
                      <th className="py-2 px-3">Grade</th>
                      <th className="py-2 px-3">Dimensions (L × W × H)</th>
                      <th className="py-2 px-3 text-right">Volume</th>
                      <th className="py-2 px-3 text-center">Usability Score</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {targetResult.blocks.flatMap((b) => b.usable_remnants).map((r) => (
                      <tr key={r.id}>
                        <td className="py-2 px-3 font-mono font-bold text-slate-800">{r.code}</td>
                        <td className="py-2 px-3">{r.grade}</td>
                        <td className="py-2 px-3 font-mono">{r.length}" × {r.width}" × {r.height}"</td>
                        <td className="py-2 px-3 text-right font-medium">{(r.volume / 1728).toFixed(2)} ft³</td>
                        <td className="py-2 px-3 text-center font-bold text-emerald-700">
                          {Math.round(r.usability_score * 100)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Footer Note */}
          <div className="pt-4 border-t border-slate-200 text-[10px] text-slate-400 flex justify-between items-center">
            <span>Tatras NestPro Certified Placement Sheet</span>
            <span>Saved in this browser only (demo)</span>
          </div>
        </div>
      )}
    </div>
  );
};
