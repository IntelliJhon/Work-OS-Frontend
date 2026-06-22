import React, { useState, useEffect, useMemo } from 'react';
import { X, Trash2, Plus, MessageSquare } from 'lucide-react';
import type { Task } from '../../services/api/tasks.api';
import type { Project, Sprint, Phase } from '../../services/api/projects';
import type { User } from '../../services/api/users';
import { CommentsSystem } from '../collaboration/CommentsSystem';
import { useAuthStore } from '../../store/authStore';
import { useConfirm } from '../ui/ConfirmDialog';

interface TaskDrawerProps {
  task: Task | null;
  isOpen: boolean;
  onClose: () => void;
  projects: Project[];
  sprints: Sprint[];
  phases: Phase[];
  assignees: User[];
  onUpdateTask: (id: string, updates: Partial<Task>) => Promise<void>;
  onDeleteTask: (id: string) => Promise<void>;
}

export const TaskDrawer: React.FC<TaskDrawerProps> = ({
  task,
  isOpen,
  onClose,
  projects,
  sprints,
  phases,
  assignees,
  onUpdateTask,
  onDeleteTask,
}) => {
  const { user } = useAuthStore();
  const confirm = useConfirm();
  const project = projects.find((p) => p.id === task?.projectId);

  const isFullAccess = user?.role === 'Admin' || user?.role === 'Project Manager' || project?.pmId === user?.id;
  const isAssignee = task?.assigneeId === user?.id;

  const canUpdate = isFullAccess || isAssignee;
  const canEditFull = isFullAccess;
  const canDelete = isFullAccess;

  // Local state for editing fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [sprintId, setSprintId] = useState('');
  
  // Custom fields
  const [priority, setPriority] = useState('medium');
  const [dueDate, setDueDate] = useState('');
  const [storyPoints, setStoryPoints] = useState(0);
  const [phaseId, setPhaseId] = useState('');
  
  // Subtasks state
  const [subtasks, setSubtasks] = useState<{ id: string; title: string; done: boolean }[]>([]);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');

  const filteredAssignees = useMemo(() => {
    return assignees;
  }, [assignees]);


  // Sync state when task changes
  useEffect(() => {
    if (task) {
      setName(task.name);
      setDescription(task.description || '');
      setStatus(task.status || 'to_do');
      setAssigneeId(task.assigneeId || '');
      setSprintId(task.sprintId || '');
      
      setPriority(task.customFields?.priority || 'medium');
      setDueDate(task.customFields?.dueDate || '');
      setStoryPoints(task.customFields?.storyPoints || 0);
      setPhaseId(task.customFields?.phaseId || '');
      setSubtasks(task.customFields?.subtasks || []);
    }
  }, [task]);

  if (!isOpen || !task) return null;

  const filteredSprints = sprints.filter((s) => s.projectId === task.projectId);
  const filteredPhases = phases.filter((ph) => ph.projectId === task.projectId);

  // Field change savers
  const handleSaveField = async (fieldName: string, value: any) => {
    const isRestrictedField = ['name', 'description', 'assigneeId', 'sprintId', 'priority', 'dueDate', 'storyPoints', 'phaseId'].includes(fieldName);
    const hasPermission = isRestrictedField ? canEditFull : canUpdate;
    if (!hasPermission) return;
    try {
      const updates: Partial<Task> = {};
      
      if (['name', 'description', 'status', 'assigneeId', 'sprintId'].includes(fieldName)) {
        // Direct root fields
        (updates as any)[fieldName] = value === '' ? null : value;
      } else {
        // Custom fields nesting
        updates.customFields = {
          ...task.customFields,
          [fieldName]: value === '' ? undefined : value,
        };
      }

      await onUpdateTask(task.id, updates);
    } catch (err) {
      console.error('Failed to update task field', err);
    }
  };

  // Subtasks update
  const handleToggleSubtask = async (subtaskId: string) => {
    if (!canUpdate) return;
    const updatedSubtasks = subtasks.map((s) =>
      s.id === subtaskId ? { ...s, done: !s.done } : s
    );
    setSubtasks(updatedSubtasks);
    
    await onUpdateTask(task.id, {
      customFields: {
        ...task.customFields,
        subtasks: updatedSubtasks,
      },
    });
  };

  const handleAddSubtask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubtaskTitle.trim() || !canUpdate) return;

    const newSub = {
      id: `sub_${Date.now()}`,
      title: newSubtaskTitle.trim(),
      done: false,
    };
    
    const updatedSubtasks = [...subtasks, newSub];
    setSubtasks(updatedSubtasks);
    setNewSubtaskTitle('');

    await onUpdateTask(task.id, {
      customFields: {
        ...task.customFields,
        subtasks: updatedSubtasks,
      },
    });
  };

  const handleDeleteSubtask = async (subtaskId: string) => {
    if (!canUpdate) return;
    const updatedSubtasks = subtasks.filter((s) => s.id !== subtaskId);
    setSubtasks(updatedSubtasks);

    await onUpdateTask(task.id, {
      customFields: {
        ...task.customFields,
        subtasks: updatedSubtasks,
      },
    });
  };

  const handleDeleteClick = async () => {
    if (!canDelete) return;
    const ok = await confirm({
      title: 'Delete Task',
      message: 'Are you sure you want to permanently delete this task? This cannot be undone.',
      confirmLabel: 'Delete Task',
      variant: 'danger',
    });
    if (ok) {
      await onDeleteTask(task.id);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-background/60 backdrop-blur-sm" onClick={onClose} />

      {/* Drawer Body */}
      <div className="relative w-full max-w-2xl h-full glass-panel-heavy border-l border-border shadow-2xl flex flex-col z-10 animate-slide-in">
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center space-x-2">
            <span className="text-[10px] uppercase tracking-widest font-extrabold px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-blue-400">
              {task.status.replace('_', ' ')}
            </span>
            <span className="text-xs text-muted-foreground font-light truncate max-w-[200px]">
              {project?.name}
            </span>
          </div>

          <div className="flex items-center space-x-3">
            {canDelete && (
              <button
                onClick={handleDeleteClick}
                className="p-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 transition-all cursor-pointer"
                title="Delete Task"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-muted hover:bg-accent border border-border text-muted-foreground hover:text-foreground transition-all cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Container */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          
          {/* Task Name Input */}
          <div className="space-y-1">
            <input
              type="text"
              value={name}
              disabled={!canEditFull}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => handleSaveField('name', name)}
              className="w-full bg-transparent border-0 border-b border-transparent hover:border-slate-200/50 dark:border-border/50 focus:border-blue-500/50 text-xl font-bold text-foreground focus:outline-none py-1 transition-all"
            />
          </div>

          {/* Configuration Grid */}
          <div className="grid grid-cols-2 gap-4 bg-muted/40 p-4 rounded-2xl border border-border">
            {/* Assignee */}
            <div className="space-y-1.5">
              <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Assignee</label>
              <select
                value={assigneeId}
                disabled={!canEditFull}
                onChange={(e) => {
                  setAssigneeId(e.target.value);
                  handleSaveField('assigneeId', e.target.value);
                }}
                className="w-full px-3 py-2 glass-input text-foreground text-xs rounded-xl focus:outline-none [&>option]:bg-background [&>option]:text-foreground"
              >
                <option value="">Unassigned</option>
                {filteredAssignees.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.firstName} {u.lastName} ({u.email})
                  </option>
                ))}
              </select>
            </div>

            {/* Status */}
            <div className="space-y-1.5">
              <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Status</label>
              <select
                value={status}
                disabled={!canUpdate}
                onChange={(e) => {
                  setStatus(e.target.value);
                  handleSaveField('status', e.target.value);
                }}
                className="w-full px-3 py-2 glass-input text-foreground text-xs rounded-xl focus:outline-none [&>option]:bg-background [&>option]:text-foreground"
              >
                <option value="to_do">To Do</option>
                <option value="in_progress">In Progress</option>
                <option value="in_review">In Review</option>
                <option value="done">Done</option>
                <option value="blocked">Blocked</option>
              </select>
            </div>

            {/* Sprint */}
            <div className="space-y-1.5">
              <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Sprint</label>
              <select
                value={sprintId}
                disabled={!canEditFull}
                onChange={(e) => {
                  setSprintId(e.target.value);
                  handleSaveField('sprintId', e.target.value);
                }}
                className="w-full px-3 py-2 glass-input text-foreground text-xs rounded-xl focus:outline-none [&>option]:bg-background [&>option]:text-foreground"
              >
                <option value="">No Sprint</option>
                {filteredSprints.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.status})
                  </option>
                ))}
              </select>
            </div>

            {/* Phase */}
            <div className="space-y-1.5">
              <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Project Phase</label>
              <select
                value={phaseId}
                disabled={!canEditFull}
                onChange={(e) => {
                  setPhaseId(e.target.value);
                  handleSaveField('phaseId', e.target.value);
                }}
                className="w-full px-3 py-2 glass-input text-foreground text-xs rounded-xl focus:outline-none [&>option]:bg-background [&>option]:text-foreground"
              >
                <option value="">No Phase</option>
                {filteredPhases.map((ph) => (
                  <option key={ph.id} value={ph.id}>
                    {ph.name} ({ph.status})
                  </option>
                ))}
              </select>
            </div>

            {/* Priority */}
            <div className="space-y-1.5">
              <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Priority</label>
              <select
                value={priority}
                disabled={!canEditFull}
                onChange={(e) => {
                  setPriority(e.target.value);
                  handleSaveField('priority', e.target.value);
                }}
                className="w-full px-3 py-2 glass-input text-foreground text-xs rounded-xl focus:outline-none [&>option]:bg-background [&>option]:text-foreground"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>

            {/* Story Points */}
            <div className="space-y-1.5">
              <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Story Weight (SP)</label>
              <select
                value={storyPoints}
                disabled={!canEditFull}
                onChange={(e) => {
                  setStoryPoints(Number(e.target.value));
                  handleSaveField('storyPoints', Number(e.target.value));
                }}
                className="w-full px-3 py-2 glass-input text-foreground text-xs rounded-xl focus:outline-none [&>option]:bg-background [&>option]:text-foreground"
              >
                <option value={0}>0 SP (None)</option>
                <option value={1}>1 SP</option>
                <option value={2}>2 SP</option>
                <option value={3}>3 SP</option>
                <option value={5}>5 SP</option>
                <option value={8}>8 SP</option>
              </select>
            </div>

            {/* Due Date */}
            <div className="space-y-1.5 col-span-2">
              <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Due Date</label>
              <div className="relative">
                <input
                  type="date"
                  value={dueDate}
                  disabled={!canEditFull}
                  onChange={(e) => {
                    setDueDate(e.target.value);
                    handleSaveField('dueDate', e.target.value);
                  }}
                  className="w-full px-3 py-2 glass-input text-foreground text-xs rounded-xl focus:outline-none cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Description Section */}
          <div className="space-y-2">
            <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest block">Description</label>
            <textarea
              value={description}
              disabled={!canEditFull}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() => handleSaveField('description', description)}
              rows={4}
              placeholder="Provide a detailed overview of the requirements and outcomes..."
              className="w-full px-4 py-3 rounded-2xl glass-input text-foreground text-xs focus:outline-none resize-none font-light leading-relaxed"
            />
          </div>

          {/* Subtasks Section */}
          <div className="space-y-3">
            <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest block">Subtasks Checklist</label>
            
            {/* List */}
            {subtasks.length > 0 && (
              <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
                {subtasks.map((sub) => (
                  <div
                    key={sub.id}
                    className="flex items-center justify-between p-2 rounded-xl bg-muted/30 border border-border text-xs text-foreground"
                  >
                    <div className="flex items-center space-x-3">
                      <input
                        type="checkbox"
                        checked={sub.done}
                        disabled={!canUpdate}
                        onChange={() => handleToggleSubtask(sub.id)}
                        className="rounded border-border bg-background text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                      <span className={sub.done ? 'line-through text-muted-foreground' : 'text-foreground'}>
                        {sub.title}
                      </span>
                    </div>
                    {canUpdate && (
                      <button
                        onClick={() => handleDeleteSubtask(sub.id)}
                        className="text-muted-foreground hover:text-red-400 p-1 rounded-lg hover:bg-muted transition-all cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Input Form */}
            {canUpdate && (
              <form onSubmit={handleAddSubtask} className="flex gap-2">
                <input
                  type="text"
                  placeholder="Add a new checklist subtask..."
                  value={newSubtaskTitle}
                  onChange={(e) => setNewSubtaskTitle(e.target.value)}
                  className="flex-1 px-4 py-2 glass-input rounded-xl text-xs text-foreground placeholder-muted-foreground focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={!newSubtaskTitle.trim()}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all disabled:opacity-50 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </form>
            )}
          </div>

          {/* Comments System Integration */}
          <div className="border-t border-border pt-5 space-y-3">
            <div className="flex items-center space-x-2 text-muted-foreground">
              <MessageSquare className="w-4 h-4 text-blue-400" />
              <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Realtime Comments Feed</label>
            </div>
            
            <CommentsSystem
              projectId={task.projectId}
              entityId={task.id}
              entityType="TASK"
            />
          </div>

        </div>
      </div>
    </div>
  );
};
