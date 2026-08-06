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
  FileDown,
  ChevronDown,
  ChevronRight,
  CornerDownRight,
  FolderKanban,
  Pencil
} from 'lucide-react';

interface HierarchicalActivity extends ProjectActivity {
  subActivities: ProjectActivity[];
  ownHrs: number;
  totalSubHrs: number;
  totalHrs: number;
}

export const ProjectActivitiesView: React.FC = () => {
  const { id: routeProjectId } = useParams<{ id: string }>();
  const outletContext = useOutletContext<{ project?: Project }>();
  const project = outletContext?.project;

  const projectId = routeProjectId || project?.id || '';
  const queryClient = useQueryClient();
  const confirm = useConfirm();

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');

  // Expand / Collapse State for Parent Activities (default expanded)
  const [expandedParents, setExpandedParents] = useState<Record<string, boolean>>({});

  // Sidebar Drawer state
  const [isAddDrawerOpen, setIsAddDrawerOpen] = useState(false);
  const [editingActivity, setEditingActivity] = useState<ProjectActivity | null>(null);
  const [targetParentId, setTargetParentId] = useState<string | null>(null);
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

  // Build Parent-Child Activity Hierarchy
  const activityHierarchy = useMemo(() => {
    const mainList: ProjectActivity[] = [];
    const subMap: Record<string, ProjectActivity[]> = {};

    safeActivities.forEach((act: ProjectActivity) => {
      const parentId = act.parentId;
      if (!parentId) {
        mainList.push(act);
      } else {
        if (!subMap[parentId]) {
          subMap[parentId] = [];
        }
        subMap[parentId].push(act);
      }
    });

    const result: HierarchicalActivity[] = mainList.map((main) => {
      const subs = subMap[main.id] || [];
      const ownHrs = typeof main.workHrs === 'string' ? parseFloat(main.workHrs) || 0 : main.workHrs || 0;
      const totalSubHrs = subs.reduce((sum, s) => {
        const h = typeof s.workHrs === 'string' ? parseFloat(s.workHrs) || 0 : s.workHrs || 0;
        return sum + h;
      }, 0);

      return {
        ...main,
        subActivities: subs,
        ownHrs,
        totalSubHrs,
        totalHrs: ownHrs + totalSubHrs,
      };
    });

    return result;
  }, [safeActivities]);

  // Toggle Row Expansion
  const toggleExpand = (parentId: string) => {
    setExpandedParents((prev) => ({
      ...prev,
      [parentId]: prev[parentId] === undefined ? false : !prev[parentId],
    }));
  };

  const isExpanded = (parentId: string) => {
    return expandedParents[parentId] !== false; // Default true (expanded)
  };

  // Open Add Drawer (Main or Sub Activity)
  const handleOpenAddDrawer = (parentId: string | null = null) => {
    setEditingActivity(null);
    setTargetParentId(parentId);
    setFormTitle('');
    setFormWorkHrs('');
    setSaveError(null);
    setIsAddDrawerOpen(true);
  };

  // Open Edit Drawer
  const handleOpenEditDrawer = (act: ProjectActivity) => {
    setEditingActivity(act);
    setTargetParentId(act.parentId || null);
    setFormTitle(act.title);
    setFormWorkHrs(String(act.workHrs));
    setSaveError(null);
    setIsAddDrawerOpen(true);
  };

  // Target Parent Activity Object
  const targetParentActivity = useMemo(() => {
    if (!targetParentId) return null;
    return safeActivities.find((a: ProjectActivity) => a.id === targetParentId) || null;
  }, [targetParentId, safeActivities]);

  // Save Activity to Database
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
      if (editingActivity) {
        await projectActivitiesApi.update(editingActivity.id, {
          title: formTitle.trim(),
          workHrs: hrsNum,
        });
      } else {
        await projectActivitiesApi.create({
          projectId,
          parentId: targetParentId || null,
          title: formTitle.trim(),
          workHrs: hrsNum,
        });
      }

      // Expand parent automatically if sub-activity was added/edited
      if (targetParentId) {
        setExpandedParents((prev) => ({ ...prev, [targetParentId]: true }));
      }

      queryClient.invalidateQueries({ queryKey: ['project-activities', projectId] });
      setIsAddDrawerOpen(false);
    } catch (err: any) {
      console.error('Failed to create project activity:', err);
      setSaveError(err.response?.data?.message || err?.message || 'Failed to save activity to database.');
    } finally {
      setIsSaving(false);
    }
  };

  // Delete Activity (Main or Sub)
  const handleDeleteActivity = async (act: ProjectActivity, isParent: boolean = false) => {
    const isConfirmed = await confirm({
      title: isParent ? 'Delete Main Activity' : 'Delete Sub-Activity',
      message: isParent
        ? `Are you sure you want to delete "${act.title}" and all of its sub-activities?`
        : `Are you sure you want to delete sub-activity "${act.title}"?`,
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

  // Filter Hierarchy by Search
  const filteredHierarchy = useMemo(() => {
    if (!searchQuery.trim()) return activityHierarchy;

    const q = searchQuery.toLowerCase();
    return activityHierarchy.filter((parent) => {
      const parentMatches = parent.title.toLowerCase().includes(q);
      const subMatches = parent.subActivities.some((s) => s.title.toLowerCase().includes(q));
      return parentMatches || subMatches;
    });
  }, [activityHierarchy, searchQuery]);

  // Total Work Hours across entire project
  const grandTotalWorkHrs = useMemo(() => {
    return safeActivities.reduce((sum: number, act: ProjectActivity) => {
      const hrs = typeof act.workHrs === 'string' ? parseFloat(act.workHrs) : act.workHrs;
      return sum + (isNaN(hrs) ? 0 : hrs);
    }, 0);
  }, [safeActivities]);

  // Export PDF Report
  const handleExportPDF = () => {
    if (!activityHierarchy.length) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const projectName = project?.name || 'Project';
    const reportDate = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    let rowsHtml = '';
    activityHierarchy.forEach((parent, pIdx) => {
      rowsHtml += `
        <tr style="background: #f8fafc; border-top: 2px solid #cbd5e1; border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 12px; text-align: center; font-weight: 800; color: #475569; font-size: 13px;">${pIdx + 1}</td>
          <td style="padding: 12px; font-weight: 800; color: #0f172a; font-size: 14px;">
            📦 ${parent.title}
          </td>
          <td style="padding: 12px; text-align: center; font-weight: 800; color: #7c3aed; font-size: 13px;">
            ${parent.totalHrs} hrs
          </td>
        </tr>
      `;

      parent.subActivities.forEach((sub) => {
        const subHrs = typeof sub.workHrs === 'string' ? parseFloat(sub.workHrs) : sub.workHrs;
        rowsHtml += `
          <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 10px; text-align: center; color: #94a3b8; font-size: 11px;"></td>
            <td style="padding: 10px 10px 10px 36px; color: #334155; font-size: 13px; font-weight: 600;">
              <span style="color: #a855f7; font-weight: 700; margin-right: 6px;">└─</span> 📌 ${sub.title}
            </td>
            <td style="padding: 10px; text-align: center; font-weight: 700; color: #6b21a8; font-size: 12px;">
              ${subHrs} hrs
            </td>
          </tr>
        `;
      });
    });

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${projectName} - Activity Hierarchy Report</title>
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
              <p class="subtitle">Main & Sub-Activity Hierarchy Report</p>
            </div>
            <div class="badge">Date: ${reportDate}</div>
          </div>

          <div class="kpi-container">
            <div class="kpi-card">
              <div class="kpi-label">Main Activities</div>
              <div class="kpi-value">${activityHierarchy.length}</div>
            </div>
            <div class="kpi-card">
              <div class="kpi-label">Total Sub-Activities</div>
              <div class="kpi-value">${safeActivities.length - activityHierarchy.length}</div>
            </div>
            <div class="kpi-card">
              <div class="kpi-label">Grand Total Work Hrs</div>
              <div class="kpi-value" style="color: #7c3aed;">${grandTotalWorkHrs} hrs</div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th style="width: 50px; text-align: center;">#</th>
                <th>Activity Hierarchy</th>
                <th style="width: 140px; text-align: center;">Work Hrs</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
            <tfoot>
              <tr>
                <td colspan="2" style="font-size: 13px; color: #0f172a;">Grand Total (${safeActivities.length} Total Logged Items)</td>
                <td style="text-align: center; font-size: 14px; color: #7c3aed;">${grandTotalWorkHrs} hrs</td>
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
            Manage main activities, sub-activities, and work hours for {project?.name || 'this project'}.
          </p>
        </div>

        {/* Actions: Export PDF & Add Main Activity */}
        <div className="flex items-center space-x-3 shrink-0">
          <button
            onClick={handleExportPDF}
            disabled={!safeActivities.length}
            className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-white dark:bg-zinc-850 hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-200 border border-slate-200 dark:border-zinc-700 transition-all text-xs font-bold shadow-sm active:scale-95 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            title="Export Activity Hierarchy as PDF"
          >
            <FileDown className="w-4 h-4 text-purple-500" />
            <span>Export as PDF</span>
          </button>

          <button
            onClick={() => handleOpenAddDrawer(null)}
            className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white transition-all text-xs font-extrabold shadow-lg shadow-purple-500/20 active:scale-95 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Main Activity</span>
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
        <div className="flex items-center space-x-3 overflow-x-auto">
          <div className="flex items-center space-x-2 bg-white dark:bg-background border border-slate-200 dark:border-zinc-800 px-3.5 py-1.5 rounded-xl shrink-0">
            <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Main Activities:</span>
            <span className="text-xs font-black text-slate-900 dark:text-white">{activityHierarchy.length}</span>
          </div>

          <div className="flex items-center space-x-2 bg-purple-500/10 border border-purple-500/20 px-3.5 py-1.5 rounded-xl shrink-0">
            <Clock className="w-3.5 h-3.5 text-purple-500" />
            <span className="text-[10px] font-black uppercase text-purple-600 dark:text-purple-400 tracking-wider">Total Work Hrs:</span>
            <span className="text-xs font-black text-purple-600 dark:text-purple-400">{grandTotalWorkHrs} hrs</span>
          </div>
        </div>
      </div>

      {/* ── Main Activity & Sub Activity Hierarchy Table ── */}
      {isLoading ? (
        <div className="w-full h-48 flex flex-col items-center justify-center space-y-2">
          <Loader2 className="w-6 h-6 text-purple-500 animate-spin" />
          <span className="text-xs text-muted-foreground">Loading project activities from database...</span>
        </div>
      ) : filteredHierarchy.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-slate-250 dark:border-zinc-800 rounded-3xl space-y-3 bg-slate-50/20 dark:bg-zinc-900/10">
          <FolderKanban className="w-12 h-12 mx-auto text-slate-300 dark:text-zinc-700" />
          <div className="space-y-1">
            <h4 className="text-sm font-bold text-slate-800 dark:text-zinc-300">No Activities Logged</h4>
            <p className="text-xs text-muted-foreground font-light max-w-sm mx-auto">
              Click "+ Add Main Activity" to record a new main activity for this project.
            </p>
          </div>
          <button
            onClick={() => handleOpenAddDrawer(null)}
            className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition shadow-md cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Main Activity</span>
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-background/40 shadow-sm">
          <table className="w-full text-left border-collapse min-w-[640px]">
            <thead>
              <tr className="border-b border-slate-200 dark:border-zinc-800 bg-slate-50/80 dark:bg-zinc-900/60 text-[11px] font-black uppercase text-slate-500 dark:text-zinc-400 tracking-wider">
                <th className="px-5 py-4">Activity Hierarchy</th>
                <th className="px-5 py-4 w-44 text-center text-purple-600 dark:text-purple-400">
                  Work Hrs
                </th>
                <th className="px-5 py-4 w-52 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-150 dark:divide-zinc-850 text-xs font-medium">
              {filteredHierarchy.map((parent) => {
                const parentExpanded = isExpanded(parent.id);
                const hasSubs = parent.subActivities.length > 0;

                return (
                  <React.Fragment key={parent.id}>
                    {/* ── Main Activity Row ── */}
                    <tr className="bg-slate-50/60 dark:bg-zinc-900/40 hover:bg-slate-100/70 dark:hover:bg-zinc-900/70 transition-colors duration-150 group border-t-2 border-slate-200/80 dark:border-zinc-800">
                      {/* Title & Expand Caret */}
                      <td className="px-5 py-3.5 align-middle">
                        <div className="flex items-center space-x-2.5">
                          {/* Caret Button */}
                          <button
                            onClick={() => toggleExpand(parent.id)}
                            className="p-1 rounded-md text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-500/10 transition cursor-pointer shrink-0"
                            title={parentExpanded ? 'Collapse sub-activities' : 'Expand sub-activities'}
                          >
                            {parentExpanded ? (
                              <ChevronDown className="w-4 h-4 text-purple-500" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-slate-400" />
                            )}
                          </button>

                          {/* Container Icon */}
                          <div className="p-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-500 shrink-0">
                            <Layers className="w-4 h-4" />
                          </div>

                          {/* Main Activity Title */}
                          <div className="space-y-0.5">
                            <span className="font-black text-slate-900 dark:text-white text-xs tracking-tight">
                              {parent.title}
                            </span>
                            {hasSubs && (
                              <span className="ml-2 px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400 text-[10px] font-bold">
                                {parent.subActivities.length} sub-{parent.subActivities.length === 1 ? 'activity' : 'activities'}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Work Hrs */}
                      <td className="px-5 py-3.5 align-middle text-center">
                        <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-700 dark:text-purple-300 font-black text-xs">
                          <Clock className="w-3.5 h-3.5 shrink-0 text-purple-500" />
                          <span>{parent.totalHrs} hrs</span>
                        </span>
                      </td>

                      {/* Actions: Add Sub Activity, Edit & Delete */}
                      <td className="px-5 py-3.5 align-middle text-right">
                        <div className="flex items-center justify-end space-x-2">
                          <button
                            onClick={() => handleOpenAddDrawer(parent.id)}
                            className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-purple-500/10 hover:bg-purple-500 text-purple-600 hover:text-white border border-purple-500/20 transition text-[11px] font-extrabold cursor-pointer active:scale-95"
                            title="Add sub-activity under this main activity"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Sub Activity</span>
                          </button>

                          <button
                            onClick={() => handleOpenEditDrawer(parent)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-500/10 transition cursor-pointer"
                            title="Edit Main Activity"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => handleDeleteActivity(parent, true)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-500/10 transition cursor-pointer"
                            title="Delete Main Activity"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* ── Sub-Activity Rows (if expanded) ── */}
                    {parentExpanded &&
                      parent.subActivities.map((sub) => {
                        const subHrs = typeof sub.workHrs === 'string' ? parseFloat(sub.workHrs) : sub.workHrs;

                        return (
                          <tr
                            key={sub.id}
                            className="bg-white dark:bg-zinc-950/20 hover:bg-slate-50/80 dark:hover:bg-zinc-900/30 transition-colors duration-150"
                          >
                            {/* Indented Sub-Activity Title */}
                            <td className="px-5 py-2.5 align-middle pl-12">
                              <div className="flex items-center space-x-2.5">
                                <CornerDownRight className="w-4 h-4 text-purple-400 shrink-0" />
                                <div className="p-1 rounded-md bg-purple-500/10 text-purple-500 shrink-0">
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                </div>
                                <span className="font-semibold text-slate-700 dark:text-zinc-200 text-xs">
                                  {sub.title}
                                </span>
                              </div>
                            </td>

                            {/* Sub-Activity Work Hrs */}
                            <td className="px-5 py-2.5 align-middle text-center">
                              <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-lg bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 font-bold text-[11px]">
                                <Clock className="w-3 h-3 text-slate-400" />
                                <span>{subHrs} hrs</span>
                              </span>
                            </td>

                            {/* Sub-Activity Edit & Delete Actions */}
                            <td className="px-5 py-2.5 align-middle text-right">
                              <div className="flex items-center justify-end space-x-1">
                                <button
                                  onClick={() => handleOpenEditDrawer(sub)}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-500/10 transition cursor-pointer"
                                  title="Edit Sub-Activity"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>

                                <button
                                  onClick={() => handleDeleteActivity(sub, false)}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-500/10 transition cursor-pointer"
                                  title="Delete Sub-Activity"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                  </React.Fragment>
                );
              })}
            </tbody>
            {/* Table Footer Totals */}
            <tfoot>
              <tr className="border-t-2 border-slate-200 dark:border-zinc-800 bg-slate-50/90 dark:bg-zinc-900/80 font-black text-xs">
                <td className="px-5 py-3.5 text-slate-700 dark:text-zinc-300">
                  Grand Total ({filteredHierarchy.length} Main Activities, {safeActivities.length} Total Items)
                </td>
                <td className="px-5 py-3.5 text-center text-purple-600 dark:text-purple-400 text-sm">
                  {grandTotalWorkHrs} hrs
                </td>
                <td className="px-5 py-3.5 text-right" />
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
                  {editingActivity ? <Pencil className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                </div>
                <div>
                  <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 dark:text-white">
                    {editingActivity
                      ? (editingActivity.parentId ? 'Edit Sub-Activity' : 'Edit Main Activity')
                      : (targetParentActivity ? 'Add Sub-Activity' : 'Add Main Activity')}
                  </h3>
                  {targetParentActivity && !editingActivity && (
                    <p className="text-[11px] text-purple-600 dark:text-purple-400 font-bold truncate max-w-[260px]">
                      Under: {targetParentActivity.title}
                    </p>
                  )}
                </div>
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

                {/* Parent Activity Indicator (If Sub Activity) */}
                {targetParentActivity && !editingActivity && (
                  <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-xl space-y-1">
                    <span className="text-[10px] font-black uppercase text-purple-600 dark:text-purple-400 tracking-wider">
                      Parent Activity:
                    </span>
                    <p className="text-xs font-black text-slate-900 dark:text-white">
                      📦 {targetParentActivity.title}
                    </p>
                  </div>
                )}

                {/* Input Field 1: Title */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-slate-500 dark:text-zinc-400 tracking-wider">
                    {editingActivity
                      ? 'Activity Name'
                      : targetParentActivity
                      ? 'Sub-Activity Name'
                      : 'Main Activity Name'}{' '}
                    <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    disabled={isSaving}
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    placeholder={targetParentActivity ? "e.g. AS-IS Mapping..." : "e.g. Requirement Gathering..."}
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
                      placeholder="Enter work hours (e.g. 4)"
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
                      {editingActivity ? <Pencil className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                      <span>
                        {editingActivity
                          ? 'Update Activity'
                          : targetParentActivity
                          ? 'Save Sub-Activity'
                          : 'Save Main Activity'}
                      </span>
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

