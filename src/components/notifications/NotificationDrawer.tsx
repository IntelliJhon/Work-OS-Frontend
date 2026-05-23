import React, { useState } from 'react';
import { X, Bell, CheckCheck, Inbox, Clock, ChevronRight, Filter, ShieldCheck, GitBranch, Activity, MessageSquare } from 'lucide-react';
import type { NotificationPayload } from '../../services/socket/socket-events';
import { AlertBadge } from './AlertBadge';

interface NotificationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: NotificationPayload[];
  unreadCount: number;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onAlertClick: (alert: NotificationPayload) => void;
}

export const NotificationDrawer: React.FC<NotificationDrawerProps> = ({
  isOpen,
  onClose,
  notifications,
  unreadCount,
  onMarkRead,
  onMarkAllRead,
  onAlertClick,
}) => {
  const [priorityFilter, setPriorityFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');

  if (!isOpen) return null;

  // Helper to categorize/enrich priority levels
  const getPriority = (title: string, entityType?: string): 'low' | 'medium' | 'high' => {
    const titleLower = title.toLowerCase();
    const typeLower = entityType?.toLowerCase() || '';
    if (typeLower === 'gate' || titleLower.includes('gate') || titleLower.includes('approve') || titleLower.includes('reject') || titleLower.includes('escalation')) {
      return 'high';
    }
    if (typeLower === 'sprint' || titleLower.includes('sprint') || titleLower.includes('assigned') || titleLower.includes('reassigned')) {
      return 'medium';
    }
    return 'low';
  };

  // Helper to resolve icon based on notification type
  const getAlertIcon = (type: string) => {
    const t = type.toUpperCase();
    if (t.includes('COMMENT') || t.includes('MENTION')) {
      return <MessageSquare className="w-4 h-4 text-purple-400" />;
    }
    if (t.includes('GATE') || t.includes('APPROV') || t.includes('REJECT')) {
      return <ShieldCheck className="w-4 h-4 text-emerald-400" />;
    }
    if (t.includes('SPRINT')) {
      return <Activity className="w-4 h-4 text-indigo-400" />;
    }
    if (t.includes('PHASE') || t.includes('WORKFLOW')) {
      return <GitBranch className="w-4 h-4 text-blue-400" />;
    }
    return <Bell className="w-4 h-4 text-blue-400" />;
  };

  // Filter notifications by priority
  const filteredNotifications = notifications.filter((n) => {
    if (priorityFilter === 'all') return true;
    const p = getPriority(n.title, n.entityType);
    if (priorityFilter === 'high') return p === 'high';
    if (priorityFilter === 'medium') return p === 'medium';
    if (priorityFilter === 'low') return p === 'low';
    return true;
  });

  // Group notifications by Recency: Today, Yesterday, Older
  const groupNotifications = () => {
    const groups: { today: NotificationPayload[]; yesterday: NotificationPayload[]; older: NotificationPayload[] } = {
      today: [],
      yesterday: [],
      older: [],
    };

    const todayDate = new Date();
    const yesterdayDate = new Date();
    yesterdayDate.setDate(todayDate.getDate() - 1);

    filteredNotifications.forEach((n) => {
      const nDate = new Date(n.createdAt);
      if (nDate.toDateString() === todayDate.toDateString()) {
        groups.today.push(n);
      } else if (nDate.toDateString() === yesterdayDate.toDateString()) {
        groups.yesterday.push(n);
      } else {
        groups.older.push(n);
      }
    });

    return groups;
  };

  const { today, yesterday, older } = groupNotifications();

  const handleMarkReadClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    onMarkRead(id);
  };

  const renderNotificationCard = (n: NotificationPayload) => {
    const priority = getPriority(n.title, n.entityType);

    return (
      <div
        key={n.id}
        onClick={() => onAlertClick(n)}
        className={`p-3.5 rounded-2xl border transition-all duration-200 cursor-pointer relative group flex flex-col justify-between ${
          !n.isRead
            ? 'border-blue-500/30 bg-blue-500/[0.04] shadow-[0_4px_12px_rgba(59,130,246,0.05)] hover:border-blue-500/50 hover:bg-blue-500/[0.08]'
            : 'border-border bg-card/60 hover:bg-muted/70 hover:border-border/80'
        }`}
      >
        <div className="flex justify-between items-start gap-2">
          <div className="flex items-start space-x-2.5 min-w-0">
            {/* Type Icon */}
            <div className={`p-2 rounded-lg border shrink-0 mt-0.5 ${
              !n.isRead ? 'bg-blue-500/10 border-blue-500/20 text-blue-400' : 'bg-muted border-border text-muted-foreground'
            }`}>
              {getAlertIcon(n.type)}
            </div>
            <div className="min-w-0">
              <p className={`text-xs font-black truncate leading-tight ${!n.isRead ? 'text-foreground font-black' : 'text-muted-foreground font-bold'}`}>
                {n.title}
              </p>
              <p className="text-[11px] text-muted-foreground font-light mt-1 leading-relaxed line-clamp-2">
                {n.message}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-1.5 shrink-0">
            <AlertBadge priority={priority === 'high' ? 'critical' : priority === 'medium' ? 'warning' : 'info'} />
            
            {!n.isRead && (
              <button
                onClick={(e) => handleMarkReadClick(e, n.id)}
                className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-all duration-150"
                title="Mark as read"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Bottom Area */}
        <div className="flex items-center justify-between mt-2.5 pt-2.5 border-t border-border/40 text-[9px] font-bold text-muted-foreground uppercase tracking-wide">
          <span className="flex items-center space-x-1 font-mono font-light">
            <Clock className="w-3 h-3 text-muted-foreground/60" />
            <span>{new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </span>
          <span className="text-blue-400 flex items-center space-x-0.5">
            <span>Details</span>
            <ChevronRight className="w-2.5 h-2.5" />
          </span>
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Backdrop overlay */}
      <div
        className="fixed inset-0 bg-background/40 backdrop-blur-sm z-40 transition-opacity duration-300"
        onClick={onClose}
      />

      {/* Drawer Body */}
      <div className="fixed inset-y-0 right-0 w-[420px] max-w-full bg-card/75 backdrop-blur-2xl border-l border-border z-50 flex flex-col shadow-[0_0_50px_rgba(0,0,0,0.3)] dark:shadow-[0_0_50px_rgba(0,0,0,0.7)] animate-slide-left overflow-hidden">
        {/* Drawer Header */}
        <div className="p-5 border-b border-border flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 relative">
              <Bell className="w-5 h-5 animate-pulse" />
              {unreadCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-4.5 h-4.5 bg-red-500 rounded-full text-[9px] font-bold text-white flex items-center justify-center border-2 border-card">
                  {unreadCount}
                </span>
              )}
            </div>
            <div>
              <h3 className="text-sm font-black text-foreground">Operational Alert Inbox</h3>
              <p className="text-[10px] text-muted-foreground font-semibold font-mono mt-0.5">
                Real-Time Workflow Escalation
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-1.5">
            {unreadCount > 0 && (
              <button
                onClick={onMarkAllRead}
                className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/25 text-blue-400 hover:bg-blue-500/20 text-xs font-bold flex items-center gap-1 transition"
                title="Mark all as read"
              >
                <CheckCheck className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-lg bg-muted/60 border border-border text-muted-foreground hover:text-foreground transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Priority Filter Selection */}
        <div className="px-5 py-3.5 border-b border-border/50 bg-muted/20 flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground font-black uppercase tracking-wider flex items-center gap-1">
            <Filter className="w-3 h-3 text-muted-foreground/60" />
            <span>Priority Filter</span>
          </span>
          <div className="flex gap-1 bg-muted p-0.5 rounded-lg border border-border">
            {(['all', 'high', 'medium', 'low'] as const).map((pf) => (
              <button
                key={pf}
                onClick={() => setPriorityFilter(pf)}
                className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wide transition ${
                  priorityFilter === pf
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {pf}
              </button>
            ))}
          </div>
        </div>

        {/* Drawer Stream Area */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {filteredNotifications.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-center space-y-3">
              <div className="p-4 rounded-full bg-muted/50 border border-border">
                <Inbox className="w-8 h-8 text-muted-foreground/60" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-foreground">All Clear</h4>
                <p className="text-[10px] text-muted-foreground max-w-[200px] mt-1 font-light leading-normal">
                  No active real-time notifications found in this alert filter range.
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Today Group */}
              {today.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-[9px] font-black text-muted-foreground uppercase tracking-widest flex items-center gap-1.5 pb-1 border-b border-border/40">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                    <span>Today</span>
                  </h4>
                  <div className="space-y-2.5">
                    {today.map(renderNotificationCard)}
                  </div>
                </div>
              )}

              {/* Yesterday Group */}
              {yesterday.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-[9px] font-black text-muted-foreground uppercase tracking-widest flex items-center gap-1.5 pb-1 border-b border-border/40">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500/50 shrink-0" />
                    <span>Yesterday</span>
                  </h4>
                  <div className="space-y-2.5">
                    {yesterday.map(renderNotificationCard)}
                  </div>
                </div>
              )}

              {/* Older Group */}
              {older.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-[9px] font-black text-muted-foreground uppercase tracking-widest flex items-center gap-1.5 pb-1 border-b border-border/40">
                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-600 shrink-0" />
                    <span>Older</span>
                  </h4>
                  <div className="space-y-2.5">
                    {older.map(renderNotificationCard)}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Drawer Footer link */}
        <div className="p-4 border-t border-border bg-muted/30 text-center">
          <button
            onClick={() => {
              onClose();
              // Full navigation to alerts command center will be done on the parent trigger or by navigating in DashboardLayout
              onAlertClick({} as any); // empty object to signal custom redirection or just let user click the card
            }}
            className="text-[11px] text-blue-400 hover:text-blue-300 hover:underline font-extrabold flex items-center justify-center gap-1 mx-auto"
          >
            <span>Open Advanced Alerts Command Center</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </>
  );
};
