import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuthStore } from '../../store/authStore';
import { projectsApi } from '../../services/api/projects';
import { tasksApi } from '../../services/api/tasks';
import { notificationsApi } from '../../services/api/notifications';
import { useSocketEvent } from '../../services/socket/socket-events';
import type { PresenceEvent, WorkflowEvent } from '../../services/socket/socket-events';
import { useSocket } from '../../services/socket/socket-context';
import {
  Activity,
  FolderKanban,
  AlertTriangle,
  Bell,
  CheckCircle2,
  Clock,
  Plus,
  ArrowRight,
  Sparkles,
  Building,
  HeartPulse,
  X
} from 'lucide-react';

const createProjectSchema = z.object({
  name: z.string().min(3, 'Project name must be at least 3 characters'),
  description: z.string().optional(),
});

type CreateProjectFormValues = z.infer<typeof createProjectSchema>;

interface Collaborator {
  userId: string;
  email?: string;
  status: 'online' | 'offline';
  timestamp: string;
}

export const Overview: React.FC = () => {
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const { socket, isConnected } = useSocket();

  const [collaborators, setCollaborators] = useState<Record<string, Collaborator>>(() => {
    const currentUser = useAuthStore.getState().user;
    return {
      [currentUser?.id || 'current']: {
        userId: currentUser?.id || 'current',
        email: currentUser?.email || 'admin@acme.com',
        status: 'online',
        timestamp: new Date().toISOString(),
      },
    };
  });

  const [socketActivities, setSocketActivities] = useState<WorkflowEvent[]>([]);

  // TanStack Queries
  const { data: projects = [], isLoading: loadingProjects } = useQuery({
    queryKey: ['projects'],
    queryFn: projectsApi.list,
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks'],
    queryFn: tasksApi.list,
  });

  const { data: notifications = [] } = useQuery({
    queryKey: ['notifications'],
    queryFn: notificationsApi.list,
  });

  const { data: unreadData } = useQuery({
    queryKey: ['notifications-unread-count'],
    queryFn: notificationsApi.getUnreadCount,
  });

  // Project Creation Mutation
  const createProjectMutation = useMutation({
    mutationFn: projectsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setShowCreateModal(false);
      reset();
    },
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateProjectFormValues>({
    resolver: zodResolver(createProjectSchema),
  });

  const onSubmit = (values: CreateProjectFormValues) => {
    createProjectMutation.mutate(values);
  };

  // Real-time Event Subscriptions
  useSocketEvent<PresenceEvent>('presence_event', (event) => {
    const uid = String(event.userId);
    setCollaborators((prev) => ({
      ...prev,
      [uid]: {
        userId: uid,
        email: event.email || prev[uid]?.email,
        status: event.type === 'USER_ONLINE' ? 'online' : 'offline',
        timestamp: event.timestamp,
      },
    }));
  });

  useSocketEvent<{ userIds: Array<string | number>; users?: Array<{ userId: string; email?: string }> }>('online_users_list', (data) => {
    const onlineIds = new Set(data.userIds.map(String));
    const usersMap = new Map(data.users?.map(u => [String(u.userId), u]) || []);
    setCollaborators((prev) => {
      const next = Object.fromEntries(
        Object.entries(prev).map(([uid, collab]) => [uid, {
          ...collab,
          status: onlineIds.has(uid) ? 'online' : 'offline',
        } as Collaborator])
      ) as Record<string, Collaborator>;

      onlineIds.forEach((uid) => {
        const uInfo = usersMap.get(uid);
        if (!next[uid]) {
          next[uid] = {
            userId: uid,
            email: uInfo?.email,
            status: 'online',
            timestamp: new Date().toISOString(),
          };
        } else {
          next[uid].status = 'online';
          next[uid].timestamp = new Date().toISOString();
          if (uInfo?.email) {
            next[uid].email = uInfo.email;
          }
        }
      });

      return next;
    });
  });

  useSocketEvent<WorkflowEvent>('workflow_event', (event) => {
    setSocketActivities((prev) => [event, ...prev].slice(0, 15));
  });

  // Request the initial active online users list now that listeners are registered
  React.useEffect(() => {
    if (socket && isConnected) {
      socket.emit('request_online_users');
    }
  }, [socket, isConnected]);

  // Calculate Metrics from Live Queries
  const derivedProjects = projects.map((p) => {
    const phasesList = p.phases ?? [];
    const total = phasesList.length;
    const completedCount = phasesList.filter((ph: any) => ph.status === 'completed').length;
    const isFullyComplete = total > 0 && completedCount === total;
    const effectiveStatus = isFullyComplete ? 'completed' : (p.status === 'completed' ? 'active' : p.status);
    return { ...p, effectiveStatus };
  });

  const activeProjectsCount = derivedProjects.filter((p) => p.effectiveStatus === 'active').length;
  
  // Total blocked project count (derived if any phase is blocked or status is blocked)
  const blockedProjects = derivedProjects.filter((p) => p.effectiveStatus === 'blocked').length;

  const overdueTasks = tasks.filter((t) => {
    const isPending = t.status !== 'done' && t.status !== 'completed';
    // assume tasks with index 3 or similar as mock overdue just for representation if no dueDate
    return isPending && t.name.toLowerCase().includes('overdue');
  }).length;

  const unreadCount = unreadData?.count || notifications.filter(n => !n.isRead).length;

  // Determine overall workspace health
  const healthScore = activeProjectsCount === 0 
    ? 100 
    : Math.max(0, 100 - (blockedProjects * 25) - (overdueTasks * 5));

  const healthText = healthScore >= 80 ? 'Optimal' : healthScore >= 50 ? 'At Risk' : 'Critical';
  const healthColor = healthScore >= 80 ? 'text-emerald-400' : healthScore >= 50 ? 'text-yellow-400' : 'text-red-400';

  const stats = [
    { name: 'Active Projects', value: `${activeProjectsCount} Active`, icon: FolderKanban, color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
    { name: 'Blocked Timelines', value: `${blockedProjects} Blocked`, icon: AlertTriangle, color: blockedProjects > 0 ? 'text-red-400' : 'text-slate-500 dark:text-zinc-500', bg: blockedProjects > 0 ? 'bg-red-500/10 border-red-500/20' : 'bg-zinc-500/5 border-zinc-500/10' },
    { name: 'Board Health', value: `${healthScore}% - ${healthText}`, icon: HeartPulse, color: healthColor, bg: 'bg-emerald-500/10 border-emerald-500/20' },
    { name: 'Unread Alerts', value: `${unreadCount} Alerts`, icon: Bell, color: unreadCount > 0 ? 'text-amber-400' : 'text-slate-500 dark:text-zinc-500', bg: unreadCount > 0 ? 'bg-amber-500/10 border-amber-500/20 animate-pulse' : 'bg-zinc-500/5 border-zinc-500/10' },
  ];

  return (
    <div className="space-y-8 animate-fade-in text-foreground">
      {/* Header Panel */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center space-y-4 md:space-y-0">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
              Board Overview
            </h1>
            <span className="flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-xs font-semibold text-blue-400">
              <Building className="w-3.5 h-3.5" />
              <span>Acme Corp</span>
            </span>
          </div>
          <p className="text-sm font-light text-muted-foreground mt-1">
            Realtime multi-tenant execution dashboard. Standardized governance controls enforced.
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-linear-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold text-sm transition-all shadow-xl glow-primary"
        >
          <Plus className="w-4.5 h-4.5" />
          <span>Create Project</span>
        </button>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.name}
              className="glass-panel-heavy rounded-2xl p-5 border border-border flex items-center space-x-4 hover:border-blue-500/20 transition-all duration-300 relative group overflow-hidden"
            >
              <div className={`p-3.5 rounded-xl border ${stat.bg} group-hover:scale-105 transition-all`}>
                <Icon className={`w-6.5 h-6.5 ${stat.color}`} />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest truncate">
                  {stat.name}
                </p>
                <p className="text-xl font-bold text-foreground mt-1 select-none">{stat.value}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Main Contents */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Active Projects Grid */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">
              Governance Timelines ({projects.length})
            </h3>
            <Link to="/projects" className="text-xs font-semibold text-blue-400 hover:underline flex items-center space-x-1">
              <span>View all projects</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {loadingProjects ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="h-32 rounded-2xl bg-muted/30 animate-pulse border border-border" />
              ))}
            </div>
          ) : projects.length === 0 ? (
            <div className="glass-panel rounded-2xl p-12 border border-border flex flex-col items-center justify-center text-center space-y-4">
              <FolderKanban className="w-12 h-12 text-muted-foreground" />
              <div>
                <h4 className="text-sm font-bold text-foreground">No projects provisioned</h4>
                <p className="text-xs text-muted-foreground font-light max-w-sm mt-1">
                  Initialize an enterprise deliverable to setup Initiation → Planning → Design → Build pipelines.
                </p>
              </div>
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold"
              >
                Create Project
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {derivedProjects.map((project) => (
                <div
                  key={project.id}
                  className="glass-panel rounded-2xl p-5 border border-border hover:border-blue-500/20 transition-all duration-300 flex flex-col justify-between space-y-4"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-bold text-foreground text-base">
                        {project.name}
                      </h4>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                        {project.description || 'No description provided.'}
                      </p>
                    </div>
                    <span
                      className={`text-[10px] uppercase font-bold tracking-widest px-2.5 py-0.5 rounded-full border ${
                        project.effectiveStatus === 'completed'
                          ? 'bg-teal-500/10 border-teal-500/25 text-teal-400'
                          : project.effectiveStatus === 'active'
                          ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                          : project.effectiveStatus === 'archived'
                          ? 'bg-zinc-500/10 border-zinc-500/20 text-slate-600 dark:text-zinc-400'
                          : 'bg-red-500/10 border-red-500/20 text-red-400'
                      }`}
                    >
                      {project.effectiveStatus}
                    </span>
                  </div>

                  <div className="flex items-center space-x-1.5 overflow-x-auto text-[10px] tracking-wider uppercase font-semibold text-muted-foreground border-t border-b border-border py-3">
                    <span className="text-muted-foreground mr-2">Lifecycle Phases:</span>
                    {['Initiation', 'Planning', 'Design', 'Build', 'Testing', 'Go Live'].map((phaseName) => (
                      <span
                        key={phaseName}
                        className="px-2 py-0.5 rounded bg-muted border border-border whitespace-nowrap"
                      >
                        {phaseName}
                      </span>
                    ))}
                  </div>

                  <div className="flex justify-between items-center text-xs">
                    <span className="text-muted-foreground">
                      Created: {new Date(project.createdAt).toLocaleDateString()}
                    </span>
                    <Link
                      to={`/projects/${project.id}/analytics`}
                      className="px-4 py-2.5 rounded-xl bg-blue-600/10 border border-blue-500/20 text-blue-400 hover:bg-blue-600 hover:text-white transition-all font-semibold flex items-center space-x-1.5"
                    >
                      <span>Enter</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Realtime Sidebar Widgets */}
        <div className="space-y-6">
          
          {/* Presence tracking */}
          <div className="glass-panel rounded-2xl p-6 border border-border flex flex-col h-80">
            <div className="flex items-center justify-between mb-4 border-b border-border pb-3">
              <h3 className="text-sm font-bold text-foreground tracking-wide uppercase">Presence Tracking</h3>
              <span className="text-[9px] uppercase font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                Active Sockets
              </span>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {Object.values(collaborators).map((collab) => (
                <div key={collab.userId} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted transition-all">
                  <div className="flex items-center space-x-2.5">
                    <div className="relative">
                      <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center font-bold text-indigo-400 text-xs">
                        {collab.email ? collab.email[0].toUpperCase() : 'U'}
                      </div>
                      <span
                        className={`absolute bottom-0 right-0 w-2 h-2 rounded-full border-2 border-background ${
                          collab.status === 'online' ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-500'
                        }`}
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-foreground truncate max-w-35">
                        {collab.email || `User_${collab.userId.substring(0, 5)}`}
                      </p>
                      <p className="text-[10px] text-muted-foreground font-light">
                        {collab.status === 'online' ? 'Active context' : 'Away'}
                      </p>
                    </div>
                  </div>
                  <span className="text-[9px] text-muted-foreground font-light">
                    {new Date(collab.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Workflow Feed */}
          <div className="glass-panel rounded-2xl p-6 border border-border flex flex-col h-80">
            <div className="flex items-center justify-between mb-4 border-b border-border pb-3">
              <h3 className="text-sm font-bold text-foreground tracking-wide uppercase">Workflow Activity</h3>
              <div className="flex items-center space-x-1">
                <Activity className="w-3.5 h-3.5 text-blue-400 animate-pulse" />
                <span className="text-[9px] font-semibold text-blue-400 uppercase tracking-widest">Live Stream</span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {socketActivities.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center space-y-2 text-center py-8">
                  <Clock className="w-8 h-8 text-muted-foreground animate-pulse" />
                  <p className="text-xs text-muted-foreground font-light">Listening for live updates...</p>
                </div>
              ) : (
                socketActivities.map((act, index) => (
                  <div key={index} className="flex space-x-3 items-start border-b border-border pb-2.5 last:border-0 last:pb-0">
                    <div className="p-1 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 mt-0.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold text-foreground uppercase tracking-wider truncate">
                          {act.type.replace(/_/g, ' ')}
                        </span>
                        <span className="text-[8px] text-muted-foreground">
                          {new Date(act.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {act.entityType.toUpperCase()}: <span className="text-foreground/70 font-semibold">{act.entityId.substring(0, 8)}</span>
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

      </div>

      {/* SIDEBAR DRAWER: Create Project */}
      {showCreateModal && (
        <>
          <div
            className="fixed inset-0 bg-black/20 backdrop-blur-[1px] z-40 animate-fade-in-backdrop"
            onClick={() => setShowCreateModal(false)}
          />
          <div className="fixed top-0 right-0 h-screen w-[320px] md:w-[440px] bg-slate-50 dark:bg-zinc-950 border-l border-slate-200 dark:border-border z-50 shadow-2xl flex flex-col p-6 animate-slide-in-right overflow-y-auto">
            {/* Header */}
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-white/5 pb-4 mb-6">
              <h4 className="text-sm font-black uppercase text-slate-900 dark:text-white tracking-wider flex items-center space-x-1.5">
                <Sparkles className="w-5 h-5 text-blue-400" />
                <span>Create New Project</span>
              </h4>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-white/5 text-slate-500 hover:text-slate-900 dark:hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 flex-1 flex flex-col justify-between">
              <div className="space-y-6">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Project Title</label>
                  <input
                    type="text"
                    placeholder="e.g. Apollo Go-Live Suite"
                    {...register('name')}
                    className="w-full bg-white dark:bg-background border border-slate-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-xs text-slate-800 dark:text-zinc-200 focus:outline-none focus:border-blue-500"
                  />
                  {errors.name && (
                    <p className="text-[10px] text-red-400 font-bold">{errors.name.message}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Scope Description</label>
                  <textarea
                    rows={4}
                    placeholder="Deliverable details, milestones, sprint intervals..."
                    {...register('description')}
                    className="w-full bg-white dark:bg-background border border-slate-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-xs text-slate-800 dark:text-zinc-200 focus:outline-none focus:border-blue-500 resize-none"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-4 border-t border-slate-200 dark:border-white/5">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 border border-slate-200 dark:border-zinc-800 hover:bg-slate-200 dark:hover:bg-white/5 rounded-xl text-xs font-bold text-slate-700 dark:text-zinc-300 transition duration-150 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createProjectMutation.isPending}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition duration-150 active:scale-95 shadow cursor-pointer disabled:opacity-50 flex items-center space-x-1.5"
                >
                  {createProjectMutation.isPending ? (
                    <>
                      <div className="w-3.5 h-3.5 rounded-full border-2 border-white/20 border-t-white animate-spin" />
                      <span>Creating...</span>
                    </>
                  ) : (
                    <span>Create Project</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  );
};
export default Overview;
