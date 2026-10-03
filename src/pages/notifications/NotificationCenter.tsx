import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { notificationsApi } from '../../services/api/notifications';
import { projectsApi } from '../../services/api/projects';
import type { Project } from '../../services/api/projects';
import { Bell, CheckCheck, CheckSquare, ChevronRight, Clock, FolderKanban, Inbox, Mic, Plane, ShieldCheck, CalendarCheck } from 'lucide-react';

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

type Category = 'tasks' | 'reminders' | 'leave' | 'approvals' | 'projects' | 'attendance' | 'voice' | 'other';

const CATEGORIES: Record<Category, { label: string; icon: React.ElementType; tone: string }> = {
  tasks: { label: 'Tasks', icon: CheckSquare, tone: 'text-blue-600 dark:text-blue-400 bg-blue-500/10' },
  reminders: { label: 'Reminders', icon: Clock, tone: 'text-amber-600 dark:text-amber-400 bg-amber-500/10' },
  leave: { label: 'Leave', icon: Plane, tone: 'text-sky-600 dark:text-sky-400 bg-sky-500/10' },
  approvals: { label: 'Approvals', icon: ShieldCheck, tone: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10' },
  projects: { label: 'Projects', icon: FolderKanban, tone: 'text-indigo-600 dark:text-indigo-400 bg-indigo-500/10' },
  attendance: { label: 'Attendance', icon: CalendarCheck, tone: 'text-teal-600 dark:text-teal-400 bg-teal-500/10' },
  voice: { label: 'Voice notes', icon: Mic, tone: 'text-fuchsia-600 dark:text-fuchsia-400 bg-fuchsia-500/10' },
  other: { label: 'Other', icon: Bell, tone: 'text-slate-600 dark:text-slate-300 bg-slate-500/10' },
};

/** Which kind of notification this is, from its type and what it points to */
function categoryOf(n: NotificationPayloadEnriched): Category {
  const type = (n.type || '').toLowerCase();
  const entity = (n.entityType || '').toLowerCase();
  const title = (n.title || '').toLowerCase();
  if (entity === 'leave' || type.startsWith('leave')) return 'leave';
  if (entity === 'reminder' || type.includes('reminder') || title.startsWith('reminder')) return 'reminders';
  if (entity === 'task') return 'tasks';
  if (entity === 'gate' || title.includes('gate') || title.includes('approv') || title.includes('reject')) return 'approvals';
  if (['phase', 'sprint', 'activity', 'project'].includes(entity)) return 'projects';
  if (entity === 'attendance' || type.startsWith('attendance')) return 'attendance';
  if (entity.includes('voice') || type.includes('voice')) return 'voice';
  return 'other';
}

const important = (n: NotificationPayloadEnriched) => ['critical', 'high'].includes((n.priority || '').toLowerCase());

/** "just now", "5 min ago", "3 h ago", "yesterday, 4:30 pm", "29 Sept, 4:30 pm" */
function relativeTime(iso: string, now = Date.now()): string {
  const at = new Date(iso);
  const diff = now - at.getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} min ago`;
  if (diff < 6 * 3600_000) return `${Math.floor(diff / 3600_000)} h ago`;
  const time = at.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  if (dayGroup(iso, now) === 'Today') return `today, ${time}`;
  if (dayGroup(iso, now) === 'Yesterday') return `yesterday, ${time}`;
  return `${at.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}, ${time}`;
}

function dayGroup(iso: string, now = Date.now()): string {
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((start(new Date(now)) - start(new Date(iso))) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return 'Earlier this week';
  return 'Older';
}

export const NotificationCenter: React.FC = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<'all' | 'unread' | Category>('all');

  const { data: notifications = [], isLoading } = useQuery<NotificationPayloadEnriched[]>({
    queryKey: ['notifications'],
    queryFn: notificationsApi.list,
  });

  // Projects only to open project notifications at the right project (fails quietly when Projects is off)
  const { data: projects = [] } = useQuery<Project[]>({ queryKey: ['projects'], queryFn: projectsApi.list, retry: false });

  const refreshCounts = () => {
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
    queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });
  };
  const markReadMutation = useMutation({ mutationFn: notificationsApi.markRead, onSuccess: refreshCounts });
  const markAllReadMutation = useMutation({ mutationFn: notificationsApi.markAllRead, onSuccess: refreshCounts });

  const parseMetadata = (meta: any): any => {
    if (!meta) return null;
    if (typeof meta === 'string') {
      try {
        return JSON.parse(meta);
      } catch {
        return null;
      }
    }
    return meta;
  };

  // Where a notification leads
  const resolveDeepLinkPath = (alert: NotificationPayloadEnriched): string | null => {
    if (alert.entityType === 'leave') return alert.type === 'leave_request' ? '/leave?tab=approvals' : '/leave';
    if (alert.entityType === 'reminder' && alert.entityId) return `/reminders/${alert.entityId}`;
    if (!alert.entityType || !alert.entityId) {
      if (projects.length > 0) {
        return `/projects/${projects[0].id}/scopes`;
      }
      return null;
    }

    const type = alert.entityType.toLowerCase();
    const id = alert.entityId;
    const parsed = parseMetadata(alert.metadata);

    if (type === 'phase') {
      const proj = projects.find((p) => p.phases?.some((ph) => ph.id === id)) ||
                   (parsed?.projectId ? projects.find(p => p.id === parsed.projectId) : null);
      if (proj) return `/projects/${proj.id}/scopes`;
    }
    if (type === 'sprint') {
      const proj = projects.find((p) => p.sprints?.some((sp) => sp.id === id)) ||
                   (parsed?.projectId ? projects.find(p => p.id === parsed.projectId) : null);
      if (proj) return `/projects/${proj.id}/activities`;
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
        return `/projects/${projectId}/activities`;
      }
      if (createdFrom === 'sidebar') {
        return `/dashboard/tasks`;
      }
      const sprintId = parsed?.sprintId;
      if (sprintId && projectId) {
        return `/projects/${projectId}/activities`;
      }
      return `/dashboard/tasks`;
    }

    if (projects.length > 0) {
      const pId = parsed?.projectId || projects[0].id;
      return `/projects/${pId}/${type === 'gate' ? 'gates' : (type === 'sprint' || type === 'activity') ? 'activities' : 'scopes'}`;
    }
    return null;
  };

  const open = (alert: NotificationPayloadEnriched) => {
    if (!alert.isRead) markReadMutation.mutate(alert.id);
    const linkPath = resolveDeepLinkPath(alert);
    if (linkPath) navigate(linkPath);
  };

  const items = useMemo(() => notifications.map((n) => ({ ...n, category: categoryOf(n) })), [notifications]);
  const unreadCount = items.filter((n) => !n.isRead).length;
  // Only the kinds this person actually has
  const present = useMemo(() => {
    const counts = new Map<Category, number>();
    for (const n of items) counts.set(n.category, (counts.get(n.category) ?? 0) + 1);
    return (Object.keys(CATEGORIES) as Category[]).filter((c) => counts.has(c)).map((c) => ({ c, count: counts.get(c)! }));
  }, [items]);

  const shown = items.filter((n) => (filter === 'all' ? true : filter === 'unread' ? !n.isRead : n.category === filter));
  const groups = useMemo(() => {
    const out: { label: string; items: typeof shown }[] = [];
    for (const n of shown) {
      const label = dayGroup(n.createdAt);
      const last = out[out.length - 1];
      if (last?.label === label) last.items.push(n);
      else out.push({ label, items: [n] });
    }
    return out;
  }, [shown]);

  const chip = (active: boolean) =>
    `flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors whitespace-nowrap cursor-pointer ${
      active ? 'bg-blue-600 border-blue-600 text-white' : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted'
    }`;

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="p-2 rounded-xl bg-blue-500/10 text-blue-500 border border-blue-500/20">
            <Bell className="w-5 h-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Notifications</h1>
            <p className="text-xs text-muted-foreground mt-1">
              {unreadCount ? `${unreadCount} unread. ` : "You're all caught up. "}Click a notification to open it.
            </p>
          </div>
        </div>
        {unreadCount > 0 && (
          <button
            type="button" onClick={() => markAllReadMutation.mutate()} disabled={markAllReadMutation.isPending}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-border text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50 cursor-pointer"
          >
            <CheckCheck className="w-4 h-4" /> Mark all as read
          </button>
        )}
      </div>

      <div role="tablist" aria-label="Filter notifications" className="flex gap-2 overflow-x-auto pb-1">
        <button type="button" role="tab" aria-selected={filter === 'all'} onClick={() => setFilter('all')} className={chip(filter === 'all')}>
          All <span className="opacity-70">{items.length}</span>
        </button>
        <button type="button" role="tab" aria-selected={filter === 'unread'} onClick={() => setFilter('unread')} className={chip(filter === 'unread')}>
          Unread <span className="opacity-70">{unreadCount}</span>
        </button>
        {present.map(({ c, count }) => (
          <button key={c} type="button" role="tab" aria-selected={filter === c} onClick={() => setFilter(c)} className={chip(filter === c)}>
            {CATEGORIES[c].label} <span className="opacity-70">{count}</span>
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />)}
        </div>
      ) : shown.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-12 text-center">
          <Inbox className="w-10 h-10 text-muted-foreground mx-auto" />
          <p className="text-sm font-semibold text-foreground mt-3">{filter === 'unread' ? 'No unread notifications' : 'Nothing here yet'}</p>
          <p className="text-xs text-muted-foreground mt-1">New tasks, reminders, leave requests and approvals will show up here.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <section key={g.label} aria-label={g.label}>
              <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">{g.label}</h2>
              <ul className="rounded-2xl border border-border bg-card divide-y divide-border overflow-hidden">
                {g.items.map((n) => {
                  const cat = CATEGORIES[n.category];
                  const Icon = cat.icon;
                  return (
                    <li key={n.id}>
                      <div
                        role="button" tabIndex={0}
                        onClick={() => open(n)}
                        onKeyDown={(e) => { if (e.key === 'Enter') open(n); }}
                        className={`group flex items-start gap-3 px-4 py-3.5 cursor-pointer transition-colors hover:bg-muted/60 focus:outline-none focus-visible:bg-muted ${
                          n.isRead ? '' : 'bg-blue-500/[0.04]'
                        }`}
                      >
                        <span className={`relative p-2 rounded-xl shrink-0 ${cat.tone}`}>
                          <Icon className="w-4 h-4" />
                          {!n.isRead && <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-blue-500 ring-2 ring-card" aria-label="Unread" />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            <p className={`text-sm text-foreground ${n.isRead ? 'font-medium' : 'font-bold'}`}>{n.title}</p>
                            {important(n) && (
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-red-500/10 text-red-600 dark:text-red-400">Important</span>
                            )}
                          </div>
                          {n.message && <p className="text-xs text-muted-foreground mt-0.5 break-words">{n.message}</p>}
                          <p className="text-[11px] text-muted-foreground mt-1" title={new Date(n.createdAt).toLocaleString('en-IN')}>
                            {cat.label} · {relativeTime(n.createdAt)}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 self-center shrink-0">
                          {!n.isRead && (
                            <button
                              type="button" title="Mark as read" aria-label="Mark as read"
                              onClick={(e) => { e.stopPropagation(); markReadMutation.mutate(n.id); }}
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-background opacity-0 group-hover:opacity-100 focus:opacity-100 cursor-pointer"
                            >
                              <CheckCheck className="w-4 h-4" />
                            </button>
                          )}
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
};
export default NotificationCenter;
