import React from 'react';
import { motion } from 'framer-motion';
import { Calendar, CheckSquare, AlertTriangle, User as UserIcon } from 'lucide-react';
import type { Task } from '../../services/api/tasks.api';
import type { Project, Sprint, Phase } from '../../services/api/projects';
import type { User } from '../../services/api/users';
import { useAuthStore } from '../../store/authStore';

interface TaskCardProps {
  task: Task;
  projects: Project[];
  sprints: Sprint[];
  phases: Phase[];
  assignees: User[];
  onClick: () => void;
  onDragStart: (e: React.DragEvent, taskId: string, fromStatus: string) => void;
}

export const TaskCard: React.FC<TaskCardProps> = ({
  task,
  projects,
  sprints,
  phases,
  assignees,
  onClick,
  onDragStart,
}) => {
  const project = projects.find((p) => p.id === task.projectId);
  const sprint = sprints.find((s) => s.id === task.sprintId);
  const phase = phases.find((p) => p.id === task.customFields?.phaseId);
  const assignee = assignees.find((u) => u.id === task.assigneeId);

  const { user } = useAuthStore();
  const isFullAccess = user?.role === 'Admin' || user?.role === 'Project Manager' || project?.pmId === user?.id;
  const isAssignee = task.assigneeId === user?.id;
  const canDrag = isFullAccess || isAssignee;

  const priority = task.customFields?.priority || 'medium';
  const dueDate = task.customFields?.dueDate;
  const storyPoints = task.customFields?.storyPoints || 0;
  const subtasks = task.customFields?.subtasks || [];
  const completedSubtasks = subtasks.filter((s) => s.done).length;

  const isBlocked = task.status === 'blocked';
  const isCompleted = task.status === 'done';
  
  // Calculate if overdue
  const isOverdue = React.useMemo(() => {
    if (!dueDate || isCompleted) return false;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const due = new Date(dueDate);
    due.setHours(0, 0, 0, 0);
    return due < now;
  }, [dueDate, isCompleted]);

  // HSL avatar background
  const getAvatarBg = (email: string) => {
    let sum = 0;
    for (let i = 0; i < email.length; i++) sum += email.charCodeAt(i);
    const colors = [
      'bg-red-500/10 dark:bg-red-500/20 border-red-500/30 dark:border-red-500/40 text-red-600 dark:text-red-300',
      'bg-blue-500/10 dark:bg-blue-500/20 border-blue-500/30 dark:border-blue-500/40 text-blue-600 dark:text-blue-300',
      'bg-indigo-500/10 dark:bg-indigo-500/20 border-indigo-500/30 dark:border-indigo-500/40 text-indigo-600 dark:text-indigo-300',
      'bg-emerald-500/10 dark:bg-emerald-500/20 border-emerald-500/30 dark:border-emerald-500/40 text-emerald-600 dark:text-emerald-300',
      'bg-amber-500/10 dark:bg-amber-500/20 border-amber-500/30 dark:border-amber-500/40 text-amber-600 dark:text-amber-300',
      'bg-purple-500/10 dark:bg-purple-500/20 border-purple-500/30 dark:border-purple-500/40 text-purple-600 dark:text-purple-300',
    ];
    return colors[sum % colors.length];
  };

  const getInitials = (userObj?: User) => {
    if (!userObj) return '?';
    return `${userObj.firstName[0] || ''}${userObj.lastName[0] || ''}`.toUpperCase();
  };

  // Border and glow colors based on task state
  let cardClass = 'border-border/60 hover:border-border bg-card/40';
  let glowClass = 'hover:shadow-[0_0_15px_rgba(0,0,0,0.03)] dark:hover:shadow-[0_0_15px_rgba(255,255,255,0.03)]';

  if (isBlocked) {
    cardClass = 'border-red-500/30 hover:border-red-500/50 bg-red-500/5';
    glowClass = 'shadow-[0_0_10px_rgba(239,68,68,0.1)] hover:shadow-[0_0_20px_rgba(239,68,68,0.2)]';
  } else if (isOverdue) {
    cardClass = 'border-amber-500/30 hover:border-amber-500/50 bg-amber-500/5';
    glowClass = 'shadow-[0_0_10px_rgba(245,158,11,0.1)] hover:shadow-[0_0_20px_rgba(245,158,11,0.2)]';
  } else if (isCompleted) {
    cardClass = 'border-emerald-500/20 hover:border-emerald-500/30 bg-emerald-500/5 opacity-75 hover:opacity-100';
    glowClass = 'hover:shadow-[0_0_15px_rgba(16,185,129,0.05)]';
  } else if (task.status === 'in_progress') {
    cardClass = 'border-blue-500/25 hover:border-blue-500/45 bg-blue-500/5';
    glowClass = 'shadow-[0_0_10px_rgba(59,130,246,0.05)] hover:shadow-[0_0_20px_rgba(59,130,246,0.15)]';
  }

  const priorityColors = {
    low: 'text-zinc-600 dark:text-slate-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-500/10 border-zinc-200 dark:border-zinc-500/20',
    medium: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 border-blue-100 dark:border-blue-500/20',
    high: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 border-amber-100 dark:border-amber-500/20',
    critical: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border-red-100 dark:border-red-500/20 animate-pulse',
  };

  return (
    <motion.div
      layoutId={`task-${task.id}`}
      draggable={canDrag}
      onDragStart={(e) => canDrag && onDragStart(e as any, task.id, task.status)}
      onClick={onClick}
      className={`glass-panel border p-4 rounded-xl transition-all duration-300 select-none relative overflow-hidden group ${cardClass} ${glowClass} ${
        canDrag ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'
      }`}
      whileHover={canDrag ? { y: -3, scale: 1.01 } : {}}
      transition={{ duration: 0.2 }}
    >
      {/* Visual State Indicators */}
      {isBlocked && (
        <div className="absolute top-0 right-0 left-0 h-0.5 bg-red-500/60" />
      )}
      {isOverdue && (
        <div className="absolute top-0 right-0 left-0 h-0.5 bg-amber-500/60 animate-pulse" />
      )}

      <div className="space-y-3">
        {/* Project Name and Priority Badge */}
        <div className="flex items-center justify-between gap-2">
          {project?.name ? (
            <span className="text-[10px] font-extrabold text-blue-600 dark:text-blue-400 uppercase tracking-widest truncate max-w-[140px]">
              💼 {project.name}
            </span>
          ) : (
            <div />
          )}
          <span
            className={`text-[8px] uppercase tracking-wider font-extrabold px-1.5 py-0.5 rounded border ${
              priorityColors[priority as keyof typeof priorityColors] || priorityColors.medium
            }`}
          >
            {priority}
          </span>
        </div>

        {/* Task Name */}
        <div>
          <h5 className="text-xs font-bold text-foreground leading-relaxed group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
            {task.name}
          </h5>
          {task.description && (
            <p className="text-[10px] text-muted-foreground line-clamp-2 mt-1 font-light">
              {task.description}
            </p>
          )}
        </div>

        {/* Phase and Sprint badges */}
        <div className="flex flex-wrap gap-1.5">
          {sprint && (
            <span className="text-[9px] font-medium text-muted-foreground bg-muted border border-border px-2 py-0.5 rounded-md">
              🔄 {sprint.name}
            </span>
          )}
          {phase && (
            <span className="text-[9px] font-medium text-purple-600 dark:text-purple-300 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded-md">
              🔑 {phase.name}
            </span>
          )}
        </div>

        {/* Footer info: Subtasks, Due Date, Points, Assignee */}
        <div className="flex items-center justify-between border-t border-border pt-2.5 mt-1 text-[10px] text-muted-foreground">
          <div className="flex items-center space-x-2.5">
            {/* Subtask progress */}
            {subtasks.length > 0 && (
              <span className="flex items-center space-x-1 text-muted-foreground" title="Subtasks Checklist">
                <CheckSquare className="w-3.5 h-3.5 text-blue-500" />
                <span>
                  {completedSubtasks}/{subtasks.length}
                </span>
              </span>
            )}

            {/* Due date */}
            {dueDate && (
              <span
                className={`flex items-center space-x-1 ${
                  isOverdue ? 'text-amber-600 dark:text-amber-400 font-semibold' : 'text-muted-foreground'
                }`}
                title="Due Date"
              >
                <Calendar className="w-3 h-3" />
                <span>{new Date(dueDate).toLocaleDateString()}</span>
                {isOverdue && <AlertTriangle className="w-3 h-3 text-amber-600 dark:text-amber-400" />}
              </span>
            )}
          </div>

          <div className="flex items-center space-x-2">
            {/* Story Points */}
            {storyPoints > 0 && (
              <span
                className="px-1.5 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 text-[9px] font-bold"
                title="Story Points"
              >
                {storyPoints} SP
              </span>
            )}

            {/* Assignee Avatar */}
            <div className="relative">
              {assignee ? (
                <div
                  className={`w-6 h-6 rounded-full border flex items-center justify-center text-[9px] font-bold ${getAvatarBg(
                    assignee.email
                  )}`}
                  title={`${assignee.firstName} ${assignee.lastName} (${assignee.email})`}
                >
                  {getInitials(assignee)}
                </div>
              ) : (
                <div
                  className="w-6 h-6 rounded-full border border-dashed border-border flex items-center justify-center bg-muted text-muted-foreground"
                  title="Unassigned"
                >
                  <UserIcon className="w-3 h-3" />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
