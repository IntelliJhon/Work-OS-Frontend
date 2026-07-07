import React, { useState, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Project } from '../../services/api/projects';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { tasksApi } from '../../services/api/tasks.api';
import { uploadsApi } from '../../services/api/uploads';
import { useAuthStore } from '../../store/authStore';
import { PermissionGate } from '../../features/auth/PermissionGate';
import { PERMISSIONS } from '../../features/auth/permission.constants';
import {
  Bug,
  AlertTriangle,
  CheckCircle2,
  Paperclip,
  Download,
  Trash,
  ChevronDown,
  ChevronRight,
  Plus,
  X,
  Clock,
  User,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────
interface ErrorLogFile {
  id: string;
  name: string;
  publicUrl: string;
}

interface ErrorLog {
  id: string;
  taskId: string;
  taskName: string;
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  isResolved: boolean;
  resolvedAt: string | null;
  createdAt: string;
  reportedBy: string;
  files: ErrorLogFile[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const SEVERITY_CONFIG = {
  low:      { label: 'Low',      color: 'text-slate-500 dark:text-zinc-400',   bg: 'bg-slate-100 dark:bg-zinc-900',         border: 'border-slate-300 dark:border-zinc-700',        dot: 'bg-slate-400',           row: 'bg-slate-50 dark:bg-zinc-900/40' },
  medium:   { label: 'Medium',   color: 'text-amber-600 dark:text-amber-400',  bg: 'bg-amber-50 dark:bg-amber-900/20',      border: 'border-amber-300 dark:border-amber-700/50',    dot: 'bg-amber-500',           row: 'bg-amber-50/60 dark:bg-amber-900/10' },
  high:     { label: 'High',     color: 'text-orange-600 dark:text-orange-400',bg: 'bg-orange-50 dark:bg-orange-900/20',    border: 'border-orange-300 dark:border-orange-700/50',  dot: 'bg-orange-500',          row: 'bg-orange-50/60 dark:bg-orange-900/10' },
  critical: { label: 'Critical', color: 'text-red-600 dark:text-red-400',      bg: 'bg-red-50 dark:bg-red-900/20',          border: 'border-red-300 dark:border-red-700/50',        dot: 'bg-red-500 animate-pulse', row: 'bg-red-50/60 dark:bg-red-900/10' },
};

const SEVERITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

// ── Component ─────────────────────────────────────────────────────────────────
export const ProjectErrorLogs: React.FC = () => {
  const { project } = useOutletContext<{ project: Project; refetch: () => void }>();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const confirm = useConfirm();

  // ── Remote data ──────────────────────────────────────────────────────────
  const { data: dbTasks = [], isLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: tasksApi.list,
  });

  const projectTasks = dbTasks.filter((t: any) => t.projectId === project.id);

  /** Collect all error logs across all project tasks */
  const allErrorLogs: ErrorLog[] = projectTasks.flatMap((task: any) => {
    const logs: ErrorLog[] = ((task.customFields as any)?.errorLogs || []);
    return logs.map((log) => ({ ...log, taskId: task.id, taskName: task.name }));
  }).sort((a: ErrorLog, b: ErrorLog) =>
    (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99)
  );

  const openLogs   = allErrorLogs.filter((l) => !l.isResolved);
  const closedLogs = allErrorLogs.filter((l) =>  l.isResolved);

  // ── Local UI state ───────────────────────────────────────────────────────
  const [showForm,           setShowForm]           = useState(false);
  const [selectedTaskId,     setSelectedTaskId]     = useState('');
  const [newTitle,           setNewTitle]           = useState('');
  const [newDescription,     setNewDescription]     = useState('');
  const [newSeverity,        setNewSeverity]        = useState<'low'|'medium'|'high'|'critical'>('medium');
  const [uploadedFiles,      setUploadedFiles]       = useState<ErrorLogFile[]>([]);
  const [isUploading,        setIsUploading]         = useState(false);
  const [isSaving,           setIsSaving]           = useState(false);
  const [saveError,          setSaveError]           = useState<string | null>(null);
  const [expandedIds,        setExpandedIds]        = useState<string[]>([]);
  const [showClosed,         setShowClosed]         = useState(false);
  const [filterSeverity,     setFilterSeverity]     = useState<string>('all');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const toggleExpand = (id: string) =>
    setExpandedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  // Upload files immediately when they are selected
  const handleFilesSelected = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (!selectedTaskId) {
      setSaveError('⚠️ Please select a Linked Task first before attaching files.');
      return;
    }
    setSaveError(null);
    setIsUploading(true);
    const newLocalFiles = Array.from(files);
    try {
      const res = await uploadsApi.upload('TASK', selectedTaskId, newLocalFiles);
      const uploaded: ErrorLogFile[] = res.uploads.map((u: any) => ({
        id: u.id,
        name: u.originalName,
        publicUrl: u.publicUrl,
      }));
      setUploadedFiles((prev) => [...prev, ...uploaded]);
    } catch (uploadErr: any) {
      const msg = uploadErr?.response?.data?.error || uploadErr?.message || 'Unknown upload error';
      setSaveError(`⚠️ Upload failed: ${msg}`);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async () => {
    if (!newTitle.trim() || !selectedTaskId) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      const newLog: ErrorLog = {
        id: `err_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        taskId: selectedTaskId,
        taskName: projectTasks.find((t: any) => t.id === selectedTaskId)?.name || '',
        title: newTitle.trim(),
        description: newDescription.trim(),
        severity: newSeverity,
        isResolved: false,
        resolvedAt: null,
        createdAt: new Date().toISOString(),
        reportedBy: user ? `${user.firstName} ${user.lastName}` : 'Unknown',
        files: uploadedFiles,
      };

      const dbTask = projectTasks.find((t: any) => t.id === selectedTaskId);
      const currentLogs: ErrorLog[] = (dbTask?.customFields as any)?.errorLogs || [];
      await tasksApi.update(selectedTaskId, {
        customFields: { ...(dbTask?.customFields || {}), errorLogs: [...currentLogs, newLog] } as any,
      });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });

      // Reset form
      setNewTitle('');
      setNewDescription('');
      setNewSeverity('medium');
      setUploadedFiles([]);
      setSelectedTaskId('');
      setShowForm(false);
      setSaveError(null);
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || 'Unknown error';
      setSaveError(`Failed to log error: ${msg}`);
      console.error('[ErrorLogs] Failed to submit', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleResolved = async (log: ErrorLog) => {
    const dbTask = projectTasks.find((t: any) => t.id === log.taskId);
    if (!dbTask) return;
    const currentLogs: ErrorLog[] = (dbTask.customFields as any)?.errorLogs || [];
    const updated = currentLogs.map((l) =>
      l.id === log.id
        ? { ...l, isResolved: !l.isResolved, resolvedAt: !l.isResolved ? new Date().toISOString() : null }
        : l
    );
    await tasksApi.update(log.taskId, {
      customFields: { ...(dbTask.customFields || {}), errorLogs: updated } as any,
    });
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
  };

  const handleDelete = async (log: ErrorLog) => {
    const ok = await confirm({
      title: 'Delete Error Log',
      message: `Are you sure you want to permanently delete the error log "${log.title}"? This action cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;

    const dbTask = projectTasks.find((t: any) => t.id === log.taskId);
    if (!dbTask) return;
    const currentLogs: ErrorLog[] = (dbTask.customFields as any)?.errorLogs || [];
    await tasksApi.update(log.taskId, {
      customFields: { ...(dbTask.customFields || {}), errorLogs: currentLogs.filter((l) => l.id !== log.id) } as any,
    });
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
  };

  const handleDownloadFile = (_fileId: string, publicUrl?: string) => {
    // Use publicUrl directly if available (fastest, no extra API call needed)
    const url = publicUrl || '';
    if (url) {
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  const filteredOpen = filterSeverity === 'all'
    ? openLogs
    : openLogs.filter((l) => l.severity === filterSeverity);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 text-foreground animate-fade-in">
      {/* ── Page Header ── */}
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div className="space-y-1">
          <h2 className="text-xl font-extrabold text-zinc-900 dark:text-white flex items-center space-x-2">
            <Bug className="w-5 h-5 text-red-400" />
            <span>Error Logs</span>
          </h2>
          <p className="text-xs text-muted-foreground">
            Track, triage, and resolve errors across all deliverables in this project.
          </p>
        </div>
        <PermissionGate permission={PERMISSIONS.TASK_UPDATE} behavior="hide">
          <button
            onClick={() => setShowForm((v) => !v)}
            className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition active:scale-95 cursor-pointer shadow-lg shadow-red-500/20"
          >
            {showForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            <span>{showForm ? 'Cancel' : 'Report Error'}</span>
          </button>
        </PermissionGate>
      </div>

      {/* ── Stats Row ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {(['critical', 'high', 'medium', 'low'] as const).map((sev) => {
          const cfg = SEVERITY_CONFIG[sev];
          const count = openLogs.filter((l) => l.severity === sev).length;
          return (
            <button
              key={sev}
              onClick={() => setFilterSeverity((f) => f === sev ? 'all' : sev)}
              className={`p-4 rounded-xl border text-left transition cursor-pointer ${
                filterSeverity === sev ? `${cfg.border} ${cfg.bg}` : 'border-border bg-card hover:border-slate-300 dark:hover:border-zinc-700'
              }`}
            >
              <div className="flex items-center space-x-2 mb-1">
                <span className={`w-2.5 h-2.5 rounded-full ${cfg.dot}`} />
                <span className={`text-[10px] font-black uppercase tracking-wider ${cfg.color}`}>{cfg.label}</span>
              </div>
              <p className="text-2xl font-black text-zinc-900 dark:text-white">{count}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">open issues</p>
            </button>
          );
        })}
      </div>

      {/* ── Report Error Form ── */}
      {showForm && (
        <div className="border border-red-200 dark:border-red-900/40 rounded-2xl p-5 bg-red-50/50 dark:bg-red-900/5 space-y-4 animate-fade-in">
          <div className="flex items-center space-x-2 mb-1">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            <h3 className="text-sm font-black uppercase tracking-wider text-red-500">Report New Error</h3>
          </div>

          {/* Task selector */}
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Linked Task *</label>
            <select
              value={selectedTaskId}
              onChange={(e) => setSelectedTaskId(e.target.value)}
              className="w-full bg-white dark:bg-background border border-slate-200 dark:border-zinc-800 rounded-xl px-3 py-2.5 text-xs text-slate-800 dark:text-zinc-200 focus:outline-none focus:border-red-400 cursor-pointer"
            >
              <option value="">— Select a task —</option>
              {projectTasks.map((t: any) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Title */}
            <div className="sm:col-span-2 space-y-1">
              <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Error Title *</label>
              <input
                type="text"
                placeholder="Short, descriptive title..."
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="w-full bg-white dark:bg-background border border-slate-200 dark:border-zinc-800 rounded-xl px-3 py-2.5 text-xs text-slate-800 dark:text-zinc-200 focus:outline-none focus:border-red-400 placeholder-slate-400"
              />
            </div>
            {/* Severity */}
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Severity</label>
              <select
                value={newSeverity}
                onChange={(e) => setNewSeverity(e.target.value as any)}
                className="w-full bg-white dark:bg-background border border-slate-200 dark:border-zinc-800 rounded-xl px-3 py-2.5 text-xs text-slate-800 dark:text-zinc-200 focus:outline-none focus:border-red-400 cursor-pointer font-semibold"
              >
                <option value="low">🟢 Low</option>
                <option value="medium">🟡 Medium</option>
                <option value="high">🟠 High</option>
                <option value="critical">🔴 Critical</option>
              </select>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Description</label>
            <textarea
              placeholder="Steps to reproduce, expected vs actual behavior, environment details, error messages..."
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              rows={4}
              className="w-full bg-white dark:bg-background border border-slate-200 dark:border-zinc-800 rounded-xl px-3 py-2.5 text-xs text-slate-800 dark:text-zinc-200 focus:outline-none focus:border-red-400 placeholder-slate-400 resize-none leading-relaxed"
            />
          </div>

          {/* File upload */}
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Evidence / Screenshots</label>
            {!selectedTaskId && (
              <p className="text-[10px] text-amber-500 font-medium">⚠ Select a Linked Task above before attaching files.</p>
            )}
            <div className="flex items-center gap-3">
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                multiple
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.json,.zip,.png,.jpg,.jpeg,.gif,.webp,.svg"
                onChange={(e) => handleFilesSelected(e.target.files)}
              />
              <button
                type="button"
                disabled={!selectedTaskId || isUploading}
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center space-x-1.5 px-3 py-2 rounded-xl border border-dashed border-red-300 dark:border-red-800 bg-white dark:bg-background text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition text-xs cursor-pointer font-medium disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isUploading ? (
                  <><svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg><span>Uploading…</span></>
                ) : (
                  <><Paperclip className="w-3.5 h-3.5" /><span>Attach Files</span></>
                )}
              </button>
              {uploadedFiles.length > 0 && (
                <button type="button" onClick={() => setUploadedFiles([])} className="text-[10px] text-slate-400 hover:text-red-400 transition underline cursor-pointer">
                  Clear all
                </button>
              )}
            </div>
            {/* Show uploaded files */}
            {uploadedFiles.length > 0 && (
              <div className="flex flex-col gap-1.5">
                {uploadedFiles.map((f, i) => (
                  <div key={f.id} className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
                    <div className="flex items-center space-x-1.5 min-w-0">
                      <Paperclip className="w-3 h-3 text-emerald-500 shrink-0" />
                      <span className="text-[10px] text-emerald-700 dark:text-emerald-300 truncate max-w-[200px]">{f.name}</span>
                      <span className="text-[9px] text-emerald-500 font-bold">✓ Uploaded</span>
                    </div>
                    <button type="button" onClick={() => setUploadedFiles((prev) => prev.filter((_, idx) => idx !== i))} className="text-slate-400 hover:text-red-400 cursor-pointer ml-2 shrink-0">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>


          {/* Error banner */}
          {saveError && (
            <div className="flex items-start space-x-2 px-3 py-2.5 rounded-xl bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 text-xs">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>{saveError}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end space-x-3 pt-2 border-t border-red-100 dark:border-red-900/30">
            <button type="button" onClick={() => { setShowForm(false); setSaveError(null); }} className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 transition cursor-pointer">
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!newTitle.trim() || !selectedTaskId || isSaving}
              className="flex items-center space-x-2 px-5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition disabled:opacity-50 cursor-pointer active:scale-95 shadow-lg shadow-red-500/20"
            >
              {isSaving ? (
                <><svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg><span>Logging…</span></>
              ) : (
                <><Bug className="w-3.5 h-3.5" /><span>Log Error</span></>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ── Loading ── */}
      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-16 rounded-xl bg-slate-100/60 dark:bg-white/5 animate-pulse" />)}
        </div>
      )}

      {/* ── Filter info bar ── */}
      {!isLoading && filterSeverity !== 'all' && (
        <div className={`flex items-center justify-between px-4 py-2.5 rounded-xl border ${SEVERITY_CONFIG[filterSeverity as keyof typeof SEVERITY_CONFIG].border} ${SEVERITY_CONFIG[filterSeverity as keyof typeof SEVERITY_CONFIG].bg}`}>
          <span className={`text-xs font-semibold ${SEVERITY_CONFIG[filterSeverity as keyof typeof SEVERITY_CONFIG].color}`}>
            Showing {filterSeverity} severity errors ({filteredOpen.length})
          </span>
          <button onClick={() => setFilterSeverity('all')} className="text-[10px] underline text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300 cursor-pointer transition">Show all</button>
        </div>
      )}

      {/* ── Open Error Logs ── */}
      {!isLoading && (
        <div className="space-y-3">
          {filteredOpen.length === 0 ? (
            <div className="py-16 text-center border border-dashed border-border rounded-2xl bg-slate-100/60 dark:bg-white/5">
              <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
              <p className="text-sm font-bold text-zinc-900 dark:text-white">No open errors{filterSeverity !== 'all' ? ` with ${filterSeverity} severity` : ''}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {filterSeverity !== 'all' ? 'Try a different severity filter.' : 'This project is error-free! Keep it up.'}
              </p>
            </div>
          ) : (
            filteredOpen.map((log) => <ErrorLogCard key={log.id} log={log} onToggleResolved={handleToggleResolved} onDelete={handleDelete} onDownload={handleDownloadFile} isExpanded={expandedIds.includes(log.id)} onToggleExpand={toggleExpand} />)
          )}
        </div>
      )}

      {/* ── Resolved / Closed Logs ── */}
      {!isLoading && closedLogs.length > 0 && (
        <div className="space-y-3">
          <button
            onClick={() => setShowClosed((v) => !v)}
            className="flex items-center space-x-2 text-xs font-bold text-slate-500 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-zinc-300 transition cursor-pointer"
          >
            {showClosed ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            <span>Resolved Errors ({closedLogs.length})</span>
          </button>
          {showClosed && closedLogs.map((log) => (
            <ErrorLogCard key={log.id} log={log} onToggleResolved={handleToggleResolved} onDelete={handleDelete} onDownload={handleDownloadFile} isExpanded={expandedIds.includes(log.id)} onToggleExpand={toggleExpand} />
          ))}
        </div>
      )}
    </div>
  );
};

// ── Error Log Card sub-component ──────────────────────────────────────────────
interface CardProps {
  log: ErrorLog;
  isExpanded: boolean;
  onToggleExpand: (id: string) => void;
  onToggleResolved: (log: ErrorLog) => void;
  onDelete: (log: ErrorLog) => void;
  onDownload: (fileId: string, publicUrl?: string) => void;
}

const ErrorLogCard: React.FC<CardProps> = ({ log, isExpanded, onToggleExpand, onToggleResolved, onDelete, onDownload }) => {
  const cfg = SEVERITY_CONFIG[log.severity];
  return (
    <div className={`border rounded-xl overflow-hidden transition-all duration-200 ${log.isResolved ? 'border-slate-200 dark:border-zinc-800 opacity-65' : cfg.border}`}>
      {/* Card header */}
      <div className={`flex items-center gap-3 px-4 py-3 ${log.isResolved ? 'bg-slate-50 dark:bg-zinc-900/40' : cfg.row}`}>
        {/* Severity dot */}
        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${cfg.dot}`} />

        {/* Title + task name */}
        <div className="flex-1 min-w-0">
          <p className={`text-xs font-bold truncate ${log.isResolved ? 'line-through text-slate-500 dark:text-zinc-500' : 'text-slate-900 dark:text-zinc-100'}`}>
            {log.title}
          </p>
          <p className="text-[10px] text-muted-foreground truncate mt-0.5">
            Task: <span className="font-medium">{log.taskName}</span>
          </p>
        </div>

        {/* Severity badge */}
        <span className={`hidden sm:inline shrink-0 text-[8px] font-black uppercase px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.border} ${cfg.color}`}>
          {cfg.label}
        </span>

        {/* Reported date */}
        <span className="hidden md:flex items-center space-x-1 text-[10px] text-muted-foreground shrink-0">
          <Clock className="w-3 h-3" />
          <span>{new Date(log.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
        </span>

        {/* Actions */}
        <div className="flex items-center space-x-1 shrink-0">
          <button onClick={() => onToggleResolved(log)} title={log.isResolved ? 'Reopen' : 'Mark resolved'} className={`p-1.5 rounded-lg transition cursor-pointer ${log.isResolved ? 'text-emerald-500 hover:bg-emerald-500/10' : 'text-slate-400 hover:text-emerald-500 hover:bg-emerald-500/10'}`}>
            <CheckCircle2 className="w-4 h-4" />
          </button>
          <button onClick={() => onToggleExpand(log.id)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition cursor-pointer">
            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
          <button onClick={() => onDelete(log)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition cursor-pointer">
            <Trash className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Expanded body */}
      {isExpanded && (
        <div className="px-4 pb-4 pt-3 space-y-3 bg-white dark:bg-background border-t border-slate-100 dark:border-white/5 animate-fade-in">
          {/* Meta */}
          <div className="flex flex-wrap items-center gap-4 text-[10px] text-muted-foreground">
            <span className="flex items-center space-x-1"><User className="w-3 h-3" /><span>Reported by <span className="font-bold text-slate-700 dark:text-zinc-300">{log.reportedBy}</span></span></span>
            <span className="flex items-center space-x-1"><Clock className="w-3 h-3" /><span>{new Date(log.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span></span>
            {log.isResolved && log.resolvedAt && (() => {
              const resolvedDate = new Date(log.resolvedAt);
              const createdDate  = new Date(log.createdAt);
              const diffMs       = resolvedDate.getTime() - createdDate.getTime();
              const diffMins     = Math.max(0, Math.floor(diffMs / 60000));
              const days         = Math.floor(diffMins / 1440);
              const hours        = Math.floor((diffMins % 1440) / 60);
              const mins         = diffMins % 60;
              const duration     = days > 0
                ? `${days}d ${hours}h ${mins}m`
                : hours > 0
                  ? `${hours}h ${mins}m`
                  : `${mins}m`;
              return (
                <span className="flex items-center space-x-1.5 text-emerald-500 font-bold">
                  <CheckCircle2 className="w-3 h-3 shrink-0" />
                  <span>
                    Resolved {resolvedDate.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                  {diffMins > 0 && (
                    <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-700">
                      took {duration}
                    </span>
                  )}
                </span>
              );
            })()}
          </div>

          {/* Description */}
          {log.description ? (
            <p className="text-xs text-slate-700 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap border-l-2 border-slate-200 dark:border-zinc-700 pl-3">{log.description}</p>
          ) : (
            <p className="text-xs text-muted-foreground italic">No description provided.</p>
          )}

          {/* Files */}
          {log.files && log.files.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Attached Evidence ({log.files.length})</p>
              <div className="space-y-1">
                {log.files.map((file) => (
                  <div key={file.id} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800">
                    <div className="flex items-center space-x-2 min-w-0">
                      <Paperclip className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <a
                        href={file.publicUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-slate-700 dark:text-zinc-300 truncate hover:text-purple-500 hover:underline transition"
                        title={file.name}
                      >
                        {file.name}
                      </a>
                    </div>
                    <button
                      onClick={() => onDownload(file.id, file.publicUrl)}
                      className="flex items-center space-x-1 text-purple-500 hover:text-purple-400 transition cursor-pointer shrink-0 ml-3 text-xs font-medium"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ProjectErrorLogs;
