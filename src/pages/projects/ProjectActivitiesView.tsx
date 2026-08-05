import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useOutletContext } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Project } from '../../services/api/projects';
import { projectActivitiesApi, type ProjectActivity } from '../../services/api/projectActivities';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import {
  Search,
  Plus,
  X,
  Clock,
  Layers,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Loader2,
  FileDown
} from 'lucide-react';

export const ProjectActivitiesView: React.FC = () => {
  const { id: routeProjectId } = useParams<{ id: string }>();
  const outletContext = useOutletContext<{ project?: Project }>();
  const project = outletContext?.project;

  const projectId = routeProjectId || project?.id || '';
  const queryClient = useQueryClient();
  const confirm = useConfirm();

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');

  // Sidebar Drawer state
  const [isAddDrawerOpen, setIsAddDrawerOpen] = useState(false);
  const [formTitle, setFormTitle] = useState('');
  const [formWorkHrs, setFormWorkHrs] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Fetch activities from PostgreSQL project_activities table
  const { data: rawActivities = [], isLoading } = useQuery<ProjectActivity[]>({
    queryKey: ['project-activities', projectId],
    queryFn: () => (projectId ? projectActivitiesApi.listByProject(projectId) : Promise.resolve([])),
    enabled: !!projectId,
  });

  const safeActivities = useMemo(() => {
    return Array.isArray(rawActivities) ? rawActivities : (rawActivities as any)?.activities || [];
  }, [rawActivities]);

  // Open sidebar adder
  const handleOpenAddDrawer = () => {
    setFormTitle('');
    setFormWorkHrs('');
    setSaveError(null);
    setIsAddDrawerOpen(true);
  };

  // Submit new activity to database
  const handleSaveActivity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) {
      setSaveError('Activity title is required.');
      return;
    }

    const hrsNum = parseFloat(formWorkHrs);
    if (isNaN(hrsNum) || hrsNum < 0) {
      setSaveError('Please enter a valid non-negative number for Work Hrs.');
      return;
    }

    if (!projectId) {
      setSaveError('Missing project ID.');
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    try {
      await projectActivitiesApi.create({
        projectId,
        title: formTitle.trim(),
        workHrs: hrsNum,
      });

      queryClient.invalidateQueries({ queryKey: ['project-activities', projectId] });
      setIsAddDrawerOpen(false);
    } catch (err: any) {
      console.error('Failed to create project activity:', err);
      setSaveError(err.response?.data?.message || err?.message || 'Failed to save activity to database.');
    } finally {
      setIsSaving(false);
    }
  };

  // Handle deleting an activity
  const handleDeleteActivity = async (act: ProjectActivity) => {
    const isConfirmed = await confirm({
      title: 'Delete Activity',
      message: `Are you sure you want to delete "${act.title}"?`,
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      variant: 'danger',
    });

    if (!isConfirmed) return;

    try {
      await projectActivitiesApi.delete(act.id);
      queryClient.invalidateQueries({ queryKey: ['project-activities', projectId] });
    } catch (err: any) {
      console.error('Failed to delete activity:', err);
    }
  };

  // Filter activities by search query
  const filteredActivities = useMemo(() => {
    return safeActivities.filter((act: ProjectActivity) => {
      return !searchQuery.trim() || act.title.toLowerCase().includes(searchQuery.toLowerCase());
    });
  }, [safeActivities, searchQuery]);

  // Calculate total work hours
  const totalWorkHrs = useMemo(() => {
    return safeActivities.reduce((sum: number, act: ProjectActivity) => {
      const hrs = typeof act.workHrs === 'string' ? parseFloat(act.workHrs) : act.workHrs;
      return sum + (isNaN(hrs) ? 0 : hrs);
    }, 0);
  }, [safeActivities]);

  // Export Activities report as PDF
  const handleExportPDF = () => {
    if (!safeActivities.length) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const projectName = project?.name || 'Project';
    const reportDate = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const rowsHtml = safeActivities.map((act: ProjectActivity, idx: number) => {
      const displayHrs = typeof act.workHrs === 'string' ? parseFloat(act.workHrs) : act.workHrs;
      return `
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 12px; text-align: center; color: #64748b; font-size: 12px;">${idx + 1}</td>
          <td style="padding: 12px; font-weight: 600; color: #0f172a; font-size: 13px;">${act.title}</td>
          <td style="padding: 12px; text-align: center; font-weight: 700; color: #7c3aed; font-size: 13px;">${displayHrs} hrs</td>
        </tr>
      `;
    }).join('');

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${projectName} - Activities & Work Hours Report</title>
          <style>
            @media print {
              @page { margin: 20mm; size: A4; }
              body { -webkit-print-color-adjust: exact; }
            }
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
              color: #0f172a;
              margin: 0;
              padding: 40px;
              background: #ffffff;
            }
            .header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              border-bottom: 2px solid #7c3aed;
              padding-bottom: 20px;
              margin-bottom: 30px;
            }
            .title {
              font-size: 22px;
              font-weight: 800;
              color: #0f172a;
              margin: 0 0 6px 0;
            }
            .subtitle {
              font-size: 13px;
              color: #64748b;
              margin: 0;
            }
            .badge {
              background: #f3e8ff;
              color: #7c3aed;
              padding: 6px 14px;
              border-radius: 8px;
              font-weight: 800;
              font-size: 12px;
            }
            .kpi-container {
              display: flex;
              gap: 20px;
              margin-bottom: 30px;
            }
            .kpi-card {
              flex: 1;
              background: #f8fafc;
              border: 1px solid #e2e8f0;
              border-radius: 12px;
              padding: 16px;
            }
            .kpi-label {
              font-size: 11px;
              font-weight: 700;
              text-transform: uppercase;
              color: #64748b;
              margin-bottom: 4px;
            }
            .kpi-value {
              font-size: 20px;
              font-weight: 800;
              color: #0f172a;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 10px;
            }
            th {
              background: #f1f5f9;
              color: #475569;
              font-size: 11px;
              font-weight: 800;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              padding: 12px;
              text-align: left;
              border-bottom: 2px solid #cbd5e1;
            }
            tfoot tr {
              background: #faf5ff;
              font-weight: 800;
            }
            tfoot td {
              padding: 14px 12px;
              border-top: 2px solid #7c3aed;
            }
            .footer {
              margin-top: 40px;
              text-align: center;
              font-size: 11px;
              color: #94a3b8;
              border-top: 1px solid #e2e8f0;
              padding-top: 16px;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <h1 class="title">${projectName}</h1>
              <p class="subtitle">Project Activities & Work Hours Report</p>
            </div>
            <div class="badge">
              Date: ${reportDate}
            </div>
          </div>

          <div class="kpi-container">
            <div class="kpi-card">
              <div class="kpi-label">Total Activities</div>
              <div class="kpi-value">${safeActivities.length}</div>
            </div>
            <div class="kpi-card">
              <div class="kpi-label">Total Work Hours</div>
              <div class="kpi-value" style="color: #7c3aed;">${totalWorkHrs} hrs</div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th style="width: 50px; text-align: center;">#</th>
                <th>Activity Name</th>
                <th style="width: 140px; text-align: center;">Work Hrs</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
            <tfoot>
              <tr>
                <td colspan="2" style="font-size: 13px; color: #0f172a;">Total (${safeActivities.length} Activities)</td>
                <td style="text-align: center; font-size: 14px; color: #7c3aed;">${totalWorkHrs} hrs</td>
              </tr>
            </tfoot>
          </table>

          <div class="footer">
            Generated automatically via WorkOS Management System on ${new Date().toLocaleString()}
          </div>

          <script>
            window.onload = function() {
              window.print();
            };
          </script>
        </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  return (
    <div className="space-y-6 text-slate-800 dark:text-zinc-200 animate-fade-in">
      {/* ── Top Header & Controls Bar ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/70 dark:bg-zinc-900/40 p-4 border border-slate-200 dark:border-zinc-800 rounded-2xl">
        <div className="space-y-0.5">
          <div className="flex items-center space-x-2">
            <Layers className="w-5 h-5 text-purple-500" />
            <h2 className="text-lg font-extrabold text-slate-900 dark:text-white tracking-tight">
              Activities
            </h2>
          </div>
          <p className="text-xs text-muted-foreground font-light">
            Record and view activities and work hours for {project?.name || 'this project'}.
          </p>
        </div>

        {/* Actions: Export PDF & Add Activity */}
        <div className="flex items-center space-x-3 shrink-0">
          <button
            onClick={handleExportPDF}
            disabled={!safeActivities.length}
            className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-white dark:bg-zinc-850 hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-200 border border-slate-200 dark:border-zinc-700 transition-all text-xs font-bold shadow-sm active:scale-95 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            title="Export Activities as PDF"
          >
            <FileDown className="w-4 h-4 text-purple-500" />
            <span>Export as PDF</span>
          </button>

          <button
            onClick={handleOpenAddDrawer}
            className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white transition-all text-xs font-extrabold shadow-lg shadow-purple-500/20 active:scale-95 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Activity</span>
          </button>
        </div>
      </div>

      {/* ── Summary KPI Bar & Search ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/40 dark:bg-zinc-900/20 p-4 border border-slate-200 dark:border-zinc-800 rounded-2xl">
        {/* Search */}
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search activity name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-white dark:bg-background border border-slate-200 dark:border-zinc-800 text-xs text-slate-800 dark:text-zinc-200 focus:outline-none focus:border-purple-500 font-medium"
          />
        </div>

        {/* Summary Badges */}
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2 bg-white dark:bg-background border border-slate-200 dark:border-zinc-800 px-3.5 py-1.5 rounded-xl">
            <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Total Activities:</span>
            <span className="text-xs font-black text-slate-900 dark:text-white">{safeActivities.length}</span>
          </div>

          <div className="flex items-center space-x-2 bg-purple-500/10 border border-purple-500/20 px-3.5 py-1.5 rounded-xl">
            <Clock className="w-3.5 h-3.5 text-purple-500" />
            <span className="text-[10px] font-black uppercase text-purple-600 dark:text-purple-400 tracking-wider">Total Work Hrs:</span>
            <span className="text-xs font-black text-purple-600 dark:text-purple-400">{totalWorkHrs} hrs</span>
          </div>
        </div>
      </div>

      {/* ── Main Activities & Work Hrs Table ── */}
      {isLoading ? (
        <div className="w-full h-48 flex flex-col items-center justify-center space-y-2">
          <Loader2 className="w-6 h-6 text-purple-500 animate-spin" />
          <span className="text-xs text-muted-foreground">Loading project activities from database...</span>
        </div>
      ) : filteredActivities.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-slate-250 dark:border-zinc-800 rounded-3xl space-y-3 bg-slate-50/20 dark:bg-zinc-900/10">
          <Layers className="w-12 h-12 mx-auto text-slate-300 dark:text-zinc-700" />
          <div className="space-y-1">
            <h4 className="text-sm font-bold text-slate-800 dark:text-zinc-300">No Activities Logged</h4>
            <p className="text-xs text-muted-foreground font-light max-w-sm mx-auto">
              Click "+ Add Activity" to record a new activity and work hours for this project.
            </p>
          </div>
          <button
            onClick={handleOpenAddDrawer}
            className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition shadow-md"
          >
            <Plus className="w-4 h-4" />
            <span>Add Activity</span>
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-background/40 shadow-sm">
          <table className="w-full text-left border-collapse min-w-[500px]">
            <thead>
              <tr className="border-b border-slate-200 dark:border-zinc-800 bg-slate-50/80 dark:bg-zinc-900/60 text-[11px] font-black uppercase text-slate-500 dark:text-zinc-400 tracking-wider">
                <th className="px-6 py-4">Activity</th>
                <th className="px-6 py-4 w-48 text-center text-purple-600 dark:text-purple-400">
                  Work Hrs
                </th>
                <th className="px-6 py-4 w-24 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-150 dark:divide-zinc-850 text-xs font-medium">
              {filteredActivities.map((act: ProjectActivity) => {
                const displayHrs = typeof act.workHrs === 'string' ? parseFloat(act.workHrs) : act.workHrs;
                return (
                  <tr
                    key={act.id}
                    className="hover:bg-slate-50/60 dark:hover:bg-zinc-900/20 transition-colors duration-150"
                  >
                    {/* Activity Name */}
                    <td className="px-6 py-4 align-middle">
                      <div className="flex items-center space-x-3">
                        <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-500 shrink-0">
                          <CheckCircle2 className="w-4 h-4" />
                        </div>
                        <p className="font-extrabold text-slate-900 dark:text-zinc-100 text-xs leading-snug">
                          {act.title}
                        </p>
                      </div>
                    </td>

                    {/* Work Hrs */}
                    <td className="px-6 py-4 align-middle text-center">
                      <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-600 dark:text-purple-400 font-extrabold text-xs">
                        <Clock className="w-3.5 h-3.5 shrink-0 text-purple-500" />
                        <span>{displayHrs} hrs</span>
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="px-6 py-4 align-middle text-right">
                      <button
                        onClick={() => handleDeleteActivity(act)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-500/10 transition cursor-pointer"
                        title="Delete Activity"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {/* Table Footer Totals */}
            <tfoot>
              <tr className="border-t border-slate-200 dark:border-zinc-800 bg-slate-50/90 dark:bg-zinc-900/80 font-black text-xs">
                <td className="px-6 py-3.5 text-slate-700 dark:text-zinc-300">
                  Total ({filteredActivities.length} Activities)
                </td>
                <td className="px-6 py-3.5 text-center text-purple-600 dark:text-purple-400 text-sm">
                  {totalWorkHrs} hrs
                </td>
                <td className="px-6 py-3.5 text-right" />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* ── Activity Adder Sidebar Drawer ── */}
      {isAddDrawerOpen && createPortal(
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-[9999] transition-opacity animate-fade-in-backdrop"
            onClick={() => !isSaving && setIsAddDrawerOpen(false)}
          />

          {/* Drawer Container */}
          <div className="fixed top-0 right-0 h-screen w-full sm:w-[440px] bg-slate-50 dark:bg-zinc-950 border-l border-slate-200 dark:border-zinc-800 z-[10000] shadow-2xl flex flex-col animate-slide-in-right">
            {/* Drawer Header */}
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-zinc-800 px-6 py-5 bg-white dark:bg-zinc-900/50">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-500">
                  <Plus className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 dark:text-white">
                  Add Activity
                </h3>
              </div>
              <button
                type="button"
                disabled={isSaving}
                onClick={() => setIsAddDrawerOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-zinc-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Body Form */}
            <form onSubmit={handleSaveActivity} className="flex-1 flex flex-col justify-between overflow-y-auto p-6 space-y-6">
              <div className="space-y-5">
                {saveError && (
                  <div className="flex items-start space-x-2 p-3 text-xs bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 font-medium">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{saveError}</span>
                  </div>
                )}

                {/* Input Field 1: Activity */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-slate-500 dark:text-zinc-400 tracking-wider">
                    Activity <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    disabled={isSaving}
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    placeholder="Enter activity title..."
                    className="w-full bg-white dark:bg-background border border-slate-200 dark:border-zinc-800 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white font-medium transition outline-none"
                    autoFocus
                    required
                  />
                </div>

                {/* Input Field 2: Work Hrs */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-slate-500 dark:text-zinc-400 tracking-wider">
                    Work Hrs <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      disabled={isSaving}
                      value={formWorkHrs}
                      onChange={(e) => setFormWorkHrs(e.target.value)}
                      placeholder="Enter work hours (e.g. 8)"
                      className="w-full bg-white dark:bg-background border border-slate-200 dark:border-zinc-800 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white font-bold transition outline-none pl-9"
                      required
                    />
                    <Clock className="w-4 h-4 text-purple-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* Drawer Footer Actions */}
              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-200 dark:border-zinc-800">
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => setIsAddDrawerOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-800 text-xs font-bold text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 transition cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={isSaving || !formTitle.trim() || !formWorkHrs}
                  className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-black uppercase tracking-wider shadow-lg shadow-purple-500/20 transition active:scale-95 flex items-center space-x-2 cursor-pointer disabled:opacity-40"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      <span>Save Activity</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </>,
        document.body
      )}
    </div>
  );
};

export default ProjectActivitiesView;
