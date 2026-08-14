import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { useAuthStore } from '../../store/authStore';
import { usePermissions } from '../../features/auth/usePermissions';
import { PERMISSIONS } from '../../features/auth/permission.constants';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { usersApi, type User } from '../../services/api/users';
import {
  ListTodo,
  Plus,
  Search,
  CheckCircle,
  HelpCircle,
  AlertTriangle,
  Pencil,
  Trash,
  User as UserIcon,
  Paperclip,
  X,
  FileText,
  Download
} from 'lucide-react';

export interface ManagementSubTaskFile {
  id: string;
  name: string;
  publicUrl?: string;
}

export interface ManagementOPLItem {
  id: string;
  title: string;
  category: string; // e.g. Strategy, Compliance, Operations, Financial, Quality, Risk
  status: 'to_do' | 'in_progress' | 'done';
  priority: 'low' | 'medium' | 'high' | 'critical';
  assignee?: string;
  assigneeId?: string;
  remarks?: string;
  files?: ManagementSubTaskFile[];
  createdAt: string;
  completedAt?: string | null;
}

const STORAGE_KEY = 'work_os_management_review_opl';

const INITIAL_DEMO_ITEMS: ManagementOPLItem[] = [
  {
    id: 'mgt-opl-1',
    title: 'Conduct Q3 Quality & Regulatory Compliance Audit',
    category: 'Quality & Regulatory Audit',
    status: 'in_progress',
    priority: 'high',
    assignee: 'Admin Acme',
    remarks: 'Reviewing ISO 9001 audit checklists, tenant security compliance, and governance documentation.',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'mgt-opl-2',
    title: 'Review Executive Financial Allocation & Project Margins',
    category: 'Financial Allocation & Budget',
    status: 'to_do',
    priority: 'critical',
    assignee: 'Finance Director',
    remarks: 'Analyze quarterly resource utilization, department expenditures, and revenue margins across active workspaces.',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'mgt-opl-3',
    title: 'Finalize Workspace Escalation & Governance Protocols',
    category: 'Operations & Compliance',
    status: 'done',
    priority: 'medium',
    assignee: 'Admin Acme',
    remarks: 'Approved executive SLA thresholds and published governance guidelines across all tenant accounts.',
    createdAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
  },
];

const CATEGORIES = [
  'Executive Strategy & Governance',
  'Quality & Regulatory Audit',
  'Financial Allocation & Budget',
  'Operations & Compliance',
  'Risk Management',
  'Infrastructure & Security',
  'Human Resources & Talent'
];

