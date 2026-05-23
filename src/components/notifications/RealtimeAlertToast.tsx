import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, ChevronRight, Sparkles, AlertTriangle, ShieldCheck, GitBranch, Activity, MessageSquare } from 'lucide-react';
import { playNotificationSound } from './AlertSoundManager';

export interface ToastAlert {
  id: string;
  title: string;
  message: string;
  priority: string;
  type: string;
  entityType?: string;
  entityId?: string;
  createdAt: string;
  metadata?: any;
}

let globalTriggerToast: ((toast: Omit<ToastAlert, 'id' | 'createdAt'>) => void) | null = null;

export const triggerRealtimeToast = (toast: Omit<ToastAlert, 'id' | 'createdAt'>) => {
  if (globalTriggerToast) {
    globalTriggerToast(toast);
  }
};

export const RealtimeAlertToast: React.FC = () => {
  const [toasts, setToasts] = useState<ToastAlert[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    globalTriggerToast = (newToast) => {
      const id = Math.random().toString(36).substring(2, 9);
      const createdAt = new Date().toISOString();
      const toastItem: ToastAlert = { ...newToast, id, createdAt };

      // Play matching enterprise synthesized chime
      playNotificationSound(newToast.priority || 'info');

      // Append new toast to the list
      setToasts((prev) => [toastItem, ...prev].slice(0, 5)); // Keep max 5 concurrent toasts

      // Auto dismiss after 6 seconds
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 6000);
    };

    return () => {
      globalTriggerToast = null;
    };
  }, []);

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

  const handleToastClick = (toast: ToastAlert) => {
    setToasts((prev) => prev.filter((t) => t.id !== toast.id));
    
    // Resolve deep-linking navigation path
    if (!toast.entityType || !toast.entityId) {
      navigate('/notifications');
      return;
    }

    const type = toast.entityType.toLowerCase();
    const parsed = parseMetadata(toast.metadata);
    const projectId = parsed?.projectId;

    if (type === 'phase') {
      if (projectId) {
        navigate(`/projects/${projectId}/workflow`);
      } else {
        navigate(`/dashboard/workflow`);
      }
    } else if (type === 'sprint') {
      if (projectId) {
        navigate(`/projects/${projectId}/sprints`);
      } else {
        navigate(`/dashboard/sprints`);
      }
    } else if (type === 'gate') {
      if (projectId) {
        navigate(`/projects/${projectId}/gates`);
      } else {
        navigate(`/dashboard/gates`);
      }
    } else if (type === 'task') {
      const createdFrom = parsed?.createdFrom;
      if (createdFrom === 'sprint' && projectId) {
        navigate(`/projects/${projectId}/sprints`);
      } else {
        navigate(`/dashboard/tasks`);
      }
    } else {
      navigate(`/notifications`);
    }
  };

  const getAlertIcon = (type: string) => {
    const t = type.toUpperCase();
    if (t.includes('COMMENT') || t.includes('MENTION')) {
      return <MessageSquare className="w-5 h-5 text-purple-400" />;
    }
    if (t.includes('GATE') || t.includes('APPROV') || t.includes('REJECT')) {
      return <ShieldCheck className="w-5 h-5 text-emerald-400 animate-pulse" />;
    }
    if (t.includes('SPRINT')) {
      return <Activity className="w-5 h-5 text-indigo-400" />;
    }
    if (t.includes('PHASE') || t.includes('WORKFLOW')) {
      return <GitBranch className="w-5 h-5 text-blue-400" />;
    }
    if (t.includes('BLOCK') || t.includes('ESCALATION') || t.includes('REMEDIATION')) {
      return <AlertTriangle className="w-5 h-5 text-red-400 animate-bounce" />;
    }
    return <Sparkles className="w-5 h-5 text-blue-400" />;
  };

  const getPriorityBorder = (priority: string) => {
    const p = priority?.toLowerCase() || '';
    if (p === 'critical' || p === 'high') {
      return 'border-red-500/40 shadow-[0_0_20px_rgba(239,68,68,0.15)] bg-red-500/[0.04]';
    }
    if (p === 'warning' || p === 'medium') {
      return 'border-amber-500/40 shadow-[0_0_20px_rgba(245,158,11,0.1)] bg-amber-500/[0.03]';
    }
    if (p === 'success') {
      return 'border-emerald-500/40 shadow-[0_0_20px_rgba(16,185,129,0.1)] bg-emerald-500/[0.03]';
    }
    return 'border-blue-500/40 shadow-[0_0_20px_rgba(59,130,246,0.1)] bg-blue-500/[0.03]';
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 w-[360px] max-w-[calc(100vw-3rem)]">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`glass-panel-heavy border rounded-2xl p-4 flex gap-3.5 relative overflow-hidden transition-all duration-300 animate-slide-in cursor-pointer select-none group ${getPriorityBorder(
            toast.priority
          )}`}
          onClick={() => handleToastClick(toast)}
        >
          {/* Top colored accent glow bar */}
          <div
            className={`absolute top-0 left-0 right-0 h-[2.5px] ${
              toast.priority === 'critical' || toast.priority === 'high'
                ? 'bg-red-500'
                : toast.priority === 'warning' || toast.priority === 'medium'
                ? 'bg-amber-500'
                : toast.priority === 'success'
                ? 'bg-emerald-500'
                : 'bg-blue-500'
            }`}
          />

          {/* Left Icon Area */}
          <div className="flex-shrink-0 mt-0.5">
            <div className="p-2 rounded-xl bg-card border border-border/80 flex items-center justify-center">
              {getAlertIcon(toast.type)}
            </div>
          </div>

          {/* Core Content */}
          <div className="flex-1 min-w-0 pr-4">
            <div className="flex items-center gap-1.5 mb-0.5">
              <span
                className={`text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded font-mono shrink-0 border ${
                  toast.priority === 'critical' || toast.priority === 'high'
                    ? 'bg-red-500/10 border-red-500/25 text-red-400'
                    : toast.priority === 'warning' || toast.priority === 'medium'
                    ? 'bg-amber-500/10 border-amber-500/25 text-amber-400'
                    : toast.priority === 'success'
                    ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400'
                    : 'bg-blue-500/10 border-blue-500/25 text-blue-400'
                }`}
              >
                {toast.priority || 'info'}
              </span>
              <p className="text-[10px] text-muted-foreground font-semibold font-mono">
                Real-Time Alert
              </p>
            </div>

            <p className="text-xs font-black text-foreground truncate group-hover:text-blue-400 transition-colors">
              {toast.title}
            </p>
            <p className="text-[11px] text-muted-foreground font-light mt-1 line-clamp-2 leading-relaxed">
              {toast.message}
            </p>

            {/* Quick CTA */}
            <div className="mt-2 pt-2 border-t border-border/40 flex items-center justify-end text-[9px] font-bold text-blue-400">
              <span>View Details</span>
              <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
            </div>
          </div>

          {/* Close trigger button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setToasts((prev) => prev.filter((t) => t.id !== toast.id));
            }}
            className="absolute top-3.5 right-3.5 p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-all opacity-0 group-hover:opacity-100"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
};
