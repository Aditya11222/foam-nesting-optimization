import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FolderKanban,
  Search,
  Plus,
  ArrowUpRight,
  Copy,
  Edit2,
  Trash2,
  Tag,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Database,
  FileCode
} from 'lucide-react';
import type { SavedJob } from '../../types';

interface ProjectsPageProps {
  savedJobs: SavedJob[];
  currentJobId: string;
  onOpenJob: (job: SavedJob) => void;
  onNewJob: () => void;
  onDuplicateJob: (job: SavedJob) => void;
  onRenameJob: (jobId: string, newName: string) => void;
  onDeleteJob: (jobId: string) => void;
}

export const ProjectsPage: React.FC<ProjectsPageProps> = ({
  savedJobs,
  currentJobId,
  onOpenJob,
  onNewJob,
  onDuplicateJob,
  onRenameJob,
  onDeleteJob,
}) => {
  const { t, i18n } = useTranslation();
  const [searchTerm, setSearchTerm] = useState('');
  const [gradeFilter, setGradeFilter] = useState<string>('all');
  const [deletingJob, setDeletingJob] = useState<SavedJob | null>(null);
  const [editingJob, setEditingJob] = useState<{ id: string; name: string } | null>(null);

  const filteredJobs = useMemo(() => {
    return savedJobs
      .filter((j) => {
        const matchesSearch =
          j.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          j.job_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (j.customer_ref && j.customer_ref.toLowerCase().includes(searchTerm.toLowerCase()));
        const matchesGrade = gradeFilter === 'all' || j.grade === gradeFilter;
        return matchesSearch && matchesGrade;
      })
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  }, [savedJobs, searchTerm, gradeFilter]);

  const gradesList = useMemo(() => {
    const set = new Set(savedJobs.map((j) => j.grade));
    return ['all', ...Array.from(set)];
  }, [savedJobs]);

  const formatDate = (isoString?: string) => {
    if (!isoString) return '—';
    try {
      const d = new Date(isoString);
      return new Intl.DateTimeFormat(i18n.language === 'es' ? 'es-ES' : 'en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(d);
    } catch {
      return isoString;
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 lg:p-8 space-y-6 max-w-7xl mx-auto w-full">
      {/* Page Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-xl lg:text-2xl font-black text-slate-900 tracking-tight flex items-center space-x-2">
            <span>{t('saved_jobs_title')}</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
              {savedJobs.length} Jobs
            </span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Manage, duplicate, and resume foam cutting production batches saved in this browser.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <div className="hidden sm:flex items-center space-x-1.5 text-xs text-slate-500 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg">
            <Database className="w-3.5 h-3.5 text-slate-400" />
            <span>{t('saved_in_browser_demo')}</span>
          </div>

          <button
            type="button"
            onClick={onNewJob}
            className="inline-flex items-center space-x-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg transition shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>{t('new_job')}</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Controls Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={t('search_jobs')}
            className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-slate-50/50"
          />
        </div>

        {/* Grade Filter Chips */}
        <div className="flex items-center space-x-1.5 overflow-x-auto text-xs">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mr-1">
            Grade:
          </span>
          {gradesList.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGradeFilter(g)}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold transition cursor-pointer ${
                gradeFilter === g
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {g === 'all' ? t('all_grades') : g}
            </button>
          ))}
        </div>
      </div>

      {/* Jobs Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden">
        {filteredJobs.length === 0 ? (
          <div className="py-16 text-center text-xs text-slate-400 space-y-3">
            <FolderKanban className="w-10 h-10 text-slate-300 mx-auto" />
            <p>No jobs found matching current filters.</p>
            <button
              type="button"
              onClick={onNewJob}
              className="inline-flex items-center space-x-1 text-xs text-blue-600 font-semibold hover:underline"
            >
              <span>Create a new job</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold select-none">
                <tr>
                  <th className="py-3 px-4">{t('table_name')}</th>
                  <th className="py-3 px-3">{t('table_id')}</th>
                  <th className="py-3 px-3">{t('table_grade')}</th>
                  <th className="py-3 px-3">{t('table_machine')}</th>
                  <th className="py-3 px-3">{t('table_algorithm')}</th>
                  <th className="py-3 px-3 text-right">{t('table_parts')}</th>
                  <th className="py-3 px-3 text-right">{t('table_yield')}</th>
                  <th className="py-3 px-3 text-center">{t('table_status')}</th>
                  <th className="py-3 px-3">{t('table_modified')}</th>
                  <th className="py-3 px-4 text-right">{t('table_actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredJobs.map((job) => {
                  const isCurrent = job.job_id === currentJobId;
                  const partsPlaced = job.parts_placed_count ?? job.parts.reduce((a, b) => a + b.quantity, 0);

                  return (
                    <tr
                      key={job.id}
                      className={`hover:bg-slate-50/80 transition ${
                        isCurrent ? 'bg-blue-50/30' : ''
                      }`}
                    >
                      {/* Name & Customer */}
                      <td className="py-3 px-4 font-semibold text-slate-900 max-w-[220px]">
                        <div className="flex items-center space-x-2">
                          <span className="truncate" title={job.name}>
                            {job.name}
                          </span>
                          {isCurrent && (
                            <span className="shrink-0 text-[9px] uppercase px-1.5 py-0.2 rounded bg-blue-100 text-blue-700 font-bold">
                              Active
                            </span>
                          )}
                        </div>
                        {job.customer_ref && (
                          <div className="text-[10px] text-slate-400 font-normal flex items-center space-x-1 mt-0.5 truncate">
                            <Tag className="w-2.5 h-2.5 shrink-0" />
                            <span className="truncate">{job.customer_ref}</span>
                          </div>
                        )}
                        {job.last_gcode_export && (
                          <div
                            className="text-[10px] text-amber-700 font-medium flex items-center space-x-1 mt-0.5 truncate"
                            title={`Exported on ${job.last_gcode_export.machine_name} (${job.last_gcode_export.filenames.join(', ')})`}
                          >
                            <FileCode className="w-2.5 h-2.5 shrink-0 text-amber-600" />
                            <span>G-code exported {new Date(job.last_gcode_export.exported_at).toLocaleDateString()}</span>
                          </div>
                        )}
                      </td>

                      {/* Job ID */}
                      <td className="py-3 px-3 font-mono text-slate-600 text-[11px]">
                        {job.job_id}
                      </td>

                      {/* Grade */}
                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                          {job.grade}
                        </span>
                      </td>

                      {/* Machine */}
                      <td className="py-3 px-3 text-slate-600 truncate max-w-[120px]">
                        {job.machine_id}
                      </td>

                      {/* Algorithm */}
                      <td className="py-3 px-3 text-slate-600 font-mono text-[10px] truncate max-w-[130px]" title={job.algorithm_id}>
                        {job.algorithm_id.replace('ortools_', '')}
                      </td>

                      {/* Parts Count */}
                      <td className="py-3 px-3 text-right font-medium text-slate-800">
                        {partsPlaced} pcs
                      </td>

                      {/* Yield */}
                      <td className="py-3 px-3 text-right font-bold">
                        {job.yield_pct != null ? (
                          <span className="text-emerald-700">{job.yield_pct.toFixed(1)}%</span>
                        ) : (
                          <span className="text-slate-400 font-normal">—</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-3 text-center">
                        {job.status === 'Optimized' ? (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>Optimized</span>
                          </span>
                        ) : job.status === 'Stale' ? (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-300">
                            <AlertTriangle className="w-3 h-3 text-amber-600" />
                            <span>Stale</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600">
                            <Clock className="w-3 h-3 text-slate-400" />
                            <span>Not optimized</span>
                          </span>
                        )}
                      </td>

                      {/* Last Modified */}
                      <td className="py-3 px-3 text-slate-500 text-[11px] whitespace-nowrap">
                        {formatDate(job.updated_at)}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right space-x-1.5 whitespace-nowrap">
                        {/* Open Button */}
                        <button
                          type="button"
                          onClick={() => onOpenJob(job)}
                          className="inline-flex items-center space-x-1 px-2.5 py-1 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md border border-blue-200 transition cursor-pointer"
                          title="Open job in Optimization workspace"
                        >
                          <span>{t('action_open')}</span>
                          <ArrowUpRight className="w-3 h-3" />
                        </button>

                        {/* Duplicate */}
                        <button
                          type="button"
                          onClick={() => onDuplicateJob(job)}
                          className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded transition cursor-pointer"
                          title="Duplicate Job"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>

                        {/* Rename */}
                        <button
                          type="button"
                          onClick={() => setEditingJob({ id: job.id, name: job.name })}
                          className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded transition cursor-pointer"
                          title="Rename Job"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>

                        {/* Delete */}
                        <button
                          type="button"
                          onClick={() => setDeletingJob(job)}
                          className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition cursor-pointer"
                          title="Delete Job"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Rename Modal */}
      {editingJob && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl max-w-sm w-full p-5 space-y-4">
            <h3 className="font-bold text-slate-900 text-sm">Rename Job</h3>
            <input
              type="text"
              value={editingJob.name}
              onChange={(e) => setEditingJob({ ...editingJob, name: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && editingJob.name.trim()) {
                  onRenameJob(editingJob.id, editingJob.name.trim());
                  setEditingJob(null);
                }
              }}
              className="w-full px-3 py-1.5 text-xs border border-blue-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
              autoFocus
            />
            <div className="flex justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingJob(null)}
                className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (editingJob.name.trim()) {
                    onRenameJob(editingJob.id, editingJob.name.trim());
                    setEditingJob(null);
                  }
                }}
                className="px-3.5 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs transition"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingJob && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl max-w-sm w-full p-5 space-y-4">
            <h3 className="font-bold text-slate-900 text-sm">Delete Job</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              {t('delete_job_confirm', { name: deletingJob.name })}
            </p>
            <div className="flex justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setDeletingJob(null)}
                className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteJob(deletingJob.id);
                  setDeletingJob(null);
                }}
                className="px-3.5 py-1.5 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-xs transition"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
