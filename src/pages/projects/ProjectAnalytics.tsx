import React, { useState, useEffect, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { 
  Calendar, 
  Layers, 
  Clock, 
  AlertOctagon, 
  ChevronDown, 
  ChevronRight,
  TrendingUp,
  Filter
} from 'lucide-react';
import type { Project } from '../../services/api/projects';
import { activitiesApi } from '../../services/api/sprints';
import { tasksApi } from '../../services/api/tasks.api';
import { usersApi } from '../../services/api/users';
import type { User } from '../../services/api/users';

export const ProjectAnalytics: React.FC = () => {
  const { project } = useOutletContext<{ project: Project }>();
  const [members, setMembers] = useState<User[]>([]);
  
  // Filter and view states
  const [selectedAssignee, setSelectedAssignee] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [collapsedActivities, setCollapsedActivities] = useState<Record<string, boolean>>({});
  const [timeScale, setTimeScale] = useState<'days' | 'weeks'>('days');

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

    // Only show activities that have tasks matching filters (or show all if no filters are active)
    const showAllActivities = selectedAssignee === 'all' && selectedStatus === 'all';
    const activeActivities = activities.filter(
      (act) => showAllActivities || filteredMap[act.id]?.length > 0
    );

    return {
      activities: activeActivities,
      tasksMap: filteredMap,
    };
  }, [projectTasks, activities, selectedAssignee, selectedStatus]);

  // Compute overall statistics
  const stats = useMemo(() => {
    const total = projectTasks.length;
    const completed = projectTasks.filter((t) => t.status === 'done' || t.status === 'completed').length;
    const blocked = projectTasks.filter((t) => t.status === 'blocked').length;
    const inProgress = projectTasks.filter((t) => t.status === 'in_progress').length;
    
    return {
      total,
      completed,
      blocked,
      inProgress,
      progressPercent: total > 0 ? Math.round((completed / total) * 100) : 0,
    };
  }, [projectTasks]);

  // Determine timeline boundary dates
  const timelineBounds = useMemo(() => {
    let minDate = new Date();
    let maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + 30); // Default to a 30 day window
    
    let hasValidDates = false;

    // Look at activities
    activities.forEach((act) => {
      if (act.startDate) {
        const d = new Date(act.startDate);
        if (!hasValidDates || d < minDate) minDate = d;
        hasValidDates = true;
      }
      if (act.endDate) {
        const d = new Date(act.endDate);
        if (!hasValidDates || d > maxDate) maxDate = d;
        hasValidDates = true;
      }
    });

    // Look at tasks
    projectTasks.forEach((t) => {
      const tStart = t.customFields?.startDate;
      const tDue = t.customFields?.dueDate;
      if (tStart) {
        const d = new Date(tStart);
        if (!hasValidDates || d < minDate) minDate = d;
        hasValidDates = true;
      }
      if (tDue) {
        const d = new Date(tDue);
        if (!hasValidDates || d > maxDate) maxDate = d;
        hasValidDates = true;
      }
    });

    // Give it a little buffer (2 days before min, 5 days after max)
    const timelineStart = new Date(minDate);
    timelineStart.setDate(timelineStart.getDate() - 3);
    
    const timelineEnd = new Date(maxDate);
    timelineEnd.setDate(timelineEnd.getDate() + 7);

    return {
      start: timelineStart,
      end: timelineEnd,
    };
  }, [activities, projectTasks]);

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
      // If it's Sunday, or the last day in our timeline bounds
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

  const toggleActivityCollapse = (activityId: string) => {
    setCollapsedActivities((prev) => ({
      ...prev,
      [activityId]: !prev[activityId],
    }));
  };

  // Helper to calculate column positioning
  const getPositionStyles = (startDateStr?: string | null, endDateStr?: string | null) => {
    if (!startDateStr || !endDateStr) {
      // Return a default mock span if dates are missing
      return { gridColumnStart: 3, gridColumnEnd: 'span 5', isFallback: true };
    }

    const start = new Date(startDateStr);
    const end = new Date(endDateStr);
    
    // Boundary checks
    const timelineStart = timelineBounds.start;

    // Calculate difference in days
    const startDiff = Math.round((start.getTime() - timelineStart.getTime()) / (1000 * 60 * 60 * 24));
    const duration = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);

    const colStart = Math.max(1, startDiff + 1);
    
    return {
      gridColumnStart: colStart,
      gridColumnEnd: `span ${duration}`,
      isFallback: false,
    };
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'done':
      case 'completed':
        return {
          bg: 'bg-emerald-500/20 dark:bg-emerald-500/15',
          border: 'border-emerald-500/40 dark:border-emerald-500/30',
          bar: 'bg-emerald-500 dark:bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.3)]',
          text: 'text-emerald-400',
        };
      case 'in_progress':
        return {
          bg: 'bg-blue-500/20 dark:bg-blue-500/15',
          border: 'border-blue-500/40 dark:border-blue-500/30',
          bar: 'bg-blue-500 dark:bg-blue-400 shadow-[0_0_8px_rgba(59,130,246,0.3)]',
          text: 'text-blue-400',
        };
      case 'in_review':
        return {
          bg: 'bg-purple-500/20 dark:bg-purple-500/15',
          border: 'border-purple-500/40 dark:border-purple-500/30',
          bar: 'bg-purple-500 dark:bg-purple-400 shadow-[0_0_8px_rgba(168,85,247,0.3)]',
          text: 'text-purple-400',
        };
      case 'blocked':
        return {
          bg: 'bg-rose-500/20 dark:bg-rose-500/15',
          border: 'border-rose-500/40 dark:border-rose-500/30',
          bar: 'bg-rose-500 dark:bg-rose-400 shadow-[0_0_8px_rgba(239,68,68,0.3)]',
          text: 'text-rose-400',
        };
      default:
        return {
          bg: 'bg-zinc-500/10 dark:bg-white/5',
          border: 'border-zinc-500/20 dark:border-white/10',
          bar: 'bg-zinc-500 dark:bg-zinc-600',
          text: 'text-slate-500 dark:text-zinc-500',
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
    <div className="space-y-6 text-foreground animate-fade-in">
      
      {/* 1. Analytics KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Progress Card */}
        <div className="glass-panel border border-border rounded-2xl p-5 flex items-center justify-between relative overflow-hidden group hover:border-blue-500/30 transition duration-300">
          <div className="space-y-1.5 z-10">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block">Project Progress</span>
            <div className="flex items-baseline space-x-1.5">
              <span className="text-2xl font-black text-foreground">{stats.progressPercent}%</span>
              <span className="text-xs text-muted-foreground font-bold">({stats.completed} of {stats.total} Tasks)</span>
            </div>
            <div className="w-full bg-slate-100 dark:bg-white/5 rounded-full h-1 overflow-hidden mt-2">
              <div 
                className="bg-blue-500 h-full rounded-full transition-all duration-500" 
                style={{ width: `${stats.progressPercent}%` }}
              />
            </div>
          </div>
          <div className="p-3 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-xl">
            <TrendingUp className="w-5 h-5 animate-pulse" />
          </div>
        </div>

        {/* In Progress Card */}
        <div className="glass-panel border border-border rounded-2xl p-5 flex items-center justify-between relative overflow-hidden group hover:border-amber-500/30 transition duration-300">
          <div className="space-y-1 z-10">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block">Active Workload</span>
            <div className="flex items-baseline space-x-1.5">
              <span className="text-2xl font-black text-foreground">{stats.inProgress}</span>
              <span className="text-xs text-muted-foreground font-bold">Tasks In Progress</span>
            </div>
            <p className="text-[10px] text-muted-foreground mt-2 font-medium">Actively being worked on by team</p>
          </div>
          <div className="p-3 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-xl">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        {/* Blocked Card */}
        <div className="glass-panel border border-border rounded-2xl p-5 flex items-center justify-between relative overflow-hidden group hover:border-red-500/30 transition duration-300">
          <div className="space-y-1 z-10">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block">Blocked Tasks</span>
            <div className="flex items-baseline space-x-1.5">
              <span className="text-2xl font-black text-foreground">{stats.blocked}</span>
              <span className="text-xs text-muted-foreground font-bold">Friction Blockers</span>
            </div>
            <p className="text-[10px] text-red-400 mt-2 font-bold flex items-center gap-1">
              <AlertOctagon className="w-3 h-3" /> Requires escalation review
            </p>
          </div>
          <div className="p-3 bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded-xl">
            <AlertOctagon className="w-5 h-5 animate-bounce" />
          </div>
        </div>

        {/* Total Tasks Card */}
        <div className="glass-panel border border-border rounded-2xl p-5 flex items-center justify-between relative overflow-hidden group hover:border-purple-500/30 transition duration-300">
          <div className="space-y-1 z-10">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block">Total Scope</span>
            <div className="flex items-baseline space-x-1.5">
              <span className="text-2xl font-black text-foreground">{stats.total}</span>
              <span className="text-xs text-muted-foreground font-bold">Planned Deliverables</span>
            </div>
            <p className="text-[10px] text-muted-foreground mt-2 font-medium">Mapped to project timelines</p>
          </div>
          <div className="p-3 bg-purple-500/10 text-purple-400 border border-purple-500/20 rounded-xl">
            <Layers className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* 2. Gantt Controls */}
      <div className="glass-panel border border-border rounded-2xl p-4 bg-white dark:bg-zinc-950 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Assignee Filter */}
          <div className="flex items-center space-x-2">
            <Filter className="w-3.5 h-3.5 text-muted-foreground" />
            <select
              value={selectedAssignee}
              onChange={(e) => setSelectedAssignee(e.target.value)}
              className="bg-slate-50 dark:bg-zinc-900 border border-border rounded-xl px-3 py-1.5 text-xs text-slate-800 dark:text-zinc-200 focus:outline-none cursor-pointer"
            >
              <option value="all">All Assignees</option>
              {members.map((u) => (
                <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div className="flex items-center space-x-2">
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="bg-slate-50 dark:bg-zinc-900 border border-border rounded-xl px-3 py-1.5 text-xs text-slate-800 dark:text-zinc-200 focus:outline-none cursor-pointer"
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

        {/* Time Scale selector */}
        <div className="flex items-center bg-slate-100 dark:bg-white/5 rounded-xl p-1 border border-border">
          <button
            onClick={() => setTimeScale('days')}
            className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
              timeScale === 'days' 
                ? 'bg-blue-600 text-white shadow-md' 
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Daily Grid
          </button>
          <button
            onClick={() => setTimeScale('weeks')}
            className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
              timeScale === 'weeks' 
                ? 'bg-blue-600 text-white shadow-md' 
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Weekly Scale
          </button>
        </div>
      </div>

      {/* 3. Gantt Chart View */}
      {filteredData.activities.length === 0 && projectTasks.length === 0 ? (
        <div className="glass-panel border border-border rounded-2xl p-12 text-center bg-white dark:bg-zinc-950">
          <Calendar className="w-12 h-12 text-slate-500 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-slate-800 dark:text-zinc-300">No Schedule Mapped</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto mt-2">
            There are currently no tasks or task containers created for this project yet. Head over to the Task Planner to map them.
          </p>
        </div>
      ) : (
        <div className="glass-panel border border-border rounded-2xl bg-white dark:bg-zinc-950 overflow-hidden shadow-xl flex flex-col">
          
          {/* Gantt Scroll Container */}
          <div className="overflow-x-auto select-none">
            <div className="min-w-[800px] flex flex-col">
              
              {/* Timeline Header Row */}
              <div className="flex border-b border-border">
                {/* Fixed Label Space */}
                <div className="w-[300px] shrink-0 bg-slate-50/50 dark:bg-zinc-900/50 border-r border-border p-4 flex items-center">
                  <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Task Structure / Activities</span>
                </div>

                {/* Scrollable Timeline Grid Header */}
                <div className="flex-1 bg-slate-100/40 dark:bg-white/2 relative">
                  {timeScale === 'days' ? (
                    /* Daily Grid */
                    <div 
                      className="grid h-full"
                      style={{ 
                        gridTemplateColumns: `repeat(${timelineDays.length}, minmax(40px, 1fr))`,
                      }}
                    >
                      {timelineDays.map((day, i) => {
                        const isToday = day.toDateString() === new Date().toDateString();
                        const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                        return (
                          <div 
                            key={i} 
                            className={`border-r border-border/40 py-2.5 px-0.5 text-center flex flex-col items-center justify-center shrink-0 min-w-[40px] ${
                              isToday ? 'bg-blue-500/10' : isWeekend ? 'bg-slate-100/10 dark:bg-white/1' : ''
                            }`}
                          >
                            <span className="text-[8px] uppercase tracking-wider text-muted-foreground font-black">
                              {day.toLocaleDateString([], { weekday: 'narrow' })}
                            </span>
                            <span className={`text-[10px] font-bold mt-0.5 ${isToday ? 'text-blue-400 font-extrabold' : 'text-slate-700 dark:text-zinc-300'}`}>
                              {day.getDate()}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    /* Weekly scale */
                    <div 
                      className="grid h-full"
                      style={{ 
                        gridTemplateColumns: `repeat(${timelineDays.length}, minmax(40px, 1fr))`,
                      }}
                    >
                      {timelineWeeks.map((week, i) => (
                        <div 
                          key={i} 
                          className="border-r border-border/40 py-3 text-center flex items-center justify-center text-[9px] font-black uppercase text-slate-500 tracking-wider"
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
                </div>
              </div>

              {/* Gantt Rows */}
              <div className="flex flex-col divide-y divide-border">
                {/* 1. Render Activities and their nested Tasks */}
                {filteredData.activities.map((activity) => {
                  const isCollapsed = !!collapsedActivities[activity.id];
                  const childTasks = filteredData.tasksMap[activity.id] || [];
                  const hasChildren = childTasks.length > 0;
                  const activityPos = getPositionStyles(activity.startDate, activity.endDate);

                  return (
                    <React.Fragment key={activity.id}>
                      {/* Activity Container Row */}
                      <div className="flex hover:bg-slate-100/20 dark:hover:bg-white/1 transition-all group">
                        
                        {/* Left Label: Activity details */}
                        <div className="w-[300px] shrink-0 border-r border-border p-3 flex items-center justify-between bg-slate-50/20 dark:bg-zinc-900/10">
                          <div 
                            className="flex items-center space-x-2.5 min-w-0 cursor-pointer"
                            onClick={() => toggleActivityCollapse(activity.id)}
                          >
                            <button className="text-slate-400 hover:text-white transition">
                              {isCollapsed ? (
                                <ChevronRight className="w-4 h-4" />
                              ) : (
                                <ChevronDown className="w-4 h-4" />
                              )}
                            </button>
                            <span className="text-xs font-bold text-slate-800 dark:text-zinc-200 truncate group-hover:text-blue-400">
                              📦 {activity.title}
                            </span>
                          </div>
                          
                          <span className={`text-[8px] uppercase tracking-wider font-extrabold px-1.5 py-0.5 rounded border ${
                            activity.isSprintRelevant
                              ? 'bg-purple-500/10 border-purple-500/20 text-purple-400'
                              : 'bg-zinc-500/10 border-zinc-500/20 text-slate-500'
                          }`}>
                            {activity.isSprintRelevant ? 'Sprint' : 'Standard'}
                          </span>
                        </div>

                        {/* Right: Gantt Timeline Position */}
                        <div className="flex-1 min-w-[500px] relative p-3 flex items-center bg-slate-50/10 dark:bg-zinc-950/20">
                          {/* Grid Column Background slots */}
                          <div 
                            className="absolute inset-0 grid"
                            style={{ 
                              gridTemplateColumns: `repeat(${timelineDays.length}, minmax(40px, 1fr))`,
                            }}
                          >
                            {timelineDays.map((_, i) => (
                              <div key={i} className="border-r border-border/20 h-full" />
                            ))}
                          </div>

                          {/* Activity Timeline Bar */}
                          {activity.startDate && activity.endDate ? (
                            <div 
                              className="h-6 rounded-lg bg-blue-500/15 border border-blue-500/35 relative flex items-center justify-between px-3 z-10 select-none overflow-hidden"
                              style={{
                                gridColumnStart: activityPos.gridColumnStart,
                                gridColumnEnd: activityPos.gridColumnEnd,
                              }}
                            >
                              <div className="absolute inset-y-0 left-0 bg-blue-500/20 w-full animate-pulse-slow" />
                              <span className="text-[9px] font-black uppercase text-blue-400 tracking-wider truncate z-10">
                                {activity.title}
                              </span>
                              <span className="text-[8px] font-mono font-bold text-blue-500 dark:text-blue-400/70 z-10 shrink-0">
                                {new Date(activity.startDate).toLocaleDateString([], { month: 'short', day: 'numeric' })} - {new Date(activity.endDate).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                              </span>
                            </div>
                          ) : (
                            <div 
                              className="h-6 rounded-lg bg-zinc-500/10 border border-dashed border-zinc-500/20 relative flex items-center justify-center z-10 select-none w-full"
                              style={{
                                gridColumnStart: 1,
                                gridColumnEnd: -1,
                              }}
                            >
                              <span className="text-[9px] italic text-muted-foreground font-light">No timelines defined for this task planner container</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Nested Tasks under this Activity */}
                      {!isCollapsed && hasChildren && childTasks.map((task) => {
                        const taskPos = getPositionStyles(task.customFields?.startDate, task.customFields?.dueDate);
                        const colors = getStatusColor(task.status);
                        
                        return (
                          <div key={task.id} className="flex hover:bg-slate-100/10 dark:hover:bg-white/1 transition duration-150">
                            
                            {/* Left Label: Task details */}
                            <div className="w-[300px] shrink-0 border-r border-border p-3 pl-8 flex items-center justify-between">
                              <div className="min-w-0 space-y-1">
                                <p className="text-xs font-semibold text-slate-700 dark:text-zinc-300 truncate">
                                  📌 {task.name}
                                </p>
                                <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
                                  {task.customFields?.priority && (
                                    <span className={`text-[8px] uppercase tracking-wider font-extrabold px-1.5 py-0.5 rounded border ${getPriorityBadgeColor(task.customFields.priority)}`}>
                                      {task.customFields.priority}
                                    </span>
                                  )}
                                  <span className={`text-[8px] uppercase tracking-wider font-extrabold px-1.5 py-0.5 rounded border ${colors.bg} ${colors.border} ${colors.text}`}>
                                    {task.status.replace(/_/g, ' ')}
                                  </span>
                                </div>
                              </div>

                              {/* Assignee Avatar */}
                              <div 
                                className="w-5 h-5 rounded-full border border-border flex items-center justify-center text-[8px] font-black text-slate-800 dark:text-white shrink-0 bg-slate-100 dark:bg-zinc-800/80"
                                title={getMemberName(task.assigneeId)}
                              >
                                {getMemberInitials(task.assigneeId)}
                              </div>
                            </div>

                            {/* Right: Task timeline bar */}
                            <div className="flex-1 min-w-[500px] relative p-3 flex items-center bg-slate-50/5 dark:bg-zinc-950/10">
                              {/* Background grid vertical slots */}
                              <div 
                                className="absolute inset-0 grid"
                                style={{ 
                                  gridTemplateColumns: `repeat(${timelineDays.length}, minmax(40px, 1fr))`,
                                }}
                              >
                                {timelineDays.map((_, i) => (
                                  <div key={i} className="border-r border-border/20 h-full" />
                                ))}
                              </div>

                              {/* Task Timeline Bar */}
                              {task.customFields?.startDate && task.customFields?.dueDate ? (
                                <div 
                                  className={`h-4.5 rounded-md ${colors.bg} ${colors.border} border relative flex items-center justify-between px-2.5 z-10 select-none overflow-hidden`}
                                  style={{
                                    gridColumnStart: taskPos.gridColumnStart,
                                    gridColumnEnd: taskPos.gridColumnEnd,
                                  }}
                                  title={`${task.name}\nAssignee: ${getMemberName(task.assigneeId)}\nDates: ${task.customFields.startDate} to ${task.customFields.dueDate}`}
                                >
                                  {/* Progress fill */}
                                  <div className={`absolute inset-y-0 left-0 ${colors.bar} w-full opacity-30`} />
                                  <span className="text-[8.5px] font-bold text-slate-800 dark:text-zinc-300 truncate z-10 pr-2">
                                    {task.name}
                                  </span>
                                  <span className="text-[7.5px] font-mono font-bold text-slate-500 dark:text-zinc-400 z-10 shrink-0">
                                    {new Date(task.customFields.startDate).toLocaleDateString([], { month: 'short', day: 'numeric' })} - {new Date(task.customFields.dueDate).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                                  </span>
                                </div>
                              ) : (
                                <div 
                                  className="h-4.5 rounded-md bg-zinc-500/5 border border-dashed border-zinc-500/20 relative flex items-center justify-center z-10 select-none w-full"
                                  style={{
                                    gridColumnStart: 1,
                                    gridColumnEnd: -1,
                                  }}
                                >
                                  <span className="text-[8.5px] italic text-muted-foreground font-light">Timeline dates not specified for task</span>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </React.Fragment>
                  );
                })}

                {/* 2. Render Unassigned Activity tasks */}
                {filteredData.tasksMap['unassigned']?.length > 0 && (
                  <React.Fragment>
                    <div className="flex bg-slate-50/20 dark:bg-zinc-900/10">
                      <div className="w-[300px] shrink-0 border-r border-border p-3 flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800 dark:text-zinc-200">
                          📦 Ungrouped Tasks
                        </span>
                      </div>
                      <div className="flex-1 min-w-[500px] bg-slate-50/10 dark:bg-zinc-950/20 p-3" />
                    </div>

                    {filteredData.tasksMap['unassigned'].map((task) => {
                      const taskPos = getPositionStyles(task.customFields?.startDate, task.customFields?.dueDate);
                      const colors = getStatusColor(task.status);

                      return (
                        <div key={task.id} className="flex hover:bg-slate-100/10 dark:hover:bg-white/1 transition duration-150">
                          <div className="w-[300px] shrink-0 border-r border-border p-3 pl-8 flex items-center justify-between">
                            <div className="min-w-0 space-y-1">
                              <p className="text-xs font-semibold text-slate-700 dark:text-zinc-300 truncate">
                                📌 {task.name}
                              </p>
                              <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
                                {task.customFields?.priority && (
                                  <span className={`text-[8px] uppercase tracking-wider font-extrabold px-1.5 py-0.5 rounded border ${getPriorityBadgeColor(task.customFields.priority)}`}>
                                    {task.customFields.priority}
                                  </span>
                                )}
                                <span className={`text-[8px] uppercase tracking-wider font-extrabold px-1.5 py-0.5 rounded border ${colors.bg} ${colors.border} ${colors.text}`}>
                                  {task.status.replace(/_/g, ' ')}
                                </span>
                              </div>
                            </div>

                            <div 
                              className="w-5 h-5 rounded-full border border-border flex items-center justify-center text-[8px] font-black text-slate-800 dark:text-white shrink-0 bg-slate-100 dark:bg-zinc-800/80"
                              title={getMemberName(task.assigneeId)}
                            >
                              {getMemberInitials(task.assigneeId)}
                            </div>
                          </div>

                          <div className="flex-1 min-w-[500px] relative p-3 flex items-center bg-slate-50/5 dark:bg-zinc-950/10">
                            <div 
                              className="absolute inset-0 grid"
                              style={{ 
                                gridTemplateColumns: `repeat(${timelineDays.length}, minmax(40px, 1fr))`,
                              }}
                            >
                              {timelineDays.map((_, i) => (
                                <div key={i} className="border-r border-border/20 h-full" />
                              ))}
                            </div>

                            {task.customFields?.startDate && task.customFields?.dueDate ? (
                              <div 
                                className={`h-4.5 rounded-md ${colors.bg} ${colors.border} border relative flex items-center justify-between px-2.5 z-10 select-none overflow-hidden`}
                                style={{
                                  gridColumnStart: taskPos.gridColumnStart,
                                  gridColumnEnd: taskPos.gridColumnEnd,
                                }}
                                title={`${task.name}\nAssignee: ${getMemberName(task.assigneeId)}\nDates: ${task.customFields.startDate} to ${task.customFields.dueDate}`}
                              >
                                <div className={`absolute inset-y-0 left-0 ${colors.bar} w-full opacity-30`} />
                                <span className="text-[8.5px] font-bold text-slate-800 dark:text-zinc-300 truncate z-10 pr-2">
                                  {task.name}
                                </span>
                                <span className="text-[7.5px] font-mono font-bold text-slate-500 dark:text-zinc-400 z-10 shrink-0">
                                  {new Date(task.customFields.startDate).toLocaleDateString([], { month: 'short', day: 'numeric' })} - {new Date(task.customFields.dueDate).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                                </span>
                              </div>
                            ) : (
                              <div 
                                className="h-4.5 rounded-md bg-zinc-500/5 border border-dashed border-zinc-500/20 relative flex items-center justify-center z-10 select-none w-full"
                                style={{
                                  gridColumnStart: 1,
                                  gridColumnEnd: -1,
                                }}
                              >
                                <span className="text-[8.5px] italic text-muted-foreground font-light">Timeline dates not specified for task</span>
                              </div>
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

    </div>
  );
};
export default ProjectAnalytics;
