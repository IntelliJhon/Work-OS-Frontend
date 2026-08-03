import React, { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { projectsApi, type Project } from '../../services/api/projects';
import { tasksApi, type Task } from '../../services/api/tasks.api';
import { usersApi, type User } from '../../services/api/users';
import {
  FolderKanban,
  Search,
  CheckCircle2,
  Clock,
  Timer,
  AlertCircle,
  ChevronDown,
  User as UserIcon,
  Loader2,
  ListTodo,
  SlidersHorizontal,
  ArrowUpDown
} from 'lucide-react';

// Priority Styling Config
const PRIORITY_CONFIG = {
  critical: { label: 'CRITICAL', bg: 'bg-rose-500/10 text-rose-500 border-rose-500/20 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-900/50' },
  high: { label: 'HIGH', bg: 'bg-amber-500/10 text-amber-600 border-amber-500/20 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900/50' },
  medium: { label: 'MEDIUM', bg: 'bg-blue-500/10 text-blue-600 border-blue-500/20 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-900/50' },
  low: { label: 'LOW', bg: 'bg-slate-500/10 text-slate-600 border-slate-500/20 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700' },
};

// Status Styling Config
const STATUS_CONFIG: Record<string, { label: string; bg: string }> = {
  done: { label: 'COMPLETED', bg: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900/50' },
  completed: { label: 'COMPLETED', bg: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900/50' },
  in_progress: { label: 'IN PROGRESS', bg: 'bg-blue-500/10 text-blue-600 border-blue-500/20 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-900/50' },
  in_review: { label: 'IN REVIEW', bg: 'bg-purple-500/10 text-purple-600 border-purple-500/20 dark:bg-purple-950/30 dark:text-purple-400 dark:border-purple-900/50' },
  blocked: { label: 'BLOCKED', bg: 'bg-red-500/10 text-red-600 border-red-500/20 dark:bg-red-950/30 dark:text-red-400 dark:border-red-900/50' },
  to_do: { label: 'TO DO', bg: 'bg-slate-500/10 text-slate-600 border-slate-500/20 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700' },
};

// Calculate formatted duration string
function calculateDuration(createdAt: string, completedAt: string | null, status: string): {
  text: string;
  isDone: boolean;
  isInProgress: boolean;
  diffMs: number;
} {
  const start = new Date(createdAt).getTime();
  const isDone = status === 'done' || status === 'completed';
  const isInProgress = status === 'in_progress';

  if (isDone && completedAt) {
    const end = new Date(completedAt).getTime();
    const diffMs = Math.max(0, end - start);
    return { text: formatMs(diffMs), isDone: true, isInProgress: false, diffMs };
  }

  if (isDone && !completedAt) {
    return { text: 'Completed', isDone: true, isInProgress: false, diffMs: 0 };
  }

  if (isInProgress) {
    const diffMs = Math.max(0, Date.now() - start);
    return { text: `${formatMs(diffMs)} (Running)`, isDone: false, isInProgress: true, diffMs };
  }

  return { text: 'Not Started', isDone: false, isInProgress: false, diffMs: -1 };
}

function formatMs(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    const remHours = hours % 24;
    return remHours > 0 ? `${days}d ${remHours}h` : `${days} day${days > 1 ? 's' : ''}`;
  }
  if (hours > 0) {
    const remMins = minutes % 60;
    return remMins > 0 ? `${hours}h ${remMins}m` : `${hours} hr${hours > 1 ? 's' : ''}`;
  }
  if (minutes > 0) {
    return `${minutes} min${minutes > 1 ? 's' : ''}`;
  }
  return '< 1 min';
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '-';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '-';
  }
}

export const ProjectTaskList: React.FC = () => {
  const { id: routeProjectId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // Selected project state (defaults to URL param project ID)
  const [selectedProjectId, setSelectedProjectId] = useState<string>(routeProjectId || '');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'duration' | 'title'>('newest');

  // Fetch all projects for the dropdown
  const { data: allProjects = [], isLoading: isLoadingProjects } = useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: projectsApi.list,
  });

  // Fetch users for assignee mapping
  const { data: usersList = [] } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: async () => {
      const res = await usersApi.list({ limit: 100 });
      return Array.isArray(res) ? res : res?.users || [];
    },
  });

  // Map of users for quick lookup
  const userMap = useMemo(() => {
    const map = new Map<string, User>();
    usersList.forEach(u => map.set(u.id, u));
    return map;
  }, [usersList]);

  // Fetch all tasks for workspace
  const { data: allTasks = [], isLoading: isLoadingTasks } = useQuery<Task[]>({
    queryKey: ['tasks'],
    queryFn: tasksApi.list,
  });

  // Current active project object
  const activeProject = useMemo(() => {
    return allProjects.find(p => p.id === (selectedProjectId || routeProjectId)) || null;
  }, [allProjects, selectedProjectId, routeProjectId]);

  // Handle switching project from dropdown
  const handleProjectSelect = (projId: string) => {
    setSelectedProjectId(projId);
    if (projId && projId !== routeProjectId) {
      navigate(`/projects/${projId}/task-list`);
    }
  };

  // Filter tasks for the selected project
  const projectTasks = useMemo(() => {
    const pid = selectedProjectId || routeProjectId;
    if (!pid) return [];
    return allTasks.filter(t => t.projectId === pid);
  }, [allTasks, selectedProjectId, routeProjectId]);

  // Sprints / Activities map for context
  const sprintMap = useMemo(() => {
    const map = new Map<string, string>();
    if (activeProject?.sprints) {
      activeProject.sprints.forEach(s => map.set(s.id, s.name));
    }
    return map;
  }, [activeProject]);

  // Filtered and Sorted tasks
  const filteredTasks = useMemo(() => {
    return projectTasks.filter(task => {
      // Search
      const matchesSearch =
        !searchQuery.trim() ||
        task.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (task.description && task.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (task.assigneeId && userMap.get(task.assigneeId) &&
          `${userMap.get(task.assigneeId)?.firstName} ${userMap.get(task.assigneeId)?.lastName}`
            .toLowerCase()
            .includes(searchQuery.toLowerCase()));

      // Status
      const taskStatus = task.status || 'to_do';
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'completed' && (taskStatus === 'done' || taskStatus === 'completed')) ||
        (statusFilter === 'in_progress' && taskStatus === 'in_progress') ||
        (statusFilter === 'to_do' && (taskStatus === 'to_do' || taskStatus === 'todo')) ||
        (statusFilter === 'blocked' && taskStatus === 'blocked');

      // Priority
      const priority = task.customFields?.priority || 'medium';
      const matchesPriority = priorityFilter === 'all' || priority === priorityFilter;

      return matchesSearch && matchesStatus && matchesPriority;
    }).sort((a, b) => {
      if (sortBy === 'newest') {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      if (sortBy === 'oldest') {
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }
      if (sortBy === 'title') {
        return a.name.localeCompare(b.name);
      }
      if (sortBy === 'duration') {
        const durA = calculateDuration(a.createdAt, a.completedAt, a.status).diffMs;
        const durB = calculateDuration(b.createdAt, b.completedAt, b.status).diffMs;
        return durB - durA;
      }
      return 0;
    });
  }, [projectTasks, searchQuery, statusFilter, priorityFilter, sortBy, userMap]);

  // KPI Metrics Calculation
  const metrics = useMemo(() => {
    const total = projectTasks.length;
    const completed = projectTasks.filter(t => t.status === 'done' || t.status === 'completed').length;
    const inProgress = projectTasks.filter(t => t.status === 'in_progress').length;
    const pending = total - completed - inProgress;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

    // Calculate average duration for completed tasks
    const completedDurationsMs = projectTasks
      .filter(t => (t.status === 'done' || t.status === 'completed') && t.completedAt)
      .map(t => Math.max(0, new Date(t.completedAt!).getTime() - new Date(t.createdAt).getTime()));

    const avgMs = completedDurationsMs.length > 0
      ? completedDurationsMs.reduce((a, b) => a + b, 0) / completedDurationsMs.length
      : 0;

    return {
      total,
      completed,
      inProgress,
      pending,
      completionRate,
      avgDurationText: avgMs > 0 ? formatMs(avgMs) : 'N/A',
    };
  }, [projectTasks]);

  if (isLoadingTasks || isLoadingProjects) {
    return (
      <div className="w-full h-72 flex flex-col items-center justify-center space-y-3">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
        <p className="text-xs text-muted-foreground font-light tracking-wider uppercase animate-pulse">
          Loading Project Task List
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-slate-800 dark:text-zinc-200 animate-fade-in">
      {/* ── Top Bar with Title & Project Selection Dropdown ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/70 dark:bg-zinc-900/40 p-4 border border-slate-200 dark:border-zinc-800 rounded-2xl">
        <div className="space-y-0.5">
          <div className="flex items-center space-x-2">
            <ListTodo className="w-5 h-5 text-blue-500" />
            <h2 className="text-lg font-extrabold text-slate-900 dark:text-white tracking-tight">
              Task List & Time Performance
            </h2>
          </div>
          <p className="text-xs text-muted-foreground font-light">
            Monitor all deliverable tasks, progress status, and exact time taken to complete each task.
          </p>
        </div>

        {/* Project Selector Dropdown */}
        <div className="flex items-center space-x-2 bg-white dark:bg-background border border-slate-200 dark:border-zinc-800 rounded-xl px-3 py-2 shadow-sm">
          <FolderKanban className="w-4 h-4 text-purple-500 shrink-0" />
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-zinc-400 shrink-0">
            Project:
          </span>
          <div className="relative min-w-[200px]">
            <select
              value={selectedProjectId || routeProjectId || ''}
              onChange={(e) => handleProjectSelect(e.target.value)}
              className="w-full appearance-none bg-transparent pr-7 pl-1 text-xs font-bold text-slate-900 dark:text-white focus:outline-none cursor-pointer truncate"
            >
              {allProjects.map((p) => (
                <option key={p.id} value={p.id} className="bg-white dark:bg-zinc-900 text-slate-900 dark:text-white">
                  {p.name}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* ── KPI Metric Summary Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Tasks */}
        <div className="glass-panel p-4 rounded-2xl border border-slate-200 dark:border-zinc-800 space-y-1.5">
          <div className="flex items-center justify-between text-slate-500 dark:text-zinc-400">
            <span className="text-[10px] font-black uppercase tracking-wider">Total Tasks</span>
            <ListTodo className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white">{metrics.total}</div>
          <p className="text-[10px] text-muted-foreground font-light">
            In project {activeProject?.name || 'Selected'}
          </p>
        </div>

        {/* Completed Tasks & Rate */}
        <div className="glass-panel p-4 rounded-2xl border border-slate-200 dark:border-zinc-800 space-y-1.5">
          <div className="flex items-center justify-between text-slate-500 dark:text-zinc-400">
            <span className="text-[10px] font-black uppercase tracking-wider">Completed</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-black text-slate-900 dark:text-white">{metrics.completed}</span>
            <span className="text-xs font-bold text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded">
              {metrics.completionRate}%
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground font-light">Finished deliverables</p>
        </div>

        {/* In Progress */}
        <div className="glass-panel p-4 rounded-2xl border border-slate-200 dark:border-zinc-800 space-y-1.5">
          <div className="flex items-center justify-between text-slate-500 dark:text-zinc-400">
            <span className="text-[10px] font-black uppercase tracking-wider">In Progress</span>
            <Clock className="w-4 h-4 text-blue-500 animate-spin duration-3000" />
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white">{metrics.inProgress}</div>
          <p className="text-[10px] text-muted-foreground font-light">Active development</p>
        </div>

        {/* Avg Completion Time */}
        <div className="glass-panel p-4 rounded-2xl border border-slate-200 dark:border-zinc-800 space-y-1.5">
          <div className="flex items-center justify-between text-slate-500 dark:text-zinc-400">
            <span className="text-[10px] font-black uppercase tracking-wider">Avg Time Taken</span>
            <Timer className="w-4 h-4 text-purple-500" />
          </div>
          <div className="text-2xl font-black text-purple-600 dark:text-purple-400">
            {metrics.avgDurationText}
          </div>
          <p className="text-[10px] text-muted-foreground font-light">Average cycle time</p>
        </div>
      </div>

      {/* ── Search, Filters & Controls Bar ── */}
      <div className="flex flex-col lg:flex-row gap-3 items-center justify-between bg-slate-50/50 dark:bg-zinc-900/20 p-4 border border-slate-200 dark:border-zinc-800 rounded-2xl">
        {/* Search */}
        <div className="relative w-full lg:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search tasks, descriptions, assignee..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-white dark:bg-background border border-slate-200 dark:border-zinc-800 text-xs text-slate-800 dark:text-zinc-200 focus:outline-none focus:border-blue-500 font-medium"
          />
        </div>

        {/* Filter Controls */}
        <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
          {/* Status Filter */}
          <div className="flex items-center space-x-1 bg-white dark:bg-background border border-slate-200 dark:border-zinc-800 rounded-xl px-2.5 py-1.5">
            <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-transparent text-xs font-semibold text-slate-700 dark:text-zinc-300 focus:outline-none cursor-pointer"
            >
              <option value="all" className="bg-white dark:bg-zinc-900">All Statuses</option>
              <option value="to_do" className="bg-white dark:bg-zinc-900">To Do</option>
              <option value="in_progress" className="bg-white dark:bg-zinc-900">In Progress</option>
              <option value="completed" className="bg-white dark:bg-zinc-900">Completed</option>
              <option value="blocked" className="bg-white dark:bg-zinc-900">Blocked</option>
            </select>
          </div>

          {/* Priority Filter */}
          <div className="flex items-center space-x-1 bg-white dark:bg-background border border-slate-200 dark:border-zinc-800 rounded-xl px-2.5 py-1.5">
            <AlertCircle className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="bg-transparent text-xs font-semibold text-slate-700 dark:text-zinc-300 focus:outline-none cursor-pointer"
            >
              <option value="all" className="bg-white dark:bg-zinc-900">All Priorities</option>
              <option value="critical" className="bg-white dark:bg-zinc-900">Critical</option>
              <option value="high" className="bg-white dark:bg-zinc-900">High</option>
              <option value="medium" className="bg-white dark:bg-zinc-900">Medium</option>
              <option value="low" className="bg-white dark:bg-zinc-900">Low</option>
            </select>
          </div>

          {/* Sort By */}
          <div className="flex items-center space-x-1 bg-white dark:bg-background border border-slate-200 dark:border-zinc-800 rounded-xl px-2.5 py-1.5">
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-transparent text-xs font-semibold text-slate-700 dark:text-zinc-300 focus:outline-none cursor-pointer"
            >
              <option value="newest" className="bg-white dark:bg-zinc-900">Sort: Newest</option>
              <option value="oldest" className="bg-white dark:bg-zinc-900">Sort: Oldest</option>
              <option value="duration" className="bg-white dark:bg-zinc-900">Sort: Time Taken</option>
              <option value="title" className="bg-white dark:bg-zinc-900">Sort: Task Title</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── Main Tasks & Time Taken Table ── */}
      {filteredTasks.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-slate-250 dark:border-zinc-800 rounded-3xl space-y-3 bg-slate-50/20 dark:bg-zinc-900/10">
          <ListTodo className="w-12 h-12 mx-auto text-slate-300 dark:text-zinc-700" />
          <div className="space-y-1">
            <h4 className="text-sm font-bold text-slate-800 dark:text-zinc-300">No Tasks Found</h4>
            <p className="text-xs text-muted-foreground font-light max-w-sm mx-auto">
              No project tasks match your active filters or project selection ({activeProject?.name || 'Selected'}).
            </p>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-background/40 shadow-sm">
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead>
              <tr className="border-b border-slate-200 dark:border-zinc-800 bg-slate-50/80 dark:bg-zinc-900/60 text-[10px] font-black uppercase text-slate-500 dark:text-zinc-400 tracking-wider">
                <th className="px-4 py-3.5">Task Name & Details</th>
                <th className="px-4 py-3.5 w-32">Sprint / Context</th>
                <th className="px-4 py-3.5 w-28">Status</th>
                <th className="px-4 py-3.5 w-24 text-center">Priority</th>
                <th className="px-4 py-3.5 w-36">Assigned To</th>
                <th className="px-4 py-3.5 w-28">Created Date</th>
                <th className="px-4 py-3.5 w-28">Completed Date</th>
                <th className="px-4 py-3.5 w-40 font-extrabold text-purple-600 dark:text-purple-400">
                  Time Taken
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-150 dark:divide-zinc-850 text-xs font-medium">
              {filteredTasks.map((task) => {
                const priorityKey = (task.customFields?.priority || 'medium') as keyof typeof PRIORITY_CONFIG;
                const priorityCfg = PRIORITY_CONFIG[priorityKey] || PRIORITY_CONFIG.medium;
                const statusKey = task.status || 'to_do';
                const statusCfg = STATUS_CONFIG[statusKey] || STATUS_CONFIG.to_do;

                const duration = calculateDuration(task.createdAt, task.completedAt, statusKey);
                const sprintName = task.sprintId ? sprintMap.get(task.sprintId) : null;
                const assignee = task.assigneeId ? userMap.get(task.assigneeId) : null;
                const assigneeName = assignee
                  ? `${assignee.firstName || ''} ${assignee.lastName || ''}`.trim() || assignee.email
                  : 'Unassigned';

                const subtasks = task.customFields?.subtasks || [];
                const subtasksDone = subtasks.filter(s => s.done || s.status === 'done').length;

                return (
                  <tr
                    key={task.id}
                    className="hover:bg-slate-50/60 dark:hover:bg-zinc-900/20 transition-colors duration-150"
                  >
                    {/* Task Title */}
                    <td className="px-4 py-3.5 align-top">
                      <div className="space-y-1 max-w-md">
                        <p className="font-extrabold text-slate-900 dark:text-zinc-100 leading-snug">
                          {task.name}
                        </p>
                        {task.description && (
                          <p className="text-[11px] text-muted-foreground font-light line-clamp-1">
                            {task.description}
                          </p>
                        )}
                        {subtasks.length > 0 && (
                          <div className="inline-flex items-center space-x-1 text-[9.5px] font-semibold text-slate-500 dark:text-zinc-400 bg-slate-100 dark:bg-zinc-850 px-2 py-0.5 rounded-md">
                            <span>Subtasks: {subtasksDone}/{subtasks.length} completed</span>
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Sprint / Context */}
                    <td className="px-4 py-3.5 align-top">
                      <span className="text-[11px] font-semibold text-slate-600 dark:text-zinc-400 truncate block">
                        {sprintName || 'General Workspace'}
                      </span>
                    </td>

                    {/* Status Badge */}
                    <td className="px-4 py-3.5 align-top">
                      <span
                        className={`inline-block text-[9.5px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg border ${statusCfg.bg}`}
                      >
                        {statusCfg.label}
                      </span>
                    </td>

                    {/* Priority Badge */}
                    <td className="px-4 py-3.5 align-top text-center">
                      <span
                        className={`inline-block text-[9.5px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md border ${priorityCfg.bg}`}
                      >
                        {priorityCfg.label}
                      </span>
                    </td>

                    {/* Assigned To */}
                    <td className="px-4 py-3.5 align-top">
                      <div className="flex items-center space-x-2">
                        <div className="w-6 h-6 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-500 flex items-center justify-center text-[10px] font-bold uppercase shrink-0">
                          {assignee ? (assignee.firstName?.[0] || assignee.email[0]) : <UserIcon className="w-3 h-3" />}
                        </div>
                        <span className="text-xs font-semibold text-slate-700 dark:text-zinc-300 truncate">
                          {assigneeName}
                        </span>
                      </div>
                    </td>

                    {/* Created Date */}
                    <td className="px-4 py-3.5 align-top text-slate-500 dark:text-zinc-400 text-xs">
                      {formatDate(task.createdAt)}
                    </td>

                    {/* Completed Date */}
                    <td className="px-4 py-3.5 align-top text-slate-500 dark:text-zinc-400 text-xs">
                      {formatDate(task.completedAt)}
                    </td>

                    {/* Time Taken Column (Key Requirement) */}
                    <td className="px-4 py-3.5 align-top">
                      {duration.isDone ? (
                        <div className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-extrabold text-xs">
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-500" />
                          <span>{duration.text}</span>
                        </div>
                      ) : duration.isInProgress ? (
                        <div className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 font-bold text-xs">
                          <Timer className="w-3.5 h-3.5 shrink-0 text-blue-500 animate-spin duration-3000" />
                          <span>{duration.text}</span>
                        </div>
                      ) : (
                        <span className="text-slate-400 dark:text-zinc-550 text-xs italic">
                          Not Started
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ProjectTaskList;
