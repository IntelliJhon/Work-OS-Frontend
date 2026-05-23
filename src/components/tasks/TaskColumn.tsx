import React from 'react';
import { TaskCard } from './TaskCard';
import type { Task } from '../../services/api/tasks.api';
import type { Project, Sprint, Phase } from '../../services/api/projects';
import type { User } from '../../services/api/users';

interface TaskColumnProps {
  id: string;
  title: string;
  tasks: Task[];
  projects: Project[];
  sprints: Sprint[];
  phases: Phase[];
  assignees: User[];
  onTaskClick: (task: Task) => void;
  onDragStart: (e: React.DragEvent, taskId: string, fromStatus: string) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, toStatus: string) => void;
}

export const TaskColumn: React.FC<TaskColumnProps> = ({
  id,
  title,
  tasks,
  projects,
  sprints,
  phases,
  assignees,
  onTaskClick,
  onDragStart,
  onDragOver,
  onDrop,
}) => {
  const [isDragOver, setIsDragOver] = React.useState(false);

  // Calculate sum of story points
  const totalStoryPoints = React.useMemo(() => {
    return tasks.reduce((sum, t) => sum + (t.customFields?.storyPoints || 0), 0);
  }, [tasks]);

  const handleDragOverLocal = (e: React.DragEvent) => {
    onDragOver(e);
    setIsDragOver(true);
  };

  const handleDragLeaveLocal = () => {
    setIsDragOver(false);
  };

  const handleDropLocal = (e: React.DragEvent) => {
    onDrop(e, id);
    setIsDragOver(false);
  };

  // Status-specific styles
  const headerStyles = {
    to_do: 'border-l-2 border-zinc-500 bg-zinc-500/5',
    in_progress: 'border-l-2 border-blue-500 bg-blue-500/5',
    in_review: 'border-l-2 border-purple-500 bg-purple-500/5',
    done: 'border-l-2 border-emerald-500 bg-emerald-500/5',
    blocked: 'border-l-2 border-red-500 bg-red-500/5',
  };

  const countBadgeStyles = {
    to_do: 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border border-zinc-500/25',
    in_progress: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/25',
    in_review: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/25',
    done: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25',
    blocked: 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/25',
  };

  return (
    <div
      onDragOver={handleDragOverLocal}
      onDragLeave={handleDragLeaveLocal}
      onDrop={handleDropLocal}
      className={`flex flex-col h-[calc(100vh-320px)] min-h-[450px] w-[280px] md:w-[320px] shrink-0 rounded-2xl border transition-all duration-300 ${
        isDragOver
          ? 'bg-muted/50 border-blue-500/30 shadow-[inset_0_0_15px_rgba(59,130,246,0.05)] scale-[0.99]'
          : 'bg-card/50 border-border'
      }`}
    >
      {/* Column Header */}
      <div
        className={`flex items-center justify-between p-3.5 border-b border-border rounded-t-2xl ${
          headerStyles[id as keyof typeof headerStyles] || 'border-l-2 border-zinc-500'
        }`}
      >
        <div className="flex items-center space-x-2">
          <span className="text-xs font-bold text-foreground tracking-wide">{title}</span>
          <span
            className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded ${
              countBadgeStyles[id as keyof typeof countBadgeStyles] || 'bg-zinc-500/10 text-zinc-400'
            }`}
          >
            {tasks.length}
          </span>
        </div>

        {totalStoryPoints > 0 && (
          <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest bg-muted px-2 py-0.5 rounded">
            {totalStoryPoints} SP
          </span>
        )}
      </div>

      {/* Cards List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
        {tasks.length === 0 ? (
          <div className="h-full flex items-center justify-center border border-dashed border-border rounded-xl p-4">
            <span className="text-[10px] text-muted-foreground font-light tracking-wide text-center">
              No tasks
            </span>
          </div>
        ) : (
          tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              projects={projects}
              sprints={sprints}
              phases={phases}
              assignees={assignees}
              onClick={() => onTaskClick(task)}
              onDragStart={onDragStart}
            />
          ))
        )}
      </div>
    </div>
  );
};
