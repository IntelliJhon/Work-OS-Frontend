import React, { useState, useMemo } from 'react';
import { 
  ArrowUp, 
  ArrowDown, 
  ArrowUpDown, 
  CheckSquare, 
  Calendar, 
  AlertTriangle, 
  User as UserIcon,
  CircleDot
} from 'lucide-react';
import type { Task } from '../../services/api/tasks.api';
import type { Project, Sprint, Phase } from '../../services/api/projects';
import type { User } from '../../services/api/users';

interface TaskTableProps {
  tasks: Task[];
  projects: Project[];
  sprints: Sprint[];
  phases: Phase[];
  assignees: User[];
  onTaskClick: (task: Task) => void;
}

type SortField = 'name' | 'project' | 'sprint' | 'status' | 'priority' | 'storyPoints' | 'dueDate';
type SortOrder = 'asc' | 'desc';

export const TaskTable: React.FC<TaskTableProps> = ({
  tasks,
  projects,
  sprints,
  phases,
  assignees,
  onTaskClick,
}) => {
  const [sortField, setSortField] = useState<SortField>('dueDate');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

  // Priority ranking for sorting logic
  const priorityRank = { critical: 4, high: 3, medium: 2, low: 1 };
  
  // Status ranking for sorting logic
  const statusRank = { blocked: 5, in_review: 4, in_progress: 3, to_do: 2, done: 1 };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const sortedTasks = useMemo(() => {
    const sorted = [...tasks];
    
    sorted.sort((a, b) => {
      let valA: any = '';
      let valB: any = '';

      switch (sortField) {
        case 'name':
          valA = a.name.toLowerCase();
          valB = b.name.toLowerCase();
          break;
        case 'project':
          const pA = projects.find(p => p.id === a.projectId)?.name || '';
          const pB = projects.find(p => p.id === b.projectId)?.name || '';
          valA = pA.toLowerCase();
          valB = pB.toLowerCase();
          break;
        case 'sprint':
          const sA = sprints.find(s => s.id === a.sprintId)?.name || '';
          const sB = sprints.find(s => s.id === b.sprintId)?.name || '';
          valA = sA.toLowerCase();
          valB = sB.toLowerCase();
          break;
        case 'status':
          valA = statusRank[a.status as keyof typeof statusRank] || 0;
          valB = statusRank[b.status as keyof typeof statusRank] || 0;
          break;
        case 'priority':
          valA = priorityRank[a.customFields?.priority as keyof typeof priorityRank] || 0;
          valB = priorityRank[b.customFields?.priority as keyof typeof priorityRank] || 0;
          break;
        case 'storyPoints':
          valA = a.customFields?.storyPoints || 0;
          valB = b.customFields?.storyPoints || 0;
          break;
        case 'dueDate':
          valA = a.customFields?.dueDate ? new Date(a.customFields.dueDate).getTime() : Infinity;
          valB = b.customFields?.dueDate ? new Date(b.customFields.dueDate).getTime() : Infinity;
          break;
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return sorted;
  }, [tasks, sortField, sortOrder, projects, sprints]);

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown className="w-3.5 h-3.5 text-slate-500 dark:text-zinc-500 opacity-50" />;
    return sortOrder === 'asc' 
      ? <ArrowUp className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" /> 
      : <ArrowDown className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />;
  };

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

  const priorityColors = {
    low: 'text-zinc-600 dark:text-slate-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-500/10 border-zinc-200 dark:border-zinc-500/20',
    medium: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 border-blue-100 dark:border-blue-500/20',
    high: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 border-amber-100 dark:border-amber-500/20',
    critical: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border-red-100 dark:border-red-500/20 animate-pulse',
  };

  const statusColors = {
    to_do: 'text-zinc-600 dark:text-slate-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-500/10 border-zinc-200 dark:border-zinc-500/20',
    in_progress: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 border-blue-100 dark:border-blue-500/20',
    in_review: 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-500/10 border-purple-100 dark:border-purple-500/20',
    done: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 border-emerald-100 dark:border-emerald-500/20',
    blocked: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border-red-100 dark:border-red-500/20',
  };

  const statusLabels = {
    to_do: 'To Do',
    in_progress: 'In Progress',
    in_review: 'In Review',
    done: 'Done',
    blocked: 'Blocked',
  };

  return (
    <div className="w-full glass-panel border border-border rounded-2xl overflow-hidden">
      <div className="overflow-x-auto w-full scrollbar-thin">
        <table className="w-full text-left border-collapse min-w-[1000px]">
          {/* Header Row */}
          <thead>
            <tr className="border-b border-border bg-muted/40 text-[10px] font-bold text-muted-foreground uppercase tracking-wider select-none">
              <th className="py-4 px-5 cursor-pointer hover:text-foreground transition-colors" onClick={() => handleSort('name')}>
                <div className="flex items-center space-x-1.5">
                  <span>Task Name</span>
                  {getSortIcon('name')}
                </div>
              </th>
              <th className="py-4 px-4 cursor-pointer hover:text-foreground transition-colors" onClick={() => handleSort('project')}>
                <div className="flex items-center space-x-1.5">
                  <span>Project</span>
                  {getSortIcon('project')}
                </div>
              </th>
              <th className="py-4 px-4 cursor-pointer hover:text-foreground transition-colors" onClick={() => handleSort('sprint')}>
                <div className="flex items-center space-x-1.5">
                  <span>Sprint</span>
                  {getSortIcon('sprint')}
                </div>
              </th>
              <th className="py-4 px-4">Phase</th>
              <th className="py-4 px-4">Assignee</th>
              <th className="py-4 px-4 cursor-pointer hover:text-foreground transition-colors" onClick={() => handleSort('status')}>
                <div className="flex items-center space-x-1.5">
                  <span>Status</span>
                  {getSortIcon('status')}
                </div>
              </th>
              <th className="py-4 px-4 cursor-pointer hover:text-foreground transition-colors" onClick={() => handleSort('priority')}>
                <div className="flex items-center space-x-1.5">
                  <span>Priority</span>
                  {getSortIcon('priority')}
                </div>
              </th>
              <th className="py-4 px-4 cursor-pointer hover:text-foreground transition-colors text-center" onClick={() => handleSort('storyPoints')}>
                <div className="flex items-center space-x-1.5 justify-center">
                  <span>Story Points</span>
                  {getSortIcon('storyPoints')}
                </div>
              </th>
              <th className="py-4 px-5 cursor-pointer hover:text-foreground transition-colors" onClick={() => handleSort('dueDate')}>
                <div className="flex items-center space-x-1.5">
                  <span>Due Date</span>
                  {getSortIcon('dueDate')}
                </div>
              </th>
            </tr>
          </thead>

          {/* Table Body */}
          <tbody className="divide-y divide-border text-xs text-foreground/90">
            {sortedTasks.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-12 text-center text-muted-foreground font-light tracking-wide">
                  No tasks matched your operational filters.
                </td>
              </tr>
            ) : (
              sortedTasks.map((task) => {
                const project = projects.find(p => p.id === task.projectId);
                const sprint = sprints.find(s => s.id === task.sprintId);
                const phase = phases.find(p => p.id === task.customFields?.phaseId);
                const assignee = assignees.find(u => u.id === task.assigneeId);
                const isOverdue = task.customFields?.dueDate && task.status !== 'done' && new Date(task.customFields.dueDate) < new Date();

                return (
                  <tr 
                    key={task.id}
                    onClick={() => onTaskClick(task)}
                    className="hover:bg-muted/40 transition-all duration-200 cursor-pointer group"
                  >
                    {/* Name & subtask checklist count */}
                    <td className="py-3.5 px-5 font-semibold text-foreground group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                      <div className="flex items-center space-x-3.5">
                        <span className="truncate max-w-[280px]" title={task.name}>{task.name}</span>
                        {task.customFields?.subtasks && task.customFields.subtasks.length > 0 && (
                          <span 
                            className="flex items-center space-x-1 text-[9px] text-muted-foreground bg-muted border border-border px-1.5 py-0.5 rounded-md"
                            title="Subtasks progress"
                          >
                            <CheckSquare className="w-3 h-3 text-blue-500" />
                            <span>
                              {task.customFields.subtasks.filter(s => s.done).length}/{task.customFields.subtasks.length}
                            </span>
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Project */}
                    <td className="py-3.5 px-4 font-medium text-muted-foreground">
                      <span className="truncate max-w-[120px] block" title={project?.name || 'Unassigned'}>
                        💼 {project?.name || 'Unassigned'}
                      </span>
                    </td>

                    {/* Sprint */}
                    <td className="py-3.5 px-4">
                      {sprint ? (
                        <span className="text-muted-foreground bg-muted border border-border px-2 py-0.5 rounded text-[10px] whitespace-nowrap">
                          🔄 {sprint.name}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/45 font-light">-</span>
                      )}
                    </td>

                    {/* Phase */}
                    <td className="py-3.5 px-4">
                      {phase ? (
                        <span className="text-purple-600 dark:text-purple-300 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded text-[10px] whitespace-nowrap">
                          🔑 {phase.name}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/45 font-light">-</span>
                      )}
                    </td>

                    {/* Assignee */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center space-x-2">
                        {assignee ? (
                          <>
                            <div className={`w-5 h-5 rounded-full border flex items-center justify-center text-[8px] font-bold ${getAvatarBg(assignee.email)}`}>
                              {getInitials(assignee)}
                            </div>
                            <span className="text-muted-foreground truncate max-w-[100px]">{assignee.firstName} {assignee.lastName[0]}.</span>
                          </>
                        ) : (
                          <>
                            <div className="w-5 h-5 rounded-full border border-dashed border-border flex items-center justify-center bg-muted text-muted-foreground">
                              <UserIcon className="w-2.5 h-2.5" />
                            </div>
                            <span className="text-muted-foreground/45 italic">Unassigned</span>
                          </>
                        )}
                      </div>
                    </td>

                    {/* Status */}
                    <td className="py-3.5 px-4">
                      <span className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded border text-[9px] font-bold uppercase tracking-wider ${statusColors[task.status as keyof typeof statusColors] || statusColors.to_do}`}>
                        <CircleDot className="w-2.5 h-2.5 mr-0.5" />
                        {statusLabels[task.status as keyof typeof statusLabels] || task.status}
                      </span>
                    </td>

                    {/* Priority */}
                    <td className="py-3.5 px-4">
                      <span className={`px-2 py-0.5 rounded border text-[9px] font-bold uppercase tracking-wider ${priorityColors[task.customFields?.priority as keyof typeof priorityColors] || priorityColors.medium}`}>
                        {task.customFields?.priority || 'medium'}
                      </span>
                    </td>

                    {/* Story Points */}
                    <td className="py-3.5 px-4 text-center font-bold">
                      {task.customFields?.storyPoints ? (
                        <span className="px-1.5 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 text-[10px]">
                          {task.customFields.storyPoints} SP
                        </span>
                      ) : (
                        <span className="text-muted-foreground/45 font-light">-</span>
                      )}
                    </td>

                    {/* Due Date */}
                    <td className="py-3.5 px-5">
                      {task.customFields?.dueDate ? (
                        <div className={`flex items-center space-x-1.5 ${isOverdue ? 'text-amber-600 dark:text-amber-400 font-semibold' : 'text-muted-foreground'}`}>
                          <Calendar className="w-3.5 h-3.5" />
                          <span>{new Date(task.customFields.dueDate).toLocaleDateString()}</span>
                          {isOverdue && <span title="Task is Overdue!"><AlertTriangle className="w-3 h-3 text-amber-600 dark:text-amber-400 animate-pulse" /></span>}
                        </div>
                      ) : (
                        <span className="text-muted-foreground/45 font-light">-</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