const PRIORITY_CONFIG = {
  low: { label: 'Low', color: 'text-slate-600 dark:text-zinc-400', bg: 'bg-slate-100 dark:bg-zinc-800', border: 'border-slate-300 dark:border-zinc-700' },
  medium: { label: 'Medium', color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/20', border: 'border-amber-300 dark:border-amber-700/50' },
  high: { label: 'High', color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-900/20', border: 'border-orange-300 dark:border-orange-700/50' },
  critical: { label: 'Critical', color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/20', border: 'border-red-300 dark:border-red-700/50' },
};

export const ManagementReviewView: React.FC = () => {
  const { user } = useAuthStore();
  const { can, role: userRole } = usePermissions();
  const navigate = useNavigate();
  const confirm = useConfirm();

  // Admin Access Guard (Case-insensitive & Permission fallback)
  const isAdmin = useMemo(() => {
    const r = (userRole || user?.role || '').toLowerCase();
    return (
      r.includes('admin') ||
      r.includes('owner') ||
      can(PERMISSIONS.WORKSPACE_ROLES_READ) ||
      can(PERMISSIONS.WORKSPACE_MEMBERS_READ)
    );
  }, [userRole, user?.role, can]);

  useEffect(() => {
    if (!user) return;
    if (!isAdmin) {
      navigate('/403', { replace: true });
    }
  }, [user, isAdmin, navigate]);

  // Load items from localStorage with auto-purge for legacy cached project data
  const [items, setItems] = useState<ManagementOPLItem[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (
          Array.isArray(parsed) &&
          parsed.some(
            (i: any) =>
              i.category === 'Go Live | in AU region' ||
              (i.title && i.title.toLowerCase().includes('wallet'))
          )
        ) {
          localStorage.removeItem(STORAGE_KEY);
          return INITIAL_DEMO_ITEMS;
        }
        return parsed;
      }
    } catch (err) {
      console.error('[ManagementReview] Failed to load OPL items', err);
    }
    return INITIAL_DEMO_ITEMS;
  });

  // Save to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch (err) {
      console.error('[ManagementReview] Failed to save OPL items', err);
    }
  }, [items]);

  // Fetch workspace members for assignee selection
  const [members, setMembers] = useState<User[]>([]);
  useEffect(() => {
    usersApi.list({ limit: 1000 })
      .then((res) => {
        const list = Array.isArray(res) ? res : (res?.users || []);
        setMembers(list);
      })
      .catch((err) => console.error('[ManagementReview] Failed to fetch users', err));
  }, []);

  // Filter & Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'completed'>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');

  // Form State for Add
  const [showForm, setShowForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState('Executive Strategy & Governance');
  const [newPriority, setNewPriority] = useState<'low' | 'medium' | 'high' | 'critical'>('medium');
  const [newAssignee, setNewAssignee] = useState('');
  const [newRemarks, setNewRemarks] = useState('');
  const [uploadedFiles, setUploadedFiles] = useState<ManagementSubTaskFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Edit Drawer State
  const [editingItem, setEditingItem] = useState<ManagementOPLItem | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editCategory, setEditCategory] = useState('Executive Strategy & Governance');
  const [editStatus, setEditStatus] = useState<'to_do' | 'in_progress' | 'done'>('to_do');
  const [editPriority, setEditPriority] = useState<'low' | 'medium' | 'high' | 'critical'>('medium');
  const [editAssignee, setEditAssignee] = useState('');
  const [editRemarks, setEditRemarks] = useState('');
  const [editFiles, setEditFiles] = useState<ManagementSubTaskFile[]>([]);
  const editFileInputRef = useRef<HTMLInputElement>(null);

  // Handlers for Add
  const handleAddFile = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const newFiles: ManagementSubTaskFile[] = Array.from(files).map(f => ({
      id: `file_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      name: f.name,
      publicUrl: URL.createObjectURL(f)
    }));
    setUploadedFiles(prev => [...prev, ...newFiles]);
  };

  const handleAddOpenPoint = () => {
    if (!newTitle.trim()) return;
    const newItem: ManagementOPLItem = {
      id: `mgt-opl-${Date.now()}`,
      title: newTitle.trim(),
      category: newCategory,
      status: 'to_do',
      priority: newPriority,
      assignee: newAssignee.trim() || undefined,
      remarks: newRemarks.trim() || undefined,
      files: uploadedFiles.length > 0 ? uploadedFiles : undefined,
      createdAt: new Date().toISOString(),
    };

    setItems(prev => [newItem, ...prev]);

    // Reset Form
    setNewTitle('');
    setNewAssignee('');
    setNewRemarks('');
    setUploadedFiles([]);
    setShowForm(false);
  };

  // Handlers for Update Status
  const handleUpdateStatus = (item: ManagementOPLItem, status: 'to_do' | 'in_progress' | 'done') => {
    setItems(prev =>
      prev.map(i =>
        i.id === item.id
          ? {
              ...i,
              status,
              completedAt: status === 'done' ? new Date().toISOString() : null
            }
          : i
      )
    );
  };

  // Handlers for Edit Modal
  const handleOpenEditModal = (item: ManagementOPLItem) => {
    setEditingItem(item);
    setEditTitle(item.title);
    setEditCategory(item.category || 'Go Live | in AU region');
    setEditStatus(item.status);
    setEditPriority(item.priority || 'medium');
    setEditAssignee(item.assignee || '');
    setEditRemarks(item.remarks || '');
    setEditFiles(item.files || []);
  };

  const handleAddEditFile = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const newFiles: ManagementSubTaskFile[] = Array.from(files).map(f => ({
      id: `file_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      name: f.name,
      publicUrl: URL.createObjectURL(f)
    }));
    setEditFiles(prev => [...prev, ...newFiles]);
  };

  const handleSaveEditChanges = () => {
    if (!editingItem || !editTitle.trim()) return;
    setItems(prev =>
      prev.map(i =>
        i.id === editingItem.id
          ? {
              ...i,
              title: editTitle.trim(),
              category: editCategory,
              status: editStatus,
              priority: editPriority,
              assignee: editAssignee.trim() || undefined,
              remarks: editRemarks.trim() || undefined,
              files: editFiles.length > 0 ? editFiles : undefined,
              completedAt: editStatus === 'done' ? (i.completedAt || new Date().toISOString()) : null
            }
          : i
      )
    );
    setEditingItem(null);
  };

  const handleDeleteItem = async (item: ManagementOPLItem) => {
    const isOk = await confirm({
      title: 'Delete Open Point',
      message: `Are you sure you want to permanently delete this subtask point "${item.title}"?`,
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      variant: 'danger',
    });
    if (!isOk) return;

    setItems(prev => prev.filter(i => i.id !== item.id));
  };

  // Filtered Items
  const filteredOPLItems = useMemo(() => {
    return items.filter(item => {
      // Status filter
      if (statusFilter === 'open' && item.status === 'done') return false;
      if (statusFilter === 'completed' && item.status !== 'done') return false;

      // Priority filter
      if (priorityFilter !== 'all' && item.priority !== priorityFilter) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          item.title.toLowerCase().includes(q) ||
          item.category.toLowerCase().includes(q) ||
          (item.remarks && item.remarks.toLowerCase().includes(q)) ||
          (item.assignee && item.assignee.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [items, statusFilter, priorityFilter, searchQuery]);

  // Stats calculation
  const totalCount = items.length;
  const openCount = items.filter(i => i.status !== 'done').length;
  const completedCount = items.filter(i => i.status === 'done').length;
  const criticalCount = items.filter(i => i.status !== 'done' && (i.priority === 'critical' || i.priority === 'high')).length;

  if (!isAdmin) return null;

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="space-y-1">
          <h2 className="text-xl font-bold flex items-center space-x-2 text-slate-900 dark:text-white">
            <ListTodo className="w-5 h-5 text-purple-500" />
            <span>OPL (Open Points List)</span>
          </h2>
          <p className="text-xs text-muted-foreground font-light">
            Monitor and track management review decisions, executive deliverables, and open action points.
          </p>
        </div>

        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center space-x-1.5 px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition shadow-lg shadow-purple-500/20 active:scale-95 cursor-pointer"
        >
          {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          <span>{showForm ? 'Cancel' : 'Add Open Point'}</span>
        </button>
      </div>

      {/* ── Stats Summary Grid ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'TOTAL POINTS', value: totalCount, icon: ListTodo, color: 'text-blue-500 bg-blue-500/10' },
          { label: 'OPEN ACTIONS', value: openCount, icon: HelpCircle, color: 'text-amber-500 bg-amber-500/10' },
          { label: 'COMPLETED', value: completedCount, icon: CheckCircle, color: 'text-emerald-500 bg-emerald-500/10' },
          { label: 'CRITICAL/HIGH OPEN', value: criticalCount, icon: AlertTriangle, color: 'text-red-500 bg-red-500/10' }
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
              <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Category / Review Area</label>
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                className="w-full mt-1.5 bg-white dark:bg-background border border-slate-200 dark:border-zinc-850 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 dark:text-zinc-200 focus:outline-none focus:border-purple-500 font-bold"
              >
                {CATEGORIES.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Action Point Title</label>
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
                {members.map((m: any) => (
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
                onChange={(e) => handleAddFile(e.target.files)}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center space-x-1.5 px-4.5 py-2.5 rounded-xl border border-dashed border-purple-300 dark:border-purple-800 bg-white dark:bg-background text-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition text-xs cursor-pointer font-bold"
              >
                <Paperclip className="w-3.5 h-3.5" />
                <span>Attach Files</span>
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

          <div className="flex justify-end space-x-3 pt-3 border-t border-slate-200 dark:border-white/5">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleAddOpenPoint}
              disabled={!newTitle.trim()}
              className="flex items-center space-x-1.5 px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition disabled:opacity-50 active:scale-95 shadow-lg shadow-purple-500/20"
            >
              Log Point
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

      {/* ── OPL Listing Table ── */}
      {filteredOPLItems.length === 0 ? (
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
                <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-500 dark:text-zinc-400 tracking-wider">Action Point Title</th>
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
                const subStatus = item.status;
                const isDone = subStatus === 'done';

                return (
                  <tr
                    key={item.id}
                    className={`hover:bg-slate-50/40 dark:hover:bg-zinc-900/10 transition-colors duration-150 ${
                      isDone ? 'opacity-60 bg-slate-50/20 dark:bg-zinc-900/5' : ''
                    }`}
                  >
                    {/* Title */}
                    <td className="px-4 py-3.5 align-top">
                      <div className="min-w-0 pl-1">
                        <button
                          type="button"
                          onClick={() => handleOpenEditModal(item)}
                          className={`text-left text-xs font-extrabold leading-tight transition cursor-pointer hover:underline ${
                            isDone
                              ? 'line-through text-slate-450 dark:text-zinc-550 hover:text-purple-500'
                              : 'text-slate-900 dark:text-zinc-100 hover:text-purple-600 dark:hover:text-purple-400'
                          }`}
                        >
                          {item.title}
                        </button>
                        <p className="text-[9px] text-slate-450 mt-0.5">
                          Category: <span className="font-semibold text-slate-650 dark:text-zinc-400">{item.category}</span>
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
                        <option value="to_do">TO DO</option>
                        <option value="in_progress">IN PROGRESS</option>
                        <option value="done">DONE</option>
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
                      {item.assignee && item.assignee !== 'Unassigned' ? (
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
                                href={file.publicUrl || '#'}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="truncate hover:text-purple-500 hover:underline text-slate-650 dark:text-zinc-400 font-bold flex-1"
                                title={file.name}
                              >
                                {file.name}
                              </a>
                              <a
                                href={file.publicUrl || '#'}
                                download={file.name}
                                className="text-purple-500 hover:text-purple-400 shrink-0"
                                title="Download"
                              >
                                <Download className="w-2.5 h-2.5 ml-0.5" />
                              </a>
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

      {/* ── Edit Action Point Sidebar Modal ── */}
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
              <div>
                <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Action Point Title</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full mt-1.5 bg-white dark:bg-background border border-slate-200 dark:border-zinc-850 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 dark:text-zinc-200 focus:outline-none focus:border-purple-500 font-extrabold"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Status</label>
                  <select
                    value={editStatus}
                    onChange={(e: any) => setEditStatus(e.target.value)}
                    className="w-full mt-1.5 bg-white dark:bg-background border border-slate-200 dark:border-zinc-850 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 dark:text-zinc-200 focus:outline-none focus:border-purple-500 font-black uppercase"
                  >
                    <option value="to_do">TO DO</option>
                    <option value="in_progress">IN PROGRESS</option>
                    <option value="done">DONE</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Priority</label>
                  <select
                    value={editPriority}
                    onChange={(e: any) => setEditPriority(e.target.value)}
                    className="w-full mt-1.5 bg-white dark:bg-background border border-slate-200 dark:border-zinc-850 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 dark:text-zinc-200 focus:outline-none focus:border-purple-500 font-bold"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Category</label>
                  <select
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value)}
                    className="w-full mt-1.5 bg-white dark:bg-background border border-slate-200 dark:border-zinc-850 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 dark:text-zinc-200 focus:outline-none focus:border-purple-500 font-bold"
                  >
                    {CATEGORIES.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Assigned to</label>
                  <select
                    value={editAssignee}
                    onChange={(e) => setEditAssignee(e.target.value)}
                    className="w-full mt-1.5 bg-white dark:bg-background border border-slate-200 dark:border-zinc-850 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 dark:text-zinc-200 focus:outline-none focus:border-purple-500"
                  >
                    <option value="">Unassigned</option>
                    {members.map((m: any) => (
                      <option key={m.id} value={`${m.firstName || ''} ${m.lastName || ''}`.trim() || m.email}>
                        {m.firstName ? `${m.firstName} ${m.lastName} (${m.email.split('@')[0]})` : m.email}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Remarks / Comments</label>
                <textarea
                  value={editRemarks}
                  onChange={(e) => setEditRemarks(e.target.value)}
                  rows={4}
                  placeholder="Add remarks or notes..."
                  className="w-full mt-1.5 bg-white dark:bg-background border border-slate-200 dark:border-zinc-850 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 dark:text-zinc-200 focus:outline-none focus:border-purple-500 resize-none font-medium"
                />
              </div>

              <div>
                <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider block mb-1">Uploads / Documentation</label>
                <div className="flex items-center gap-3">
                  <input
                    ref={editFileInputRef}
                    type="file"
                    className="hidden"
                    multiple
                    onChange={(e) => handleAddEditFile(e.target.files)}
                  />
                  <button
                    type="button"
                    onClick={() => editFileInputRef.current?.click()}
                    className="flex items-center space-x-1.5 px-4.5 py-2.5 rounded-xl border border-dashed border-purple-300 dark:border-purple-800 bg-white dark:bg-background text-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition text-xs cursor-pointer font-bold"
                  >
                    <Paperclip className="w-3.5 h-3.5" />
                    <span>Upload Attachment</span>
                  </button>
                </div>

                {editFiles.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {editFiles.map((file, i) => (
                      <span key={file.id} className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-xs text-slate-700 dark:text-zinc-300">
                        <Paperclip className="w-3 h-3 text-purple-500 shrink-0" />
                        <span className="max-w-[140px] truncate">{file.name}</span>
                        <button type="button" onClick={() => setEditFiles(prev => prev.filter((_, idx) => idx !== i))} className="text-slate-400 hover:text-red-400 ml-1">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="border-t border-slate-200 dark:border-white/5 p-6 flex justify-end space-x-3 bg-slate-100/50 dark:bg-zinc-900/30">
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-zinc-800 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEditChanges}
                disabled={!editTitle.trim()}
                className="flex items-center space-x-1.5 px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition disabled:opacity-50 active:scale-95 shadow-lg shadow-purple-500/20"
              >
                Save Changes
              </button>
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  );
};

export default ManagementReviewView;
