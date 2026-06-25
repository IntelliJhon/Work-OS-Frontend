import React from 'react';
import { Clock, Info, CheckCircle, AlertTriangle, MessageSquare } from 'lucide-react';
import type { ActivityEvent } from '../../store/collaborationStore';
import type { Project } from '../../services/api/projects';

interface TaskActivityFeedProps {
  activities: ActivityEvent[];
  projects: Project[];
}

export const TaskActivityFeed: React.FC<TaskActivityFeedProps> = ({ activities, projects }) => {
  const getIcon = (type: string, severity: string) => {
    if (type === 'task_completed' || type === 'sprint_closed') {
      return <CheckCircle className="w-4 h-4 text-emerald-400" />;
    }
    if (type === 'comment_added') {
      return <MessageSquare className="w-4 h-4 text-blue-400" />;
    }
    if (severity === 'high' || type === 'task_blocked') {
      return <AlertTriangle className="w-4 h-4 text-red-400 animate-pulse" />;
    }
    if (severity === 'medium') {
      return <AlertTriangle className="w-4 h-4 text-amber-400" />;
    }
    return <Info className="w-4 h-4 text-blue-400" />;
  };

  const getRelativeTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 6000);
      
      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${Math.floor(diffMins / 60)}h ago`;
      return date.toLocaleDateString();
    } catch {
      return 'Recent';
    }
  };

  return (
    <div className="glass-panel rounded-2xl border border-border p-4 flex flex-col h-full glow-primary">
      <div className="flex items-center space-x-2 border-b border-border pb-3 mb-3">
        <Clock className="w-4 h-4 text-blue-500 dark:text-blue-400" />
        <span className="text-xs font-bold text-foreground tracking-wider uppercase">Live Activity Stream</span>
        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping ml-auto" />
      </div>

      <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar max-h-[calc(100vh-320px)] pr-1">
        {activities.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-2 border border-dashed border-border rounded-xl">
            <span className="text-[11px] text-muted-foreground font-light">
              No recent board activities.
            </span>
          </div>
        ) : (
          activities.map((act) => {
            const project = projects.find((p) => p.id === act.projectId);
            return (
              <div
                key={act.id}
                className="flex items-start space-x-3 p-2.5 rounded-xl bg-card border border-border hover:bg-muted/40 transition-all text-xs"
              >
                <div className="mt-0.5 flex-shrink-0">
                  {getIcon(act.type, act.severity)}
                </div>
                
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-foreground truncate">{act.title}</span>
                    <span className="text-[9px] text-muted-foreground font-medium whitespace-nowrap">
                      {getRelativeTime(act.createdAt)}
                    </span>
                  </div>
                  
                  <p className="text-[10px] text-muted-foreground font-light leading-relaxed">
                    {act.message}
                  </p>

                  {project && (
                    <div className="text-[8px] uppercase tracking-wider font-extrabold text-blue-500 dark:text-blue-400 truncate mt-1">
                      📂 {project.name}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
