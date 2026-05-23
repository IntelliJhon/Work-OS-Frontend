import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { notificationsApi } from '../../services/api/notifications';
import { projectsApi } from '../../services/api/projects';
import type { Project } from '../../services/api/projects';
import { AlertBadge } from '../../components/notifications/AlertBadge';
import {
  Bell,
  CheckCheck,
  GitBranch,
  ShieldCheck,
  Activity,
  Clock,
  Inbox,
  AlertTriangle,
  ChevronRight
} from 'lucide-react';

interface NotificationPayloadEnriched {
  id: string;
  tenantId: string;
  recipientUserId: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  entityType?: string;
  entityId?: string;
  priority?: string;
  metadata?: any;
}

export const NotificationCenter: React.FC = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'all' | 'unread' | 'workflow' | 'approvals' | 'sprints'>('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');

  // Fetch notifications
  const { data: notifications = [], isLoading, refetch } = useQuery<NotificationPayloadEnriched[]>({
    queryKey: ['notifications'],
    queryFn: notificationsApi.list,
  });

  // Fetch projects to resolve deep linking
  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: projectsApi.list,
  });

  const markReadMutation = useMutation({
    mutationFn: notificationsApi.markRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });
      refetch();
    }
  });

  const markAllReadMutation = useMutation({
    mutationFn: notificationsApi.markAllRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });
      refetch();
    }
  });

  // Assign categories and priorities dynamically based on content
  const getCategory = (title: string, entityType?: string): 'workflow' | 'approvals' | 'sprints' | 'general' => {
    const typeLower = entityType?.toLowerCase() || '';
    const titleLower = title.toLowerCase();
    
    if (typeLower === 'gate' || titleLower.includes('gate') || titleLower.includes('approve') || titleLower.includes('reject')) {
      return 'approvals';
    }
    if (typeLower === 'sprint' || titleLower.includes('sprint')) {
      return 'sprints';
    }
    if (typeLower === 'phase' || titleLower.includes('workflow') || titleLower.includes('phase')) {
      return 'workflow';
    }
    return 'general';
  };

  const getPriority = (title: string, dbPriority?: string, entityType?: string): 'low' | 'medium' | 'high' => {
    if (dbPriority) {
      const p = dbPriority.toLowerCase();
      if (p === 'critical' || p === 'high') return 'high';
      if (p === 'warning' || p === 'medium') return 'medium';
      return 'low';
    }
    const category = getCategory(title, entityType);
    if (category === 'approvals') return 'high';
    if (category === 'sprints') return 'medium';
    return 'low';
  };

  const getAlertIcon = (title: string, entityType?: string) => {
    const category = getCategory(title, entityType);
    if (category === 'workflow') {
      return <GitBranch className="w-4.5 h-4.5 text-blue-400" />;
    }
    if (category === 'approvals') {
      return <ShieldCheck className="w-4.5 h-4.5 text-emerald-400 animate-pulse" />;
    }
    if (category === 'sprints') {
      return <Activity className="w-4.5 h-4.5 text-indigo-400" />;
    }
    return <Bell className="w-4.5 h-4.5 text-amber-400" />;
  };

  const parseMetadata = (meta: any): any => {
    if (!meta) return null;
    if (typeof meta === 'string') {
      try {
        return JSON.parse(meta);
      } catch (e) {
        return null;
      }
    }
    return meta;
  };

  // Helper to resolve deep link based on entityType and entityId
  const resolveDeepLinkPath = (alert: NotificationPayloadEnriched): string | null => {
    if (!alert.entityType || !alert.entityId) {
      if (projects.length > 0) {
        return `/projects/${projects[0].id}/workflow`;
      }
      return null;
    }

    const type = alert.entityType.toLowerCase();
    const id = alert.entityId;
    const parsed = parseMetadata(alert.metadata);

    if (type === 'phase') {
      const proj = projects.find((p) => p.phases?.some((ph) => ph.id === id)) || 
                   (parsed?.projectId ? projects.find(p => p.id === parsed.projectId) : null);
      if (proj) return `/projects/${proj.id}/workflow`;
    }
    if (type === 'sprint') {
      const proj = projects.find((p) => p.sprints?.some((sp) => sp.id === id)) || 
                   (parsed?.projectId ? projects.find(p => p.id === parsed.projectId) : null);
      if (proj) return `/projects/${proj.id}/sprints`;
    }
    if (type === 'gate') {
      const proj = projects.find((p) => p.gates?.some((gt) => gt.id === id)) || 
                   (parsed?.projectId ? projects.find(p => p.id === parsed.projectId) : null);
      if (proj) return `/projects/${proj.id}/gates`;
    }
    if (type === 'task') {
      const createdFrom = parsed?.createdFrom;
      const projectId = parsed?.projectId;
      if (createdFrom === 'sprint' && projectId) {
        return `/projects/${projectId}/sprints`;
      }
      if (createdFrom === 'sidebar') {
        return `/dashboard/tasks`;
      }
      
      const sprintId = parsed?.sprintId;
      if (sprintId && projectId) {
        return `/projects/${projectId}/sprints`;
      }
      return `/dashboard/tasks`;
    }

    // Default project fallback
    if (projects.length > 0) {
      const pId = parsed?.projectId || projects[0].id;
      return `/projects/${pId}/${type === 'gate' ? 'gates' : type === 'sprint' ? 'sprints' : 'workflow'}`;
    }

    return null;
  };

  const handleNotificationClick = async (alert: NotificationPayloadEnriched) => {
    // 1. Mark as read
    if (!alert.isRead) {
      markReadMutation.mutate(alert.id);
    }
    // 2. Resolve link and navigate
    const linkPath = resolveDeepLinkPath(alert);
    if (linkPath) {
      navigate(linkPath);
    }
  };

  const handleMarkAllRead = () => {
    if (confirm('Mark all active system notifications as read?')) {
      markAllReadMutation.mutate();
    }
  };

  // Filter logic based on tab selection and priority filters
  const filteredNotifications = notifications
    .map(n => ({
      ...n,
      category: getCategory(n.title, n.entityType),
      priority: getPriority(n.title, n.priority, n.entityType)
    }))
    .filter((item) => {
      // 1. Category Tab Filter
      if (activeTab === 'unread') {
        if (item.isRead) return false;
      } else if (activeTab === 'workflow') {
        if (item.category !== 'workflow') return false;
      } else if (activeTab === 'approvals') {
        if (item.category !== 'approvals') return false;
      } else if (activeTab === 'sprints') {
        if (item.category !== 'sprints') return false;
      }

      // 2. Priority Pill Filter
      if (priorityFilter !== 'all' && item.priority !== priorityFilter) return false;

      return true;
    });

  const unreadCount = notifications.filter(n => !n.isRead).length;
  const highCount = notifications.filter(n => getPriority(n.title, n.priority, n.entityType) === 'high' && !n.isRead).length;
  const lowCount = notifications.filter(n => getPriority(n.title, n.priority, n.entityType) === 'low' && !n.isRead).length;

  const activeSprintsCount = projects.reduce((count, proj) => {
    const activeInProject = proj.sprints?.filter((s: any) => s.status === 'active').length || 0;
    return count + activeInProject;
  }, 0);

  return (
    <div className="space-y-6 text-foreground animate-fade-in">
      {/* Header Area */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center space-y-4 sm:space-y-0 pb-4 border-b border-border">
        <div>
          <h1 className="text-2xl font-extrabold text-white flex items-center space-x-2.5">
            <Bell className="w-7 h-7 text-blue-500" />
            <span>Deep-Linked Alerts Command Center</span>
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Track multi-tenant workflow modifications, stage gates, sprint cycles, and audit signs. Click any notification to navigate directly.
          </p>
        </div>

        {unreadCount > 0 && (
          <button
            onClick={handleMarkAllRead}
            disabled={markAllReadMutation.isPending}
            className="flex items-center space-x-1.5 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white transition-all text-xs font-bold shadow glow-primary disabled:opacity-50 border border-blue-500/20"
          >
            <CheckCheck className="w-4 h-4" />
            <span>Mark All as Read</span>
          </button>
        )}
      </div>

      {/* Real-time statistics summaries */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white/5 border border-white/5 p-4 rounded-xl flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Active Alerts Inbox</p>
            <p className="text-2xl font-black text-white mt-1">{unreadCount} <span className="text-zinc-500 font-light text-xs">Unread</span></p>
          </div>
          <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400">
            <Inbox className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white/5 border border-white/5 p-4 rounded-xl flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">High Priority Gates</p>
            <p className="text-2xl font-black text-red-400 mt-1">{highCount} <span className="text-zinc-500 font-light text-xs">Pending</span></p>
          </div>
          <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white/5 border border-white/5 p-4 rounded-xl flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Active Sprints</p>
            <p className="text-2xl font-black text-indigo-400 mt-1">{activeSprintsCount} <span className="text-zinc-500 font-light text-xs">Active</span></p>
          </div>
          <div className="p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
            <Activity className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white/5 border border-white/5 p-4 rounded-xl flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Workflow Actions</p>
            <p className="text-2xl font-black text-blue-400 mt-1">{lowCount} <span className="text-zinc-500 font-light text-xs">Pings</span></p>
          </div>
          <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400">
            <GitBranch className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Filter Tabs Selection */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-border pb-px gap-4">
        <div className="flex space-x-2 overflow-x-auto">
          {([
            { id: 'all', label: 'All Alerts' },
            { id: 'unread', label: `Unread (${unreadCount})` },
            { id: 'workflow', label: 'Workflow' },
            { id: 'approvals', label: 'Quality Approvals' },
            { id: 'sprints', label: 'Sprints' }
          ] as const).map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-5 py-3 text-xs font-bold border-b-2 transition-all whitespace-nowrap ${
                  isActive
                    ? 'border-blue-500 text-blue-400 bg-blue-500/5'
                    : 'border-transparent text-muted-foreground hover:text-white hover:bg-white/5'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Priority Filter Pill Selection */}
        <div className="flex items-center space-x-2 text-xs self-start md:self-auto bg-white/5 border border-white/5 p-1 rounded-xl">
          <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider px-2">Priority:</span>
          {([
            { id: 'all', label: 'All' },
            { id: 'high', label: '🔴 Critical' },
            { id: 'medium', label: '🟡 Sprints' },
            { id: 'low', label: '🔵 Info' }
          ] as const).map((pill) => {
            const isActive = priorityFilter === pill.id;
            return (
              <button
                key={pill.id}
                onClick={() => setPriorityFilter(pill.id)}
                className={`px-2.5 py-1 rounded-lg font-bold text-[10px] uppercase tracking-wide transition ${
                  isActive
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-zinc-400 hover:text-white hover:bg-white/5'
                }`}
              >
                {pill.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Notifications Alerts List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-16 rounded-xl bg-white/5 animate-pulse" />
          ))}
        </div>
      ) : filteredNotifications.length === 0 ? (
        <div className="glass-panel rounded-2xl p-16 text-center border border-border flex flex-col items-center justify-center space-y-4">
          <Inbox className="w-16 h-16 text-zinc-600" />
          <div>
            <h3 className="text-base font-bold text-white">Inbox Clean</h3>
            <p className="text-xs text-muted-foreground max-w-sm mt-1 mx-auto font-light">
              No recent notifications matching this filter scope inside your active workspace.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
          {filteredNotifications.map((alert) => {
            const pathLink = resolveDeepLinkPath(alert);
            
            return (
              <div
                key={alert.id}
                onClick={() => handleNotificationClick(alert)}
                className={`p-4 rounded-2xl border flex items-start justify-between gap-4 transition-all duration-300 cursor-pointer ${
                  !alert.isRead
                    ? 'border-blue-500/30 bg-blue-500/5 shadow-lg hover:border-blue-500/60 hover:bg-blue-500/10'
                    : 'border-white/5 bg-zinc-900/40 hover:bg-zinc-900/60 hover:border-zinc-800'
                }`}
              >
                <div className="flex items-start space-x-4 min-w-0">
                  {/* Icon Indicator */}
                  <div className={`p-3 rounded-xl border shrink-0 mt-0.5 ${
                    !alert.isRead
                      ? 'bg-blue-500/10 border-blue-500/20 text-blue-400'
                      : 'bg-zinc-500/5 border-white/5 text-zinc-500'
                  }`}>
                    {getAlertIcon(alert.title, alert.entityType)}
                  </div>

                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className={`text-sm font-extrabold ${!alert.isRead ? 'text-white font-black' : 'text-zinc-300 font-bold'}`}>
                        {alert.title}
                      </p>
                      
                      {/* Priority Tag Badge */}
                      <AlertBadge priority={alert.priority || 'low'} />

                      {!alert.isRead && (
                        <span className="w-2 h-2 rounded-full bg-blue-500 animate-ping shrink-0" />
                      )}
                    </div>
                    
                    <p className="text-xs font-light text-zinc-400 leading-relaxed max-w-2xl">
                      {alert.message}
                    </p>

                    {/* Metadata tags */}
                    <div className="flex flex-wrap items-center gap-3 pt-1 text-[9px] text-zinc-500 font-bold uppercase tracking-wider">
                      <div className="flex items-center space-x-1">
                        <Clock className="w-3 h-3 text-zinc-600" />
                        <span>{new Date(alert.createdAt).toLocaleString()}</span>
                      </div>
                      
                      {alert.entityType && (
                        <span className="text-blue-500 bg-blue-500/10 border border-blue-500/20 px-1.5 py-0.2 rounded text-[8px] font-mono">
                          📁 {alert.entityType}
                        </span>
                      )}

                      {pathLink && (
                        <span className="text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.2 rounded text-[8px] font-mono flex items-center space-x-0.5">
                          <span>🚀 Deep Link Enabled</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-2 self-center shrink-0">
                  <div className="p-1 rounded-lg text-zinc-500 hover:text-white transition group-hover:translate-x-1">
                    <ChevronRight className="w-5 h-5 text-zinc-600" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
export default NotificationCenter;
