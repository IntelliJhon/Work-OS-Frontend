import React, { useState, useEffect, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Project, Sprint, Phase } from '../../services/api/projects';
import { sprintsApi } from '../../services/api/sprints';
import { tasksApi } from '../../services/api/tasks.api';
import { epicsApi } from '../../services/api/epics.api';
import { storiesApi } from '../../services/api/stories.api';
import { PermissionGate } from '../../features/auth/PermissionGate';
import { PERMISSIONS } from '../../features/auth/permission.constants';
import {
  Activity,
  Plus,
  Calendar,
  PlusCircle,
  Sparkles,
  Lock,
  Trash,
  X,
  ShieldAlert,
  Clock,
  CheckSquare,
  Square,
  MessageSquare,
  ClipboardList
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

// Real-time Collaboration & Auth Imports
import { useSocket } from '../../services/socket/socket-context';
import { useSocketEvent } from '../../services/socket/socket-events';
import { useAuthStore } from '../../store/authStore';
import { useCollaborationStore } from '../../store/collaborationStore';
import { usersApi } from '../../services/api/users';
import type { User } from '../../services/api/users';
import { CommentsSystem } from '../../components/collaboration/CommentsSystem';

const createSprintSchema = z.object({
  name: z.string().min(3, 'Sprint name must be at least 3 characters'),
  phaseId: z.string().min(1, 'Target Phase is required'),
  startDate: z.string().min(1, 'Start Date is required'),
  endDate: z.string().min(1, 'End Date is required'),
  cadence: z.enum(['Weekly', 'Bi-Weekly', 'Monthly', 'Custom']),
}).refine((data) => {
  if (data.startDate && data.endDate) {
    const start = new Date(data.startDate);
    const end = new Date(data.endDate);
    return end.getTime() > start.getTime();
  }
  return true;
}, {
  message: "End Date must be strictly after Start Date",
  path: ["endDate"]
}).refine((data) => {
  if (data.startDate && data.endDate) {
    const start = new Date(data.startDate);
    const end = new Date(data.endDate);
    const oneYearInMs = 365 * 24 * 60 * 60 * 1000;
    return (end.getTime() - start.getTime()) <= oneYearInMs;
  }
  return true;
}, {
  message: "Sprint duration cannot exceed 1 year",
  path: ["endDate"]
});

type CreateSprintValues = z.infer<typeof createSprintSchema>;

// Beautiful rich task structure for premium operational Kanban collaboration
interface SubTask {
  id: string;
  title: string;
  done: boolean;
}

interface InteractiveTask {
  id: string;
  name: string;
  status: 'to_do' | 'in_progress' | 'in_review' | 'done' | 'blocked';
  weight: number;
  assignee: string;
  dueDate?: string;
  description?: string;
  subtasks?: SubTask[];
}



export const ProjectSprints: React.FC = () => {
  const { project, refetch: refetchProject } = useOutletContext<{ project: Project; refetch: () => void }>();
  const queryClient = useQueryClient();

  // Socket and Collaboration context
  const { socket, isConnected } = useSocket();
  const { user } = useAuthStore();
  const { addActivity } = useCollaborationStore();

  const [selectedSprintId, setSelectedSprintId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showBlockerModal, setShowBlockerModal] = useState(false);
  const [showAddTaskModal, setShowAddTaskModal] = useState(false);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);

  // Form states for new task
  const [addTaskName, setAddTaskName] = useState('');
  const [addTaskWeight, setAddTaskWeight] = useState(3);
  const [addTaskAssignee, setAddTaskAssignee] = useState('unassigned@acme.com');
  const [addTaskDueDate, setAddTaskDueDate] = useState('');
  const [addTaskDesc, setAddTaskDesc] = useState('');

  // Form states for subtasks in details side panel
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');

  // Fetch active tenant members for assignment dropdowns
  const [members, setMembers] = useState<User[]>([]);

  useEffect(() => {
    usersApi.list()
      .then((res) => setMembers(res))
      .catch((err) => console.error('[ProjectSprints] Failed to load members', err));
  }, []);

  // Database Tasks Query via TanStack Query
  const { data: dbTasks = [] } = useQuery({
    queryKey: ['tasks'],
    queryFn: tasksApi.list,
  });

  // Realtime Socket updates to invalidate Query Cache
  useSocketEvent<{ taskId: string; fromStatus: string; toStatus: string; actorName: string }>(
    'kanban_task_moved_received',
    () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    }
  );

  useSocketEvent<any>('kanban_task_created_received', () => {
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
  });

  useSocketEvent<{ sprintId: string; taskId: string }>(
    'kanban_task_deleted_received',
    (data) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setActiveTaskId((currId) => (currId === data.taskId ? null : currId));
    }
  );

  useSocketEvent<any>('kanban_task_updated_received', () => {
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
  });

  // Query Sprints
  const { data: sprints = [], isLoading, refetch: refetchSprints } = useQuery({
    queryKey: ['sprints', project.id],
    queryFn: () => sprintsApi.listByProject(project.id),
    enabled: !!project.id,
  });

  const selectedSprint = sprints.find((s) => s.id === (selectedSprintId || sprints[0]?.id));

  // Compute activeSprintTasks dynamically based on database tasks
  const activeSprintTasks = useMemo(() => {
    if (!selectedSprint) return [];
    
    // Filter tasks belonging to the current project and active sprint
    // A task is only visible on the sprint page if it has both a sprint and a phase selected
    const filtered = dbTasks.filter(
      (task) => 
        task.projectId === project.id && 
        task.sprintId === selectedSprint.id &&
        task.sprintId && 
        task.customFields?.phaseId
    );

    // Map DB tasks to UI's InteractiveTask structure
    return filtered.map((task) => {
      // Map assignee ID to email
      const member = members.find((m) => m.id === task.assigneeId);
      const assigneeEmail = member ? member.email : 'unassigned@acme.com';

      // Parse custom fields safely
      const customFields = task.customFields || {};
      const dueDate = customFields.dueDate || undefined;
      const storyPoints = customFields.storyPoints || 0;

      // Extract subtasks safely
      const subtasks = Array.isArray(customFields.subtasks) ? customFields.subtasks : [];

      // Safe status mapping
      let mappedStatus: 'to_do' | 'in_progress' | 'in_review' | 'done' | 'blocked' = 'to_do';
      if (task.status === 'in_progress') {
        mappedStatus = 'in_progress';
      } else if (task.status === 'in_review' || task.status === 'review') {
        mappedStatus = 'in_review';
      } else if (task.status === 'blocked') {
        mappedStatus = 'blocked';
      } else if (task.status === 'done' || task.status === 'completed') {
        mappedStatus = 'done';
      }

      return {
        id: task.id,
        name: task.name,
        status: selectedSprint.status === 'closed' ? ('done' as const) : mappedStatus,
        weight: storyPoints,
        assignee: assigneeEmail,
        dueDate,
        description: task.description || undefined,
        subtasks,
      };
    });
  }, [dbTasks, selectedSprint, project.id, members]);

  // Mutations
  const createSprintMutation = useMutation({
    mutationFn: sprintsApi.create,
    onSuccess: (newSprint) => {
      queryClient.invalidateQueries({ queryKey: ['sprints', project.id] });
      refetchSprints();
      setSelectedSprintId(newSprint.id);
      setShowCreateModal(false);
      reset();
    }
  });

  const startSprintMutation = useMutation({
    mutationFn: sprintsApi.start,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sprints', project.id] });
      refetchSprints();
      refetchProject();
    }
  });

  const closeSprintMutation = useMutation({
    mutationFn: sprintsApi.close,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['sprints', project.id] });
      refetchSprints();
      refetchProject();
    }
  });

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CreateSprintValues>({
    resolver: zodResolver(createSprintSchema),
    defaultValues: {
      cadence: 'Weekly'
    }
  });

  const watchedStartDate = watch('startDate');
  const watchedEndDate = watch('endDate');
  const watchedCadence = watch('cadence');

  useEffect(() => {
    if (!watchedStartDate || !watchedCadence || watchedCadence === 'Custom') return;
    
    const start = new Date(watchedStartDate);
    if (isNaN(start.getTime())) return;
    
    const end = new Date(start);
    if (watchedCadence === 'Weekly') {
      end.setDate(start.getDate() + 7);
    } else if (watchedCadence === 'Bi-Weekly') {
      end.setDate(start.getDate() + 14);
    } else if (watchedCadence === 'Monthly') {
      end.setMonth(start.getMonth() + 1);
    }
    
    // Format to YYYY-MM-DD
    const yyyy = end.getFullYear();
    const mm = String(end.getMonth() + 1).padStart(2, '0');
    const dd = String(end.getDate()).padStart(2, '0');
    setValue('endDate', `${yyyy}-${mm}-${dd}`);
  }, [watchedStartDate, watchedCadence, setValue]);

  const onSubmit = (values: any) => {
    let cadenceType: 'WEEK' | 'MONTH' | 'CUSTOM' = 'WEEK';
    let cadenceInterval = 1;

    if (values.cadence === 'Weekly') {
      cadenceType = 'WEEK';
      cadenceInterval = 1;
    } else if (values.cadence === 'Bi-Weekly') {
      cadenceType = 'WEEK';
      cadenceInterval = 2;
    } else if (values.cadence === 'Monthly') {
      cadenceType = 'MONTH';
      cadenceInterval = 1;
    } else if (values.cadence === 'Custom') {
      cadenceType = 'CUSTOM';
      cadenceInterval = 1;
    }

    const startDateISO = values.startDate ? new Date(values.startDate).toISOString() : undefined;
    const endDateISO = values.endDate ? new Date(values.endDate).toISOString() : undefined;

    createSprintMutation.mutate({
      projectId: project.id,
      phaseId: values.phaseId,
      name: values.name,
      startDate: startDateISO,
      endDate: endDateISO,
      cadenceType,
      cadenceInterval,
    });
  };

  // Find parent phase of a sprint
  const getParentPhase = (sprint: Sprint): Phase | undefined => {
    return project.phases?.find((p) => p.id === sprint.phaseId);
  };

  const formatCadenceBadge = (type?: string | null, interval?: number | null) => {
    if (!type) return null;
    if (type === 'WEEK') {
      if (interval === 1) return 'Weekly Sprint';
      if (interval === 2) return 'Bi-Weekly Sprint';
      return `${interval}-Week Sprint`;
    }
    if (type === 'MONTH') {
      if (interval === 1) return 'Monthly Sprint';
      return `${interval}-Month Sprint`;
    }
    return 'Custom Sprint';
  };

  const formatPreviewDate = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '';
    
    const day = date.getDate();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[date.getMonth()];
    const year = date.getFullYear();
    
    return `${day} ${month} ${year}`;
  };

  // Toggle task status interactively in state
  const handleToggleTaskStatus = async (_sprintId: string, taskId: string, nextStatus: 'to_do' | 'in_progress' | 'in_review' | 'done' | 'blocked') => {
    try {
      await tasksApi.update(taskId, { status: nextStatus });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    } catch (err: any) {
      console.error('Failed to update task status', err);
      const errMsg = err?.response?.data?.message || err?.response?.data?.error || err.message || 'Failed to update task status';
      alert(`RBAC Security: ${errMsg}`);
    }
  };

  // Update specific fields of a task
  const handleUpdateTaskDetail = async (sprintId: string, taskId: string, updates: Partial<InteractiveTask>) => {
    try {
      const dbTask = dbTasks.find((t) => t.id === taskId);
      if (!dbTask) return;

      const payload: any = {};
      
      if (updates.name !== undefined) payload.name = updates.name;
      if (updates.description !== undefined) payload.description = updates.description;
      if (updates.status !== undefined) payload.status = updates.status;

      if (updates.assignee !== undefined) {
        const selectedMember = members.find((m) => m.email === updates.assignee);
        payload.assigneeId = selectedMember ? selectedMember.id : null;
      }

      const existingCustomFields = dbTask.customFields || {};
      const newCustomFields = { ...existingCustomFields };

      if (updates.weight !== undefined) {
        newCustomFields.storyPoints = updates.weight;
      }
      if (updates.dueDate !== undefined) {
        newCustomFields.dueDate = updates.dueDate;
        payload.dueDate = updates.dueDate;
      }
      if (updates.subtasks !== undefined) {
        newCustomFields.subtasks = updates.subtasks;
      }

      payload.customFields = newCustomFields;

      await tasksApi.update(taskId, payload);
      queryClient.invalidateQueries({ queryKey: ['tasks'] });

      if (socket && isConnected) {
        socket.emit('kanban_task_updated', {
          projectId: project.id,
          sprintId,
          taskId,
          updates
        });
      }
    } catch (err: any) {
      console.error('Failed to update task details', err);
      const errMsg = err?.response?.data?.message || err?.response?.data?.error || err.message || 'Failed to update task details';
      alert(`RBAC Security: ${errMsg}`);
    }
  };

  // Add a task deliverable interactively to selected sprint via modal confirmation
  const handleCreateTaskConfirm = async (sprintId: string) => {
    if (!addTaskName.trim()) return;

    try {
      const projectStories = await storiesApi.list(project.id);
      let targetStoryId = '';

      if (projectStories.length > 0) {
        targetStoryId = projectStories[0].id;
      } else {
        const projectEpics = await epicsApi.list(project.id);
        let targetEpicId = '';

        if (projectEpics.length > 0) {
          targetEpicId = projectEpics[0].id;
        } else {
          const newEpic = await epicsApi.create({
            projectId: project.id,
            name: 'General Epic',
            description: 'Default Epic provisioned automatically for tasks.',
          });
          targetEpicId = newEpic.id;
        }

        const newStory = await storiesApi.create({
          projectId: project.id,
          epicId: targetEpicId,
          name: 'General Story',
          description: 'Default Story provisioned automatically for tasks.',
        });
        targetStoryId = newStory.id;
      }

      const selectedMember = members.find((m) => m.email === addTaskAssignee);
      const assigneeId = selectedMember ? selectedMember.id : null;

      const payload = {
        projectId: project.id,
        storyId: targetStoryId,
        sprintId: sprintId,
        assigneeId: assigneeId,
        name: addTaskName.trim(),
        description: addTaskDesc.trim() || undefined,
        status: 'to_do',
        customFields: {
          priority: 'medium' as const,
          dueDate: addTaskDueDate || undefined,
          storyPoints: addTaskWeight,
          phaseId: selectedSprint?.phaseId || undefined,
          subtasks: [],
          createdFrom: 'sprint',
        },
      };

      const createdTask = await tasksApi.create(payload);
      queryClient.invalidateQueries({ queryKey: ['tasks'] });

      const actorName = user ? `${user.firstName} ${user.lastName}` : 'System';
      if (user?.tenantId) {
        addActivity(user.tenantId, project.id, {
          projectId: project.id,
          type: 'task_created',
          title: 'Sprint Deliverable Added',
          message: `${actorName} created task "${createdTask.name}" in selected sprint.`,
          severity: 'low',
          actor: actorName
        });
      }

      if (socket && isConnected) {
        socket.emit('kanban_task_created', {
          projectId: project.id,
          sprintId,
          task: {
            id: createdTask.id,
            name: createdTask.name,
            status: 'to_do',
            weight: addTaskWeight,
            assignee: addTaskAssignee,
            dueDate: addTaskDueDate || undefined,
            description: addTaskDesc.trim() || undefined,
            subtasks: []
          },
          actorName
        });
      }

      setAddTaskName('');
      setAddTaskWeight(3);
      setAddTaskAssignee('unassigned@acme.com');
      setAddTaskDueDate('');
      setAddTaskDesc('');
      setShowAddTaskModal(false);
    } catch (err) {
      console.error('Failed to create task deliverable', err);
      alert('Failed to create task.');
    }
  };

  // Delete a task interactively
  const handleDeleteTask = async (sprintId: string, taskId: string) => {
    try {
      const taskToDelete = activeSprintTasks.find((t) => t.id === taskId);
      const taskName = taskToDelete?.name || 'Deliverable Task';

      await tasksApi.delete(taskId);
      queryClient.invalidateQueries({ queryKey: ['tasks'] });

      if (activeTaskId === taskId) {
        setActiveTaskId(null);
      }

      const actorName = user ? `${user.firstName} ${user.lastName}` : 'System';
      if (user?.tenantId) {
        addActivity(user.tenantId, project.id, {
          projectId: project.id,
          type: 'task_deleted',
          title: 'Task Deliverable Deleted',
          message: `${actorName} removed task "${taskName}".`,
          severity: 'low',
          actor: actorName
        });
      }

      if (socket && isConnected) {
        socket.emit('kanban_task_deleted', {
          projectId: project.id,
          sprintId,
          taskId
        });
      }
    } catch (err) {
      console.error('Failed to delete task deliverable', err);
    }
  };

  // Drag and Drop Logic
  const handleDragStart = (e: React.DragEvent, taskId: string, fromStatus: 'to_do' | 'in_progress' | 'in_review' | 'done' | 'blocked') => {
    if (selectedSprint?.status === 'closed') {
      e.preventDefault();
      return;
    }
    const task = activeSprintTasks.find((t) => t.id === taskId);
    if (!task) return;
    const dbTask = dbTasks.find((t) => t.id === task.id);
    const isFullAccess = user?.role === 'Admin' || user?.role === 'Project Manager' || project?.pmId === user?.id;
    const isAssignee = dbTask?.assigneeId === user?.id;
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

  const handleDrop = async (e: React.DragEvent, toStatus: 'to_do' | 'in_progress' | 'in_review' | 'done' | 'blocked') => {
    e.preventDefault();
    if (!selectedSprint || selectedSprint.status === 'closed') return;

    const taskId = e.dataTransfer.getData('text/plain');
    const fromStatus = e.dataTransfer.getData('fromStatus') as 'to_do' | 'in_progress' | 'in_review' | 'done' | 'blocked';

    if (fromStatus === toStatus) return;

    const movedTask = activeSprintTasks.find((t) => t.id === taskId);
    const taskName = movedTask?.name || 'Deliverable Task';

    await handleToggleTaskStatus(selectedSprint.id, taskId, toStatus);

    const actorName = user ? `${user.firstName} ${user.lastName}` : 'System';

    if (socket && isConnected) {
      socket.emit('kanban_task_moved', {
        projectId: project.id,
        taskId,
        fromStatus,
        toStatus,
        actorName
      });
    }

    if (user?.tenantId) {
      addActivity(user.tenantId, project.id, {
        projectId: project.id,
        type: 'kanban_task_moved',
        title: 'Task Moved on Kanban',
        message: `${actorName} moved task "${taskName}" to ${toStatus.replace(/_/g, ' ')}.`,
        severity: 'medium',
        actor: actorName
      });
    }
  };

  // Subtask management inside the Details Panel
  const handleToggleSubtask = (sprintId: string, taskId: string, subtaskId: string) => {
    const task = activeSprintTasks.find((t) => t.id === taskId);
    if (!task) return;

    const updatedSubtasks = (task.subtasks || []).map((sub) =>
      sub.id === subtaskId ? { ...sub, done: !sub.done } : sub
    );

    handleUpdateTaskDetail(sprintId, taskId, { subtasks: updatedSubtasks });
  };

  const handleAddSubtask = (sprintId: string, taskId: string) => {
    if (!newSubtaskTitle.trim()) return;

    const task = activeSprintTasks.find((t) => t.id === taskId);
    if (!task) return;

    const newSub: SubTask = {
      id: `sub_${Date.now()}`,
      title: newSubtaskTitle.trim(),
      done: false
    };

    const updatedSubtasks = [...(task.subtasks || []), newSub];
    handleUpdateTaskDetail(sprintId, taskId, { subtasks: updatedSubtasks });
    setNewSubtaskTitle('');
  };

  const handleDeleteSubtask = (sprintId: string, taskId: string, subtaskId: string) => {
    const task = activeSprintTasks.find((t) => t.id === taskId);
    if (!task) return;

    const updatedSubtasks = (task.subtasks || []).filter((sub) => sub.id !== subtaskId);
    handleUpdateTaskDetail(sprintId, taskId, { subtasks: updatedSubtasks });
  };

  // Governance Sprint Rules Check: Close Sprint
  const handleCloseSprintAttempt = (sprint: Sprint) => {
    const tasksForSprint = dbTasks.filter(
      (task) => task.projectId === project.id && task.sprintId === sprint.id
    );
    const incompleteTasks = tasksForSprint.filter(
      (t) => t.status !== 'done' && t.status !== 'completed'
    );

    if (incompleteTasks.length > 0) {
      setShowBlockerModal(true);
    } else {
      if (confirm('Are you ready to close this sprint? The sprint status will be updated, locking all task weights into ledger history.')) {
        closeSprintMutation.mutate(sprint.id);
      }
    }
  };

  const completedCount = activeSprintTasks.filter((t) => t.status === 'done').length;
  const totalCount = activeSprintTasks.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const totalPoints = activeSprintTasks.reduce((sum, t) => sum + t.weight, 0);
  const completedPoints = activeSprintTasks.filter((t) => t.status === 'done').reduce((sum, t) => sum + t.weight, 0);

  const getCanDragTask = (task: any) => {
    if (!selectedSprint || selectedSprint.status === 'closed') return false;
    const dbTask = dbTasks.find((t) => t.id === task.id);
    const isFullAccess = user?.role === 'Admin' || user?.role === 'Project Manager' || project?.pmId === user?.id;
    const isAssignee = dbTask?.assigneeId === user?.id;
    return isFullAccess || isAssignee;
  };

  // Filter tasks into Kanban Columns
  const todoTasks = activeSprintTasks.filter((t) => t.status === 'to_do');
  const inProgressTasks = activeSprintTasks.filter((t) => t.status === 'in_progress');
  const reviewTasks = activeSprintTasks.filter((t) => t.status === 'in_review');
  const doneTasks = activeSprintTasks.filter((t) => t.status === 'done');
  const blockedTasks = activeSprintTasks.filter((t) => t.status === 'blocked');

  // Active task details for sliding panel
  const activeTask = activeSprintTasks.find((t) => t.id === activeTaskId);

  // Compute permissions for the active task in detail drawer
  const dbTaskForActive = activeTask ? dbTasks.find((t) => t.id === activeTask.id) : null;
  const isActiveFullAccess = user?.role === 'Admin' || user?.role === 'Project Manager' || project?.pmId === user?.id;
  const isActiveAssignee = dbTaskForActive?.assigneeId === user?.id;
  const canEditFull = isActiveFullAccess;
  const canUpdate = isActiveFullAccess || isActiveAssignee;

  const filteredMembersForCreate = useMemo(() => {
    if (user?.role === 'Project Manager') {
      return members.filter((m) => m.roleName === 'User');
    }
    return members;
  }, [members, user]);

  const filteredMembersForDrawer = useMemo(() => {
    if (user?.role === 'Project Manager') {
      return members.filter((m) => m.roleName === 'User' || m.email === activeTask?.assignee);
    }
    return members;
  }, [members, user, activeTask?.assignee]);


  // HSL Color Generator for Initials Avatar
  const getAvatarBg = (userName: string) => {
    let charCodeSum = 0;
    for (let i = 0; i < userName.length; i++) charCodeSum += userName.charCodeAt(i);
    const hues = [200, 240, 280, 320, 360, 25, 140, 175];
    return `hsl(${hues[charCodeSum % hues.length]}, 70%, 40%)`;
  };

  const getInitials = (name: string) => {
    const parts = name.split(' ');
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name.substring(0, 2).toUpperCase();
  };

  return (
    <div className="space-y-6 text-foreground animate-fade-in relative min-h-screen pb-16">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

        {/* Left column: Sprints list sidebar */}
        <div className="lg:col-span-1 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/5 pb-2">
            <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center space-x-1.5">
              <ClipboardList className="w-4 h-4 text-blue-400" />
              <span>Sprints Backlog</span>
            </h4>
            <PermissionGate
              permission={PERMISSIONS.PROJECT_MANAGE}
              behavior="hide"
            >
              <button
                onClick={() => setShowCreateModal(true)}
                className="p-1 rounded-lg hover:bg-slate-100/60 dark:bg-white/5 text-blue-400 hover:text-white transition-all"
                title="Create New Sprint Deliverable"
              >
                <Plus className="w-4.5 h-4.5" />
              </button>
            </PermissionGate>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 rounded-xl bg-slate-100/60 dark:bg-white/5 animate-pulse" />
              ))}
            </div>
          ) : sprints.length === 0 ? (
            <div className="p-6 text-center border border-dashed border-border rounded-2xl bg-slate-100/60 dark:bg-white/5">
              <Activity className="w-8 h-8 text-slate-500 dark:text-zinc-500 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground font-light">No sprints provisioned.</p>
              <PermissionGate
                permission={PERMISSIONS.PROJECT_MANAGE}
                behavior="hide"
              >
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="mt-3 text-xs bg-blue-600 hover:bg-blue-500 text-white font-bold px-3 py-1.5 rounded-lg transition-all"
                >
                  Plan Sprint
                </button>
              </PermissionGate>
            </div>
          ) : (
            <div className="space-y-2">
              {sprints.map((sprint) => {
                const isSelected = selectedSprint?.id === sprint.id;
                const parentPhase = getParentPhase(sprint);

                return (
                  <div
                    key={sprint.id}
                    onClick={() => {
                      setSelectedSprintId(sprint.id);
                      setActiveTaskId(null); // Clear active task detail
                    }}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all duration-300 ${
                      isSelected
                        ? 'border-blue-500 bg-blue-500/10 shadow-lg text-blue-400 glow-primary'
                        : 'border-border bg-slate-100/60 dark:bg-white/5 text-slate-600 dark:text-zinc-400 hover:bg-slate-200/60 dark:bg-white/10 hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <p className={`text-xs font-extrabold truncate max-w-[130px] ${isSelected ? 'text-white' : ''}`}>
                        {sprint.name}
                      </p>
                      <span className={`text-[8px] uppercase tracking-wider font-extrabold px-1.5 py-0.5 rounded border ${
                        sprint.status === 'active'
                          ? 'bg-blue-500/10 border-blue-500/20 text-blue-400 animate-pulse'
                          : sprint.status === 'closed'
                          ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                          : 'bg-zinc-500/10 border-zinc-500/20 text-slate-500 dark:text-zinc-500'
                      }`}>
                        {sprint.status}
                      </span>
                    </div>

                    {sprint.cadenceType && (
                      <div className="mt-1.5 flex">
                        <span className="text-[7.5px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                          🔄 {formatCadenceBadge(sprint.cadenceType, sprint.cadenceInterval)}
                        </span>
                      </div>
                    )}

                    <div className="flex items-center justify-between text-[9px] text-slate-500 dark:text-zinc-500 font-bold uppercase tracking-wider mt-2.5">
                      <span className="truncate max-w-[80px] text-blue-400">
                        🔑 {parentPhase?.name || 'N/A'}
                      </span>
                      <span>
                        Tasks: {dbTasks.filter((t) => t.sprintId === sprint.id && t.customFields?.phaseId).length}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right column: Selected sprint details and premium drag-and-drop Kanban Board */}
        <div className="lg:col-span-3 min-w-0 space-y-5">
          {selectedSprint ? (
            <>
              {/* Sprint info panel & governance tools */}
              <div className="glass-panel-heavy rounded-2xl p-6 border border-border space-y-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center space-y-4 sm:space-y-0 border-b border-slate-100 dark:border-white/5 pb-4">
                  <div className="space-y-1.5">
                    <div className="flex items-center space-x-2">
                      <h4 className="text-xl font-bold text-slate-900 dark:text-white">
                        {selectedSprint.name}
                      </h4>
                      <span className="flex items-center space-x-1 text-[9px] uppercase font-bold text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded">
                        Stage Gate: {getParentPhase(selectedSprint)?.name || 'N/A'}
                      </span>
                      {selectedSprint.cadenceType && (
                        <span className="flex items-center space-x-1 text-[9px] uppercase font-bold text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded">
                          🔄 {formatCadenceBadge(selectedSprint.cadenceType, selectedSprint.cadenceInterval)}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center space-x-3 text-xs text-slate-500 dark:text-zinc-500 font-light">
                      <span className="flex items-center space-x-1">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>Dates: {selectedSprint.startDate ? new Date(selectedSprint.startDate).toLocaleDateString() : 'N/A'} - {selectedSprint.endDate ? new Date(selectedSprint.endDate).toLocaleDateString() : 'N/A'}</span>
                      </span>
                    </div>
                  </div>

                  {/* Sprint Lifecycle Action Controls */}
                  <div className="flex items-center space-x-2 shrink-0">
                    {selectedSprint.status === 'planning' && (
                      <PermissionGate
                        permission={PERMISSIONS.PROJECT_MANAGE}
                        behavior="hide"
                      >
                        <button
                          onClick={() => startSprintMutation.mutate(selectedSprint.id)}
                          className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all shadow border border-blue-500/20 active:scale-95 duration-150"
                        >
                          <span>Start Sprint Cycle</span>
                        </button>
                      </PermissionGate>
                    )}
                    {selectedSprint.status === 'active' && (
                      <PermissionGate
                        permission={PERMISSIONS.PROJECT_MANAGE}
                        behavior="hide"
                      >
                        <button
                          onClick={() => handleCloseSprintAttempt(selectedSprint)}
                          className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow border border-emerald-500/20 active:scale-95 duration-150"
                        >
                          <span>Complete & Close Sprint</span>
                        </button>
                      </PermissionGate>
                    )}
                  </div>
                </div>

                {/* Sprints checklist summary */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-slate-100/60 dark:bg-white/5 border border-slate-100 dark:border-white/5 p-4 rounded-xl space-y-2">
                    <div className="flex justify-between text-xs font-bold text-slate-600 dark:text-zinc-400">
                      <span>Tasks Closed Checklist</span>
                      <span className="text-slate-900 dark:text-white">{progressPercent}% ({completedCount}/{totalCount})</span>
                    </div>
                    <div className="w-full bg-slate-100/60 dark:bg-white/5 rounded-full h-1.5 overflow-hidden border border-slate-100 dark:border-white/5">
                      <div
                        className="bg-gradient-to-r from-blue-500 to-indigo-600 h-full rounded-full transition-all duration-500"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  </div>

                  <div className="bg-slate-100/60 dark:bg-white/5 border border-slate-100 dark:border-white/5 p-4 rounded-xl flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-bold text-slate-500 dark:text-zinc-500 uppercase tracking-widest">Story Weight Tallies</p>
                      <p className="text-lg font-bold text-slate-900 dark:text-white mt-1">
                        {completedPoints} <span className="text-slate-500 dark:text-zinc-500 font-light text-xs">/ {totalPoints} Points Closed</span>
                      </p>
                    </div>
                    <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400">
                      <Sparkles className="w-5 h-5 animate-pulse" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Real-time Drag-and-Drop Kanban Workspace */}
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/5 pb-2">
                  <h5 className="text-sm font-extrabold text-slate-900 dark:text-white uppercase tracking-wider">
                    Kanban Operational Workspace
                  </h5>
                  {selectedSprint.status === 'closed' ? (
                    <span className="text-[10px] text-slate-500 dark:text-zinc-500 flex items-center space-x-1">
                      <Lock className="w-3.5 h-3.5" />
                      <span>Sprint Closed — Kanban Locked</span>
                    </span>
                  ) : (
                    <PermissionGate
                      permission={PERMISSIONS.TASK_CREATE}
                      behavior="hide"
                    >
                      <button
                        onClick={() => {
                          setAddTaskName('');
                          setAddTaskWeight(3);
                          setAddTaskAssignee('admin@acme.com');
                          setAddTaskDueDate('');
                          setAddTaskDesc('');
                          setShowAddTaskModal(true);
                        }}
                        className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-blue-600/90 hover:bg-blue-600 text-white text-xs font-bold transition-all border border-blue-500/20"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Task Card</span>
                      </button>
                    </PermissionGate>
                  )}
                </div>

                <div className="flex flex-row gap-5 overflow-x-auto pb-4 w-full scrollbar-thin">
                  {/* Column 1: To Do */}
                  <div
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, 'to_do')}
                    className="glass-panel-heavy rounded-2xl p-4 border border-slate-100 dark:border-white/5 flex flex-col space-y-3 min-h-[500px] w-[280px] md:w-[320px] shrink-0 bg-slate-50/50 dark:bg-zinc-900/20 hover:bg-zinc-900/30 transition-all duration-300"
                  >
                    <div className="flex justify-between items-center border-b border-slate-100 dark:border-white/5 pb-2">
                      <div className="flex items-center space-x-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]" />
                        <h6 className="text-xs font-extrabold text-slate-900 dark:text-white uppercase tracking-wider">To Do</h6>
                      </div>
                      <span className="text-[10px] font-bold bg-slate-100/60 dark:bg-white/5 px-2 py-0.5 rounded-md text-slate-600 dark:text-zinc-400 border border-slate-100 dark:border-white/5">
                        {todoTasks.length}
                      </span>
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-3 pr-1 max-h-[600px] scrollbar-thin">
                      {todoTasks.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-center p-6 text-zinc-600 border border-dashed border-zinc-800 rounded-xl py-12">
                          <Activity className="w-6 h-6 mb-1 text-slate-800 dark:text-zinc-300" />
                          <p className="text-[10px] italic">No tasks planned.</p>
                        </div>
                      ) : (
                        todoTasks.map((task) => (
                          <div
                            key={task.id}
                            draggable={getCanDragTask(task)}
                            onDragStart={(e) => handleDragStart(e, task.id, 'to_do')}
                            onClick={() => setActiveTaskId(task.id)}
                            className={`p-3.5 rounded-xl border border-slate-100 dark:border-white/5 bg-white dark:bg-zinc-900/60 transition-all duration-200 cursor-pointer shadow-md group relative ${
                              selectedSprint.status === 'closed' ? 'opacity-85' : 'active:scale-95'
                            } ${
                              getCanDragTask(task)
                                ? 'cursor-grab active:cursor-grabbing hover:bg-zinc-900/90 hover:border-blue-500/40'
                                : 'cursor-default opacity-85 hover:bg-white dark:bg-zinc-900/60 hover:border-slate-100 dark:border-white/5'
                            }`}
                          >
                            <div className="flex justify-between items-start space-x-2">
                              <span className="text-xs font-bold text-slate-900 dark:text-white leading-snug group-hover:text-blue-400 transition">
                                {task.name}
                              </span>
                            </div>

                            {task.description && (
                              <p className="text-[10px] text-slate-500 dark:text-zinc-500 line-clamp-2 mt-1.5 font-light leading-relaxed">
                                {task.description}
                              </p>
                            )}

                            {/* Subtasks checklist progress bar on card */}
                            {task.subtasks && task.subtasks.length > 0 && (() => {
                              const doneCount = task.subtasks.filter(s => s.done).length;
                              const totalSub = task.subtasks.length;
                              const pct = Math.round((doneCount / totalSub) * 100);
                              return (
                                <div className="mt-3 space-y-1">
                                  <div className="flex justify-between text-[9px] font-bold text-slate-500 dark:text-zinc-500">
                                    <span className="flex items-center space-x-0.5">
                                      <CheckSquare className="w-2.5 h-2.5 text-blue-500" />
                                      <span>Subtasks</span>
                                    </span>
                                    <span>{doneCount}/{totalSub}</span>
                                  </div>
                                  <div className="w-full bg-slate-100/60 dark:bg-white/5 rounded-full h-1 overflow-hidden">
                                    <div className="bg-blue-500 h-full rounded-full transition-all" style={{ width: `${pct}%` }} />
                                  </div>
                                </div>
                              );
                            })()}

                            <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-100 dark:border-white/5 text-[9px] text-slate-500 dark:text-zinc-500 font-bold uppercase tracking-wider">
                              <div className="flex items-center space-x-2">
                                <span className="bg-blue-500/10 border border-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded font-mono text-[8px]">
                                  {task.weight} SP
                                </span>
                                {task.dueDate && (
                                  <span className="flex items-center space-x-0.5 text-slate-500 dark:text-zinc-500">
                                    <Clock className="w-2.5 h-2.5 text-zinc-600" />
                                    <span>{new Date(task.dueDate).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
                                  </span>
                                )}
                              </div>

                              {/* Assignee Avatar */}
                              <div
                                className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-black text-slate-900 dark:text-white shrink-0 shadow-inner"
                                style={{ backgroundColor: getAvatarBg(task.assignee) }}
                                title={`Assignee: ${task.assignee}`}
                              >
                                {getInitials(task.assignee)}
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Column 2: In Progress */}
                  <div
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, 'in_progress')}
                    className="glass-panel-heavy rounded-2xl p-4 border border-slate-100 dark:border-white/5 flex flex-col space-y-3 min-h-[500px] w-[280px] md:w-[320px] shrink-0 bg-slate-50/50 dark:bg-zinc-900/20 hover:bg-zinc-900/30 transition-all duration-300"
                  >
                    <div className="flex justify-between items-center border-b border-slate-100 dark:border-white/5 pb-2">
                      <div className="flex items-center space-x-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]" />
                        <h6 className="text-xs font-extrabold text-slate-900 dark:text-white uppercase tracking-wider">In Progress</h6>
                      </div>
                      <span className="text-[10px] font-bold bg-slate-100/60 dark:bg-white/5 px-2 py-0.5 rounded-md text-slate-600 dark:text-zinc-400 border border-slate-100 dark:border-white/5">
                        {inProgressTasks.length}
                      </span>
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-3 pr-1 max-h-[600px] scrollbar-thin">
                      {inProgressTasks.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-center p-6 text-zinc-600 border border-dashed border-zinc-800 rounded-xl py-12">
                          <Activity className="w-6 h-6 mb-1 text-slate-800 dark:text-zinc-300" />
                          <p className="text-[10px] italic">No active works.</p>
                        </div>
                      ) : (
                        inProgressTasks.map((task) => (
                          <div
                            key={task.id}
                            draggable={getCanDragTask(task)}
                            onDragStart={(e) => handleDragStart(e, task.id, 'in_progress')}
                            onClick={() => setActiveTaskId(task.id)}
                            className={`p-3.5 rounded-xl border border-slate-100 dark:border-white/5 bg-white dark:bg-zinc-900/60 transition-all duration-200 cursor-pointer shadow-md group relative ${
                              selectedSprint.status === 'closed' ? 'opacity-85' : 'active:scale-95'
                            } ${
                              getCanDragTask(task)
                                ? 'cursor-grab active:cursor-grabbing hover:bg-zinc-900/90 hover:border-amber-500/40'
                                : 'cursor-default opacity-85 hover:bg-white dark:bg-zinc-900/60 hover:border-slate-100 dark:border-white/5'
                            }`}
                          >
                            <div className="flex justify-between items-start space-x-2">
                              <span className="text-xs font-bold text-slate-900 dark:text-white leading-snug group-hover:text-amber-400 transition">
                                {task.name}
                              </span>
                            </div>

                            {task.description && (
                              <p className="text-[10px] text-slate-500 dark:text-zinc-500 line-clamp-2 mt-1.5 font-light leading-relaxed">
                                {task.description}
                              </p>
                            )}

                            {/* Subtasks checklist progress bar on card */}
                            {task.subtasks && task.subtasks.length > 0 && (() => {
                              const doneCount = task.subtasks.filter(s => s.done).length;
                              const totalSub = task.subtasks.length;
                              const pct = Math.round((doneCount / totalSub) * 100);
                              return (
                                <div className="mt-3 space-y-1">
                                  <div className="flex justify-between text-[9px] font-bold text-slate-500 dark:text-zinc-500">
                                    <span className="flex items-center space-x-0.5">
                                      <CheckSquare className="w-2.5 h-2.5 text-amber-500" />
                                      <span>Subtasks</span>
                                    </span>
                                    <span>{doneCount}/{totalSub}</span>
                                  </div>
                                  <div className="w-full bg-slate-100/60 dark:bg-white/5 rounded-full h-1 overflow-hidden">
                                    <div className="bg-amber-500 h-full rounded-full transition-all" style={{ width: `${pct}%` }} />
                                  </div>
                                </div>
                              );
                            })()}

                            <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-100 dark:border-white/5 text-[9px] text-slate-500 dark:text-zinc-500 font-bold uppercase tracking-wider">
                              <div className="flex items-center space-x-2">
                                <span className="bg-amber-500/10 border border-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded font-mono text-[8px]">
                                  {task.weight} SP
                                </span>
                                {task.dueDate && (
                                  <span className="flex items-center space-x-0.5 text-slate-500 dark:text-zinc-500">
                                    <Clock className="w-2.5 h-2.5 text-zinc-600" />
                                    <span>{new Date(task.dueDate).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
                                  </span>
                                )}
                              </div>

                              {/* Assignee Avatar */}
                              <div
                                className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-black text-slate-900 dark:text-white shrink-0 shadow-inner"
                                style={{ backgroundColor: getAvatarBg(task.assignee) }}
                                title={`Assignee: ${task.assignee}`}
                              >
                                {getInitials(task.assignee)}
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Column 3: In Review */}
                  <div
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, 'in_review')}
                    className="glass-panel-heavy rounded-2xl p-4 border border-slate-100 dark:border-white/5 flex flex-col space-y-3 min-h-[500px] w-[280px] md:w-[320px] shrink-0 bg-slate-50/50 dark:bg-zinc-900/20 hover:bg-zinc-900/30 transition-all duration-300"
                  >
                    <div className="flex justify-between items-center border-b border-slate-100 dark:border-white/5 pb-2">
                      <div className="flex items-center space-x-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.6)]" />
                        <h6 className="text-xs font-extrabold text-slate-900 dark:text-white uppercase tracking-wider">In Review</h6>
                      </div>
                      <span className="text-[10px] font-bold bg-slate-100/60 dark:bg-white/5 px-2 py-0.5 rounded-md text-slate-600 dark:text-zinc-400 border border-slate-100 dark:border-white/5">
                        {reviewTasks.length}
                      </span>
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-3 pr-1 max-h-[600px] scrollbar-thin">
                      {reviewTasks.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-center p-6 text-zinc-600 border border-dashed border-zinc-800 rounded-xl py-12">
                          <Activity className="w-6 h-6 mb-1 text-slate-800 dark:text-zinc-300" />
                          <p className="text-[10px] italic">No reviews pending.</p>
                        </div>
                      ) : (
                        reviewTasks.map((task) => (
                          <div
                            key={task.id}
                            draggable={getCanDragTask(task)}
                            onDragStart={(e) => handleDragStart(e, task.id, 'in_review')}
                            onClick={() => setActiveTaskId(task.id)}
                            className={`p-3.5 rounded-xl border border-slate-100 dark:border-white/5 bg-white dark:bg-zinc-900/60 transition-all duration-200 cursor-pointer shadow-md group relative ${
                              selectedSprint.status === 'closed' ? 'opacity-85' : 'active:scale-95'
                            } ${
                              getCanDragTask(task)
                                ? 'cursor-grab active:cursor-grabbing hover:bg-zinc-900/90 hover:border-purple-500/40'
                                : 'cursor-default opacity-85 hover:bg-white dark:bg-zinc-900/60 hover:border-slate-100 dark:border-white/5'
                            }`}
                          >
                            <div className="flex justify-between items-start space-x-2">
                              <span className="text-xs font-bold text-slate-900 dark:text-white leading-snug group-hover:text-purple-400 transition">
                                {task.name}
                              </span>
                            </div>

                            {task.description && (
                              <p className="text-[10px] text-slate-500 dark:text-zinc-500 line-clamp-2 mt-1.5 font-light leading-relaxed">
                                {task.description}
                              </p>
                            )}

                            {/* Subtasks checklist progress bar on card */}
                            {task.subtasks && task.subtasks.length > 0 && (() => {
                              const doneCount = task.subtasks.filter(s => s.done).length;
                              const totalSub = task.subtasks.length;
                              const pct = Math.round((doneCount / totalSub) * 100);
                              return (
                                <div className="mt-3 space-y-1">
                                  <div className="flex justify-between text-[9px] font-bold text-slate-500 dark:text-zinc-500">
                                    <span className="flex items-center space-x-0.5">
                                      <CheckSquare className="w-2.5 h-2.5 text-purple-500" />
                                      <span>Subtasks</span>
                                    </span>
                                    <span>{doneCount}/{totalSub}</span>
                                  </div>
                                  <div className="w-full bg-slate-100/60 dark:bg-white/5 rounded-full h-1 overflow-hidden">
                                    <div className="bg-purple-500 h-full rounded-full transition-all" style={{ width: `${pct}%` }} />
                                  </div>
                                </div>
                              );
                            })()}

                            <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-100 dark:border-white/5 text-[9px] text-slate-500 dark:text-zinc-500 font-bold uppercase tracking-wider">
                              <div className="flex items-center space-x-2">
                                <span className="bg-purple-500/10 border border-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded font-mono text-[8px]">
                                  {task.weight} SP
                                </span>
                                {task.dueDate && (
                                  <span className="flex items-center space-x-0.5 text-slate-500 dark:text-zinc-500">
                                    <Clock className="w-2.5 h-2.5 text-zinc-600" />
                                    <span>{new Date(task.dueDate).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
                                  </span>
                                )}
                              </div>

                              {/* Assignee Avatar */}
                              <div
                                className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-black text-slate-900 dark:text-white shrink-0 shadow-inner"
                                style={{ backgroundColor: getAvatarBg(task.assignee) }}
                                title={`Assignee: ${task.assignee}`}
                              >
                                {getInitials(task.assignee)}
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Column 4: Done */}
                  <div
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, 'done')}
                    className="glass-panel-heavy rounded-2xl p-4 border border-slate-100 dark:border-white/5 flex flex-col space-y-3 min-h-[500px] w-[280px] md:w-[320px] shrink-0 bg-slate-50/50 dark:bg-zinc-900/20 hover:bg-zinc-900/30 transition-all duration-300"
                  >
                    <div className="flex justify-between items-center border-b border-slate-100 dark:border-white/5 pb-2">
                      <div className="flex items-center space-x-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
                        <h6 className="text-xs font-extrabold text-slate-900 dark:text-white uppercase tracking-wider">Done</h6>
                      </div>
                      <span className="text-[10px] font-bold bg-slate-100/60 dark:bg-white/5 px-2 py-0.5 rounded-md text-slate-600 dark:text-zinc-400 border border-slate-100 dark:border-white/5">
                        {doneTasks.length}
                      </span>
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-3 pr-1 max-h-[600px] scrollbar-thin">
                      {doneTasks.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-center p-6 text-zinc-600 border border-dashed border-zinc-800 rounded-xl py-12">
                          <Activity className="w-6 h-6 mb-1 text-slate-800 dark:text-zinc-300" />
                          <p className="text-[10px] italic">No completed deliverables.</p>
                        </div>
                      ) : (
                        doneTasks.map((task) => (
                          <div
                            key={task.id}
                            draggable={getCanDragTask(task)}
                            onDragStart={(e) => handleDragStart(e, task.id, 'done')}
                            onClick={() => setActiveTaskId(task.id)}
                            className={`p-3.5 rounded-xl border border-slate-100 dark:border-white/5 bg-white dark:bg-zinc-900/60 transition-all duration-200 cursor-pointer shadow-md group relative ${
                              selectedSprint.status === 'closed' ? 'opacity-85' : 'active:scale-95'
                            } ${
                              getCanDragTask(task)
                                ? 'cursor-grab active:cursor-grabbing hover:bg-zinc-900/90 hover:border-emerald-500/40'
                                : 'cursor-default opacity-85 hover:bg-white dark:bg-zinc-900/60 hover:border-slate-100 dark:border-white/5'
                            }`}
                          >
                            <div className="flex justify-between items-start space-x-2">
                              <span className="text-xs font-bold text-slate-600 dark:text-zinc-400 line-through leading-snug group-hover:text-emerald-400 transition">
                                {task.name}
                              </span>
                            </div>

                            {task.description && (
                              <p className="text-[10px] text-slate-500 dark:text-zinc-500 line-clamp-2 mt-1.5 font-light leading-relaxed">
                                {task.description}
                              </p>
                            )}

                            {/* Subtasks checklist progress bar on card */}
                            {task.subtasks && task.subtasks.length > 0 && (() => {
                              const doneCount = task.subtasks.filter(s => s.done).length;
                              const totalSub = task.subtasks.length;
                              const pct = Math.round((doneCount / totalSub) * 100);
                              return (
                                <div className="mt-3 space-y-1">
                                  <div className="flex justify-between text-[9px] font-bold text-slate-500 dark:text-zinc-500">
                                    <span className="flex items-center space-x-0.5">
                                      <CheckSquare className="w-2.5 h-2.5 text-emerald-500" />
                                      <span>Subtasks</span>
                                    </span>
                                    <span>{doneCount}/{totalSub}</span>
                                  </div>
                                  <div className="w-full bg-slate-100/60 dark:bg-white/5 rounded-full h-1 overflow-hidden">
                                    <div className="bg-emerald-500 h-full rounded-full transition-all" style={{ width: `${pct}%` }} />
                                  </div>
                                </div>
                              );
                            })()}

                            <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-100 dark:border-white/5 text-[9px] text-slate-500 dark:text-zinc-500 font-bold uppercase tracking-wider">
                              <div className="flex items-center space-x-2">
                                <span className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded font-mono text-[8px]">
                                  {task.weight} SP
                                </span>
                                {task.dueDate && (
                                  <span className="flex items-center space-x-0.5 text-slate-500 dark:text-zinc-500">
                                    <Clock className="w-2.5 h-2.5 text-zinc-600" />
                                    <span>{new Date(task.dueDate).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
                                  </span>
                                )}
                              </div>

                              {/* Assignee Avatar */}
                              <div
                                className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-black text-slate-900 dark:text-white shrink-0 shadow-inner"
                                style={{ backgroundColor: getAvatarBg(task.assignee) }}
                                title={`Assignee: ${task.assignee}`}
                              >
                                {getInitials(task.assignee)}
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Column 5: Blocked */}
                  <div
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, 'blocked')}
                    className="glass-panel-heavy rounded-2xl p-4 border border-slate-100 dark:border-white/5 flex flex-col space-y-3 min-h-[500px] w-[280px] md:w-[320px] shrink-0 bg-slate-50/50 dark:bg-zinc-900/20 hover:bg-zinc-900/30 transition-all duration-300"
                  >
                    <div className="flex justify-between items-center border-b border-slate-100 dark:border-white/5 pb-2">
                      <div className="flex items-center space-x-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)]" />
                        <h6 className="text-xs font-extrabold text-slate-900 dark:text-white uppercase tracking-wider">Blocked</h6>
                      </div>
                      <span className="text-[10px] font-bold bg-slate-100/60 dark:bg-white/5 px-2 py-0.5 rounded-md text-slate-600 dark:text-zinc-400 border border-slate-100 dark:border-white/5">
                        {blockedTasks.length}
                      </span>
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-3 pr-1 max-h-[600px] scrollbar-thin">
                      {blockedTasks.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-center p-6 text-zinc-600 border border-dashed border-zinc-800 rounded-xl py-12">
                          <Activity className="w-6 h-6 mb-1 text-slate-800 dark:text-zinc-300" />
                          <p className="text-[10px] italic">No active blockers.</p>
                        </div>
                      ) : (
                        blockedTasks.map((task) => (
                          <div
                            key={task.id}
                            draggable={getCanDragTask(task)}
                            onDragStart={(e) => handleDragStart(e, task.id, 'blocked')}
                            onClick={() => setActiveTaskId(task.id)}
                            className={`p-3.5 rounded-xl border border-slate-100 dark:border-white/5 bg-white dark:bg-zinc-900/60 transition-all duration-200 cursor-pointer shadow-md group relative ${
                              selectedSprint.status === 'closed' ? 'opacity-85' : 'active:scale-95'
                            } ${
                              getCanDragTask(task)
                                ? 'cursor-grab active:cursor-grabbing hover:bg-zinc-900/90 hover:border-rose-500/40'
                                : 'cursor-default opacity-85 hover:bg-white dark:bg-zinc-900/60 hover:border-slate-100 dark:border-white/5'
                            }`}
                          >
                            <div className="flex justify-between items-start space-x-2">
                              <span className="text-xs font-bold text-slate-900 dark:text-white leading-snug group-hover:text-rose-400 transition">
                                {task.name}
                              </span>
                            </div>

                            {task.description && (
                              <p className="text-[10px] text-slate-500 dark:text-zinc-500 line-clamp-2 mt-1.5 font-light leading-relaxed">
                                {task.description}
                              </p>
                            )}

                            {/* Subtasks checklist progress bar on card */}
                            {task.subtasks && task.subtasks.length > 0 && (() => {
                              const doneCount = task.subtasks.filter(s => s.done).length;
                              const totalSub = task.subtasks.length;
                              const pct = Math.round((doneCount / totalSub) * 100);
                              return (
                                <div className="mt-3 space-y-1">
                                  <div className="flex justify-between text-[9px] font-bold text-slate-500 dark:text-zinc-500">
                                    <span className="flex items-center space-x-0.5">
                                      <CheckSquare className="w-2.5 h-2.5 text-rose-500" />
                                      <span>Subtasks</span>
                                    </span>
                                    <span>{doneCount}/{totalSub}</span>
                                  </div>
                                  <div className="w-full bg-slate-100/60 dark:bg-white/5 rounded-full h-1 overflow-hidden">
                                    <div className="bg-rose-500 h-full rounded-full transition-all" style={{ width: `${pct}%` }} />
                                  </div>
                                </div>
                              );
                            })()}

                            <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-100 dark:border-white/5 text-[9px] text-slate-500 dark:text-zinc-500 font-bold uppercase tracking-wider">
                              <div className="flex items-center space-x-2">
                                <span className="bg-rose-500/10 border border-rose-500/20 text-rose-400 px-1.5 py-0.5 rounded font-mono text-[8px]">
                                  {task.weight} SP
                                </span>
                                {task.dueDate && (
                                  <span className="flex items-center space-x-0.5 text-slate-500 dark:text-zinc-500">
                                    <Clock className="w-2.5 h-2.5 text-zinc-600" />
                                    <span>{new Date(task.dueDate).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
                                  </span>
                                )}
                              </div>

                              {/* Assignee Avatar */}
                              <div
                                className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-black text-slate-900 dark:text-white shrink-0 shadow-inner"
                                style={{ backgroundColor: getAvatarBg(task.assignee) }}
                                title={`Assignee: ${task.assignee}`}
                              >
                                {getInitials(task.assignee)}
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="glass-panel rounded-2xl p-16 text-center border border-border flex flex-col items-center justify-center space-y-4">
              <Activity className="w-16 h-16 text-slate-500 dark:text-zinc-500" />
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">No sprint selected</h3>
                <p className="text-xs text-muted-foreground max-w-sm mt-1 mx-auto font-light">
                  Select a sprint deliverable in the sidebar backlog or plan a new sprint increment.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Plan New Sprint Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md">
          <div className="w-full max-w-md glass-panel-heavy rounded-2xl p-6 border border-border shadow-2xl animate-scale-in">
            <div className="flex items-center justify-between border-b border-border pb-3 mb-5">
              <div className="flex items-center space-x-2 text-slate-900 dark:text-white">
                <Sparkles className="w-5 h-5 text-blue-500" />
                <h4 className="font-bold text-base">Plan New Sprint</h4>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1 rounded-lg hover:bg-slate-100/60 dark:bg-white/5 text-muted-foreground hover:text-white transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                  Sprint Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Q2 Sprint 1 Core RLS Setup"
                  {...register('name')}
                  className="w-full px-4 py-3 rounded-xl bg-slate-100/60 dark:bg-white/5 border border-border text-white text-sm focus:outline-none focus:border-blue-500 transition-all font-light"
                />
                {errors.name && (
                  <p className="text-[10px] font-bold text-red-400 tracking-wider">
                    {errors.name.message}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                  Governance Stage Gate Link
                </label>
                <select
                  {...register('phaseId')}
                  className="w-full px-4 py-3 rounded-xl bg-background border border-border text-white text-xs focus:outline-none focus:border-blue-500"
                >
                  <option value="">Select Target Stage Gate...</option>
                  {(project.phases || []).map((phase) => (
                    <option key={phase.id} value={phase.id}>
                      {phase.name} (Status: {phase.status})
                    </option>
                  ))}
                </select>
                {errors.phaseId && (
                  <p className="text-[10px] font-bold text-red-400 tracking-wider">
                    {errors.phaseId.message}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                  Sprint Frequency
                </label>
                <select
                  {...register('cadence')}
                  className="w-full px-4 py-3 rounded-xl bg-background border border-border text-white text-xs focus:outline-none focus:border-blue-500"
                >
                  <option value="Weekly">Weekly</option>
                  <option value="Bi-Weekly">Bi-Weekly</option>
                  <option value="Monthly">Monthly</option>
                  <option value="Custom">Custom</option>
                </select>
                {errors.cadence && (
                  <p className="text-[10px] font-bold text-red-400 tracking-wider">
                    {errors.cadence.message}
                  </p>
                )}
              </div>

              {/* Conditional Date Selection & Readonly Preview Card */}
              {watchedCadence === 'Custom' ? (
                <div className="grid grid-cols-2 gap-4 animate-fade-in transition-all duration-300">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-500 dark:text-zinc-500 uppercase tracking-widest">Start Date</label>
                    <input
                      type="date"
                      {...register('startDate')}
                      className="w-full px-4 py-2 bg-slate-100/60 dark:bg-white/5 border border-border text-white text-xs rounded-xl focus:outline-none focus:border-blue-500"
                    />
                    {errors.startDate && (
                      <p className="text-[10px] font-bold text-red-400 tracking-wider">
                        {errors.startDate.message}
                      </p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-500 dark:text-zinc-500 uppercase tracking-widest">End Date</label>
                    <input
                      type="date"
                      {...register('endDate')}
                      className="w-full px-4 py-2 bg-slate-100/60 dark:bg-white/5 border border-border text-white text-xs rounded-xl focus:outline-none focus:border-blue-500"
                    />
                    {errors.endDate && (
                      <p className="text-[10px] font-bold text-red-400 tracking-wider">
                        {errors.endDate.message}
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-4 animate-fade-in transition-all duration-300">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-500 dark:text-zinc-500 uppercase tracking-widest">Start Date</label>
                    <input
                      type="date"
                      {...register('startDate')}
                      className="w-full px-4 py-2 bg-slate-100/60 dark:bg-white/5 border border-border text-white text-xs rounded-xl focus:outline-none focus:border-blue-500"
                    />
                    {errors.startDate && (
                      <p className="text-[10px] font-bold text-red-400 tracking-wider">
                        {errors.startDate.message}
                      </p>
                    )}
                  </div>
                  
                  {/* Readonly Date Preview Card */}
                  {watchedStartDate && watchedEndDate && (
                    <div className="glass-panel p-4 rounded-xl border border-blue-500/20 bg-blue-500/5 text-xs text-slate-700 dark:text-zinc-300 flex items-center space-x-3.5 shadow-inner">
                      <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 select-none animate-pulse">
                        🔄
                      </div>
                      <div className="flex-1 min-w-0 space-y-1">
                        <p className="text-[10px] font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wider">
                          Auto-Calculated Sprint Duration
                        </p>
                        <p className="text-xs text-slate-900 dark:text-white font-medium">
                          {formatPreviewDate(watchedStartDate)} <span className="text-indigo-400 mx-1">→</span> {formatPreviewDate(watchedEndDate)}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="pt-2 flex space-x-3 justify-end text-xs">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2.5 rounded-xl hover:bg-slate-100/60 dark:bg-white/5 font-semibold text-muted-foreground hover:text-white border border-transparent"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createSprintMutation.isPending}
                  className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold tracking-wide transition-all disabled:opacity-50 shadow-lg glow-primary flex items-center space-x-1.5"
                >
                  {createSprintMutation.isPending ? (
                    <>
                      <div className="w-3.5 h-3.5 rounded-full border-2 border-white/20 border-t-white animate-spin" />
                      <span>Planning...</span>
                    </>
                  ) : (
                    <span>Plan Increment</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Governance Blocker Checklist warning overlay */}
      {showBlockerModal && selectedSprint && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/95 backdrop-blur-md">
          <div className="w-full max-w-lg glass-panel-heavy border border-red-500/30 rounded-2xl p-6 shadow-2xl animate-scale-in text-center space-y-5">
            <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 text-red-500 flex items-center justify-center mx-auto glow-danger">
              <ShieldAlert className="w-9 h-9" />
            </div>

            <div>
              <h4 className="text-lg font-extrabold text-slate-900 dark:text-white">Governance Blocker: Incomplete Deliverables</h4>
              <p className="text-xs text-muted-foreground max-w-md mx-auto mt-1.5 font-light">
                Agile restrictions deny closing sprint "{selectedSprint.name}". In accordance with safety checklists, all active tasks must be closed prior to sprint closure.
              </p>
            </div>

            {/* Checklist of incomplete tasks */}
            <div className="bg-slate-100/60 dark:bg-white/5 border border-slate-100 dark:border-white/5 rounded-xl p-4 text-left max-h-48 overflow-y-auto space-y-2">
              <p className="text-[10px] font-bold text-red-400 uppercase tracking-widest">Active Blockers Checklist:</p>
              {activeSprintTasks
                .filter((t) => t.status !== 'done')
                .map((task) => (
                  <div key={task.id} className="flex justify-between items-center p-2 rounded bg-red-500/5 border border-red-500/10 text-xs text-red-200">
                    <span className="font-semibold truncate max-w-[280px]">{task.name}</span>
                    <span className="text-[9px] uppercase font-bold px-2 py-0.5 rounded border border-red-500/20 bg-red-500/10">
                      {task.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                ))}
            </div>

            <div className="pt-2 flex justify-center text-xs">
              <button
                onClick={() => setShowBlockerModal(false)}
                className="px-6 py-2.5 rounded-xl bg-slate-100/60 dark:bg-white/5 border border-border text-slate-700 dark:text-zinc-300 hover:text-white hover:bg-slate-200/60 dark:bg-white/10 transition-all font-semibold"
              >
                Acknowledge & Resolve Checklist
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Task Modal */}
      {showAddTaskModal && selectedSprint && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md">
          <div className="w-full max-w-md glass-panel-heavy rounded-2xl p-6 border border-border shadow-2xl animate-scale-in">
            <div className="flex items-center justify-between border-b border-border pb-3 mb-5">
              <div className="flex items-center space-x-2 text-slate-900 dark:text-white">
                <PlusCircle className="w-5 h-5 text-blue-500" />
                <h4 className="font-bold text-base">Add Task Deliverable</h4>
              </div>
              <button
                onClick={() => setShowAddTaskModal(false)}
                className="p-1 rounded-lg hover:bg-slate-100/60 dark:bg-white/5 text-muted-foreground hover:text-white transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                  Task Details / Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Provision multi-tenant schema audits"
                  value={addTaskName}
                  onChange={(e) => setAddTaskName(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-slate-100/60 dark:bg-white/5 border border-border text-white text-sm focus:outline-none focus:border-blue-500 transition-all font-light"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                  Description
                </label>
                <textarea
                  placeholder="Detailed breakdown of criteria, remediation plans, or goals..."
                  value={addTaskDesc}
                  onChange={(e) => setAddTaskDesc(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-3 rounded-xl bg-slate-100/60 dark:bg-white/5 border border-border text-white text-sm focus:outline-none focus:border-blue-500 transition-all font-light resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-500 dark:text-zinc-500 uppercase tracking-widest">
                    Story Weight
                  </label>
                  <select
                    value={addTaskWeight}
                    onChange={(e) => setAddTaskWeight(Number(e.target.value))}
                    className="w-full px-4 py-2.5 bg-background border border-border text-white text-xs rounded-xl focus:outline-none focus:border-blue-500"
                  >
                    <option value={1}>1 SP (Extra Light)</option>
                    <option value={2}>2 SP (Light)</option>
                    <option value={3}>3 SP (Medium)</option>
                    <option value={5}>5 SP (Heavy)</option>
                    <option value={8}>8 SP (Epic/Complex)</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-500 dark:text-zinc-500 uppercase tracking-widest">
                    Due Date
                  </label>
                  <input
                    type="date"
                    value={addTaskDueDate}
                    onChange={(e) => setAddTaskDueDate(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-100/60 dark:bg-white/5 border border-border text-white text-xs rounded-xl focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-500 dark:text-zinc-500 uppercase tracking-widest">
                  Assignee
                </label>
                <select
                  value={addTaskAssignee}
                  onChange={(e) => setAddTaskAssignee(e.target.value)}
                  className="w-full px-4 py-2.5 bg-background border border-border text-white text-xs rounded-xl focus:outline-none focus:border-blue-500"
                >
                  <option value="unassigned@acme.com">Unassigned</option>
                  {filteredMembersForCreate.length > 0 ? (
                    filteredMembersForCreate.map((m) => (
                      <option key={m.id} value={m.email}>
                        {m.firstName} {m.lastName} ({m.email})
                      </option>
                    ))
                  ) : (
                    <>
                      <option value="admin@acme.com">admin@acme.com</option>
                      <option value="lead-dev@acme.com">lead-dev@acme.com</option>
                      <option value="qa-engineer@acme.com">qa-engineer@acme.com</option>
                      <option value="product-owner@acme.com">product-owner@acme.com</option>
                    </>
                  )}
                </select>
              </div>

              <div className="pt-2 flex space-x-3 justify-end text-xs">
                <button
                  type="button"
                  onClick={() => setShowAddTaskModal(false)}
                  className="px-4 py-2.5 rounded-xl hover:bg-slate-100/60 dark:bg-white/5 font-semibold text-muted-foreground hover:text-white border border-transparent"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleCreateTaskConfirm(selectedSprint.id)}
                  disabled={!addTaskName.trim()}
                  className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold tracking-wide transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg glow-primary flex items-center space-x-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Task</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Task Details sliding command drawer panel with discussions and checklist */}
      {activeTask && selectedSprint && (
        <>
          {/* Overlay to click out */}
          <div
            onClick={() => setActiveTaskId(null)}
            className="fixed inset-0 bg-background/50 backdrop-blur-sm z-40 transition-opacity duration-300"
          />

          <div className="fixed top-0 right-0 h-full w-[540px] bg-zinc-950/98 border-l border-zinc-800/80 shadow-[0_0_50px_rgba(0,0,0,0.8)] backdrop-blur-lg z-50 p-6 overflow-y-auto transform transition-transform duration-300 ease-out flex flex-col justify-between animate-slide-in">
            <div className="space-y-6 flex-1 overflow-y-auto pr-1 pb-6">
              {/* Header */}
              <div className="flex justify-between items-start border-b border-slate-100 dark:border-white/5 pb-4">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className={`text-[8px] uppercase tracking-wider font-extrabold px-1.5 py-0.5 rounded border ${
                      activeTask.status === 'done'
                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                        : activeTask.status === 'in_progress'
                        ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                        : activeTask.status === 'in_review'
                        ? 'bg-purple-500/10 border-purple-500/20 text-purple-400'
                        : activeTask.status === 'blocked'
                        ? 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                        : 'bg-zinc-500/10 border-zinc-500/20 text-slate-500 dark:text-zinc-500'
                    }`}>
                      {activeTask.status.replace(/_/g, ' ')}
                    </span>
                    <span className="text-[10px] text-slate-500 dark:text-zinc-500 font-mono">
                      ID: {activeTask.id}
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
                    {activeTask.name}
                  </h3>
                </div>

                <div className="flex items-center space-x-2">
                  {selectedSprint.status !== 'closed' && canEditFull && (
                    <button
                      onClick={() => {
                        if (confirm('Delete this task deliverable permanently?')) {
                          handleDeleteTask(selectedSprint.id, activeTask.id);
                        }
                      }}
                      className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-500 dark:text-zinc-500 hover:text-red-400 transition"
                      title="Delete deliverable"
                    >
                      <Trash className="w-4.5 h-4.5" />
                    </button>
                  )}
                  <button
                    onClick={() => setActiveTaskId(null)}
                    className="p-1.5 rounded-lg hover:bg-slate-100/60 dark:bg-white/5 text-slate-600 dark:text-zinc-400 hover:text-white transition"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Task Fields Configuration Panel */}
              <div className="bg-white/3 border border-slate-100 dark:border-white/5 rounded-2xl p-4 grid grid-cols-2 gap-4 text-xs">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 dark:text-zinc-500 uppercase tracking-widest">Assignee</label>
                  <select
                    disabled={!canEditFull || selectedSprint.status === 'closed'}
                    value={activeTask.assignee}
                    onChange={(e) => handleUpdateTaskDetail(selectedSprint.id, activeTask.id, { assignee: e.target.value })}
                    className="w-full bg-background border border-zinc-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500 disabled:opacity-60"
                  >
                    <option value="unassigned@acme.com">Unassigned</option>
                    {filteredMembersForDrawer.length > 0 ? (
                      filteredMembersForDrawer.map((m) => (
                        <option key={m.id} value={m.email}>
                          {m.firstName} {m.lastName}
                        </option>
                      ))
                    ) : (
                      <>
                        <option value="admin@acme.com">admin@acme.com</option>
                        <option value="lead-dev@acme.com">lead-dev@acme.com</option>
                        <option value="qa-engineer@acme.com">qa-engineer@acme.com</option>
                        <option value="product-owner@acme.com">product-owner@acme.com</option>
                      </>
                    )}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 dark:text-zinc-500 uppercase tracking-widest">Story Weight</label>
                  <select
                    disabled={!canEditFull || selectedSprint.status === 'closed'}
                    value={activeTask.weight}
                    onChange={(e) => handleUpdateTaskDetail(selectedSprint.id, activeTask.id, { weight: Number(e.target.value) })}
                    className="w-full bg-background border border-zinc-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500 disabled:opacity-60 font-mono font-bold text-blue-400"
                  >
                    <option value={1}>1 SP</option>
                    <option value={2}>2 SP</option>
                    <option value={3}>3 SP</option>
                    <option value={5}>5 SP</option>
                    <option value={8}>8 SP</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 dark:text-zinc-500 uppercase tracking-widest">Due Date</label>
                  <input
                    type="date"
                    disabled={!canEditFull || selectedSprint.status === 'closed'}
                    value={activeTask.dueDate || ''}
                    onChange={(e) => handleUpdateTaskDetail(selectedSprint.id, activeTask.id, { dueDate: e.target.value })}
                    className="w-full bg-background border border-zinc-800 rounded-xl px-3 py-1.5 text-white focus:outline-none focus:border-blue-500 disabled:opacity-60"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 dark:text-zinc-500 uppercase tracking-widest">Status</label>
                  <select
                    disabled={!canUpdate || selectedSprint.status === 'closed'}
                    value={activeTask.status}
                    onChange={(e) => {
                      const nextStatus = e.target.value as any;
                      const fromStatus = activeTask.status;
                      handleToggleTaskStatus(selectedSprint.id, activeTask.id, nextStatus);
                      if (socket && isConnected) {
                        socket.emit('kanban_task_moved', {
                          projectId: project.id,
                          taskId: activeTask.id,
                          fromStatus,
                          toStatus: nextStatus,
                          actorName: user ? `${user.firstName} ${user.lastName}` : 'System'
                        });
                      }
                    }}
                    className="w-full bg-background border border-zinc-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500 disabled:opacity-60 uppercase font-black tracking-wide"
                  >
                    <option value="to_do">To Do</option>
                    <option value="in_progress">In Progress</option>
                    <option value="in_review">In Review</option>
                    <option value="done">Done</option>
                    <option value="blocked">Blocked</option>
                  </select>
                </div>
              </div>

              {/* Task Details description area */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 dark:text-zinc-500 uppercase tracking-widest">Description</label>
                <textarea
                  disabled={!canEditFull || selectedSprint.status === 'closed'}
                  value={activeTask.description || ''}
                  onChange={(e) => handleUpdateTaskDetail(selectedSprint.id, activeTask.id, { description: e.target.value })}
                  placeholder="Describe this deliverable tasks goals, security metrics, and remediation path..."
                  rows={3}
                  className="w-full px-4 py-3 rounded-2xl bg-white/3 border border-zinc-800 text-white text-xs focus:outline-none focus:border-blue-500 font-light resize-none leading-relaxed disabled:opacity-60"
                />
              </div>

              {/* Subtasks Checklist */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-bold text-slate-500 dark:text-zinc-500 uppercase tracking-widest">Subtasks Checklist</label>
                  <span className="text-[10px] text-slate-600 dark:text-zinc-400 font-bold font-mono">
                    {((activeTask.subtasks || []).filter(s => s.done).length)} / {((activeTask.subtasks || []).length)} Completed
                  </span>
                </div>

                {/* Subtask list */}
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {(activeTask.subtasks || []).length === 0 ? (
                    <p className="text-xs text-slate-500 dark:text-zinc-500 italic py-2 font-light">No subtasks created yet. Add one below.</p>
                  ) : (
                    (activeTask.subtasks || []).map((sub) => (
                      <div key={sub.id} className="flex items-center justify-between p-2.5 bg-white/2 hover:bg-white/4 border border-slate-100 dark:border-white/5 rounded-xl transition duration-150">
                        <button
                          disabled={!canUpdate || selectedSprint.status === 'closed'}
                          onClick={() => handleToggleSubtask(selectedSprint.id, activeTask.id, sub.id)}
                          className="flex items-center space-x-2 text-left text-xs text-white"
                        >
                          {sub.done ? (
                            <CheckSquare className="w-4 h-4 text-blue-400 shrink-0" />
                          ) : (
                            <Square className="w-4 h-4 text-zinc-600 shrink-0" />
                          )}
                          <span className={`transition ${sub.done ? 'line-through text-slate-500 dark:text-zinc-500 font-light' : 'font-semibold'}`}>
                            {sub.title}
                          </span>
                        </button>

                        {selectedSprint.status !== 'closed' && canUpdate && (
                          <button
                            onClick={() => handleDeleteSubtask(selectedSprint.id, activeTask.id, sub.id)}
                            className="p-1 rounded text-slate-500 dark:text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition"
                          >
                            <Trash className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>

                {/* Add Subtask Form */}
                {selectedSprint.status !== 'closed' && canUpdate && (
                  <div className="flex items-center space-x-2 pt-1">
                    <input
                      type="text"
                      placeholder="e.g. Review RLS query execution logs..."
                      value={newSubtaskTitle}
                      onChange={(e) => setNewSubtaskTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleAddSubtask(selectedSprint.id, activeTask.id);
                      }}
                      className="flex-1 px-4 py-2.5 bg-background border border-zinc-800 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500 font-light"
                    />
                    <button
                      onClick={() => handleAddSubtask(selectedSprint.id, activeTask.id)}
                      disabled={!newSubtaskTitle.trim()}
                      className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold transition flex items-center space-x-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Threaded Comments discussion section */}
              <div className="border-t border-slate-100 dark:border-white/5 pt-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h5 className="text-[10px] font-bold text-slate-500 dark:text-zinc-500 uppercase tracking-widest flex items-center space-x-1.5">
                    <MessageSquare className="w-4 h-4 text-blue-400" />
                    <span>Task Discussion Thread</span>
                  </h5>
                </div>

                <div className="h-[300px] border border-zinc-800/60 rounded-2xl bg-zinc-950 p-4">
                  <CommentsSystem
                    projectId={project.id}
                    entityId={activeTask.id}
                    entityType="TASK"
                  />
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ProjectSprints;
