import React, { useState, useEffect, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { 
  Calendar, 
  Layers, 
  Clock, 
  AlertOctagon, 
  ChevronDown, 
  ChevronRight,
  Filter,
  X,
  Play,
  CheckCircle,
  FileText,
  Activity as ActivityIcon,
  CheckSquare,
  Square,
  Plus,
  Trash
} from 'lucide-react';
import type { Project } from '../../services/api/projects';
import { activitiesApi } from '../../services/api/sprints';
import { tasksApi } from '../../services/api/tasks.api';
import { usersApi } from '../../services/api/users';
import type { User as UserType } from '../../services/api/users';
import { useAuthStore } from '../../store/authStore';
import { DatePickerInput } from '../../components/ui/DatePickerInput';

interface SubTask {
  id: string;
  title: string;
  done: boolean;
}

export const ProjectAnalytics: React.FC = () => {
  const { project } = useOutletContext<{ project: Project }>();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  const [members, setMembers] = useState<UserType[]>([]);
  
  // Filter and view states
  const [selectedAssignee, setSelectedAssignee] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [timeScale, setTimeScale] = useState<'days' | 'weeks' | 'months'>('days');

  // Dynamic grid column width based on timescale to reduce horizontal scroll area
  const colWidth = useMemo(() => {
    if (timeScale === 'weeks') return 16;
    if (timeScale === 'months') return 6;
    return 32;
  }, [timeScale]);

  // Slide drawers
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [activeActivityId, setActiveActivityId] = useState<string | null>(null);

  // New subtask state inside Task details drawer
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');

  // Scoped localStorage collapse state (collapsed by default)
  const [expandedActivities, setExpandedActivities] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem(`project_analytics_expanded_${project.id}`);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(`project_analytics_expanded_${project.id}`, JSON.stringify(expandedActivities));
    } catch (e) {
      console.error('[ProjectAnalytics] Failed to save collapse state', e);
    }
  }, [expandedActivities, project.id]);

  // Load team members
  useEffect(() => {
    usersApi.list({ limit: 1000 })
      .then((res) => setMembers(res))
      .catch((err) => console.error('[ProjectAnalytics] Failed to load members', err));
  }, []);

  // Fetch activities
  const { data: activities = [], isLoading: isLoadingActivities } = useQuery({
    queryKey: ['activities', project.id],
    queryFn: () => activitiesApi.listByProject(project.id),
    enabled: !!project.id,
  });

  // Fetch tasks
  const { data: dbTasks = [], isLoading: isLoadingTasks } = useQuery({
    queryKey: ['tasks'],
    queryFn: tasksApi.list,
  });

  // Filter tasks belonging to the current project
  const projectTasks = useMemo(() => {
    return dbTasks.filter((task) => task.projectId === project.id);
  }, [dbTasks, project.id]);

  // Determine overdue status
  const isTaskOverdue = (task: any) => {
    if (task.status === 'done' || task.status === 'completed') return false;
    const dueDateStr = task.customFields?.dueDate;
    if (!dueDateStr) return false;
    const dueDate = new Date(dueDateStr);
    dueDate.setHours(23, 59, 59, 999);
    return dueDate < new Date();
  };

  // Filtered Activities and Tasks based on dropdown selections
  const filteredData = useMemo(() => {
    let tasksFiltered = [...projectTasks];

    if (selectedAssignee !== 'all') {
      tasksFiltered = tasksFiltered.filter((t) => t.assigneeId === selectedAssignee);
    }
    if (selectedStatus !== 'all') {
      tasksFiltered = tasksFiltered.filter((t) => t.status === selectedStatus);
    }

    const filteredMap: Record<string, typeof projectTasks> = {};
    tasksFiltered.forEach((task) => {
      const actId = task.activityId || 'unassigned';
      if (!filteredMap[actId]) {
        filteredMap[actId] = [];
      }
      filteredMap[actId].push(task);
    });

    const showAllActivities = selectedAssignee === 'all' && selectedStatus === 'all';
    const activeActivities = activities.filter(
      (act) => showAllActivities || filteredMap[act.id]?.length > 0
    );

    return {
      activities: activeActivities,
      tasksMap: filteredMap,
    };
  }, [projectTasks, activities, selectedAssignee, selectedStatus]);

  // Derived activity start/end dates based on child tasks if parent has no dates
  const activityDatesMap = useMemo(() => {
    const map: Record<string, { startDate?: string; endDate?: string; isDerived: boolean }> = {};
    activities.forEach((act) => {
      let start = act.startDate;
      let end = act.endDate;
      let isDerived = false;

      if (!start || !end) {
        const childTasks = projectTasks.filter((t) => t.activityId === act.id);
        let minStart: Date | null = null;
        let maxEnd: Date | null = null;

        childTasks.forEach((t) => {
          const tStart = t.customFields?.startDate;
          const tDue = t.customFields?.dueDate;
          
          // Use either date as fallback if the other is missing
          const resolvedStart = tStart || tDue;
          const resolvedDue = tDue || tStart;

          if (resolvedStart) {
            const d = new Date(resolvedStart);
            if (!minStart || d < minStart) minStart = d;
          }
          if (resolvedDue) {
            const d = new Date(resolvedDue);
            if (!maxEnd || d > maxEnd) maxEnd = d;
          }
        });

        if (minStart && !start) {
          start = (minStart as Date).toISOString().split('T')[0];
          isDerived = true;
        }
        if (maxEnd && !end) {
          end = (maxEnd as Date).toISOString().split('T')[0];
          isDerived = true;
        }
      }

      // Fallback if one parent date is missing and could not be derived from child tasks
      if (start && !end) {
        end = start;
      }
      if (end && !start) {
        start = end;
      }

      map[act.id] = { startDate: start || undefined, endDate: end || undefined, isDerived };
    });
    return map;
  }, [activities, projectTasks]);

  // Compute overall statistics
  const stats = useMemo(() => {
    const totalActivities = filteredData.activities.length;
    const totalTasks = projectTasks.length;
    const completed = projectTasks.filter((t) => t.status === 'done' || t.status === 'completed').length;
    const inProgress = projectTasks.filter((t) => t.status === 'in_progress').length;
    const blocked = projectTasks.filter((t) => t.status === 'blocked').length;
    const overdue = projectTasks.filter(isTaskOverdue).length;

    return {
      totalActivities,
      totalTasks,
      completed,
      inProgress,
      blocked,
      overdue,
      progressPercent: totalTasks > 0 ? Math.round((completed / totalTasks) * 100) : 0,
    };
  }, [projectTasks, filteredData.activities]);

  // Determine timeline boundary dates
  const timelineBounds = useMemo(() => {
    let minDate = new Date();
    let maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + 30); // Default to a 30 day window
    let hasValidDates = false;

    // Look at activities (using derived dates)
    Object.values(activityDatesMap).forEach((dates) => {
      if (dates.startDate) {
        const d = new Date(dates.startDate);
        if (!hasValidDates || d < minDate) minDate = d;
        hasValidDates = true;
      }
      if (dates.endDate) {
        const d = new Date(dates.endDate);
        if (!hasValidDates || d > maxDate) maxDate = d;
        hasValidDates = true;
      }
    });

    // Look at tasks
    projectTasks.forEach((t) => {
      const tStart = t.customFields?.startDate;
      const tDue = t.customFields?.dueDate;
      
      const resolvedStart = tStart || tDue;
      const resolvedDue = tDue || tStart;

      if (resolvedStart) {
        const d = new Date(resolvedStart);
        if (!hasValidDates || d < minDate) minDate = d;
        hasValidDates = true;
      }
      if (resolvedDue) {
        const d = new Date(resolvedDue);
        if (!hasValidDates || d > maxDate) maxDate = d;
        hasValidDates = true;
      }
    });

    // Give it a little buffer (3 days before min, 7 days after max)
    const timelineStart = new Date(minDate);
    timelineStart.setDate(timelineStart.getDate() - 3);
    
    const timelineEnd = new Date(maxDate);
    timelineEnd.setDate(timelineEnd.getDate() + 7);

    return {
      start: timelineStart,
      end: timelineEnd,
    };
  }, [activityDatesMap, projectTasks]);

  // Generate date columns for rendering the timeline header and calculating positions
  const timelineDays = useMemo(() => {
    const days: Date[] = [];
    const current = new Date(timelineBounds.start);
    while (current <= timelineBounds.end) {
      days.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }
    return days;
  }, [timelineBounds]);

  // Calculate weeks for rendering a weekly timeline scale
  const timelineWeeks = useMemo(() => {
    const weeks: { start: Date; label: string; daysCount: number }[] = [];
    let currentWeekDays = 0;
    let currentWeekStart = new Date(timelineBounds.start);

    timelineDays.forEach((day, index) => {
      currentWeekDays++;
      if (day.getDay() === 0 || index === timelineDays.length - 1) {
        weeks.push({
          start: new Date(currentWeekStart),
          label: `Wk of ${currentWeekStart.toLocaleDateString([], { month: 'short', day: 'numeric' })}`,
          daysCount: currentWeekDays,
        });
        currentWeekStart = new Date(day);
        currentWeekStart.setDate(currentWeekStart.getDate() + 1);
        currentWeekDays = 0;
      }
    });

    return weeks;
  }, [timelineDays, timelineBounds]);

  // Calculate months for rendering a monthly timeline scale
  const timelineMonths = useMemo(() => {
    const months: { start: Date; label: string; daysCount: number }[] = [];
    let currentMonthDays = 0;
    let currentMonthStart = new Date(timelineBounds.start);

    timelineDays.forEach((day, index) => {
      currentMonthDays++;
      const isLastDayOfMonth = new Date(day.getFullYear(), day.getMonth() + 1, 0).getDate() === day.getDate();
      const isLastDayOfTimeline = index === timelineDays.length - 1;

      if (isLastDayOfMonth || isLastDayOfTimeline) {
        months.push({
          start: new Date(currentMonthStart),
          label: currentMonthStart.toLocaleDateString([], { month: 'short', year: 'numeric' }),
          daysCount: currentMonthDays,
        });
        currentMonthStart = new Date(day);
        currentMonthStart.setDate(currentMonthStart.getDate() + 1);
        currentMonthDays = 0;
      }
    });

    return months;
  }, [timelineDays, timelineBounds]);

  // Calculate months for the daily scale to group columns by month
  const timelineMonthsForDaily = useMemo(() => {
    const months: { label: string; daysCount: number }[] = [];
    if (timelineDays.length === 0) return months;

    let currentMonthDays = 0;
    let currentMonthLabel = '';

    timelineDays.forEach((day, index) => {
      currentMonthDays++;
      const monthLabel = day.toLocaleDateString([], { month: 'long', year: 'numeric' });
      
      if (index === 0) {
        currentMonthLabel = monthLabel;
      }

      const nextDay = timelineDays[index + 1];
      const isMonthEnd = !nextDay || nextDay.getMonth() !== day.getMonth() || nextDay.getFullYear() !== day.getFullYear();

      if (isMonthEnd) {
        months.push({
          label: currentMonthLabel,
          daysCount: currentMonthDays,
        });
        if (nextDay) {
          currentMonthLabel = nextDay.toLocaleDateString([], { month: 'long', year: 'numeric' });
        }
        currentMonthDays = 0;
      }
    });

    return months;
  }, [timelineDays]);

  const toggleActivityCollapse = (activityId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setExpandedActivities((prev) => ({
      ...prev,
      [activityId]: !prev[activityId],
    }));
  };

  const getActivityProgress = (childTasks: any[]) => {
    if (childTasks.length === 0) return 0;
    const completed = childTasks.filter(t => t.status === 'done' || t.status === 'completed').length;
    return Math.round((completed / childTasks.length) * 100);
  };

  // Helper to calculate column positioning
  const getPositionStyles = (startDateStr?: string | null, endDateStr?: string | null) => {
    let startStr = startDateStr;
    let endStr = endDateStr;

    if (!startStr && !endStr) {
      return null;
    }

    // Fallback if only one date is present
    if (!startStr && endStr) startStr = endStr;
    if (!endStr && startStr) endStr = startStr;

    const start = new Date(startStr!);
    const end = new Date(endStr!);
    const timelineStart = timelineBounds.start;

    // Calculate difference in days
    const startDiff = Math.round((start.getTime() - timelineStart.getTime()) / (1000 * 60 * 60 * 24));
    const duration = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);

    const colStart = Math.max(1, startDiff + 1);
    
    return {
      gridColumnStart: colStart,
      gridColumnEnd: `span ${duration}`,
      duration,
    };
  };

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'done':
      case 'completed':
        return {
          bg: 'bg-emerald-500/10 dark:bg-emerald-500/10',
          border: 'border-emerald-500/40 dark:border-emerald-500/20',
          bar: 'bg-emerald-500 dark:bg-emerald-600 shadow-[0_0_8px_rgba(16,185,129,0.3)]',
          text: 'text-emerald-600 dark:text-emerald-400',
          badge: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
        };
      case 'in_progress':
        return {
          bg: 'bg-blue-500/10 dark:bg-blue-500/10',
          border: 'border-blue-500/40 dark:border-blue-500/20',
          bar: 'bg-blue-500 dark:bg-blue-600 shadow-[0_0_8px_rgba(59,130,246,0.3)]',
          text: 'text-blue-600 dark:text-blue-400',
          badge: 'bg-blue-500/10 border-blue-500/20 text-blue-600 dark:text-blue-400'
        };
      case 'in_review':
        return {
          bg: 'bg-orange-500/10 dark:bg-orange-500/10',
          border: 'border-orange-500/40 dark:border-orange-500/20',
          bar: 'bg-orange-500 dark:bg-orange-655 shadow-[0_0_8px_rgba(249,115,22,0.3)]',
          text: 'text-orange-600 dark:text-orange-400',
          badge: 'bg-orange-500/10 border-orange-500/20 text-orange-600 dark:text-orange-400'
        };
      case 'blocked':
        return {
          bg: 'bg-rose-500/10 dark:bg-rose-500/10',
          border: 'border-rose-500/40 dark:border-rose-500/20',
          bar: 'bg-rose-500 dark:bg-rose-600 shadow-[0_0_8px_rgba(239,68,68,0.3)]',
          text: 'text-rose-600 dark:text-rose-400',
          badge: 'bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400'
        };
      default:
        return {
          bg: 'bg-zinc-500/10 dark:bg-white/5',
          border: 'border-zinc-500/25 dark:border-white/10',
          bar: 'bg-zinc-400 dark:bg-zinc-650',
          text: 'text-slate-600 dark:text-zinc-400',
          badge: 'bg-zinc-500/10 border-zinc-500/20 text-slate-600 dark:text-zinc-400'
        };
    }
  };

  const getPriorityBadgeColor = (priority?: string) => {
    switch (priority) {
      case 'critical':
        return 'bg-rose-500/15 border-rose-500/25 text-rose-400';
      case 'high':
        return 'bg-amber-500/15 border-amber-500/25 text-amber-400';
      case 'medium':
        return 'bg-blue-500/15 border-blue-500/20 text-blue-400';
      default:
        return 'bg-zinc-500/10 border-zinc-500/20 text-slate-500';
    }
  };

  const getMemberInitials = (userId?: string | null) => {
    if (!userId) return 'UA';
    const m = members.find((u) => u.id === userId);
    if (!m) return 'UA';
    return `${m.firstName[0] || ''}${m.lastName[0] || ''}`.toUpperCase();
  };

  const getMemberName = (userId?: string | null) => {
    if (!userId) return 'Unassigned';
    const m = members.find((u) => u.id === userId);
    return m ? `${m.firstName} ${m.lastName}` : 'Unassigned';
  };

  const getMemberDisplayName = (m: UserType) => {
    const fullName = `${m.firstName || ''} ${m.lastName || ''}`.trim();
    return fullName ? `${fullName} (${m.email.split('@')[0]})` : m.email.split('@')[0];
  };

  const activeTask = useMemo(() => {
    return projectTasks.find((t) => t.id === activeTaskId) || null;
  }, [projectTasks, activeTaskId]);

  const activeActivity = useMemo(() => {
    return activities.find((a) => a.id === activeActivityId) || null;
  }, [activities, activeActivityId]);

  // Authorization details
  const isFullAccess = user?.role === 'Admin' || user?.role === 'Project Manager' || project?.pmId === user?.id;
  const dbTaskForActive = activeTask ? dbTasks.find((t) => t.id === activeTask.id) : null;
  const isAssignee = dbTaskForActive?.assigneeId === user?.id;
  const canUpdate = isFullAccess || isAssignee;
  const canEditFull = isFullAccess;

  const handleUpdateTaskDetail = async (taskId: string, updates: any) => {
    try {
      const dbTask = dbTasks.find((t) => t.id === taskId);
      if (!dbTask) return;

      const payload: any = {};
      if (updates.name !== undefined) payload.name = updates.name;
      if (updates.description !== undefined) payload.description = updates.description;
      if (updates.status !== undefined) payload.status = updates.status;

      if (updates.assigneeId !== undefined) {
        payload.assigneeId = updates.assigneeId;
      }

      const existingCustomFields = dbTask.customFields || {};
      const newCustomFields = { ...existingCustomFields };

      if (updates.weight !== undefined) newCustomFields.storyPoints = updates.weight;
      if (updates.priority !== undefined) newCustomFields.priority = updates.priority;
      if (updates.startDate !== undefined) newCustomFields.startDate = updates.startDate;
      if (updates.dueDate !== undefined) newCustomFields.dueDate = updates.dueDate;
      if (updates.subtasks !== undefined) newCustomFields.subtasks = updates.subtasks;

      payload.customFields = newCustomFields;

      await tasksApi.update(taskId, payload);
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    } catch (err: any) {
      console.error('[ProjectAnalytics] Failed to update task details', err);
      const errMsg = err?.response?.data?.message || err?.response?.data?.error || err.message || 'Failed to update task details';
      alert(`RBAC Security: ${errMsg}`);
    }
  };

  const handleToggleSubtask = (taskId: string, subtaskId: string) => {
    const task = dbTasks.find((t) => t.id === taskId);
    if (!task) return;
    const existingSubs = task.customFields?.subtasks || [];
    const updatedSubtasks = existingSubs.map((sub: any) =>
      sub.id === subtaskId ? { ...sub, done: !sub.done } : sub
    );
    handleUpdateTaskDetail(taskId, { subtasks: updatedSubtasks });
  };

  const handleAddSubtask = (taskId: string) => {
    if (!newSubtaskTitle.trim()) return;
    const task = dbTasks.find((t) => t.id === taskId);
    if (!task) return;

    const existingSubs = task.customFields?.subtasks || [];
    const newSub: SubTask = {
      id: crypto.randomUUID(),
      title: newSubtaskTitle.trim(),
      done: false,
    };

    const updatedSubtasks = [...existingSubs, newSub];
    handleUpdateTaskDetail(taskId, { subtasks: updatedSubtasks });
    setNewSubtaskTitle('');
  };

  const handleDeleteSubtask = (taskId: string, subtaskId: string) => {
    if (!window.confirm("Permanently delete this subtask?")) return;
    const task = dbTasks.find((t) => t.id === taskId);
    if (!task) return;

    const existingSubs = task.customFields?.subtasks || [];
    const updatedSubtasks = existingSubs.filter((sub: any) => sub.id !== subtaskId);
    handleUpdateTaskDetail(taskId, { subtasks: updatedSubtasks });
  };

  if (isLoadingActivities || isLoadingTasks) {
    return (
      <div className="w-full h-[50vh] flex flex-col items-center justify-center space-y-4">
        <div className="w-8 h-8 border-t-2 border-r-2 border-blue-500 rounded-full animate-spin" />
        <span className="text-xs text-muted-foreground uppercase tracking-widest animate-pulse font-light">
          Generating Gantt View...
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-foreground animate-fade-in relative">
      
      {/* 1. Summary Metrics Block */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Total Activities */}
        <div className="glass-panel border border-border rounded-xl p-3 flex items-center justify-between hover:border-blue-500/20 transition-all duration-200">
          <div className="min-w-0">
            <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block truncate">Activities</span>
            <span className="text-lg font-black text-foreground">{stats.totalActivities}</span>
          </div>
          <div className="p-2 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-lg shrink-0">
            <Layers className="w-4 h-4" />
          </div>
        </div>

        {/* Total Tasks */}
        <div className="glass-panel border border-border rounded-xl p-3 flex items-center justify-between hover:border-indigo-500/20 transition-all duration-200">
          <div className="min-w-0">
            <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block truncate">Total Scope</span>
            <span className="text-lg font-black text-foreground">{stats.totalTasks}</span>
          </div>
          <div className="p-2 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-lg shrink-0">
            <ActivityIcon className="w-4 h-4" />
          </div>
        </div>

        {/* Completed */}
        <div className="glass-panel border border-border rounded-xl p-3 flex items-center justify-between hover:border-emerald-500/20 transition-all duration-200">
          <div className="min-w-0">
            <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block truncate">Completed</span>
            <div className="flex items-baseline space-x-1">
              <span className="text-lg font-black text-emerald-500">{stats.completed}</span>
              <span className="text-[9px] text-muted-foreground font-bold">({stats.progressPercent}%)</span>
            </div>
          </div>
          <div className="p-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-lg shrink-0">
            <CheckCircle className="w-4 h-4" />
          </div>
        </div>

        {/* In Progress */}
        <div className="glass-panel border border-border rounded-xl p-3 flex items-center justify-between hover:border-sky-500/20 transition-all duration-200">
          <div className="min-w-0">
            <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block truncate">In Progress</span>
            <span className="text-lg font-black text-sky-500">{stats.inProgress}</span>
          </div>
          <div className="p-2 bg-sky-500/10 text-sky-400 border border-sky-500/20 rounded-lg shrink-0">
            <Play className="w-4 h-4" />
          </div>
        </div>

        {/* Blocked */}
        <div className="glass-panel border border-border rounded-xl p-3 flex items-center justify-between hover:border-rose-500/20 transition-all duration-200">
          <div className="min-w-0">
            <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block truncate">Blocked</span>
            <span className="text-lg font-black text-rose-500">{stats.blocked}</span>
          </div>
          <div className="p-2 bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded-lg shrink-0">
            <AlertOctagon className="w-4 h-4" />
          </div>
        </div>

        {/* Overdue */}
        <div className="glass-panel border border-border rounded-xl p-3 flex items-center justify-between hover:border-orange-500/20 transition-all duration-200">
          <div className="min-w-0">
            <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block truncate">Overdue</span>
            <span className={`text-lg font-black ${stats.overdue > 0 ? 'text-orange-500 animate-pulse' : 'text-foreground'}`}>
              {stats.overdue}
            </span>
          </div>
          <div className={`p-2 rounded-lg shrink-0 border ${
            stats.overdue > 0 
              ? 'bg-orange-500/20 text-orange-400 border-orange-500/30' 
              : 'bg-zinc-500/10 text-slate-500 border-zinc-500/20'
          }`}>
            <Clock className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* 2. Controls and Filters */}
      <div className="glass-panel border border-border rounded-xl p-3 bg-white dark:bg-zinc-950 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          {/* Assignee Select */}
          <div className="flex items-center space-x-1.5">
            <Filter className="w-3.5 h-3.5 text-muted-foreground" />
            <select
              value={selectedAssignee}
              onChange={(e) => setSelectedAssignee(e.target.value)}
              className="bg-slate-50 dark:bg-zinc-900 border border-border rounded-lg px-2.5 py-1 text-xs text-slate-800 dark:text-zinc-200 focus:outline-none cursor-pointer"
            >
              <option value="all">All Assignees</option>
              {members.map((u) => (
                <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div className="flex items-center">
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="bg-slate-50 dark:bg-zinc-900 border border-border rounded-lg px-2.5 py-1 text-xs text-slate-800 dark:text-zinc-200 focus:outline-none cursor-pointer"
            >
              <option value="all">All Statuses</option>
              <option value="to_do">To Do</option>
              <option value="in_progress">In Progress</option>
              <option value="in_review">In Review</option>
              <option value="blocked">Blocked</option>
              <option value="done">Completed</option>
            </select>
          </div>
        </div>

        {/* View scale selector */}
        <div className="flex items-center bg-slate-100 dark:bg-white/5 rounded-lg p-0.5 border border-border self-start sm:self-auto">
          {(['days', 'weeks', 'months'] as const).map((scale) => (
            <button
              key={scale}
              onClick={() => setTimeScale(scale)}
              className={`px-3 py-1 text-xs font-bold rounded-md capitalize transition-all ${
                timeScale === scale 
                  ? 'bg-blue-600 text-white shadow-sm' 
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {scale === 'days' ? 'Daily' : scale === 'weeks' ? 'Weekly' : 'Monthly'}
            </button>
          ))}
        </div>
      </div>

      {/* 3. Gantt Chart Table */}
      {filteredData.activities.length === 0 && projectTasks.length === 0 ? (
        <div className="glass-panel border border-border rounded-xl p-10 text-center bg-white dark:bg-zinc-950">
          <Calendar className="w-10 h-10 text-slate-500 mx-auto mb-2" />
          <h3 className="text-xs font-bold text-slate-800 dark:text-zinc-300">No Schedule Mapped</h3>
          <p className="text-[11px] text-muted-foreground max-w-xs mx-auto mt-1">
            There are currently no tasks or task containers created for this project yet. Head over to the Task Planner to map them.
          </p>
        </div>
      ) : (
        <div className="glass-panel border border-border rounded-xl bg-white dark:bg-zinc-950 overflow-hidden shadow-sm flex flex-col">
          
          {/* Timeline Scroll Box */}
          <div className="overflow-x-auto select-none">
            <div className="min-w-[800px] w-max flex flex-col">
              
              {/* Header block */}
              <div className="flex border-b border-border">
                {/* Structure details title */}
                <div className="w-[280px] shrink-0 bg-slate-50/50 dark:bg-zinc-900/40 border-r border-border p-3 flex items-center">
                  <span className="text-[9px] font-black uppercase text-slate-500 tracking-wider">Task Hierarchy / Containers</span>
                </div>

                {/* Grid Header column layout */}
                <div 
                  className="flex-1 min-w-[520px] w-max bg-slate-100/30 dark:bg-white/2 relative grid overflow-hidden"
                  style={{
                    gridTemplateColumns: `repeat(${timelineDays.length}, minmax(${colWidth}px, 1fr))`,
                    minWidth: `${Math.max(520, timelineDays.length * colWidth)}px`,
                  }}
                >
                  {timeScale === 'days' && (
                    <div 
                      className="flex flex-col h-full justify-between"
                      style={{ gridColumn: '1 / -1' }}
                    >
                      {/* Grouped Month/Year header row */}
                      <div 
                        className="grid border-b border-border/40 bg-slate-50/50 dark:bg-zinc-900/30"
                        style={{ 
                          gridTemplateColumns: `repeat(${timelineDays.length}, minmax(${colWidth}px, 1fr))`,
                        }}
                      >
                        {timelineMonthsForDaily.map((month, i) => (
                          <div 
                            key={i} 
                            className="border-r border-border/40 py-1 text-center flex items-center justify-center text-[8px] font-black uppercase text-slate-500 dark:text-zinc-400 tracking-wider truncate"
                            style={{
                              gridColumnStart: 'auto',
                              gridColumnEnd: `span ${month.daysCount}`,
                            }}
                          >
                            {month.label}
                          </div>
                        ))}
                      </div>

                      {/* Day and Weekday numbers row */}
                      <div 
                        className="grid flex-1"
                        style={{ 
                          gridTemplateColumns: `repeat(${timelineDays.length}, minmax(${colWidth}px, 1fr))`,
                        }}
                      >
                        {timelineDays.map((day, i) => {
                          const isToday = day.toDateString() === new Date().toDateString();
                          const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                          return (
                            <div 
                              key={i} 
                              className={`border-r border-border/40 py-1 px-0.5 text-center flex flex-col items-center justify-center shrink-0 ${
                                isToday ? 'bg-blue-500/10' : isWeekend ? 'bg-slate-100/10 dark:bg-white/1' : ''
                              }`}
                              style={{ minWidth: `${colWidth}px` }}
                            >
                              <span className="text-[7px] uppercase tracking-wider text-muted-foreground font-black">
                                {day.toLocaleDateString([], { weekday: 'narrow' })}
                              </span>
                              <span className={`text-[9px] font-bold mt-0.5 ${isToday ? 'text-blue-400 font-extrabold' : 'text-slate-700 dark:text-zinc-300'}`}>
                                {day.getDate()}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {timeScale === 'weeks' && (
                    <div 
                      className="grid h-full"
                      style={{ 
                        gridTemplateColumns: `repeat(${timelineDays.length}, minmax(${colWidth}px, 1fr))`,
                        gridColumn: '1 / -1',
                      }}
                    >
                      {timelineWeeks.map((week, i) => (
                        <div 
                          key={i} 
                          className="border-r border-border/40 py-2.5 text-center flex items-center justify-center text-[8.5px] font-black uppercase text-slate-500 tracking-wider"
                          style={{
                            gridColumnStart: 'auto',
                            gridColumnEnd: `span ${week.daysCount}`,
                          }}
                        >
                          {week.label}
                        </div>
                      ))}
                    </div>
                  )}

                  {timeScale === 'months' && (
                    <div 
                      className="grid h-full"
                      style={{ 
                        gridTemplateColumns: `repeat(${timelineDays.length}, minmax(${colWidth}px, 1fr))`,
                        gridColumn: '1 / -1',
                      }}
                    >
                      {timelineMonths.map((month, i) => (
                        <div 
                          key={i} 
                          className="border-r border-border/40 py-2.5 text-center flex items-center justify-center text-[8.5px] font-black uppercase text-slate-500 tracking-wider"
                          style={{
                            gridColumnStart: 'auto',
                            gridColumnEnd: `span ${month.daysCount}`,
                          }}
                        >
                          {month.label}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Rows */}
              <div className="flex flex-col divide-y divide-border">
                {activities.map((activity) => {
                  const isExpanded = !!expandedActivities[activity.id];
                  const childTasks = filteredData.tasksMap[activity.id] || [];
                  const hasChildren = childTasks.length > 0;
                  
                  // Use derived dates if parent dates are null/missing
                  const actDates = activityDatesMap[activity.id];
                  const activityPos = getPositionStyles(actDates?.startDate, actDates?.endDate);
                  const progressPercent = getActivityProgress(childTasks);

                  return (
                    <React.Fragment key={activity.id}>
                      {/* Parent Activity row */}
                      <div 
                        onClick={() => setActiveActivityId(activity.id)}
                        className="flex hover:bg-slate-100/20 dark:hover:bg-white/2 transition-all group cursor-pointer bg-slate-50/50 dark:bg-zinc-900/25 border-l-4 border-blue-500/80"
                      >
                        
                        {/* Activity details left */}
                        <div className="w-[280px] shrink-0 border-r border-border py-1 px-2.5 flex items-center justify-between min-w-0">
                          <div className="flex items-center space-x-1.5 min-w-0">
                            {hasChildren ? (
                              <button 
                                onClick={(e) => toggleActivityCollapse(activity.id, e)}
                                className="text-slate-400 hover:text-slate-900 dark:hover:text-white transition p-0.5 rounded"
                              >
                                {isExpanded ? (
                                  <ChevronDown className="w-3.5 h-3.5" />
                                ) : (
                                  <ChevronRight className="w-3.5 h-3.5" />
                                )}
                              </button>
                            ) : (
                              <span className="w-4" />
                            )}
                            <span className="text-[11.5px] font-bold text-slate-800 dark:text-zinc-200 truncate group-hover:text-blue-400">
                              📦 {activity.title}
                            </span>
                          </div>
                          
                          {/* Badges block */}
                          <div className="flex items-center space-x-1 shrink-0 ml-1">
                            {activity.isSprintRelevant && (
                              <span className="text-[7.5px] uppercase tracking-wider font-extrabold px-1 py-0.2 rounded border bg-purple-500/10 border-purple-500/20 text-purple-400">
                                Sprint
                              </span>
                            )}
                            {activity.isSprintRelevant && activity.frequency && (
                              <span className="text-[7.5px] uppercase tracking-wider font-extrabold px-1 py-0.2 rounded border bg-indigo-500/10 border-indigo-500/20 text-indigo-400">
                                {activity.frequency.replace('BIWEEKLY', 'Bi-Wk').replace('WEEKLY', 'Weekly').replace('DAILY', 'Daily').replace('MONTHLY', 'Monthly')}
                              </span>
                            )}
                            {hasChildren && (
                              <span className="text-[7.5px] font-extrabold px-1 py-0.2 rounded border bg-emerald-500/10 border-emerald-500/20 text-emerald-400">
                                {progressPercent}% Done
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Gantt line bar details */}
                        <div 
                          className="flex-1 min-w-[520px] w-max relative py-1 px-2.5 grid items-center bg-slate-50/10 dark:bg-zinc-950/20"
                          style={{ 
                            gridTemplateColumns: `repeat(${timelineDays.length}, minmax(${colWidth}px, 1fr))`,
                            minWidth: `${Math.max(520, timelineDays.length * colWidth)}px`,
                          }}
                        >
                          <div 
                            className="absolute inset-0 grid"
                            style={{ 
                              gridTemplateColumns: `repeat(${timelineDays.length}, minmax(${colWidth}px, 1fr))`,
                            }}
                          >
                            {timelineDays.map((_, i) => (
                              <div key={i} className="border-r border-border/20 h-full" />
                            ))}
                          </div>

                          {activityPos ? (
                            <>
                              <div 
                                className={`h-5 rounded-md relative flex items-center justify-between px-2.5 z-10 select-none overflow-hidden ${
                                  actDates.isDerived 
                                    ? 'bg-blue-500/10 border border-dashed border-blue-500/30' 
                                    : 'bg-blue-500/20 border border-blue-500/40'
                                }`}
                                style={{
                                  gridColumnStart: activityPos.gridColumnStart,
                                  gridColumnEnd: `span ${activityPos.duration}`,
                                  gridRow: 1,
                                }}
                                title={`${activity.title}${actDates.isDerived ? ' (Derived)' : ''}\nDates: ${new Date(actDates.startDate!).toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' })} to ${new Date(actDates.endDate!).toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' })}`}
                              >
                                <div className="absolute inset-y-0 left-0 bg-blue-500/10 w-full" />
                                {activityPos.duration * colWidth >= 120 && (
                                  <span className="text-[8.5px] font-black uppercase text-blue-700 dark:text-blue-300 tracking-wider truncate z-10">
                                    {activity.title} {actDates.isDerived && '(Derived)'}
                                  </span>
                                )}
                                {activityPos.duration * colWidth >= 220 && (
                                  <span className="text-[8px] font-mono font-bold text-blue-600 dark:text-blue-400/70 z-10 shrink-0">
                                    {new Date(actDates.startDate!).toLocaleDateString([], { month: 'short', day: 'numeric' })} - {new Date(actDates.endDate!).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                                  </span>
                                )}
                              </div>
                              {activityPos.duration * colWidth < 120 && (
                                <span 
                                  className="text-[8.5px] font-black uppercase text-blue-700 dark:text-blue-300 tracking-wider z-10 self-center pl-2 whitespace-nowrap pointer-events-none"
                                  style={{
                                    gridColumnStart: activityPos.gridColumnStart + activityPos.duration,
                                    gridColumnEnd: 'span 15',
                                    gridRow: 1,
                                  }}
                                >
                                  {activity.title} {actDates.isDerived && '(Derived)'}
                                </span>
                              )}
                            </>
                          ) : (
                            <div 
                              className="h-5 relative flex items-center z-10 select-none pl-2"
                              style={{ gridColumn: '1 / -1' }}
                            >
                              <span className="text-[7.5px] uppercase tracking-wider font-extrabold px-1.5 py-0.5 rounded border bg-zinc-500/10 border-zinc-500/20 text-slate-500 shrink-0">
                                No Schedule
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Subtasks under expanded activity */}
                      {isExpanded && hasChildren && childTasks.map((task) => {
                        const taskPos = getPositionStyles(task.customFields?.startDate, task.customFields?.dueDate);
                        const colors = getStatusStyle(task.status);
                        const isOverdue = isTaskOverdue(task);
                        const tStart = task.customFields?.startDate;
                        const tDue = task.customFields?.dueDate;
                        
                        return (
                          <div 
                            key={task.id} 
                            onClick={() => setActiveTaskId(task.id)}
                            className="flex hover:bg-slate-100/10 dark:hover:bg-white/2 transition duration-150 cursor-pointer"
                          >
                            
                            {/* Left label detailed representation */}
                            <div className="w-[280px] shrink-0 border-r border-border py-1 pl-7 pr-2.5 flex items-center justify-between relative bg-white dark:bg-zinc-950/20">
                              {/* Visual nesting guide connector lines */}
                              <div className="absolute left-3 top-0 bottom-0 w-px bg-slate-200 dark:bg-zinc-800" />
                              <div className="absolute left-3 top-1/2 w-2.5 h-px bg-slate-200 dark:bg-zinc-800" />

                              <div className="min-w-0 space-y-0.5">
                                <p className="text-[11.5px] font-semibold text-slate-700 dark:text-zinc-300 truncate">
                                  📌 {task.name}
                                </p>
                                <div className="flex items-center space-x-1 flex-wrap gap-y-0.5">
                                  {task.customFields?.priority && (
                                    <span className={`text-[7.5px] uppercase tracking-wider font-extrabold px-1 py-0.2 rounded border ${getPriorityBadgeColor(task.customFields.priority)}`}>
                                      {task.customFields.priority}
                                    </span>
                                  )}
                                  <span className={`text-[7.5px] uppercase tracking-wider font-extrabold px-1 py-0.2 rounded border ${colors.badge}`}>
                                    {task.status.replace(/_/g, ' ')}
                                  </span>
                                  {isOverdue && (
                                    <span className="text-[7.5px] uppercase tracking-wider font-extrabold px-1 py-0.2 rounded border bg-rose-500/15 border-rose-500/25 text-rose-400">
                                      Overdue
                                    </span>
                                  )}
                                  {!taskPos && (
                                    <span className="text-[7.5px] uppercase tracking-wider font-extrabold px-1 py-0.2 rounded border bg-zinc-500/10 border-zinc-500/20 text-slate-500">
                                      No Schedule
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Assignee initials badge */}
                              <div 
                                className="w-5 h-5 rounded-full border border-border flex items-center justify-center text-[7.5px] font-black text-slate-800 dark:text-white shrink-0 bg-slate-100 dark:bg-zinc-800"
                                title={getMemberName(task.assigneeId)}
                              >
                                {getMemberInitials(task.assigneeId)}
                              </div>
                            </div>

                            {/* Timeline display details */}
                            <div 
                              className="flex-1 min-w-[520px] w-max relative py-1 px-2.5 grid items-center bg-slate-50/5 dark:bg-zinc-950/10"
                              style={{ 
                                gridTemplateColumns: `repeat(${timelineDays.length}, minmax(${colWidth}px, 1fr))`,
                                minWidth: `${Math.max(520, timelineDays.length * colWidth)}px`,
                              }}
                            >
                              <div 
                                className="absolute inset-0 grid"
                                style={{ 
                                  gridTemplateColumns: `repeat(${timelineDays.length}, minmax(${colWidth}px, 1fr))`,
                                }}
                              >
                                {timelineDays.map((_, i) => (
                                  <div key={i} className="border-r border-border/20 h-full" />
                                ))}
                              </div>

                              {taskPos && (
                                <>
                                  <div 
                                    className={`h-4 rounded-md ${colors.bg} ${colors.border} border relative flex items-center justify-between px-2 z-10 select-none overflow-hidden`}
                                    style={{
                                      gridColumnStart: taskPos.gridColumnStart,
                                      gridColumnEnd: `span ${taskPos.duration}`,
                                      gridRow: 1,
                                    }}
                                    title={`${task.name}\nAssignee: ${getMemberName(task.assigneeId)}\nDates: ${tStart || tDue} to ${tDue || tStart}`}
                                  >
                                    <div className={`absolute inset-y-0 left-0 ${colors.bar} w-full opacity-35`} />
                                    {taskPos.duration * colWidth >= 120 && (
                                      <span className="text-[8px] font-bold text-slate-800 dark:text-zinc-300 truncate z-10 pr-2">
                                        {task.name}
                                      </span>
                                    )}
                                    {taskPos.duration * colWidth >= 220 && (
                                      <span className="text-[7.5px] font-mono font-bold text-slate-500 dark:text-zinc-400 z-10 shrink-0">
                                        {new Date(tStart || tDue || '').toLocaleDateString([], { month: 'short', day: 'numeric' })} - {new Date(tDue || tStart || '').toLocaleDateString([], { month: 'short', day: 'numeric' })}
                                      </span>
                                    )}
                                  </div>
                                  {taskPos.duration * colWidth < 120 && (
                                    <span 
                                      className="text-[8px] font-bold text-slate-700 dark:text-zinc-300 z-10 self-center pl-2 whitespace-nowrap pointer-events-none"
                                      style={{
                                        gridColumnStart: taskPos.gridColumnStart + taskPos.duration,
                                        gridColumnEnd: 'span 15',
                                        gridRow: 1,
                                      }}
                                    >
                                      {task.name}
                                    </span>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </React.Fragment>
                  );
                })}

                {/* 2. Ungrouped tasks list */}
                {filteredData.tasksMap['unassigned']?.length > 0 && (
                  <React.Fragment>
                    <div className="flex bg-slate-50/15 dark:bg-zinc-900/10">
                      <div className="w-[280px] shrink-0 border-r border-border py-1 px-2.5 flex items-center justify-between">
                        <span className="text-[11.5px] font-bold text-slate-800 dark:text-zinc-200">
                          📦 Ungrouped Tasks
                        </span>
                      </div>
                      <div 
                        className="flex-1 min-w-[520px] w-max bg-slate-50/5 dark:bg-zinc-950/10 py-1 px-2.5"
                        style={{
                          minWidth: `${Math.max(520, timelineDays.length * colWidth)}px`,
                        }}
                      />
                    </div>

                    {filteredData.tasksMap['unassigned'].map((task) => {
                      const taskPos = getPositionStyles(task.customFields?.startDate, task.customFields?.dueDate);
                      const colors = getStatusStyle(task.status);
                      const isOverdue = isTaskOverdue(task);
                      const tStart = task.customFields?.startDate;
                      const tDue = task.customFields?.dueDate;

                      return (
                        <div 
                          key={task.id} 
                          onClick={() => setActiveTaskId(task.id)}
                          className="flex hover:bg-slate-100/10 dark:hover:bg-white/2 transition duration-150 cursor-pointer"
                        >
                          <div className="w-[280px] shrink-0 border-r border-border py-1 pl-7 pr-2.5 flex items-center justify-between relative bg-white dark:bg-zinc-950/20">
                            <div className="absolute left-3 top-0 bottom-0 w-px bg-slate-200 dark:bg-zinc-800" />
                            <div className="absolute left-3 top-1/2 w-2.5 h-px bg-slate-200 dark:bg-zinc-800" />

                            <div className="min-w-0 space-y-0.5">
                              <p className="text-[11.5px] font-semibold text-slate-700 dark:text-zinc-300 truncate">
                                📌 {task.name}
                              </p>
                              <div className="flex items-center space-x-1 flex-wrap gap-y-0.5">
                                {task.customFields?.priority && (
                                  <span className={`text-[7.5px] uppercase tracking-wider font-extrabold px-1.5 py-0.5 rounded border ${getPriorityBadgeColor(task.customFields.priority)}`}>
                                    {task.customFields.priority}
                                  </span>
                                )}
                                <span className={`text-[7.5px] uppercase tracking-wider font-extrabold px-1.5 py-0.5 rounded border ${colors.badge}`}>
                                  {task.status.replace(/_/g, ' ')}
                                </span>
                                {isOverdue && (
                                  <span className="text-[7.5px] uppercase tracking-wider font-extrabold px-1.5 py-0.5 rounded border bg-rose-500/15 border-rose-500/25 text-rose-400">
                                    Overdue
                                  </span>
                                )}
                                {!taskPos && (
                                  <span className="text-[7.5px] uppercase tracking-wider font-extrabold px-1.5 py-0.5 rounded border bg-zinc-500/10 border-zinc-500/20 text-slate-500">
                                    No Schedule
                                  </span>
                                )}
                              </div>
                            </div>

                            <div 
                              className="w-5 h-5 rounded-full border border-border flex items-center justify-center text-[7.5px] font-black text-slate-800 dark:text-white shrink-0 bg-slate-100 dark:bg-zinc-800"
                              title={getMemberName(task.assigneeId)}
                            >
                              {getMemberInitials(task.assigneeId)}
                            </div>
                          </div>

                          <div 
                            className="flex-1 min-w-[520px] w-max relative py-1 px-2.5 grid items-center bg-slate-50/5 dark:bg-zinc-950/10"
                            style={{ 
                              gridTemplateColumns: `repeat(${timelineDays.length}, minmax(${colWidth}px, 1fr))`,
                              minWidth: `${Math.max(520, timelineDays.length * colWidth)}px`,
                            }}
                          >
                            <div 
                              className="absolute inset-0 grid"
                              style={{ 
                                  gridTemplateColumns: `repeat(${timelineDays.length}, minmax(${colWidth}px, 1fr))`,
                              }}
                            >
                              {timelineDays.map((_, i) => (
                                <div key={i} className="border-r border-border/20 h-full" />
                              ))}
                            </div>

                            {taskPos && (
                              <>
                                <div 
                                  className={`h-4 rounded-md ${colors.bg} ${colors.border} border relative flex items-center justify-between px-2 z-10 select-none overflow-hidden`}
                                  style={{
                                    gridColumnStart: taskPos.gridColumnStart,
                                    gridColumnEnd: `span ${taskPos.duration}`,
                                    gridRow: 1,
                                  }}
                                  title={`${task.name}\nAssignee: ${getMemberName(task.assigneeId)}\nDates: ${tStart || tDue} to ${tDue || tStart}`}
                                >
                                  <div className={`absolute inset-y-0 left-0 ${colors.bar} w-full opacity-35`} />
                                  {taskPos.duration * colWidth >= 120 && (
                                    <span className="text-[8px] font-bold text-slate-800 dark:text-zinc-300 truncate z-10 pr-2">
                                      {task.name}
                                    </span>
                                  )}
                                  {taskPos.duration * colWidth >= 220 && (
                                    <span className="text-[7.5px] font-mono font-bold text-slate-500 dark:text-zinc-400 z-10 shrink-0">
                                      {new Date(tStart || tDue || '').toLocaleDateString([], { month: 'short', day: 'numeric' })} - {new Date(tDue || tStart || '').toLocaleDateString([], { month: 'short', day: 'numeric' })}
                                    </span>
                                  )}
                                </div>
                                {taskPos.duration * colWidth < 120 && (
                                  <span 
                                    className="text-[8px] font-bold text-slate-700 dark:text-zinc-300 z-10 self-center pl-2 whitespace-nowrap pointer-events-none"
                                    style={{
                                      gridColumnStart: taskPos.gridColumnStart + taskPos.duration,
                                      gridColumnEnd: 'span 15',
                                      gridRow: 1,
                                    }}
                                  >
                                    {task.name}
                                  </span>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </React.Fragment>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. Sliding drawer Task detail */}
      {activeTask && (
        <>
          <div className="fixed inset-0 bg-black/20 backdrop-blur-[1px] z-40 animate-fade-in-backdrop" onClick={() => setActiveTaskId(null)} />
          <div className="fixed top-0 right-0 h-screen w-[320px] md:w-[480px] bg-slate-50 dark:bg-zinc-950 border-l border-slate-200 dark:border-border z-50 shadow-2xl flex flex-col p-5 animate-slide-in-right overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-white/5 pb-3 mb-4">
              <h5 className="text-[13px] font-extrabold uppercase tracking-wider text-slate-900 dark:text-white flex items-center space-x-2">
                <FileText className="w-4 h-4 text-blue-400" />
                <span>Task Detail Information</span>
              </h5>
              <button onClick={() => setActiveTaskId(null)} className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-white/5 text-slate-500 hover:text-white transition cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 space-y-4">
              {/* Task name */}
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-slate-500 tracking-wider">Title / Name</label>
                <input
                  type="text"
                  disabled={!canUpdate}
                  value={activeTask.name}
                  onChange={(e) => handleUpdateTaskDetail(activeTask.id, { name: e.target.value })}
                  className="w-full bg-white dark:bg-background border border-slate-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-xs text-slate-800 dark:text-zinc-200 focus:outline-none focus:border-blue-500 disabled:opacity-75"
                />
              </div>

              {/* Task description */}
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-slate-500 tracking-wider">Description Notes</label>
                <textarea
                  disabled={!canUpdate}
                  value={activeTask.description || ''}
                  onChange={(e) => handleUpdateTaskDetail(activeTask.id, { description: e.target.value })}
                  rows={3}
                  className="w-full bg-white dark:bg-background border border-slate-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-xs text-slate-800 dark:text-zinc-200 focus:outline-none focus:border-blue-500 disabled:opacity-75 resize-none leading-relaxed"
                  placeholder="Task details and deliverables notes..."
                />
              </div>

              {/* Status and Priority grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-500 tracking-wider">Status</label>
                  <select
                    disabled={!canUpdate}
                    value={activeTask.status || 'to_do'}
                    onChange={(e) => handleUpdateTaskDetail(activeTask.id, { status: e.target.value })}
                    className="w-full bg-white dark:bg-background border border-slate-200 dark:border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-slate-800 dark:text-zinc-200 focus:outline-none focus:border-blue-500 disabled:opacity-75 cursor-pointer"
                  >
                    <option value="to_do">To Do</option>
                    <option value="in_progress">In Progress</option>
                    <option value="in_review">In Review</option>
                    <option value="blocked">Blocked</option>
                    <option value="done">Completed</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-500 tracking-wider">Priority</label>
                  <select
                    disabled={!canEditFull}
                    value={activeTask.customFields?.priority || 'medium'}
                    onChange={(e) => handleUpdateTaskDetail(activeTask.id, { priority: e.target.value as any })}
                    className="w-full bg-white dark:bg-background border border-slate-200 dark:border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-slate-800 dark:text-zinc-200 focus:outline-none focus:border-blue-500 disabled:opacity-75 cursor-pointer"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
              </div>

              {/* Assignee and weight */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-500 tracking-wider">Assignee</label>
                  <select
                    disabled={!canEditFull}
                    value={activeTask.assigneeId || 'unassigned'}
                    onChange={(e) => handleUpdateTaskDetail(activeTask.id, { assigneeId: e.target.value === 'unassigned' ? null : e.target.value })}
                    className="w-full bg-white dark:bg-background border border-slate-200 dark:border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-slate-800 dark:text-zinc-200 focus:outline-none focus:border-blue-500 disabled:opacity-75 cursor-pointer"
                  >
                    <option value="unassigned">Unassigned</option>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>{getMemberDisplayName(m)}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-500 tracking-wider">Story Weight (Points)</label>
                  <select
                    disabled={!canEditFull}
                    value={activeTask.customFields?.storyPoints || 0}
                    onChange={(e) => handleUpdateTaskDetail(activeTask.id, { weight: Number(e.target.value) })}
                    className="w-full bg-white dark:bg-background border border-slate-200 dark:border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-slate-800 dark:text-zinc-200 focus:outline-none focus:border-blue-500 disabled:opacity-75 cursor-pointer"
                  >
                    {[0, 1, 2, 3, 5, 8, 13, 21].map((val) => (
                      <option key={val} value={val}>{val} SP</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-500 tracking-wider">Start Date</label>
                  <DatePickerInput
                    value={activeTask.customFields?.startDate ? activeTask.customFields.startDate.substring(0, 10) : ''}
                    disabled={!canEditFull}
                    onChange={(val) => handleUpdateTaskDetail(activeTask.id, { startDate: val || undefined })}
                    placeholder="No start date"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-500 tracking-wider">Due Date</label>
                  <DatePickerInput
                    value={activeTask.customFields?.dueDate ? activeTask.customFields.dueDate.substring(0, 10) : ''}
                    disabled={!canEditFull}
                    onChange={(val) => handleUpdateTaskDetail(activeTask.id, { dueDate: val || undefined })}
                    placeholder="No due date"
                  />
                </div>
              </div>

              {/* Subtask checklist */}
              <div className="space-y-2 pt-2 border-t border-border">
                <label className="text-[9px] font-black uppercase text-slate-500 tracking-wider flex items-center justify-between">
                  <span>Subtask Checklist</span>
                  <span className="text-[8px] text-zinc-500 font-bold">
                    {activeTask.customFields?.subtasks?.filter((s: any) => s.done).length || 0}/
                    {activeTask.customFields?.subtasks?.length || 0} Done
                  </span>
                </label>

                {/* Create subtask input block */}
                {canUpdate && (
                  <div className="flex space-x-1.5">
                    <input
                      type="text"
                      placeholder="Add subtask title..."
                      value={newSubtaskTitle}
                      onChange={(e) => setNewSubtaskTitle(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleAddSubtask(activeTask.id); }}
                      className="flex-1 bg-white dark:bg-background border border-slate-200 dark:border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-slate-800 dark:text-zinc-200 focus:outline-none focus:border-blue-500"
                    />
                    <button
                      onClick={() => handleAddSubtask(activeTask.id)}
                      className="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition cursor-pointer flex items-center justify-center"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {/* Subtask items listing */}
                <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
                  {!activeTask.customFields?.subtasks || activeTask.customFields.subtasks.length === 0 ? (
                    <p className="text-[10px] italic text-slate-500 font-light pl-1">No checklist deliverables added.</p>
                  ) : (
                    activeTask.customFields.subtasks.map((sub: any) => (
                      <div 
                        key={sub.id} 
                        className="flex items-center justify-between p-2 bg-white dark:bg-zinc-900/40 border border-slate-200/50 dark:border-zinc-800/40 rounded-lg group/sub hover:border-slate-300 dark:hover:border-zinc-700 transition"
                      >
                        <div 
                          className="flex items-center space-x-2 flex-1 cursor-pointer"
                          onClick={() => { if (canUpdate) handleToggleSubtask(activeTask.id, sub.id); }}
                        >
                          {sub.done ? (
                            <CheckSquare className="w-3.5 h-3.5 text-blue-500" />
                          ) : (
                            <Square className="w-3.5 h-3.5 text-slate-400" />
                          )}
                          <span className={`text-xs ${sub.done ? 'line-through text-slate-400 dark:text-zinc-500' : 'text-slate-700 dark:text-zinc-300'}`}>
                            {sub.title}
                          </span>
                        </div>
                        {canUpdate && (
                          <button
                            onClick={() => handleDeleteSubtask(activeTask.id, sub.id)}
                            className="text-slate-400 hover:text-red-400 opacity-0 group-hover/sub:opacity-100 transition p-0.5 rounded cursor-pointer"
                            title="Delete Subtask"
                          >
                            <Trash className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* 5. Sliding drawer Activity details */}
      {activeActivity && (
        <>
          <div className="fixed inset-0 bg-black/20 backdrop-blur-[1px] z-40 animate-fade-in-backdrop" onClick={() => setActiveActivityId(null)} />
          <div className="fixed top-0 right-0 h-screen w-[320px] md:w-[480px] bg-slate-50 dark:bg-zinc-950 border-l border-slate-200 dark:border-border z-50 shadow-2xl flex flex-col p-5 animate-slide-in-right overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-white/5 pb-3 mb-4">
              <h5 className="text-[13px] font-extrabold uppercase tracking-wider text-slate-900 dark:text-white flex items-center space-x-2">
                <Layers className="w-4 h-4 text-purple-400" />
                <span>Task Container (Activity) Details</span>
              </h5>
              <button onClick={() => setActiveActivityId(null)} className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-white/5 text-slate-500 hover:text-white transition cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 space-y-4">
              {/* Activity name */}
              <div className="space-y-1">
                <span className="text-[9px] font-black uppercase text-slate-500 tracking-wider block">Container Name</span>
                <p className="text-sm font-bold text-slate-900 dark:text-white bg-white dark:bg-zinc-900/60 border border-slate-200 dark:border-zinc-800 rounded-lg px-3 py-2">
                  📦 {activeActivity.title}
                </p>
              </div>

              {/* Phase and Owner/Assignee */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <span className="text-[9px] font-black uppercase text-slate-500 tracking-wider block">Target Project Phase</span>
                  <p className="text-xs text-slate-700 dark:text-zinc-300 bg-white dark:bg-zinc-900/60 border border-slate-200 dark:border-zinc-800 rounded-lg px-3 py-2 capitalize">
                    {project.phases?.find(p => p.id === activeActivity.phaseId)?.name || 'Unassigned Phase'}
                  </p>
                </div>

                <div className="space-y-1">
                  <span className="text-[9px] font-black uppercase text-slate-500 tracking-wider block">Container Lead / Owner</span>
                  <p className="text-xs text-slate-700 dark:text-zinc-300 bg-white dark:bg-zinc-900/60 border border-slate-200 dark:border-zinc-800 rounded-lg px-3 py-2 truncate">
                    {getMemberName((activeActivity as any).assigneeId)}
                  </p>
                </div>
              </div>

              {/* Start and End dates */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <span className="text-[9px] font-black uppercase text-slate-500 tracking-wider block">Start Date</span>
                  <p className="text-xs text-slate-700 dark:text-zinc-300 bg-white dark:bg-zinc-900/60 border border-slate-200 dark:border-zinc-800 rounded-lg px-3 py-2">
                    📅 {activeActivity.startDate ? new Date(activeActivity.startDate).toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' }) : 'N/A'}
                  </p>
                </div>

                <div className="space-y-1">
                  <span className="text-[9px] font-black uppercase text-slate-500 tracking-wider block">End Date</span>
                  <p className="text-xs text-slate-700 dark:text-zinc-300 bg-white dark:bg-zinc-900/60 border border-slate-200 dark:border-zinc-800 rounded-lg px-3 py-2">
                    📅 {activeActivity.endDate ? new Date(activeActivity.endDate).toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' }) : 'N/A'}
                  </p>
                </div>
              </div>

              {/* Sprint properties */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <span className="text-[9px] font-black uppercase text-slate-500 tracking-wider block">Agile Sprint Enabled?</span>
                  <span className={`inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg border text-xs font-bold ${
                    activeActivity.isSprintRelevant 
                      ? 'bg-purple-500/10 border-purple-500/20 text-purple-400' 
                      : 'bg-zinc-500/10 border-zinc-500/20 text-slate-500'
                  }`}>
                    {activeActivity.isSprintRelevant ? '🚀 Sprint-Relevant' : '📋 Standard Checklist'}
                  </span>
                </div>

                {activeActivity.isSprintRelevant && (activeActivity as any).frequency && (
                  <div className="space-y-1">
                    <span className="text-[9px] font-black uppercase text-slate-500 tracking-wider block">Sprint Run Frequency</span>
                    <p className="text-xs text-slate-700 dark:text-zinc-300 bg-white dark:bg-zinc-900/60 border border-slate-200 dark:border-zinc-800 rounded-lg px-3 py-2 capitalize">
                      {(activeActivity as any).frequency.toLowerCase()}
                    </p>
                  </div>
                )}
              </div>

              {/* Activity stats review */}
              <div className="space-y-2 pt-3 border-t border-border">
                <span className="text-[9px] font-black uppercase text-slate-500 tracking-wider block">Container Metrics</span>
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-white dark:bg-zinc-900/40 border border-slate-200/50 dark:border-zinc-800/40 p-2 rounded-lg text-center">
                    <p className="text-[8px] font-bold text-muted-foreground uppercase">Tasks</p>
                    <p className="text-sm font-black mt-0.5">{(filteredData.tasksMap[activeActivity.id] || []).length}</p>
                  </div>

                  <div className="bg-white dark:bg-zinc-900/40 border border-slate-200/50 dark:border-zinc-800/40 p-2 rounded-lg text-center">
                    <p className="text-[8px] font-bold text-emerald-500 uppercase">Completed</p>
                    <p className="text-sm font-black text-emerald-500 mt-0.5">
                      {(filteredData.tasksMap[activeActivity.id] || []).filter(t => t.status === 'done' || t.status === 'completed').length}
                    </p>
                  </div>

                  <div className="bg-white dark:bg-zinc-900/40 border border-slate-200/50 dark:border-zinc-800/40 p-2 rounded-lg text-center">
                    <p className="text-[8px] font-bold text-red-500 uppercase">Blocked</p>
                    <p className="text-sm font-black text-red-500 mt-0.5">
                      {(filteredData.tasksMap[activeActivity.id] || []).filter(t => t.status === 'blocked').length}
                    </p>
                  </div>
                </div>
              </div>

              {/* Mapped nested tasks clickable listing */}
              <div className="space-y-2 pt-3 border-t border-border">
                <span className="text-[9px] font-black uppercase text-slate-500 tracking-wider block">Deliverables list (Click to Edit)</span>
                <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
                  {!(filteredData.tasksMap[activeActivity.id]) || filteredData.tasksMap[activeActivity.id].length === 0 ? (
                    <p className="text-[10px] italic text-slate-500 font-light pl-1">No tasks created inside this container.</p>
                  ) : (
                    filteredData.tasksMap[activeActivity.id].map((task) => {
                      const taskStyle = getStatusStyle(task.status);
                      return (
                        <div
                          key={task.id}
                          onClick={() => {
                            setActiveActivityId(null);
                            setTimeout(() => setActiveTaskId(task.id), 50);
                          }}
                          className="flex items-center justify-between p-2.5 bg-white dark:bg-zinc-900/40 border border-slate-200/50 dark:border-zinc-800/40 rounded-lg hover:border-blue-500/40 hover:bg-slate-50 dark:hover:bg-zinc-900 transition cursor-pointer"
                        >
                          <div className="min-w-0 space-y-0.5">
                            <p className="text-xs font-bold text-slate-800 dark:text-zinc-300 truncate">
                              📌 {task.name}
                            </p>
                            <p className="text-[9px] text-slate-500 dark:text-zinc-500">
                              Lead: {getMemberName(task.assigneeId)}
                            </p>
                          </div>
                          <span className={`text-[7.5px] uppercase tracking-wider font-extrabold px-1.5 py-0.5 rounded border ${taskStyle.badge} shrink-0`}>
                            {task.status.replace(/_/g, ' ')}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

    </div>
  );
};
export default ProjectAnalytics;
