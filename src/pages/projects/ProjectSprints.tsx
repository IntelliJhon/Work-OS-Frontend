import React, { useState, useEffect, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Project, Phase, Activity, Sprint } from '../../services/api/projects';
import { activitiesApi, sprintsApi } from '../../services/api/sprints';
import { tasksApi } from '../../services/api/tasks.api';
import { epicsApi } from '../../services/api/epics.api';
import { storiesApi } from '../../services/api/stories.api';
import { PermissionGate } from '../../features/auth/PermissionGate';
import { PERMISSIONS } from '../../features/auth/permission.constants';
import {
  Activity as ActivityIcon,
  Plus,
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
  ClipboardList,
  Layers
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

const createActivitySchema = z.object({
  title: z.string().min(3, 'Activity title must be at least 3 characters'),
  phaseId: z.string().min(1, 'Target Phase is required'),
  isSprintRelevant: z.boolean(),
});

const createSprintSchema = z.object({
  name: z.string().min(3, 'Sprint name must be at least 3 characters'),
  cadence: z.enum(['Weekly', 'Bi-Weekly', 'Monthly', 'Custom']),
  startDate: z.string().min(1, 'Start Date is required'),
  endDate: z.string().min(1, 'End Date is required'),
  goal: z.string().optional(),
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
});

type CreateActivityValues = z.infer<typeof createActivitySchema>;
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

  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
  const [selectedSprintId, setSelectedSprintId] = useState<string | null>(null);
  
  const [showCreateActivityModal, setShowCreateActivityModal] = useState(false);
  const [showCreateSprintModal, setShowCreateSprintModal] = useState(false);
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

  // Query Activities (the parent containers)
  const { data: activities = [], isLoading: isLoadingActivities, refetch: refetchActivities } = useQuery({
    queryKey: ['activities', project.id],
    queryFn: () => activitiesApi.listByProject(project.id),
    enabled: !!project.id,
  });

  const selectedActivity = activities.find((a) => a.id === (selectedActivityId || activities[0]?.id));

  // Query nested Sprints (cycles under selectedActivity)
  const { data: nestedSprints = [], isLoading: isLoadingSprints, refetch: refetchSprints } = useQuery({
    queryKey: ['sprints', selectedActivity?.id],
    queryFn: () => sprintsApi.listByActivity(selectedActivity!.id),
    enabled: !!selectedActivity?.id && selectedActivity.isSprintRelevant,
  });

  // Fallback to active nested sprint or first sprint if not explicitly selected
  const activeNestedSprint = useMemo(() => {
    if (!selectedActivity || !selectedActivity.isSprintRelevant) return null;
    return nestedSprints.find((s) => s.id === selectedSprintId) || nestedSprints.find(s => s.status === 'active') || nestedSprints[0] || null;
  }, [nestedSprints, selectedSprintId, selectedActivity]);

  useEffect(() => {
    if (activeNestedSprint) {
      setSelectedSprintId(activeNestedSprint.id);
    } else {
      setSelectedSprintId(null);
    }
  }, [activeNestedSprint]);

  // Compute activeSprintTasks dynamically based on database tasks
  const activeSprintTasks = useMemo(() => {
    if (!selectedActivity) return [];
    
    // Filter tasks belonging to the current project and active activity/sprint
    const filtered = dbTasks.filter((task) => {
      const matchProject = task.projectId === project.id;
      const matchActivity = task.activityId === selectedActivity.id;
      
      if (!matchProject || !matchActivity) return false;
      
      if (selectedActivity.isSprintRelevant) {
        return activeNestedSprint ? task.sprintId === activeNestedSprint.id : false;
      } else {
        return !task.sprintId;
      }
    });

    // Map DB tasks to UI's InteractiveTask structure
    return filtered.map((task) => {
      const member = members.find((m) => m.id === task.assigneeId);
      const assigneeEmail = member ? member.email : 'unassigned@acme.com';

      const customFields = task.customFields || {};
      const dueDate = customFields.dueDate || undefined;
      const storyPoints = customFields.storyPoints || 0;
      const subtasks = Array.isArray(customFields.subtasks) ? customFields.subtasks : [];

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
        status: (activeNestedSprint && activeNestedSprint.status === 'closed') ? ('done' as const) : mappedStatus,
        weight: storyPoints,
        assignee: assigneeEmail,
        dueDate,
        description: task.description || undefined,
        subtasks,
      };
    });
  }, [dbTasks, selectedActivity, activeNestedSprint, project.id, members]);

  // Mutations
  const createActivityMutation = useMutation({
    mutationFn: activitiesApi.create,
    onSuccess: (newActivity) => {
      queryClient.invalidateQueries({ queryKey: ['activities', project.id] });
      refetchActivities();
      setSelectedActivityId(newActivity.id);
      setShowCreateActivityModal(false);
      activityForm.reset();
    }
  });

  const createSprintMutation = useMutation({
    mutationFn: sprintsApi.create,
    onSuccess: (newSprint) => {
      queryClient.invalidateQueries({ queryKey: ['sprints', selectedActivity?.id] });
      refetchSprints();
      setSelectedSprintId(newSprint.id);
      setShowCreateSprintModal(false);
      sprintForm.reset();
    }
  });

  const startSprintMutation = useMutation({
    mutationFn: sprintsApi.start,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sprints', selectedActivity?.id] });
      refetchSprints();
      refetchProject();
    }
  });

  const closeSprintMutation = useMutation({
    mutationFn: sprintsApi.close,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['sprints', selectedActivity?.id] });
      refetchSprints();
      refetchProject();
    }
  });

  // Forms
  const activityForm = useForm<CreateActivityValues>({
    resolver: zodResolver(createActivitySchema),
    defaultValues: {
      title: '',
      phaseId: '',
      isSprintRelevant: false
    }
  });

  const sprintForm = useForm<CreateSprintValues>({
    resolver: zodResolver(createSprintSchema),
    defaultValues: {
      name: '',
      cadence: 'Weekly',
      startDate: '',
      endDate: '',
      goal: ''
    }
  });

  const watchedStartDate = sprintForm.watch('startDate');
  const watchedCadence = sprintForm.watch('cadence');

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
    
    const yyyy = end.getFullYear();
    const mm = String(end.getMonth() + 1).padStart(2, '0');
    const dd = String(end.getDate()).padStart(2, '0');
    sprintForm.setValue('endDate', `${yyyy}-${mm}-${dd}`);
  }, [watchedStartDate, watchedCadence, sprintForm]);

  const onActivitySubmit = (values: CreateActivityValues) => {
    createActivityMutation.mutate({
      projectId: project.id,
      phaseId: values.phaseId,
      title: values.title,
      isSprintRelevant: values.isSprintRelevant,
    });
  };

  const onSprintSubmit = (values: CreateSprintValues) => {
    if (!selectedActivity) return;

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
      activityId: selectedActivity.id,
      projectId: project.id,
      name: values.name,
      startDate: startDateISO,
      endDate: endDateISO,
      cadenceType,
      cadenceInterval,
      goal: values.goal,
    });
  };

  const getParentPhase = (activity: Activity): Phase | undefined => {
    return project.phases?.find((p) => p.id === activity.phaseId);
  };

  const formatCadenceBadge = (type?: string | null, interval?: number | null) => {
    if (!type) return null;
    if (type === 'WEEK') {
      if (interval === 1) return 'Weekly Cycle';
      if (interval === 2) return 'Bi-Weekly Cycle';
      return `${interval}-Week Cycle`;
    }
    if (type === 'MONTH') {
      if (interval === 1) return 'Monthly Cycle';
      return `${interval}-Month Cycle`;
    }
    return 'Custom Cycle';
  };

  const handleToggleTaskStatus = async (taskId: string, nextStatus: 'to_do' | 'in_progress' | 'in_review' | 'done' | 'blocked') => {
    try {
      await tasksApi.update(taskId, { status: nextStatus });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    } catch (err: any) {
      console.error('Failed to update task status', err);
      const errMsg = err?.response?.data?.message || err?.response?.data?.error || err.message || 'Failed to update task status';
      alert(`RBAC Security: ${errMsg}`);
    }
  };

  const handleUpdateTaskDetail = async (taskId: string, updates: Partial<InteractiveTask>) => {
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

      if (updates.weight !== undefined) newCustomFields.storyPoints = updates.weight;
      if (updates.dueDate !== undefined) {
        newCustomFields.dueDate = updates.dueDate;
        payload.dueDate = updates.dueDate;
      }
      if (updates.subtasks !== undefined) newCustomFields.subtasks = updates.subtasks;

      payload.customFields = newCustomFields;

      await tasksApi.update(taskId, payload);
      queryClient.invalidateQueries({ queryKey: ['tasks'] });

      if (socket && isConnected) {
        socket.emit('kanban_task_updated', {
          projectId: project.id,
          sprintId: activeNestedSprint?.id || null,
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

  const handleCreateTaskConfirm = async () => {
    if (!addTaskName.trim() || !selectedActivity) return;

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
        activityId: selectedActivity.id,
        sprintId: activeNestedSprint?.id || null,
        assigneeId: assigneeId,
        name: addTaskName.trim(),
        description: addTaskDesc.trim() || undefined,
        status: 'to_do',
        customFields: {
          priority: 'medium' as const,
          dueDate: addTaskDueDate || undefined,
          storyPoints: addTaskWeight,
          phaseId: selectedActivity.phaseId,
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
          title: 'Activity Deliverable Added',
          message: `${actorName} created task "${createdTask.name}" in activity.`,
          severity: 'low',
          actor: actorName
        });
      }

      if (socket && isConnected) {
        socket.emit('kanban_task_created', {
          projectId: project.id,
          sprintId: activeNestedSprint?.id || null,
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

  const handleDeleteTask = async (taskId: string) => {
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
          sprintId: activeNestedSprint?.id || null,
          taskId
        });
      }
    } catch (err) {
      console.error('Failed to delete task deliverable', err);
    }
  };

  // Drag and Drop Logic
  const handleDragStart = (e: React.DragEvent, taskId: string, fromStatus: 'to_do' | 'in_progress' | 'in_review' | 'done' | 'blocked') => {
    if (activeNestedSprint?.status === 'closed') {
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
    if (!activeNestedSprint || activeNestedSprint.status === 'closed') return;

    const taskId = e.dataTransfer.getData('text/plain');
    const fromStatus = e.dataTransfer.getData('fromStatus') as 'to_do' | 'in_progress' | 'in_review' | 'done' | 'blocked';

    if (fromStatus === toStatus) return;

    const movedTask = activeSprintTasks.find((t) => t.id === taskId);
    const taskName = movedTask?.name || 'Deliverable Task';

    await handleToggleTaskStatus(taskId, toStatus);

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

  const handleToggleSubtask = (taskId: string, subtaskId: string) => {
    const task = activeSprintTasks.find((t) => t.id === taskId);
    if (!task) return;

    const updatedSubtasks = (task.subtasks || []).map((sub) =>
      sub.id === subtaskId ? { ...sub, done: !sub.done } : sub
    );

    handleUpdateTaskDetail(taskId, { subtasks: updatedSubtasks });
  };

  const handleAddSubtask = (taskId: string) => {
    if (!newSubtaskTitle.trim()) return;

    const task = activeSprintTasks.find((t) => t.id === taskId);
    if (!task) return;

    const newSub: SubTask = {
      id: `sub_${Date.now()}`,
      title: newSubtaskTitle.trim(),
      done: false
    };

    const updatedSubtasks = [...(task.subtasks || []), newSub];
    handleUpdateTaskDetail(taskId, { subtasks: updatedSubtasks });
    setNewSubtaskTitle('');
  };

  const handleDeleteSubtask = (taskId: string, subtaskId: string) => {
    const task = activeSprintTasks.find((t) => t.id === taskId);
    if (!task) return;

    const updatedSubtasks = (task.subtasks || []).filter((sub) => sub.id !== subtaskId);
    handleUpdateTaskDetail(taskId, { subtasks: updatedSubtasks });
  };

  // Governance Sprint Rules Check: Close Sprint
  const handleCloseSprintAttempt = (sprint: Sprint) => {
    const tasksForSprint = dbTasks.filter((task) => task.sprintId === sprint.id);
    const incompleteTasks = tasksForSprint.filter((t) => t.status !== 'done' && t.status !== 'completed');

    if (incompleteTasks.length > 0) {
      setShowBlockerModal(true);
    } else {
      if (confirm('Are you ready to close this sprint cycle? The sprint status will be updated, locking all task weights into ledger history.')) {
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
    if (selectedActivity?.isSprintRelevant && activeNestedSprint?.status === 'closed') return false;
    const dbTask = dbTasks.find((t) => t.id === task.id);
    const isFullAccess = user?.role === 'Admin' || user?.role === 'Project Manager' || project?.pmId === user?.id;
    const isAssignee = dbTask?.assigneeId === user?.id;
    return isFullAccess || isAssignee;
  };

  const todoTasks = activeSprintTasks.filter((t) => t.status === 'to_do');
  const inProgressTasks = activeSprintTasks.filter((t) => t.status === 'in_progress');
  const reviewTasks = activeSprintTasks.filter((t) => t.status === 'in_review');
  const doneTasks = activeSprintTasks.filter((t) => t.status === 'done');
  const blockedTasks = activeSprintTasks.filter((t) => t.status === 'blocked');

  const activeTask = activeSprintTasks.find((t) => t.id === activeTaskId);
  const dbTaskForActive = activeTask ? dbTasks.find((t) => t.id === activeTask.id) : null;
  const isActiveFullAccess = user?.role === 'Admin' || user?.role === 'Project Manager' || project?.pmId === user?.id;
  const isActiveAssignee = dbTaskForActive?.assigneeId === user?.id;
  const canEditFull = isActiveFullAccess;
  const canUpdate = isActiveFullAccess || isActiveAssignee;

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

        {/* Sidebar: Activities list */}
        <div className="lg:col-span-1 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/5 pb-2">
            <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center space-x-1.5">
              <ClipboardList className="w-4 h-4 text-blue-400" />
              <span>Activities Planner</span>
            </h4>
            <PermissionGate permission={PERMISSIONS.PROJECT_MANAGE} behavior="hide">
              <button
                onClick={() => setShowCreateActivityModal(true)}
                className="p-1 rounded-lg hover:bg-slate-100/60 dark:bg-white/5 text-blue-400 hover:text-white transition-all cursor-pointer"
                title="Create New Activity"
              >
                <Plus className="w-4.5 h-4.5" />
              </button>
            </PermissionGate>
          </div>

          {isLoadingActivities ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 rounded-xl bg-slate-100/60 dark:bg-white/5 animate-pulse" />
              ))}
            </div>
          ) : activities.length === 0 ? (
            <div className="p-6 text-center border border-dashed border-border rounded-2xl bg-slate-100/60 dark:bg-white/5">
              <ActivityIcon className="w-8 h-8 text-slate-500 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground font-light">No activities provisioned.</p>
              <PermissionGate permission={PERMISSIONS.PROJECT_MANAGE} behavior="hide">
                <button
                  onClick={() => setShowCreateActivityModal(true)}
                  className="mt-3 text-xs bg-blue-600 hover:bg-blue-500 text-white font-bold px-3 py-1.5 rounded-lg transition-all cursor-pointer"
                >
                  Create New Activity
                </button>
              </PermissionGate>
            </div>
          ) : (
            <div className="space-y-2">
              {activities.map((act) => {
                const isSelected = selectedActivity?.id === act.id;
                const parentPhase = getParentPhase(act);

                return (
                  <div
                    key={act.id}
                    onClick={() => {
                      setSelectedActivityId(act.id);
                      setSelectedSprintId(null);
                      setActiveTaskId(null);
                    }}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all duration-300 ${
                      isSelected
                        ? 'border-blue-500 bg-blue-500/10 shadow-lg text-blue-400 glow-primary'
                        : 'border-border bg-slate-100/60 dark:bg-white/5 text-slate-600 dark:text-zinc-400 hover:bg-slate-200/60 dark:hover:bg-white/10 hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <p className={`text-xs font-extrabold truncate max-w-[130px] ${isSelected ? 'text-blue-600 dark:text-white' : 'text-slate-800 dark:text-zinc-300'}`}>
                        {act.title}
                      </p>
                      <span className={`text-[8px] uppercase tracking-wider font-extrabold px-1.5 py-0.5 rounded border ${
                        act.isSprintRelevant
                          ? 'bg-purple-500/10 border-purple-500/20 text-purple-400'
                          : 'bg-zinc-500/10 border-zinc-500/20 text-slate-500 dark:text-zinc-500'
                      }`}>
                        {act.isSprintRelevant ? 'Sprint' : 'Standard'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[9px] text-slate-500 dark:text-zinc-500 font-bold uppercase tracking-wider mt-2.5">
                      <span className="truncate max-w-[120px] text-blue-400">
                        🔑 {parentPhase?.name || 'N/A'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Workspace Display */}
        <div className="lg:col-span-3 min-w-0 space-y-5">
          {selectedActivity ? (
            <div className="space-y-6">
              {/* Activity Info Panel */}
              <div className="glass-panel-heavy rounded-2xl p-6 border border-slate-200 dark:border-border space-y-4 bg-white dark:bg-zinc-950">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center space-y-4 sm:space-y-0 border-b border-slate-100 dark:border-white/5 pb-4">
                  <div className="space-y-1.5">
                    <div className="flex items-center space-x-2">
                      <h4 className="text-xl font-bold text-slate-900 dark:text-white">
                        {selectedActivity.title}
                      </h4>
                      <span className="flex items-center space-x-1 text-[9px] uppercase font-bold bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded">
                        Stage Gate: {getParentPhase(selectedActivity)?.name || 'N/A'}
                      </span>
                      <span className={`flex items-center space-x-1 text-[9px] uppercase font-bold px-2 py-0.5 rounded border ${
                        selectedActivity.isSprintRelevant 
                          ? 'text-purple-600 dark:text-purple-400 bg-purple-500/10 border-purple-500/20'
                          : 'text-slate-600 dark:text-zinc-400 bg-slate-100/60 dark:bg-white/5 border-border'
                      }`}>
                        {selectedActivity.isSprintRelevant ? 'Sprint-Relevant Activity' : 'Standard Activity'}
                      </span>
                    </div>
                  </div>
                </div>

                <p className="text-xs text-slate-700 dark:text-zinc-400 font-light leading-relaxed">
                  {selectedActivity.isSprintRelevant 
                    ? 'Sprint cycles are supported inside this activity container. Set up sprints below to run your agile operational delivery.'
                    : 'Standard operational checklist. Add deliverables and collaborate with team comments.'}
                </p>
              </div>

              {/* Ternary Branches */}
              {!selectedActivity.isSprintRelevant ? (
                /* Standard Activity Workspace (Only checklist + comments) */
                <div className="space-y-5 animate-fade-in">
                  <div className="glass-panel-heavy rounded-2xl p-6 border border-slate-200 dark:border-border space-y-4 bg-white dark:bg-zinc-950">
                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/5 pb-3">
                      <h5 className="text-sm font-extrabold text-slate-900 dark:text-white uppercase tracking-wider flex items-center space-x-2">
                        <ClipboardList className="w-4 h-4 text-blue-400" />
                        <span>Operational Tasks ({activeSprintTasks.length})</span>
                      </h5>
                      <PermissionGate permission={PERMISSIONS.TASK_CREATE} behavior="hide">
                        <button
                          onClick={() => {
                            setAddTaskName('');
                            setAddTaskWeight(1);
                            setAddTaskAssignee('admin@acme.com');
                            setAddTaskDueDate('');
                            setAddTaskDesc('');
                            setShowAddTaskModal(true);
                          }}
                          className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all shadow cursor-pointer active:scale-95 animate-fade-in"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Add Task</span>
                        </button>
                      </PermissionGate>
                    </div>

                    <div className="space-y-3">
                      {activeSprintTasks.length === 0 ? (
                        <div className="text-center py-12 border border-dashed border-slate-200 dark:border-zinc-800 rounded-xl text-slate-500 italic text-xs font-light">
                          No tasks created yet.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {activeSprintTasks.map((task) => (
                            <div
                              key={task.id}
                              className="p-4 bg-slate-50/50 dark:bg-white/2 hover:bg-slate-100/60 dark:hover:bg-white/4 border border-slate-100 dark:border-white/5 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4 transition duration-150"
                            >
                              <div className="flex-1 min-w-0 space-y-1">
                                <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                                  <button
                                    onClick={() => setActiveTaskId(task.id)}
                                    className={`text-sm font-bold text-left hover:text-blue-400 transition cursor-pointer ${
                                      task.status === 'done' ? 'line-through text-slate-500' : 'text-slate-900 dark:text-white'
                                    }`}
                                  >
                                    {task.name}
                                  </button>
                                  <span className={`text-[8px] uppercase tracking-wider font-extrabold px-1.5 py-0.5 rounded border capitalize ${
                                    task.status === 'done'
                                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                                      : task.status === 'in_progress'
                                      ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                                      : task.status === 'in_review'
                                      ? 'bg-purple-500/10 border-purple-500/20 text-purple-400'
                                      : task.status === 'blocked'
                                      ? 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                                      : 'bg-zinc-500/10 border-zinc-500/20 text-slate-500 dark:text-zinc-500'
                                  }`}>
                                    {task.status.replace(/_/g, ' ')}
                                  </span>
                                </div>
                                {task.description && (
                                  <p className="text-xs text-muted-foreground font-light line-clamp-1">{task.description}</p>
                                )}
                              </div>

                              <div className="flex flex-wrap items-center gap-3 shrink-0">
                                <div className="flex items-center space-x-1.5 text-xs text-slate-600 dark:text-zinc-400 font-light">
                                  <div
                                    className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-black text-slate-900 dark:text-white shadow-inner"
                                    style={{ backgroundColor: getAvatarBg(task.assignee) }}
                                  >
                                    {getInitials(task.assignee)}
                                  </div>
                                  <span className="truncate max-w-[100px]">{task.assignee.split('@')[0]}</span>
                                </div>

                                {task.dueDate && (
                                  <span className="flex items-center space-x-1 text-[10px] text-slate-500 dark:text-zinc-500 font-medium">
                                    <Clock className="w-3.5 h-3.5" />
                                    <span>{new Date(task.dueDate).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
                                  </span>
                                )}

                                <select
                                  value={task.status}
                                  onChange={(e) => handleToggleTaskStatus(task.id, e.target.value as any)}
                                  className="bg-white dark:bg-background border border-slate-200 dark:border-zinc-800 rounded-xl px-2.5 py-1.5 text-slate-700 dark:text-zinc-300 focus:outline-none focus:border-blue-500 cursor-pointer text-[10px] uppercase font-bold"
                                >
                                  <option value="to_do">To Do</option>
                                  <option value="in_progress">In Progress</option>
                                  <option value="in_review">In Review</option>
                                  <option value="done">Done</option>
                                  <option value="blocked">Blocked</option>
                                </select>

                                {canEditFull && (
                                  <button
                                    onClick={() => {
                                      if (confirm('Delete this task?')) handleDeleteTask(task.id);
                                    }}
                                    className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition cursor-pointer"
                                  >
                                    <Trash className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="glass-panel-heavy rounded-2xl p-6 border border-slate-200 dark:border-border space-y-4 bg-white dark:bg-zinc-950">
                    <h5 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center space-x-1.5">
                      <MessageSquare className="w-4 h-4 text-blue-400 animate-pulse" />
                      <span>Activity Collaboration Thread</span>
                    </h5>
                    <div className="h-[360px] border border-slate-200/60 dark:border-zinc-850 rounded-2xl bg-slate-50/60 dark:bg-zinc-950/80 p-4 shadow-inner backdrop-blur-sm">
                      <CommentsSystem
                        projectId={project.id}
                        entityId={selectedActivity.id}
                        entityType="SPRINT"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                /* Sprint-Relevant Activity Workspace */
                <div className="space-y-6 animate-fade-in">
                  
                  {/* Nested Sprint Execution Cycles list */}
                  <div className="glass-panel-heavy rounded-2xl p-6 border border-slate-200 dark:border-border space-y-4 bg-white dark:bg-zinc-950">
                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/5 pb-3">
                      <h5 className="text-sm font-extrabold text-slate-900 dark:text-white uppercase tracking-wider flex items-center space-x-2">
                        <Layers className="w-4.5 h-4.5 text-purple-400" />
                        <span>Sprint Execution Cycles</span>
                      </h5>
                      <PermissionGate permission={PERMISSIONS.PROJECT_MANAGE} behavior="hide">
                        <button
                          onClick={() => {
                            sprintForm.reset();
                            setShowCreateSprintModal(true);
                          }}
                          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-all shadow cursor-pointer active:scale-95"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Create Sprint</span>
                        </button>
                      </PermissionGate>
                    </div>

                    {isLoadingSprints ? (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {[1, 2].map(i => (
                          <div key={i} className="h-20 rounded-xl bg-slate-100/60 dark:bg-white/5 animate-pulse" />
                        ))}
                      </div>
                    ) : nestedSprints.length === 0 ? (
                      <div className="text-center py-8 border border-dashed border-slate-200 dark:border-zinc-800 rounded-xl text-slate-500 italic text-xs font-light">
                        No sprint execution cycles registered. Create a sprint to begin.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {nestedSprints.map((sprint) => {
                          const isActive = activeNestedSprint?.id === sprint.id;
                          return (
                            <div
                              key={sprint.id}
                              onClick={() => setSelectedSprintId(sprint.id)}
                              className={`p-4 rounded-xl border cursor-pointer transition duration-200 flex flex-col justify-between space-y-2 ${
                                isActive
                                  ? 'border-purple-500 bg-purple-500/10 shadow shadow-purple-500/20 text-purple-400 glow-primary'
                                  : 'border-border bg-slate-50 dark:bg-white/2 hover:bg-slate-100 dark:hover:bg-white/4'
                              }`}
                            >
                              <div className="flex justify-between items-center">
                                <span className={`text-xs font-extrabold ${isActive ? 'text-purple-600 dark:text-white' : 'text-slate-800 dark:text-zinc-300'}`}>
                                  {sprint.name}
                                </span>
                                <span className={`text-[8px] uppercase tracking-wider font-extrabold px-1.5 py-0.5 rounded border ${
                                  sprint.status === 'active'
                                    ? 'bg-blue-500/10 border-blue-500/20 text-blue-400 animate-pulse'
                                    : sprint.status === 'closed'
                                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                                    : 'bg-zinc-500/10 border-zinc-500/20 text-slate-500'
                                }`}>
                                  {sprint.status}
                                </span>
                              </div>
                              {sprint.startDate && (
                                <span className="text-[9px] text-slate-500 dark:text-zinc-500 font-medium">
                                  📅 {new Date(sprint.startDate).toLocaleDateString([], { month: 'short', day: 'numeric' })} - {sprint.endDate ? new Date(sprint.endDate).toLocaleDateString([], { month: 'short', day: 'numeric' }) : 'N/A'}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Selected Sprint Workspace Panel */}
                  {activeNestedSprint ? (
                    <div className="space-y-6">
                      
                      {/* Sprint Workspace Header */}
                      <div className="glass-panel-heavy rounded-2xl p-6 border border-slate-200 dark:border-border space-y-4 bg-white dark:bg-zinc-950">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center space-y-4 sm:space-y-0 border-b border-slate-100 dark:border-white/5 pb-4">
                          <div className="space-y-1.5">
                            <div className="flex items-center space-x-2">
                              <h4 className="text-lg font-extrabold text-slate-900 dark:text-white">
                                Workspace: {activeNestedSprint.name}
                              </h4>
                              {activeNestedSprint.cadenceType && (
                                <span className="flex items-center space-x-1 text-[9px] uppercase font-bold text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded">
                                  🔄 {formatCadenceBadge(activeNestedSprint.cadenceType, activeNestedSprint.cadenceInterval)}
                                </span>
                              )}
                            </div>
                            {activeNestedSprint.goal && (
                              <p className="text-xs text-slate-500 italic">Objective: {activeNestedSprint.goal}</p>
                            )}
                          </div>

                          {/* Lifecycle Actions */}
                          <div className="flex items-center space-x-2 shrink-0">
                            {activeNestedSprint.status === 'planning' && (
                              <PermissionGate permission={PERMISSIONS.PROJECT_MANAGE} behavior="hide">
                                <button
                                  onClick={() => startSprintMutation.mutate(activeNestedSprint.id)}
                                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-all shadow border border-purple-500/20 active:scale-95 duration-150 cursor-pointer"
                                >
                                  <span>Start Sprint</span>
                                </button>
                              </PermissionGate>
                            )}
                            {activeNestedSprint.status === 'active' && (
                              <PermissionGate permission={PERMISSIONS.PROJECT_MANAGE} behavior="hide">
                                <button
                                  onClick={() => handleCloseSprintAttempt(activeNestedSprint)}
                                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow border border-emerald-500/20 active:scale-95 duration-150 cursor-pointer"
                                >
                                  <span>Close Sprint</span>
                                </button>
                              </PermissionGate>
                            )}
                          </div>
                        </div>

                        {/* Progress and SP Ledger */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="bg-slate-100/60 dark:bg-white/5 border border-slate-100 dark:border-white/5 p-4 rounded-xl space-y-2">
                            <div className="flex justify-between text-xs font-bold text-slate-600 dark:text-zinc-400">
                              <span>Tasks Closed</span>
                              <span className="text-slate-900 dark:text-white">{progressPercent}% ({completedCount}/{totalCount})</span>
                            </div>
                            <div className="w-full bg-slate-100/60 dark:bg-white/5 rounded-full h-1.5 overflow-hidden border border-slate-100 dark:border-white/5">
                              <div
                                className="bg-gradient-to-r from-purple-500 to-indigo-600 h-full rounded-full transition-all duration-500"
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
                            <div className="p-2 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-400">
                              <Sparkles className="w-5 h-5 animate-pulse" />
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Drag and Drop Kanban Board */}
                      <div className="space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/5 pb-2">
                          <h5 className="text-sm font-extrabold text-slate-900 dark:text-white uppercase tracking-wider">
                            Agile operational workspace
                          </h5>
                          {activeNestedSprint.status === 'closed' ? (
                            <span className="text-[10px] text-slate-500 flex items-center space-x-1">
                              <Lock className="w-3.5 h-3.5" />
                              <span>Sprint Cycle Locked</span>
                            </span>
                          ) : (
                            <PermissionGate permission={PERMISSIONS.TASK_CREATE} behavior="hide">
                              <button
                                onClick={() => {
                                  setAddTaskName('');
                                  setAddTaskWeight(3);
                                  setAddTaskAssignee('admin@acme.com');
                                  setAddTaskDueDate('');
                                  setAddTaskDesc('');
                                  setShowAddTaskModal(true);
                                }}
                                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-purple-600/90 hover:bg-purple-600 text-white text-xs font-bold transition-all border border-purple-500/20 cursor-pointer"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span>Add Task Card</span>
                              </button>
                            </PermissionGate>
                          )}
                        </div>

                        <div className="flex flex-row gap-5 overflow-x-auto pb-4 w-full scrollbar-thin">
                          {/* Columns Map */}
                          {[
                            { title: 'To Do', status: 'to_do' as const, tasksList: todoTasks, color: 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]' },
                            { title: 'In Progress', status: 'in_progress' as const, tasksList: inProgressTasks, color: 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]' },
                            { title: 'In Review', status: 'in_review' as const, tasksList: reviewTasks, color: 'bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.6)]' },
                            { title: 'Done', status: 'done' as const, tasksList: doneTasks, color: 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]' },
                            { title: 'Blocked', status: 'blocked' as const, tasksList: blockedTasks, color: 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)]' }
                          ].map((column) => (
                            <div
                              key={column.status}
                              onDragOver={handleDragOver}
                              onDrop={(e) => handleDrop(e, column.status)}
                              className="glass-panel-heavy rounded-2xl p-4 border border-slate-100 dark:border-white/5 flex flex-col space-y-3 min-h-[500px] w-[280px] md:w-[320px] shrink-0 bg-slate-50/50 dark:bg-zinc-900/20 hover:bg-zinc-900/30 transition-all duration-300"
                            >
                              <div className="flex justify-between items-center border-b border-slate-100 dark:border-white/5 pb-2">
                                <div className="flex items-center space-x-2">
                                  <span className={`w-2.5 h-2.5 rounded-full ${column.color}`} />
                                  <h6 className="text-xs font-extrabold text-slate-900 dark:text-white uppercase tracking-wider">{column.title}</h6>
                                </div>
                                <span className="text-[10px] font-bold bg-slate-100/60 dark:bg-white/5 px-2 py-0.5 rounded-md text-slate-600 dark:text-zinc-400 border border-slate-100 dark:border-white/5">
                                  {column.tasksList.length}
                                </span>
                              </div>

                              <div className="flex-1 overflow-y-auto space-y-3 pr-1 max-h-[600px] scrollbar-thin">
                                {column.tasksList.length === 0 ? (
                                  <div className="h-full flex flex-col items-center justify-center text-center p-6 text-zinc-600 border border-dashed border-zinc-800 rounded-xl py-12">
                                    <ActivityIcon className="w-6 h-6 mb-1 text-slate-800 dark:text-zinc-300" />
                                    <p className="text-[10px] italic">Empty</p>
                                  </div>
                                ) : (
                                  column.tasksList.map((task) => (
                                    <div
                                      key={task.id}
                                      draggable={getCanDragTask(task)}
                                      onDragStart={(e) => handleDragStart(e, task.id, column.status)}
                                      onClick={() => setActiveTaskId(task.id)}
                                      className={`p-3.5 rounded-xl border border-slate-100 dark:border-white/5 bg-white dark:bg-zinc-900/60 transition-all duration-200 cursor-pointer shadow-md group relative ${
                                        activeNestedSprint.status === 'closed' ? 'opacity-85' : 'active:scale-95'
                                      } ${
                                        getCanDragTask(task)
                                          ? 'cursor-grab active:cursor-grabbing hover:border-purple-500/40'
                                          : 'cursor-default opacity-85'
                                      }`}
                                    >
                                      <div className="flex justify-between items-start space-x-2">
                                        <span className={`text-xs font-bold leading-snug group-hover:text-purple-400 transition ${task.status === 'done' ? 'line-through text-slate-500' : 'text-slate-900 dark:text-white'}`}>
                                          {task.name}
                                        </span>
                                      </div>

                                      {task.description && (
                                        <p className="text-[10px] text-slate-500 line-clamp-2 mt-1.5 font-light leading-relaxed">
                                          {task.description}
                                        </p>
                                      )}

                                      {task.subtasks && task.subtasks.length > 0 && (() => {
                                        const doneCount = task.subtasks.filter(s => s.done).length;
                                        const totalSub = task.subtasks.length;
                                        const pct = Math.round((doneCount / totalSub) * 100);
                                        return (
                                          <div className="mt-3 space-y-1">
                                            <div className="flex justify-between text-[9px] font-bold text-slate-500">
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

                                      <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-100 dark:border-white/5 text-[9px] text-slate-500 font-bold uppercase tracking-wider">
                                        <div className="flex items-center space-x-2">
                                          <span className="bg-purple-500/10 border border-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded font-mono text-[8px]">
                                            {task.weight} SP
                                          </span>
                                          {task.dueDate && (
                                            <span className="flex items-center space-x-0.5">
                                              <Clock className="w-2.5 h-2.5 text-zinc-600" />
                                              <span>{new Date(task.dueDate).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
                                            </span>
                                          )}
                                        </div>

                                        <div
                                          className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-black text-slate-900 dark:text-white shrink-0 shadow-inner"
                                          style={{ backgroundColor: getAvatarBg(task.assignee) }}
                                          title={task.assignee}
                                        >
                                          {getInitials(task.assignee)}
                                        </div>
                                      </div>
                                    </div>
                                  ))
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-8 text-center border border-dashed border-border rounded-2xl bg-slate-50 dark:bg-white/2">
                      <Layers className="w-8 h-8 text-slate-500 mx-auto mb-2" />
                      <p className="text-xs text-muted-foreground">Select a sprint cycle above to unlock the Kanban operational workspace.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="p-12 text-center border border-dashed border-border rounded-2xl bg-slate-100/60 dark:bg-white/5">
              <ActivityIcon className="w-10 h-10 text-slate-500 mx-auto mb-2 animate-pulse" />
              <h4 className="text-sm font-bold text-slate-800 dark:text-zinc-300">No Activity Selected</h4>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto mt-1">Select an Activity from the planner sidebar to view stages, checklists, and cycles.</p>
            </div>
          )}
        </div>
      </div>

      {/* Task detail sliding drawer */}
      {activeTask && (
        <>
          <div className="fixed inset-0 bg-black/20 backdrop-blur-[1px] z-40 animate-fade-in-backdrop" onClick={() => setActiveTaskId(null)} />
          <div className="fixed top-0 right-0 h-screen w-[320px] md:w-[480px] bg-slate-50 dark:bg-zinc-950 border-l border-slate-200 dark:border-border z-50 shadow-2xl flex flex-col p-6 animate-slide-in-right overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-white/5 pb-4 mb-4">
              <h5 className="text-sm font-extrabold uppercase tracking-wider text-slate-900 dark:text-white flex items-center space-x-2">
                <ClipboardList className="w-4 h-4 text-purple-400" />
                <span>Deliverable Detail</span>
              </h5>
              <button onClick={() => setActiveTaskId(null)} className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-white/5 text-slate-500 hover:text-white transition cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 space-y-6">
              {/* Name field */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Title / Name</label>
                <input
                  type="text"
                  disabled={!canUpdate}
                  value={activeTask.name}
                  onChange={(e) => handleUpdateTaskDetail(activeTask.id, { name: e.target.value })}
                  className="w-full bg-white dark:bg-background border border-slate-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-xs text-slate-800 dark:text-zinc-200 focus:outline-none focus:border-purple-500 disabled:opacity-75"
                />
              </div>

              {/* Description field */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Description Notes</label>
                <textarea
                  disabled={!canUpdate}
                  value={activeTask.description || ''}
                  onChange={(e) => handleUpdateTaskDetail(activeTask.id, { description: e.target.value })}
                  rows={3}
                  className="w-full bg-white dark:bg-background border border-slate-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-xs text-slate-800 dark:text-zinc-200 focus:outline-none focus:border-purple-500 disabled:opacity-75 resize-none leading-relaxed"
                  placeholder="Task details and deliverables notes..."
                />
              </div>

              {/* Assignee & Story Points grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Assignee</label>
                  <select
                    disabled={!canEditFull}
                    value={activeTask.assignee}
                    onChange={(e) => handleUpdateTaskDetail(activeTask.id, { assignee: e.target.value })}
                    className="w-full bg-white dark:bg-background border border-slate-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-zinc-200 focus:outline-none focus:border-purple-500 disabled:opacity-75 cursor-pointer"
                  >
                    <option value="unassigned@acme.com">Unassigned</option>
                    {members.map((m) => (
                      <option key={m.id} value={m.email}>{m.email.split('@')[0]}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Story Points</label>
                  <select
                    disabled={!canEditFull}
                    value={activeTask.weight}
                    onChange={(e) => handleUpdateTaskDetail(activeTask.id, { weight: Number(e.target.value) })}
                    className="w-full bg-white dark:bg-background border border-slate-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-zinc-200 focus:outline-none focus:border-purple-500 disabled:opacity-75 cursor-pointer font-mono"
                  >
                    {[0, 1, 2, 3, 5, 8, 13, 21].map((pts) => (
                      <option key={pts} value={pts}>{pts} SP</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Due date & Status grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Due Date</label>
                  <input
                    type="date"
                    disabled={!canEditFull}
                    value={activeTask.dueDate ? activeTask.dueDate.substring(0, 10) : ''}
                    onChange={(e) => handleUpdateTaskDetail(activeTask.id, { dueDate: e.target.value || undefined })}
                    className="w-full bg-white dark:bg-background border border-slate-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-zinc-200 focus:outline-none focus:border-purple-500 disabled:opacity-75 cursor-pointer"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Status</label>
                  <select
                    disabled={!canUpdate}
                    value={activeTask.status}
                    onChange={(e) => handleToggleTaskStatus(activeTask.id, e.target.value as any)}
                    className="w-full bg-white dark:bg-background border border-slate-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-zinc-200 focus:outline-none focus:border-purple-500 disabled:opacity-75 cursor-pointer font-extrabold uppercase text-[10px]"
                  >
                    <option value="to_do">To Do</option>
                    <option value="in_progress">In Progress</option>
                    <option value="in_review">In Review</option>
                    <option value="done">Done</option>
                    <option value="blocked">Blocked</option>
                  </select>
                </div>
              </div>

              {/* Subtasks checklists */}
              <div className="space-y-4 border-t border-slate-200 dark:border-white/5 pt-4">
                <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider flex items-center space-x-1.5">
                  <CheckSquare className="w-3.5 h-3.5 text-purple-400" />
                  <span>Subtask deliverables list</span>
                </label>

                {/* Subtask Creation */}
                {canUpdate && (
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      placeholder="Add subtask title..."
                      value={newSubtaskTitle}
                      onChange={(e) => setNewSubtaskTitle(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleAddSubtask(activeTask.id); }}
                      className="flex-1 bg-white dark:bg-background border border-slate-200 dark:border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-slate-800 dark:text-zinc-200 focus:outline-none focus:border-purple-500"
                    />
                    <button
                      onClick={() => handleAddSubtask(activeTask.id)}
                      className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs transition duration-150 cursor-pointer"
                    >
                      Add
                    </button>
                  </div>
                )}

                {/* Subtasks listing */}
                <div className="space-y-2">
                  {!activeTask.subtasks || activeTask.subtasks.length === 0 ? (
                    <p className="text-[10.5px] italic text-slate-500 font-light pl-1">No subtask list added.</p>
                  ) : (
                    activeTask.subtasks.map((sub) => (
                      <div key={sub.id} className="flex items-center justify-between p-2.5 bg-white dark:bg-background border border-slate-200 dark:border-zinc-800 rounded-xl transition duration-150 hover:bg-slate-100 dark:hover:bg-zinc-900">
                        <div
                          className="flex items-center space-x-2.5 cursor-pointer flex-1"
                          onClick={() => { if (canUpdate) handleToggleSubtask(activeTask.id, sub.id); }}
                        >
                          {sub.done ? (
                            <CheckSquare className="w-4 h-4 text-purple-500 shrink-0" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-500 shrink-0" />
                          )}
                          <span className={`text-xs ${sub.done ? 'line-through text-slate-500' : 'text-slate-800 dark:text-zinc-300'}`}>
                            {sub.title}
                          </span>
                        </div>
                        {canUpdate && (
                          <button
                            onClick={() => handleDeleteSubtask(activeTask.id, sub.id)}
                            className="p-1 hover:bg-red-500/10 text-slate-500 hover:text-red-400 rounded transition cursor-pointer"
                          >
                            <Trash className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* SIDEBAR DRAWER: Create Activity */}
      {showCreateActivityModal && (
        <>
          <div className="fixed inset-0 bg-black/20 backdrop-blur-[1px] z-45 animate-fade-in-backdrop" onClick={() => setShowCreateActivityModal(false)} />
          <div className="fixed top-0 left-0 h-screen w-[320px] md:w-[440px] bg-slate-50 dark:bg-zinc-950 border-r border-slate-200 dark:border-border z-50 shadow-2xl flex flex-col p-6 animate-slide-in-left overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-white/5 pb-4 mb-4">
              <h4 className="text-sm font-black uppercase text-slate-900 dark:text-white tracking-wider flex items-center space-x-1.5">
                <PlusCircle className="w-5 h-5 text-blue-400" />
                <span>Plan New Activity</span>
              </h4>
              <button onClick={() => setShowCreateActivityModal(false)} className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-white/5 text-slate-500 hover:text-white transition cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={activityForm.handleSubmit(onActivitySubmit)} className="space-y-6 flex-1 flex flex-col justify-between">
              <div className="space-y-6">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Activity Title</label>
                  <input
                    type="text"
                    placeholder="e.g. System Integration Testing"
                    {...activityForm.register('title')}
                    className="w-full bg-white dark:bg-background border border-slate-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-xs text-slate-800 dark:text-zinc-200 focus:outline-none focus:border-blue-500"
                  />
                  {activityForm.formState.errors.title && (
                    <p className="text-[10px] text-red-400 font-bold">{activityForm.formState.errors.title.message}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Target Phase Gate</label>
                  <select
                    {...activityForm.register('phaseId')}
                    className="w-full bg-white dark:bg-background border border-slate-200 dark:border-zinc-800 rounded-xl px-3 py-2.5 text-xs text-slate-800 dark:text-zinc-200 focus:outline-none focus:border-blue-500 cursor-pointer"
                  >
                    <option value="">Select Target Stage Gate...</option>
                    {project.phases?.map((phase) => (
                      <option key={phase.id} value={phase.id}>{phase.name}</option>
                    ))}
                  </select>
                  {activityForm.formState.errors.phaseId && (
                    <p className="text-[10px] text-red-400 font-bold">{activityForm.formState.errors.phaseId.message}</p>
                  )}
                </div>

                <div className="flex items-center space-x-2 bg-slate-100/30 dark:bg-white/5 border border-slate-100 dark:border-white/5 p-3.5 rounded-xl">
                  <input
                    type="checkbox"
                    id="isSprintRelevant"
                    {...activityForm.register('isSprintRelevant')}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 bg-background border-border cursor-pointer"
                  />
                  <label htmlFor="isSprintRelevant" className="text-xs font-semibold text-slate-800 dark:text-zinc-300 cursor-pointer select-none">
                    Sprint-Relevant Activity (enables nested sprint execution cycles)
                  </label>
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-4 border-t border-slate-200 dark:border-white/5">
                <button
                  type="button"
                  onClick={() => setShowCreateActivityModal(false)}
                  className="px-4 py-2 border border-slate-200 dark:border-zinc-800 hover:bg-slate-200 dark:hover:bg-white/5 rounded-xl text-xs font-bold text-slate-700 dark:text-zinc-300 transition duration-150 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createActivityMutation.isPending}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition duration-150 active:scale-95 shadow cursor-pointer"
                >
                  {createActivityMutation.isPending ? 'Planning...' : 'Plan Activity'}
                </button>
              </div>
            </form>
          </div>
        </>
      )}

      {/* MODAL: Create Sprint */}
      {showCreateSprintModal && selectedActivity && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-panel-heavy rounded-2xl w-full max-w-md p-6 border border-slate-200 dark:border-border text-foreground space-y-4 bg-white dark:bg-zinc-950">
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-white/5 pb-3">
              <h4 className="text-sm font-black uppercase text-slate-900 dark:text-white tracking-wider flex items-center space-x-1.5">
                <PlusCircle className="w-5 h-5 text-purple-400" />
                <span>Create Sprint Cycle</span>
              </h4>
              <button onClick={() => setShowCreateSprintModal(false)} className="text-slate-500 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={sprintForm.handleSubmit(onSprintSubmit)} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Sprint Name</label>
                <input
                  type="text"
                  placeholder="e.g. Sprint 1 - Core Backend Setup"
                  {...sprintForm.register('name')}
                  className="w-full bg-white dark:bg-background border border-slate-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-xs text-slate-800 dark:text-zinc-200 focus:outline-none focus:border-purple-500"
                />
                {sprintForm.formState.errors.name && (
                  <p className="text-[10px] text-red-400 font-bold">{sprintForm.formState.errors.name.message}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Frequency</label>
                  <select
                    {...sprintForm.register('cadence')}
                    className="w-full bg-white dark:bg-background border border-slate-200 dark:border-zinc-800 rounded-xl px-3 py-2.5 text-xs text-slate-800 dark:text-zinc-200 focus:outline-none focus:border-purple-500 cursor-pointer font-bold text-slate-700 dark:text-zinc-300"
                  >
                    <option value="Weekly">Weekly Cycle</option>
                    <option value="Bi-Weekly">Bi-Weekly Cycle</option>
                    <option value="Monthly">Monthly Cycle</option>
                    <option value="Custom">Custom Cadence</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Start Date</label>
                  <input
                    type="date"
                    {...sprintForm.register('startDate')}
                    className="w-full bg-white dark:bg-background border border-slate-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs text-slate-850 dark:text-zinc-200 focus:outline-none focus:border-purple-500 cursor-pointer"
                  />
                  {sprintForm.formState.errors.startDate && (
                    <p className="text-[10px] text-red-400 font-bold">{sprintForm.formState.errors.startDate.message}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5 col-span-2">
                  <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Calculated End Date</label>
                  <input
                    type="date"
                    {...sprintForm.register('endDate')}
                    className="w-full bg-white dark:bg-background border border-slate-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs text-slate-850 dark:text-zinc-200 focus:outline-none focus:border-purple-500 cursor-pointer"
                  />
                  {sprintForm.formState.errors.endDate && (
                    <p className="text-[10px] text-red-400 font-bold">{sprintForm.formState.errors.endDate.message}</p>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Goal / Objective</label>
                <textarea
                  placeholder="What is the key delivery goal of this sprint cycle?"
                  {...sprintForm.register('goal')}
                  rows={2}
                  className="w-full bg-white dark:bg-background border border-slate-200 dark:border-zinc-800 rounded-xl px-4 py-2 text-xs text-slate-800 dark:text-zinc-200 focus:outline-none focus:border-purple-500 resize-none leading-relaxed"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateSprintModal(false)}
                  className="px-4 py-2 border border-slate-200 dark:border-zinc-800 hover:bg-slate-200 dark:hover:bg-white/5 rounded-xl text-xs font-bold text-slate-700 dark:text-zinc-300 transition duration-150 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createSprintMutation.isPending}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold transition duration-150 active:scale-95 shadow cursor-pointer"
                >
                  {createSprintMutation.isPending ? 'Creating...' : 'Create Sprint'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Blocker Alert for Close Sprint */}
      {showBlockerModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-panel-heavy rounded-2xl w-full max-w-md p-6 border border-rose-500/30 text-foreground space-y-4 bg-zinc-950">
            <div className="flex items-center space-x-2 border-b border-rose-500/20 pb-3">
              <ShieldAlert className="w-6 h-6 text-rose-500 animate-bounce shrink-0" />
              <h4 className="text-sm font-black uppercase text-rose-500 tracking-wider">Sprint Close Blocked</h4>
            </div>
            <p className="text-xs text-zinc-300 leading-relaxed font-light">
              Governance Lock Error: You cannot close this sprint cycle. There are active tasks that remain incomplete. 
              In compliance with Agile policies, please complete all operational tasks or drag them to blocked/todo before completing the sprint lifecycle.
            </p>
            <div className="flex justify-end">
              <button
                onClick={() => setShowBlockerModal(false)}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition duration-150 active:scale-95 shadow cursor-pointer"
              >
                Acknowledge
              </button>
            </div>
          </div>
        </div>
      )}

       {/* SIDEBAR DRAWER: Add Task Deliverable */}
      {showAddTaskModal && selectedActivity && (
        <>
          <div className="fixed inset-0 bg-black/20 backdrop-blur-[1px] z-45 animate-fade-in-backdrop" onClick={() => setShowAddTaskModal(false)} />
          <div className="fixed top-0 right-0 h-screen w-[320px] md:w-[440px] bg-slate-50 dark:bg-zinc-950 border-l border-slate-200 dark:border-border z-50 shadow-2xl flex flex-col p-6 animate-slide-in-right overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-white/5 pb-4 mb-4">
              <h4 className="text-sm font-black uppercase text-slate-900 dark:text-white tracking-wider flex items-center space-x-1.5">
                <PlusCircle className="w-5 h-5 text-blue-400" />
                <span>Add Deliverable Task</span>
              </h4>
              <button onClick={() => setShowAddTaskModal(false)} className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-white/5 text-slate-500 hover:text-white transition cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-6 flex-1 flex flex-col justify-between">
              <div className="space-y-6">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Deliverable Title</label>
                  <input
                    type="text"
                    placeholder="e.g. Implement API Gateway validation"
                    value={addTaskName}
                    onChange={(e) => setAddTaskName(e.target.value)}
                    className="w-full bg-white dark:bg-background border border-slate-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-xs text-slate-800 dark:text-zinc-200 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Task Description Notes</label>
                  <textarea
                    placeholder="Detail notes and specifications..."
                    value={addTaskDesc}
                    onChange={(e) => setAddTaskDesc(e.target.value)}
                    rows={3}
                    className="w-full bg-white dark:bg-background border border-slate-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-xs text-slate-800 dark:text-zinc-200 focus:outline-none focus:border-blue-500 resize-none leading-relaxed"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Assignee</label>
                    <select
                      value={addTaskAssignee}
                      onChange={(e) => setAddTaskAssignee(e.target.value)}
                      className="w-full bg-white dark:bg-background border border-slate-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-zinc-200 focus:outline-none focus:border-blue-500 cursor-pointer"
                    >
                      <option value="unassigned@acme.com">Unassigned</option>
                      {members.map((m) => (
                        <option key={m.id} value={m.email}>{m.email.split('@')[0]}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Story Points (SP)</label>
                    <select
                      value={addTaskWeight}
                      onChange={(e) => setAddTaskWeight(Number(e.target.value))}
                      className="w-full bg-white dark:bg-background border border-slate-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-zinc-200 focus:outline-none focus:border-blue-500 cursor-pointer font-mono"
                    >
                      {[0, 1, 2, 3, 5, 8, 13, 21].map((pts) => (
                        <option key={pts} value={pts}>{pts} SP</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Due Date</label>
                  <input
                    type="date"
                    value={addTaskDueDate}
                    onChange={(e) => setAddTaskDueDate(e.target.value)}
                    className="w-full bg-white dark:bg-background border border-slate-200 dark:border-zinc-850 rounded-xl px-3 py-2 text-xs text-slate-850 dark:text-zinc-200 focus:outline-none focus:border-blue-500 cursor-pointer"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-4 border-t border-slate-200 dark:border-white/5">
                <button
                  type="button"
                  onClick={() => setShowAddTaskModal(false)}
                  className="px-4 py-2 border border-slate-200 dark:border-zinc-800 hover:bg-slate-200 dark:hover:bg-white/5 rounded-xl text-xs font-bold text-slate-700 dark:text-zinc-300 transition duration-150 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateTaskConfirm}
                  disabled={!addTaskName.trim()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition duration-150 active:scale-95 shadow cursor-pointer disabled:opacity-50"
                >
                  Create Deliverable
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ProjectSprints;
