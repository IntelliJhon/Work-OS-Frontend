import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useOutletContext } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Project } from '../../services/api/projects';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { tasksApi } from '../../services/api/tasks.api';
import { uploadsApi } from '../../services/api/uploads';
import { usersApi } from '../../services/api/users';
import type { User } from '../../services/api/users';
import { activitiesApi } from '../../services/api/sprints';
import { PermissionGate } from '../../features/auth/PermissionGate';
import { PERMISSIONS } from '../../features/auth/permission.constants';
import {
  ListTodo,
  Paperclip,
  Download,
  Trash,
  Plus,
  X,
  User as UserIcon,
  Search,
  AlertTriangle,
  CheckCircle,
  HelpCircle,
  FileText,
  Pencil
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────
interface SubTaskFile {
  id: string;
  name: string;
  publicUrl: string;
}

interface SubTask {
  id: string;
  title: string;
  done: boolean;
  startDate?: string;
  endDate?: string;
  timeEstimate?: number | null;
  completedAt?: string | null;
  createdAt?: string;
  status?: 'to_do' | 'in_progress' | 'done';
  priority?: 'low' | 'medium' | 'high' | 'critical';
  assignee?: string;
  assigneeId?: string;
  remarks?: string;
  files?: SubTaskFile[];
}

interface OPLItem extends SubTask {
  parentTaskId: string;
  parentTaskName: string;
  parentTaskContext?: string;
}

const PRIORITY_CONFIG = {
  low:      { label: 'Low',      color: 'text-slate-600 dark:text-zinc-400',   bg: 'bg-slate-100 dark:bg-zinc-900',         border: 'border-slate-300 dark:border-zinc-700',        dot: 'bg-slate-400' },
  medium:   { label: 'Medium',   color: 'text-amber-600 dark:text-amber-400',  bg: 'bg-amber-50 dark:bg-amber-900/20',      border: 'border-amber-300 dark:border-amber-700/50',    dot: 'bg-amber-500' },
  high:     { label: 'High',     color: 'text-orange-600 dark:text-orange-400',bg: 'bg-orange-50 dark:bg-orange-900/20',    border: 'border-orange-300 dark:border-orange-700/50',  dot: 'bg-orange-500' },
  critical: { label: 'Critical', color: 'text-red-600 dark:text-red-400',      bg: 'bg-red-50 dark:bg-red-900/20',          border: 'border-red-300 dark:border-red-700/50',        dot: 'bg-red-500 animate-pulse' },
};

const PRIORITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export const ProjectOPL: React.FC = () => {
  const { project } = useOutletContext<{ project: Project; refetch: () => void }>();
  const queryClient = useQueryClient();
  const confirm = useConfirm();

  // ── Remote Data ────────────────────────────────────────────────────────────
  const { data: dbTasks = [], isLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: tasksApi.list,
  });

  const { data: activities = [] } = useQuery({
    queryKey: ['activities', project.id],
    queryFn: () => activitiesApi.listByProject(project.id),
    enabled: !!project.id,
  });

  const [members, setMembers] = useState<User[]>([]);
  useEffect(() => {
    usersApi.list({ limit: 1000 })
      .then(res => setMembers(res))
      .catch(err => console.error('[ProjectOPL] Failed to load members', err));
  }, []);

  const projectTasks = dbTasks.filter((t: any) => t.projectId === project.id);

  // Collect all subtasks of the project into a single Open Points List (OPL)
  const allOPLItems: OPLItem[] = projectTasks.flatMap((task: any) => {
    const subtasks: any[] = task.customFields?.subtasks || [];
    const activity = activities.find(a => a.id === task.activityId);
    const phase = project.phases?.find(p => p.id === activity?.phaseId || p.id === task.customFields?.phaseId);
    const contextStr = [phase?.name, activity?.title].filter(Boolean).join(' → ');

    return subtasks.map(sub => {
      // 1. Gather all files (both sub.files and sub.comments[].files)
      const directFiles = Array.isArray(sub.files) ? sub.files : [];
      const commentFiles = Array.isArray(sub.comments)
        ? sub.comments.flatMap((c: any) => Array.isArray(c.files) ? c.files : [])
        : [];

      // Deduplicate files by id
      const allFilesMap = new Map();
      [...directFiles, ...commentFiles].forEach(f => {
        if (f && f.id) allFilesMap.set(f.id, f);
      });
      const aggregatedFiles = Array.from(allFilesMap.values());

      // 2. Determine remarks (sub.remarks or last comment text if remarks is empty)
      let resolvedRemarks = sub.remarks || '';
      if (!resolvedRemarks && Array.isArray(sub.comments) && sub.comments.length > 0) {
        // Exclude system upload comments from remarks fallback
        const textComments = sub.comments.filter((c: any) => c.text && c.text !== 'Uploaded attachments');
        if (textComments.length > 0) {
          resolvedRemarks = textComments[textComments.length - 1].text; // latest text comment
        } else {
          resolvedRemarks = sub.comments[sub.comments.length - 1].text || '';
        }
      }

      return {
        ...sub,
        parentTaskId: task.id,
        parentTaskName: task.name,
        parentTaskContext: contextStr || undefined,
        files: aggregatedFiles,
        remarks: resolvedRemarks
      };
    });
  }).sort((a, b) => {
    // Sort by status (undone first), then by priority, then by date
    if (a.done !== b.done) return a.done ? 1 : -1;
    const prioA = PRIORITY_ORDER[a.priority || 'medium'] ?? 99;
    const prioB = PRIORITY_ORDER[b.priority || 'medium'] ?? 99;
    if (prioA !== prioB) return prioA - prioB;
    return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
  });

  // ── Local Form / Filter States ──────────────────────────────────────────────
  const [showForm, setShowForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'completed'>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');

  // New subtask state
  const [selectedParentTaskId, setSelectedParentTaskId] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newPriority, setNewPriority] = useState<'low' | 'medium' | 'high' | 'critical'>('medium');
  const [newAssignee, setNewAssignee] = useState('');
  const [newRemarks, setNewRemarks] = useState('');
  const [uploadedFiles, setUploadedFiles] = useState<SubTaskFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Edit subtask state
  const [editingItem, setEditingItem] = useState<OPLItem | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editStatus, setEditStatus] = useState<'to_do' | 'in_progress' | 'done'>('to_do');
  const [editPriority, setEditPriority] = useState<'low' | 'medium' | 'high' | 'critical'>('medium');
  const [editAssignee, setEditAssignee] = useState('');
  const [editRemarks, setEditRemarks] = useState('');
  const [editFiles, setEditFiles] = useState<SubTaskFile[]>([]);
  const [isEditSaving, setIsEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [isEditUploading, setIsEditUploading] = useState(false);

  const editFileInputRef = useRef<HTMLInputElement>(null);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleUploadFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (!selectedParentTaskId) {
      setSaveError('⚠️ Please select a Parent Task first before attaching files.');
      return;
    }
    setSaveError(null);
    setIsUploading(true);
    try {
      const res = await uploadsApi.upload('TASK', selectedParentTaskId, Array.from(files));
      const uploaded: SubTaskFile[] = res.uploads.map((u: any) => ({
        id: u.id,
        name: u.originalName,
        publicUrl: u.publicUrl,
      }));
      setUploadedFiles(prev => [...prev, ...uploaded]);
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || 'Unknown upload error';
      setSaveError(`⚠️ Upload failed: ${msg}`);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleAddOpenPoint = async () => {
    if (!newTitle.trim() || !selectedParentTaskId) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      const parentTask = projectTasks.find((t: any) => t.id === selectedParentTaskId);
      if (!parentTask) throw new Error('Parent task not found');

      const newSub: SubTask = {
        id: `sub_${Date.now()}`,
        title: newTitle.trim(),
        done: false,
        createdAt: new Date().toISOString(),
        completedAt: null,
        timeEstimate: null,
        priority: newPriority,
        assignee: newAssignee.trim() || undefined,
        assigneeId: members.find(m => `${m.firstName || ''} ${m.lastName || ''}`.trim() === newAssignee.trim())?.id,
        remarks: newRemarks.trim() || undefined,
        files: uploadedFiles.length > 0 ? uploadedFiles : undefined,
      };

      const existingSubtasks = parentTask.customFields?.subtasks || [];
      const updatedSubtasks = [...existingSubtasks, newSub];

      await tasksApi.update(selectedParentTaskId, {
        customFields: {
          ...(parentTask.customFields || {}),
          subtasks: updatedSubtasks
        } as any
      });

      queryClient.invalidateQueries({ queryKey: ['tasks'] });

      // Reset
      setNewTitle('');
      setNewAssignee('');
      setNewRemarks('');
      setUploadedFiles([]);
      setSelectedParentTaskId('');
      setShowForm(false);
      setSaveError(null);
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || 'Unknown error';
      setSaveError(`Failed to save open point: ${msg}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateStatus = async (item: OPLItem, status: 'to_do' | 'in_progress' | 'done') => {
    const parentTask = projectTasks.find((t: any) => t.id === item.parentTaskId);
    if (!parentTask) return;

    const updatedSubtasks = (parentTask.customFields?.subtasks || []).map((sub: any) => {
      if (sub.id === item.id) {
        return {
          ...sub,
          status,
          done: status === 'done',
          completedAt: status === 'done' ? new Date().toISOString() : null
        };
      }
      return sub;
    });

    await tasksApi.update(item.parentTaskId, {
      customFields: {
        ...(parentTask.customFields || {}),
        subtasks: updatedSubtasks
      } as any
    });

    queryClient.invalidateQueries({ queryKey: ['tasks'] });
  };

  const handleOpenEditModal = (item: OPLItem) => {
    setEditingItem(item);
    setEditTitle(item.title);
    setEditStatus(item.status || (item.done ? 'done' : 'to_do'));
    setEditPriority(item.priority || 'medium');
    setEditAssignee(item.assignee || '');
    setEditRemarks(item.remarks || '');
    setEditFiles(item.files || []);
    setEditError(null);
  };

  const handleUploadEditFiles = async (files: FileList | null) => {
    if (!files || files.length === 0 || !editingItem) return;
    setEditError(null);
    setIsEditUploading(true);
    try {
      const res = await uploadsApi.upload('TASK', editingItem.parentTaskId, Array.from(files));
      const uploaded: SubTaskFile[] = res.uploads.map((u: any) => ({
        id: u.id,
        name: u.originalName,
        publicUrl: u.publicUrl,
      }));
      setEditFiles(prev => [...prev, ...uploaded]);
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || 'Unknown upload error';
      setEditError(`⚠️ Upload failed: ${msg}`);
    } finally {
      setIsEditUploading(false);
      if (editFileInputRef.current) editFileInputRef.current.value = '';
    }
  };

  const handleSaveEditChanges = async () => {
    if (!editingItem || !editTitle.trim()) return;
    setIsEditSaving(true);
    setEditError(null);
    try {
      const parentTask = projectTasks.find((t: any) => t.id === editingItem.parentTaskId);
      if (!parentTask) throw new Error('Parent task not found');

      const originalSub = (parentTask.customFields?.subtasks || []).find((sub: any) => sub.id === editingItem.id);
      const existingComments = originalSub?.comments || [];

      const updatedSubtasks = (parentTask.customFields?.subtasks || []).map((sub: any) => {
        if (sub.id === editingItem.id) {
          return {
            ...sub,
            title: editTitle.trim(),
            status: editStatus,
            done: editStatus === 'done',
            completedAt: editStatus === 'done' ? (sub.completedAt || new Date().toISOString()) : null,
            priority: editPriority,
            assignee: editAssignee.trim() || undefined,
            assigneeId: members.find(m => `${m.firstName || ''} ${m.lastName || ''}`.trim() === editAssignee.trim())?.id,
            remarks: editRemarks.trim() || undefined,
            files: editFiles.length > 0 ? editFiles : undefined,
            comments: existingComments
          };
        }
        return sub;
      });

      await tasksApi.update(editingItem.parentTaskId, {
        customFields: {
          ...(parentTask.customFields || {}),
          subtasks: updatedSubtasks
        } as any
      });

      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setEditingItem(null);
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || 'Unknown error';
      setEditError(`Failed to update open point: ${msg}`);
    } finally {
      setIsEditSaving(false);
    }
  };

  const handleDeleteItem = async (item: OPLItem) => {
    const ok = await confirm({
      title: 'Delete Open Point',
      message: `Are you sure you want to permanently delete this subtask point "${item.title}"?`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;

    const parentTask = projectTasks.find((t: any) => t.id === item.parentTaskId);
    if (!parentTask) return;

    const updatedSubtasks = (parentTask.customFields?.subtasks || []).filter((sub: any) => sub.id !== item.id);

    await tasksApi.update(item.parentTaskId, {
      customFields: {
        ...(parentTask.customFields || {}),
        subtasks: updatedSubtasks
      } as any
    });

    queryClient.invalidateQueries({ queryKey: ['tasks'] });
  };

  const handleDownloadFile = (_fileId: string, publicUrl?: string) => {
    if (publicUrl) {
      const a = document.createElement('a');
      a.href = publicUrl;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }
  };

  // ── Filtered Data ──────────────────────────────────────────────────────────
  const filteredOPLItems = allOPLItems.filter(item => {
    // Status filter
    if (statusFilter === 'open' && item.done) return false;
    if (statusFilter === 'completed' && !item.done) return false;

    // Priority filter
    if (priorityFilter !== 'all' && item.priority !== priorityFilter) return false;

    // Search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const matchesTitle = item.title.toLowerCase().includes(query);
      const matchesRemarks = (item.remarks || '').toLowerCase().includes(query);
      const matchesParent = item.parentTaskName.toLowerCase().includes(query);
      const matchesAssignee = (item.assignee || '').toLowerCase().includes(query);
      return matchesTitle || matchesRemarks || matchesParent || matchesAssignee;
    }

    return true;
  });

  // Stats calculation
  const totalCount = allOPLItems.length;
  const openCount = allOPLItems.filter(i => !i.done).length;
  const completedCount = allOPLItems.filter(i => i.done).length;
  const criticalCount = allOPLItems.filter(i => !i.done && (i.priority === 'critical' || i.priority === 'high')).length;

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="space-y-1">
          <h2 className="text-xl font-bold flex items-center space-x-2 text-slate-900 dark:text-white">
            <ListTodo className="w-5 h-5 text-purple-500" />
            <span>OPL (Open Points List)</span>
          </h2>
          <p className="text-xs text-muted-foreground font-light">
            Monitor and track subtasks, deliverables status, and open action points across the project.
          </p>
        </div>

        <PermissionGate permission={PERMISSIONS.TASK_CREATE}>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center space-x-1.5 px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition shadow-lg shadow-purple-500/20 active:scale-95 cursor-pointer"
          >
            {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            <span>{showForm ? 'Cancel' : 'Add Open Point'}</span>
          </button>
        </PermissionGate>
      </div>

      {/* ── Stats Summary Grid ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Points', value: totalCount, icon: ListTodo, color: 'text-blue-500 bg-blue-500/10' },
          { label: 'Open Actions', value: openCount, icon: HelpCircle, color: 'text-amber-500 bg-amber-500/10' },
          { label: 'Completed', value: completedCount, icon: CheckCircle, color: 'text-emerald-500 bg-emerald-500/10' },
          { label: 'Critical/High Open', value: criticalCount, icon: AlertTriangle, color: 'text-red-500 bg-red-500/10' }
        ].map((stat, i) => (
          <div key={i} className="glass-panel rounded-2xl p-4 border border-slate-100 dark:border-white/5 flex items-center space-x-3.5">
            <div className={`p-2.5 rounded-xl ${stat.color} shrink-0`}>
              <stat.icon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[10px] uppercase font-black tracking-wider text-slate-400">{stat.label}</p>
              <h4 className="text-xl font-extrabold text-slate-900 dark:text-white mt-0.5">{stat.value}</h4>
            </div>
          </div>
        ))}
      </div>

      {/* ── Subtask Creation Form Panel ── */}
      {showForm && (
        <div className="glass-panel rounded-2xl p-5 border border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-900/10 space-y-4 animate-fade-in">
          <h3 className="text-sm font-black uppercase text-slate-650 dark:text-zinc-300 tracking-wider">Log a New Action Point</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Parent Task Deliverable</label>
              <select
                value={selectedParentTaskId}
                onChange={(e) => setSelectedParentTaskId(e.target.value)}
                className="w-full mt-1.5 bg-white dark:bg-background border border-slate-200 dark:border-zinc-850 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 dark:text-zinc-200 focus:outline-none focus:border-purple-500 font-bold"
              >
                <option value="">Select Parent Task...</option>
                {projectTasks.map(t => {
                  const activity = activities.find(a => a.id === t.activityId);
                  const phase = project.phases?.find(p => p.id === activity?.phaseId || p.id === t.customFields?.phaseId);
                  const contextStr = [phase?.name, activity?.title].filter(Boolean).join(' → ');
                  return (
                    <option key={t.id} value={t.id}>
                      {t.name} {contextStr ? `(${contextStr})` : ''}
                    </option>
                  );
                })}
              </select>
            </div>

            <div>
              <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Action Point / Subtask Title</label>
              <input
                type="text"
                placeholder="What needs to be done?"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="w-full mt-1.5 bg-white dark:bg-background border border-slate-200 dark:border-zinc-850 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 dark:text-zinc-200 focus:outline-none focus:border-purple-500 font-medium"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Priority</label>
              <select
                value={newPriority}
                onChange={(e: any) => setNewPriority(e.target.value)}
                className="w-full mt-1.5 bg-white dark:bg-background border border-slate-200 dark:border-zinc-850 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 dark:text-zinc-200 focus:outline-none focus:border-purple-500 font-bold"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>

            <div>
              <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Assigned to</label>
              <select
                value={newAssignee}
                onChange={(e) => setNewAssignee(e.target.value)}
                className="w-full mt-1.5 bg-white dark:bg-background border border-slate-200 dark:border-zinc-850 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 dark:text-zinc-200 focus:outline-none focus:border-purple-500"
              >
                <option value="">Select Assignee...</option>
                {members.map(m => (
                  <option key={m.id} value={`${m.firstName || ''} ${m.lastName || ''}`.trim() || m.email}>
                    {m.firstName ? `${m.firstName} ${m.lastName} (${m.email.split('@')[0]})` : m.email}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Remarks / Details</label>
            <textarea
              placeholder="Provide comments, requirements, or remarks about this point..."
              value={newRemarks}
              onChange={(e) => setNewRemarks(e.target.value)}
              rows={3}
              className="w-full mt-1.5 bg-white dark:bg-background border border-slate-200 dark:border-zinc-850 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 dark:text-zinc-200 focus:outline-none focus:border-purple-500 resize-none font-medium"
            />
          </div>

          <div>
            <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider block mb-1">Attached Media / Documentation</label>
            <div className="flex items-center gap-3">
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                multiple
                onChange={(e) => handleUploadFiles(e.target.files)}
              />
              <button
                type="button"
                disabled={!selectedParentTaskId || isUploading}
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center space-x-1.5 px-4.5 py-2.5 rounded-xl border border-dashed border-purple-300 dark:border-purple-800 bg-white dark:bg-background text-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition text-xs cursor-pointer font-bold disabled:opacity-40"
              >
                {isUploading ? (
                  <><svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg><span>Uploading…</span></>
                ) : (
                  <><Paperclip className="w-3.5 h-3.5" /><span>Attach Files</span></>
                )}
              </button>
              {uploadedFiles.length > 0 && (
                <button type="button" onClick={() => setUploadedFiles([])} className="text-[10px] text-slate-450 hover:text-red-400 transition underline cursor-pointer">
                  Clear all
                </button>
              )}
            </div>

            {uploadedFiles.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {uploadedFiles.map((file, i) => (
                  <span key={file.id} className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-xs text-slate-700 dark:text-zinc-300">
                    <Paperclip className="w-3 h-3 text-purple-500 shrink-0" />
                    <span className="max-w-[120px] truncate">{file.name}</span>
                    <button type="button" onClick={() => setUploadedFiles(prev => prev.filter((_, idx) => idx !== i))} className="text-slate-400 hover:text-red-400 ml-1">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {saveError && (
            <div className="flex items-start space-x-2 px-3.5 py-2.5 rounded-xl bg-red-100 dark:bg-red-900/30 border border-red-350 text-red-700 dark:text-red-300 text-xs">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{saveError}</span>
            </div>
          )}

          <div className="flex justify-end space-x-3 pt-3 border-t border-slate-200 dark:border-white/5">
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setSaveError(null);
                setUploadedFiles([]);
              }}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleAddOpenPoint}
              disabled={!newTitle.trim() || !selectedParentTaskId || isSaving || isUploading}
              className="flex items-center space-x-1.5 px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition disabled:opacity-50 active:scale-95 shadow-lg shadow-purple-500/20"
            >
              {isSaving ? 'Saving…' : 'Log Point'}
            </button>
          </div>
        </div>
      )}

      {/* ── Filters & Search ── */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-slate-50/50 dark:bg-zinc-900/10 border border-slate-200 dark:border-zinc-800 p-4 rounded-2xl">
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search action points, tasks, assignee..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-white dark:bg-background border border-slate-200 dark:border-zinc-850 text-xs text-slate-700 dark:text-zinc-200 focus:outline-none focus:border-purple-500 font-medium"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Status filter tabs */}
          <div className="flex rounded-xl bg-white dark:bg-background p-0.5 border border-slate-200 dark:border-zinc-850">
            {(['all', 'open', 'completed'] as const).map(f => (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-[10.5px] font-black uppercase tracking-wider transition ${
                  statusFilter === f
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-zinc-300'
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          {/* Priority filter */}
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="px-3.5 py-1.5 rounded-xl bg-white dark:bg-background border border-slate-200 dark:border-zinc-850 text-xs text-slate-700 dark:text-zinc-200 font-bold focus:outline-none"
          >
            <option value="all">All Priorities</option>
            <option value="low">Low Priority</option>
            <option value="medium">Medium Priority</option>
            <option value="high">High Priority</option>
            <option value="critical">Critical Priority</option>
          </select>
        </div>
      </div>

      {/* ── OPL Subtasks Listing ── */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 rounded-2xl bg-slate-100/60 dark:bg-white/5 animate-pulse" />
          ))}
        </div>
      ) : filteredOPLItems.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-slate-250 dark:border-zinc-800 rounded-3xl space-y-2">
          <ListTodo className="w-10 h-10 mx-auto text-slate-350 dark:text-zinc-650" />
          <h4 className="text-sm font-bold text-slate-800 dark:text-zinc-300">No Action Points Found</h4>
          <p className="text-xs text-muted-foreground font-light max-w-xs mx-auto">
            No active open points match your filters or search criteria.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-background/25">
          <table className="w-full text-left border-collapse min-w-[700px]">
            <thead>
              <tr className="border-b border-slate-200 dark:border-zinc-850 bg-slate-50/70 dark:bg-zinc-900/50">
                <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-500 dark:text-zinc-400 tracking-wider">Sub Task Title</th>
                <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-500 dark:text-zinc-400 tracking-wider w-32">Status</th>
                <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-500 dark:text-zinc-400 tracking-wider w-24 text-center">Priority</th>
                <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-500 dark:text-zinc-400 tracking-wider w-36">Assigned To</th>
                <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-500 dark:text-zinc-400 tracking-wider w-44">Uploads</th>
                <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-500 dark:text-zinc-400 tracking-wider max-w-xs">Remarks</th>
                <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-500 dark:text-zinc-400 tracking-wider w-16 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-150 dark:divide-zinc-850">
              {filteredOPLItems.map((item) => {
                const cfg = PRIORITY_CONFIG[item.priority || 'medium'];
                const subStatus = item.status || (item.done ? 'done' : 'to_do');
                return (
                  <tr
                    key={item.id}
                    className={`hover:bg-slate-50/40 dark:hover:bg-zinc-900/10 transition-colors duration-150 ${
                      item.done ? 'opacity-60 bg-slate-50/20 dark:bg-zinc-900/5' : ''
                    }`}
                  >
                    {/* Title */}
                    <td className="px-4 py-3.5 align-top">
                      <div className="min-w-0 pl-1">
                        <p className={`text-xs font-bold leading-tight ${item.done ? 'line-through text-slate-450 dark:text-zinc-550' : 'text-slate-900 dark:text-zinc-200'}`}>
                          {item.title}
                        </p>
                        <p className="text-[9px] text-slate-450 mt-0.5">
                          Task: <span className="font-semibold text-slate-650 dark:text-zinc-400">{item.parentTaskName}</span>
                          {item.parentTaskContext && (
                            <span className="text-slate-400 dark:text-zinc-550 font-light italic"> ({item.parentTaskContext})</span>
                          )}
                        </p>
                      </div>
                    </td>

                    {/* Status Select */}
                    <td className="px-4 py-3.5 align-top">
                      <select
                        value={subStatus}
                        onChange={(e) => handleUpdateStatus(item, e.target.value as any)}
                        className={`text-[10px] font-black uppercase px-2 py-1 rounded-lg border transition focus:outline-none cursor-pointer ${
                          subStatus === 'done' ? 'bg-emerald-50 text-emerald-600 border-emerald-250 dark:bg-emerald-950/20 dark:text-emerald-450 dark:border-emerald-900/50' :
                          subStatus === 'in_progress' ? 'bg-blue-50 text-blue-600 border-blue-250 dark:bg-blue-950/20 dark:text-blue-450 dark:border-blue-900/50' :
                          'bg-slate-550/10 text-slate-600 border-slate-200 dark:bg-zinc-900 dark:text-zinc-450 dark:border-zinc-800'
                        }`}
                      >
                        <option value="to_do">To Do</option>
                        <option value="in_progress">In Progress</option>
                        <option value="done">Done</option>
                      </select>
                    </td>

                    {/* Priority */}
                    <td className="px-4 py-3.5 align-top text-center">
                      <span className={`inline-block text-[8px] font-black uppercase px-2 py-0.5 rounded-full border leading-none ${cfg.bg} ${cfg.border} ${cfg.color}`}>
                        {cfg.label}
                      </span>
                    </td>

                    {/* Assigned To */}
                    <td className="px-4 py-3.5 align-top">
                      {item.assignee ? (
                        <div className="flex items-center space-x-1.5 text-xs text-slate-700 dark:text-zinc-300 font-medium">
                          <UserIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate max-w-[120px]">{item.assignee}</span>
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-400 italic">Unassigned</span>
                      )}
                    </td>

                    {/* Uploads */}
                    <td className="px-4 py-3.5 align-top">
                      {item.files && item.files.length > 0 ? (
                        <div className="flex flex-col gap-1">
                          {item.files.map((file) => (
                            <div key={file.id} className="flex items-center space-x-1 px-1.5 py-0.5 rounded bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-[9px] max-w-[160px]">
                              <FileText className="w-2.5 h-2.5 text-slate-450 shrink-0" />
                              <a
                                href={file.publicUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="truncate hover:text-purple-500 hover:underline text-slate-650 dark:text-zinc-400 font-bold flex-1"
                                title={file.name}
                              >
                                {file.name}
                              </a>
                              <button
                                onClick={() => handleDownloadFile(file.id, file.publicUrl)}
                                className="text-purple-500 hover:text-purple-400 shrink-0"
                                title="Download"
                              >
                                <Download className="w-2.5 h-2.5 ml-0.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-400">-</span>
                      )}
                    </td>

                    {/* Remarks */}
                    <td className="px-4 py-3.5 align-top">
                      {item.remarks ? (
                        <p className="text-xs text-slate-600 dark:text-zinc-450 italic leading-relaxed line-clamp-3 max-w-[280px]" title={item.remarks}>
                          “{item.remarks}”
                        </p>
                      ) : (
                        <span className="text-[10px] text-slate-400">-</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3.5 align-top text-center">
                      <div className="flex items-center justify-center space-x-2">
                        <button
                          onClick={() => handleOpenEditModal(item)}
                          className="p-1 rounded-lg text-slate-400 hover:text-purple-500 hover:bg-purple-500/10 transition cursor-pointer"
                          title="Edit Action Point"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteItem(item)}
                          className="p-1 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition cursor-pointer"
                          title="Delete Open Point"
                        >
                          <Trash className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Edit Action Point Sidebar ── */}
      {editingItem && createPortal(
        <>
          <div 
            className="fixed inset-0 bg-black/20 backdrop-blur-[1px] z-[9999] animate-fade-in-backdrop" 
            onClick={() => setEditingItem(null)} 
          />
          <div className="fixed top-0 right-0 h-screen w-[380px] sm:w-[560px] md:w-[720px] bg-slate-50 dark:bg-zinc-950 border-l border-slate-200 dark:border-zinc-800 z-[10000] shadow-2xl flex flex-col animate-slide-in-right">
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-white/5 px-6 pt-6 pb-4">
              <h5 className="text-sm font-extrabold uppercase tracking-wider text-slate-900 dark:text-white flex items-center space-x-2">
                <ListTodo className="w-4 h-4 text-purple-400" />
                <span>Update Action Point</span>
              </h5>
              <button 
                onClick={() => setEditingItem(null)} 
                className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-white/5 text-slate-500 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
              {/* Title Input */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Action Point / Subtask Title</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full bg-white dark:bg-background border border-slate-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-xs text-slate-800 dark:text-zinc-200 focus:outline-none focus:border-purple-500 font-bold"
                />
              </div>

              {/* Status & Priority Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Status</label>
                  <select
                    value={editStatus}
                    onChange={(e: any) => setEditStatus(e.target.value)}
                    className="w-full bg-white dark:bg-background border border-slate-200 dark:border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 dark:text-zinc-200 focus:outline-none focus:border-purple-500 font-bold cursor-pointer"
                  >
                    <option value="to_do">To Do</option>
                    <option value="in_progress">In Progress</option>
                    <option value="done">Done</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Priority</label>
                  <select
                    value={editPriority}
                    onChange={(e: any) => setEditPriority(e.target.value)}
                    className="w-full bg-white dark:bg-background border border-slate-200 dark:border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 dark:text-zinc-200 focus:outline-none focus:border-purple-500 font-bold cursor-pointer"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
              </div>

              {/* Assignee Selection */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Assigned to</label>
                <select
                  value={editAssignee}
                  onChange={(e) => setEditAssignee(e.target.value)}
                  className="w-full bg-white dark:bg-background border border-slate-200 dark:border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 dark:text-zinc-200 focus:outline-none focus:border-purple-500 cursor-pointer"
                >
                  <option value="">Select Assignee...</option>
                  {members.map(m => (
                    <option key={m.id} value={`${m.firstName || ''} ${m.lastName || ''}`.trim() || m.email}>
                      {m.firstName ? `${m.firstName} ${m.lastName} (${m.email.split('@')[0]})` : m.email}
                    </option>
                  ))}
                </select>
              </div>

              {/* Remarks Textarea */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Remarks / Details</label>
                <textarea
                  value={editRemarks}
                  onChange={(e) => setEditRemarks(e.target.value)}
                  rows={4}
                  className="w-full bg-white dark:bg-background border border-slate-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-xs text-slate-800 dark:text-zinc-200 focus:outline-none focus:border-purple-500 resize-none font-medium leading-relaxed"
                />
              </div>

              {/* File Attachment Section */}
              <div className="space-y-1.5 border-t border-slate-200 dark:border-white/5 pt-4">
                <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider block mb-1">Attached Media / Documentation</label>
                <div className="flex items-center gap-3">
                  <input
                    ref={editFileInputRef}
                    type="file"
                    className="hidden"
                    multiple
                    onChange={(e) => handleUploadEditFiles(e.target.files)}
                  />
                  <button
                    type="button"
                    disabled={isEditUploading}
                    onClick={() => editFileInputRef.current?.click()}
                    className="flex items-center space-x-1.5 px-4.5 py-2.5 rounded-xl border border-dashed border-purple-300 dark:border-purple-800 bg-white dark:bg-background text-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition text-xs cursor-pointer font-bold disabled:opacity-40"
                  >
                    {isEditUploading ? (
                      <><svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg><span>Uploading…</span></>
                    ) : (
                      <><Paperclip className="w-3.5 h-3.5" /><span>Attach Files</span></>
                    )}
                  </button>
                </div>

                {editFiles.length > 0 && (
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[160px] overflow-y-auto pr-1">
                    {editFiles.map((file, i) => (
                      <div key={file.id} className="flex items-center justify-between px-3 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-xs">
                        <div className="flex items-center space-x-1.5 truncate">
                          <Paperclip className="w-3 h-3 text-purple-500 shrink-0" />
                          <a 
                            href={file.publicUrl} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="truncate text-slate-700 dark:text-zinc-300 hover:text-purple-500 hover:underline font-bold"
                            title={file.name}
                          >
                            {file.name}
                          </a>
                        </div>
                        <button 
                          type="button" 
                          onClick={() => setEditFiles(prev => prev.filter((_, idx) => idx !== i))} 
                          className="text-slate-400 hover:text-red-400 p-0.5 ml-2 shrink-0 transition"
                          title="Remove File"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {editError && (
                <div className="flex items-start space-x-2 px-3.5 py-2.5 rounded-xl bg-red-100 dark:bg-red-900/30 border border-red-350 text-red-750 dark:text-red-300 text-xs">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{editError}</span>
                </div>
              )}
            </div>

            <div className="flex justify-end space-x-3 p-6 border-t border-slate-200 dark:border-white/5 bg-slate-50/50 dark:bg-zinc-900/10">
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-650 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-zinc-800 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEditChanges}
                disabled={!editTitle.trim() || isEditSaving || isEditUploading}
                className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition shadow-lg shadow-purple-500/20 active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                {isEditSaving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  );
};

export default ProjectOPL;
