import React from 'react';
import { TaskColumn } from './TaskColumn';
import type { Task } from '../../services/api/tasks.api';
import type { Project, Sprint, Phase } from '../../services/api/projects';
import type { User } from '../../services/api/users';
import { useAuthStore } from '../../store/authStore';

interface TaskBoardProps {
  tasks: Task[];
  projects: Project[];
  sprints: Sprint[];
  phases: Phase[];
  assignees: User[];
  onTaskClick: (task: Task) => void;
  onMoveTask: (taskId: string, fromStatus: string, toStatus: string) => void;
}

export const TaskBoard: React.FC<TaskBoardProps> = ({
  tasks,
  projects,
  sprints,
  phases,
  assignees,
  onTaskClick,
  onMoveTask,
}) => {

  const handleDragStart = (e: React.DragEvent, taskId: string, fromStatus: string) => {
    // Basic task lookup
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    // Check governance rules
    const sprint = sprints.find((s) => s.id === task.sprintId);
    const phase = phases.find((p) => p.id === task.customFields?.phaseId);

    // 1. Closed Sprints governance
    if (sprint && sprint.status === 'closed') {
      e.preventDefault();
      alert(`Governance Alert: Task cannot be moved because sprint "${sprint.name}" is closed and locked.`);
      return;
    }

    // 2. Completed Phase governance
    if (phase && (phase.status === 'completed' || phase.isLocked)) {
      e.preventDefault();
      alert(`Governance Alert: Task cannot be moved because stage phase "${phase.name}" is completed and locked.`);
      return;
    }

    // 3. RBAC update authorization check
    const { user } = useAuthStore.getState();
    const project = projects.find((p) => p.id === task.projectId);
    const isFullAccess = user?.role === 'Admin' || user?.role === 'Project Manager' || project?.pmId === user?.id;
    const isAssignee = task.assigneeId === user?.id;

    if (!isFullAccess && !isAssignee) {
      e.preventDefault();
      alert(`RBAC Security: You do not have permissions to update this task. Only the assigned user or project managers can modify it.`);
      return;
    }

    e.dataTransfer.setData('text/plain', taskId);
    e.dataTransfer.setData('fromStatus', fromStatus);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, toStatus: string) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('text/plain');
    const fromStatus = e.dataTransfer.getData('fromStatus');

    if (!taskId || fromStatus === toStatus) return;

    // Trigger state change
    onMoveTask(taskId, fromStatus, toStatus);
  };

  // Group tasks by their status
  const columns = [
    { id: 'to_do', title: 'To Do' },
    { id: 'in_progress', title: 'In Progress' },
    { id: 'in_review', title: 'In Review' },
    { id: 'done', title: 'Done' },
    { id: 'blocked', title: 'Blocked' },
  ];

  return (
    <div className="flex flex-row gap-4 overflow-x-auto pb-4 w-full scrollbar-thin">
      {columns.map((col) => {
        const colTasks = tasks.filter((t) => {
          // Normalize to match db/schema columns
          if (!t.status) return col.id === 'to_do';
          return t.status === col.id;
        });

        return (
          <TaskColumn
            key={col.id}
            id={col.id}
            title={col.title}
            tasks={colTasks}
            projects={projects}
            sprints={sprints}
            phases={phases}
            assignees={assignees}
            onTaskClick={onTaskClick}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          />
        );
      })}
    </div>
  );
};
