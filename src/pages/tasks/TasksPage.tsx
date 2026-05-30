import React, { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Plus, 
  Activity, 
  AlertTriangle, 
  Clock, 
  User, 
  LayoutGrid, 
  Loader2, 
  ChevronRight, 
  X, 
  Sparkles,
  List,
  BarChart3
} from 'lucide-react';

// Components
import { TaskFilters } from '../../components/tasks/TaskFilters';
import { TaskBoard } from '../../components/tasks/TaskBoard';
import { TaskTable } from '../../components/tasks/TaskTable';
import { TaskAnalytics } from '../../components/tasks/TaskAnalytics';
import { TaskDrawer } from '../../components/tasks/TaskDrawer';
import { TaskActivityFeed } from '../../components/tasks/TaskActivityFeed';

// APIs & Stores
import { tasksApi } from '../../services/api/tasks.api';
import { projectsApi } from '../../services/api/projects';
import { epicsApi } from '../../services/api/epics.api';
import { storiesApi } from '../../services/api/stories.api';
import { usersApi } from '../../services/api/users';
import { useAuthStore } from '../../store/authStore';
import { useCollaborationStore } from '../../store/collaborationStore';
import { useSocket } from '../../services/socket/socket-context';
import { useSocketEvent, useSocketRoom } from '../../services/socket/socket-events';

// Permissions
import { usePermissions } from '../../features/auth/usePermissions';
import { PERMISSIONS } from '../../features/auth/permission.constants';

const ProjectRoomConnector: React.FC<{ projectId: string; isConnected: boolean; active: boolean }> = ({ projectId, isConnected, active }) => {
  useSocketRoom(`project:${projectId}`, isConnected && active);
  return null;
};

export const TasksPage: React.FC = () => {
  const { socket, isConnected } = useSocket();
  const { user: currentUser } = useAuthStore();
  const { can } = usePermissions();
  
  // Collaboration Store actions and states
  const { 
    activities, 
    loadActivities, 
    loadComments, 
    addActivity 
  } = useCollaborationStore();

  // Dialog & Active State management
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState<any | null>(null);
  const [isActivityFeedOpen, setIsActivityFeedOpen] = useState(true);
  const [activeView, setActiveView] = useState<'board' | 'list' | 'analytics'>('board');

  // Filters State
  const [search, setSearch] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [selectedSprintId, setSelectedSprintId] = useState('');
  const [selectedAssigneeId, setSelectedAssigneeId] = useState('');
  const [selectedPhaseId, setSelectedPhaseId] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedPriority, setSelectedPriority] = useState('');

  // Add Task Form State
  const [newTaskName, setNewTaskName] = useState('');
  const [newTaskDescription, setNewTaskDescription] = useState('');
  const [newTaskProjectId, setNewTaskProjectId] = useState('');
  const [newTaskSprintId, setNewTaskSprintId] = useState('');
  const [newTaskPhaseId, setNewTaskPhaseId] = useState('');
  const [newTaskAssigneeId, setNewTaskAssigneeId] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState('medium');
  const [newTaskStoryPoints, setNewTaskStoryPoints] = useState(0);
  const [newTaskDueDate, setNewTaskDueDate] = useState('');
  const [isCreatingTask, setIsCreatingTask] = useState(false);

  // Queries
  const { data: tasks = [], isLoading: loadingTasks, refetch: refetchTasks } = useQuery({
    queryKey: ['tasks'],
    queryFn: tasksApi.list,
  });

  const { data: projects = [], isLoading: loadingProjects } = useQuery({
    queryKey: ['projects'],
    queryFn: projectsApi.list,
  });

  // Query project details mapping to fetch sprints and phases
  const { data: projectDetails = [] } = useQuery({
    queryKey: ['projectDetails', projects.map(p => p.id)],
    queryFn: async () => {
      if (projects.length === 0) return [];
      return Promise.all(projects.map(p => projectsApi.getById(p.id)));
    },
    enabled: projects.length > 0,
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const res = await usersApi.list({ limit: 1000 });
      return Array.isArray(res) ? res : [];
    },
  });

  const filteredUsers = useMemo(() => {
    if (currentUser?.role === 'Project Manager') {
      return users.filter((u: any) => u.roleName === 'User');
    }
    return users;
  }, [users, currentUser]);


  // Sprints and Phases Aggregation
  const allSprints = useMemo(() => {
    return projectDetails.flatMap(p => p.sprints || []);
  }, [projectDetails]);

  const allPhases = useMemo(() => {
    return projectDetails.flatMap(p => p.phases || []);
  }, [projectDetails]);

  // Load activities and comments for loaded projects
  useEffect(() => {
    if (currentUser?.tenantId && projects.length > 0) {
      projects.forEach((p) => {
        loadActivities(currentUser.tenantId, p.id);
        loadComments(currentUser.tenantId, p.id);
      });
    }
  }, [projects, currentUser, loadActivities, loadComments]);

  // Socket room joining is handled declaratively by ProjectRoomConnector components below

  // Real-time Socket Event Listeners
  useSocketEvent<any>('kanban_task_moved_received', (data) => {
    refetchTasks();
    if (currentUser) {
      addActivity(currentUser.tenantId, data.projectId || 'global', {
        projectId: data.projectId || 'global',
        type: 'task_moved',
        title: 'Task status updated',
        message: `${data.actorName} moved task status.`,
        severity: 'medium',
        actor: data.actorName,
      });
    }
  });

  useSocketEvent<any>('kanban_task_created_received', (data) => {
    refetchTasks();
    if (currentUser) {
      addActivity(currentUser.tenantId, data.task.projectId, {
        projectId: data.task.projectId,
        type: 'task_created',
        title: 'Task created',
        message: `${data.actorName || 'A teammate'} created task "${data.task.name}".`,
        severity: 'low',
        actor: data.actorName || 'Workspace Collaboration',
      });
    }
  });

  useSocketEvent<any>('kanban_task_deleted_received', () => {
    refetchTasks();
  });

  useSocketEvent<any>('kanban_task_updated_received', () => {
    refetchTasks();
  });

  // Client-side Filters
  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      const matchesSearch =
        !search ||
        t.name.toLowerCase().includes(search.toLowerCase()) ||
        (t.description && t.description.toLowerCase().includes(search.toLowerCase()));

      const matchesProject = !selectedProjectId || t.projectId === selectedProjectId;
      const matchesSprint = !selectedSprintId || t.sprintId === selectedSprintId;
      const matchesAssignee = !selectedAssigneeId || t.assigneeId === selectedAssigneeId;
      const matchesPhase = !selectedPhaseId || t.customFields?.phaseId === selectedPhaseId;
      const matchesStatus = !selectedStatus || t.status === selectedStatus;
      const matchesPriority = !selectedPriority || t.customFields?.priority === selectedPriority;

      return (
        matchesSearch &&
        matchesProject &&
        matchesSprint &&
        matchesAssignee &&
        matchesPhase &&
        matchesStatus &&
        matchesPriority
      );
    });
  }, [
    tasks,
    search,
    selectedProjectId,
    selectedSprintId,
    selectedAssigneeId,
    selectedPhaseId,
    selectedStatus,
    selectedPriority,
  ]);

  // Aggregate stats
  const metrics = useMemo(() => {
    const active = tasks.filter(t => t.status !== 'done' && t.status !== 'blocked').length;
    const blocked = tasks.filter(t => t.status === 'blocked').length;
    
    const todayStr = new Date().toDateString();
    const dueToday = tasks.filter(t => {
      if (!t.customFields?.dueDate || t.status === 'done') return false;
      return new Date(t.customFields.dueDate).toDateString() === todayStr;
    }).length;

    const velocity = tasks
      .filter(t => t.status === 'done')
      .reduce((sum, t) => sum + (t.customFields?.storyPoints || 0), 0);

    const assignedToMe = tasks.filter(t => t.assigneeId === currentUser?.id).length;

    return { active, blocked, dueToday, velocity, assignedToMe };
  }, [tasks, currentUser]);

  // Combined activity feed sorted by date
  const combinedActivities = useMemo(() => {
    return Object.values(activities)
      .flat()
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [activities]);

  // Actions handlers
  const handleMoveTask = async (taskId: string, fromStatus: string, toStatus: string) => {
    try {
      const taskObj = tasks.find(t => t.id === taskId);
      if (!taskObj) return;

      await tasksApi.update(taskId, { status: toStatus });
      refetchTasks();

      // Emit socket notification
      if (socket && currentUser) {
        const actorName = `${currentUser.firstName} ${currentUser.lastName}`;
        socket.emit('kanban_task_moved', {
          projectId: taskObj.projectId,
          taskId,
          fromStatus,
          toStatus,
          actorName,
        });

        addActivity(currentUser.tenantId, taskObj.projectId, {
          projectId: taskObj.projectId,
          type: 'task_moved',
          title: 'Task status updated',
          message: `${actorName} moved "${taskObj.name}" to ${toStatus.replace('_', ' ')}.`,
          severity: 'medium',
          actor: actorName,
        });
      }
    } catch (err) {
      console.error('Failed to move task status', err);
      alert('Failed to update task status.');
    }
  };

  const handleUpdateTask = async (taskId: string, updates: Partial<any>) => {
    try {
      const taskObj = tasks.find(t => t.id === taskId);
      if (!taskObj) return;

      const updated = await tasksApi.update(taskId, updates);
      refetchTasks();

      // Sync local drawer selection
      if (selectedTask && selectedTask.id === taskId) {
        setSelectedTask(updated);
      }

      if (socket && currentUser) {
        socket.emit('kanban_task_updated', {
          projectId: taskObj.projectId,
          sprintId: taskObj.sprintId,
          taskId,
          updates,
        });
      }
    } catch (err) {
      console.error('Failed to update task details', err);
      alert('Failed to update task.');
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    try {
      const taskObj = tasks.find(t => t.id === taskId);
      if (!taskObj) return;

      await tasksApi.delete(taskId);
      refetchTasks();

      if (socket && currentUser) {
        socket.emit('kanban_task_deleted', {
          projectId: taskObj.projectId,
          sprintId: taskObj.sprintId,
          taskId,
        });

        addActivity(currentUser.tenantId, taskObj.projectId, {
          projectId: taskObj.projectId,
          type: 'task_deleted',
          title: 'Task deleted',
          message: `Task was deleted by ${currentUser.firstName} ${currentUser.lastName}.`,
          severity: 'high',
          actor: `${currentUser.firstName} ${currentUser.lastName}`,
        });
      }
    } catch (err) {
      console.error('Failed to delete task', err);
      alert('Failed to delete task.');
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskName.trim() || !newTaskProjectId || isCreatingTask) return;

    setIsCreatingTask(true);
    try {
      // 1. Fetch stories for selected project to satisfy backend non-null storyId constraint
      const projectStories = await storiesApi.list(newTaskProjectId);
      let targetStoryId = '';

      if (projectStories.length > 0) {
        targetStoryId = projectStories[0].id;
      } else {
        // Fallback: Provision Epic and Story dynamically
        const projectEpics = await epicsApi.list(newTaskProjectId);
        let targetEpicId = '';

        if (projectEpics.length > 0) {
          targetEpicId = projectEpics[0].id;
        } else {
          const newEpic = await epicsApi.create({
            projectId: newTaskProjectId,
            name: 'General Epic',
            description: 'Default Epic provisioned automatically for tasks.',
          });
          targetEpicId = newEpic.id;
        }

        const newStory = await storiesApi.create({
          projectId: newTaskProjectId,
          epicId: targetEpicId,
          name: 'General Story',
          description: 'Default Story provisioned automatically for tasks.',
        });
        targetStoryId = newStory.id;
      }

      // 2. Submit Create Task payload
      const payload = {
        projectId: newTaskProjectId,
        storyId: targetStoryId,
        sprintId: newTaskSprintId || null,
        assigneeId: newTaskAssigneeId || null,
        name: newTaskName.trim(),
        description: newTaskDescription.trim() || undefined,
        status: 'to_do',
        customFields: {
          priority: newTaskPriority as any,
          dueDate: newTaskDueDate || undefined,
          storyPoints: newTaskStoryPoints,
          phaseId: newTaskPhaseId || undefined,
          subtasks: [],
          createdFrom: 'sidebar',
        },
      };

      const newTask = await tasksApi.create(payload);
      refetchTasks();

      // Emit created event
      if (socket && currentUser) {
        socket.emit('kanban_task_created', {
          projectId: newTaskProjectId,
          sprintId: newTaskSprintId || null,
          task: newTask,
          actorName: `${currentUser.firstName} ${currentUser.lastName}`
        });

        addActivity(currentUser.tenantId, newTaskProjectId, {
          projectId: newTaskProjectId,
          type: 'task_created',
          title: 'Task created',
          message: `${currentUser.firstName} created task "${newTask.name}".`,
          severity: 'low',
          actor: `${currentUser.firstName} ${currentUser.lastName}`,
        });
      }

      // Reset form & close modal
      setNewTaskName('');
      setNewTaskDescription('');
      setNewTaskProjectId('');
      setNewTaskSprintId('');
      setNewTaskPhaseId('');
      setNewTaskAssigneeId('');
      setNewTaskPriority('medium');
      setNewTaskStoryPoints(0);
      setNewTaskDueDate('');
      setShowAddModal(false);
    } catch (err) {
      console.error('Failed to create task', err);
      alert('Failed to create task.');
    } finally {
      setIsCreatingTask(false);
    }
  };

  const clearFilters = () => {
    setSearch('');
    setSelectedProjectId('');
    setSelectedSprintId('');
    setSelectedAssigneeId('');
    setSelectedPhaseId('');
    setSelectedStatus('');
    setSelectedPriority('');
  };

  // Filter sprints/phases in the Add dialog modal
  const filteredSprintsForNewTask = newTaskProjectId
    ? allSprints.filter(s => s.projectId === newTaskProjectId)
    : [];

  const filteredPhasesForNewTask = newTaskProjectId
    ? allPhases.filter(p => p.projectId === newTaskProjectId)
    : [];

  if (loadingTasks || loadingProjects) {
    return (
      <div className="w-full h-[60vh] flex flex-col items-center justify-center space-y-4">
        <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
        <span className="text-xs font-light text-muted-foreground tracking-widest uppercase animate-pulse">
          Loading global tasks center...
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-foreground animate-fade-in pb-12">
      {/* Header and Live Status */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center space-y-4 md:space-y-0 pb-4 border-b border-border">
        <div className="space-y-1">
          <div className="flex items-center space-x-2 text-xs text-muted-foreground font-medium">
            <span>Workspace</span>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-muted-foreground">Global Operations</span>
          </div>
          <div className="flex items-center space-x-3">
            <h1 className="text-2xl font-extrabold text-foreground tracking-tight flex items-center gap-2">
              Tasks Dashboard
            </h1>
            <span className="flex items-center space-x-1.5 px-2 py-0.5 rounded-full bg-muted border border-border text-[9px] font-bold text-muted-foreground">
              <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
              <span>{isConnected ? 'Live Connected' : 'Disconnected'}</span>
            </span>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          {/* Dashboard View Switcher */}
          <div className="flex items-center space-x-1 bg-muted border border-border p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setActiveView('board')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${
                activeView === 'board'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/10'
                  : 'text-muted-foreground hover:text-foreground hover:bg-background'
              }`}
              title="Kanban Board View"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Board</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveView('list')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${
                activeView === 'list'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/10'
                  : 'text-muted-foreground hover:text-foreground hover:bg-background'
              }`}
              title="Spreadsheet List View"
            >
              <List className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">List</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveView('analytics')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${
                activeView === 'analytics'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/10'
                  : 'text-muted-foreground hover:text-foreground hover:bg-background'
              }`}
              title="Operational Insights & Charts"
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Analytics</span>
            </button>
          </div>

          {can(PERMISSIONS.TASK_CREATE) && (
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all shadow-[0_0_15px_rgba(37,99,235,0.2)] hover:shadow-[0_0_25px_rgba(37,99,235,0.4)] cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Create Task</span>
            </button>
          )}

          {activeView !== 'analytics' && (
            <button
              type="button"
              onClick={() => setIsActivityFeedOpen(!isActivityFeedOpen)}
              className={`flex items-center space-x-2 px-3 py-2.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                isActivityFeedOpen 
                  ? 'bg-blue-500/10 border-blue-500/30 text-blue-400' 
                  : 'bg-muted border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              <Activity className="w-4 h-4" />
              <span className="hidden sm:inline">Activity Feed</span>
            </button>
          )}
        </div>
      </div>

      {/* Metrics Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {/* Total Active */}
        <div className="glass-panel border border-border rounded-2xl p-4 flex items-center space-x-3 relative overflow-hidden group hover:border-blue-500/30 transition-all duration-300">
          <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <LayoutGrid className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Active Tasks</div>
            <div className="text-xl font-black text-foreground mt-0.5">{metrics.active}</div>
          </div>
          <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-full blur-2xl -mr-8 -mt-8" />
        </div>

        {/* Blocked */}
        <div className="glass-panel border border-border rounded-2xl p-4 flex items-center space-x-3 relative overflow-hidden group hover:border-red-500/30 transition-all duration-300">
          <div className="p-2.5 rounded-xl bg-red-500/10 text-red-400 border border-red-500/20">
            <AlertTriangle className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Blocked</div>
            <div className="text-xl font-black text-foreground mt-0.5">{metrics.blocked}</div>
          </div>
          <div className="absolute top-0 right-0 w-24 h-24 bg-red-500/5 rounded-full blur-2xl -mr-8 -mt-8" />
        </div>

        {/* Due Today */}
        <div className="glass-panel border border-border rounded-2xl p-4 flex items-center space-x-3 relative overflow-hidden group hover:border-amber-500/30 transition-all duration-300">
          <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Due Today</div>
            <div className="text-xl font-black text-foreground mt-0.5">{metrics.dueToday}</div>
          </div>
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-2xl -mr-8 -mt-8" />
        </div>

        {/* Velocity */}
        <div className="glass-panel border border-border rounded-2xl p-4 flex items-center space-x-3 relative overflow-hidden group hover:border-purple-500/30 transition-all duration-300">
          <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
            <Sparkles className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Velocity</div>
            <div className="text-xl font-black text-foreground mt-0.5">{metrics.velocity} SP</div>
          </div>
          <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/5 rounded-full blur-2xl -mr-8 -mt-8" />
        </div>

        {/* Assigned to Me */}
        <div className="glass-panel border border-border rounded-2xl p-4 flex items-center space-x-3 col-span-2 md:col-span-1 relative overflow-hidden group hover:border-emerald-500/30 transition-all duration-300">
          <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <User className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">My Tasks</div>
            <div className="text-xl font-black text-foreground mt-0.5">{metrics.assignedToMe}</div>
          </div>
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl -mr-8 -mt-8" />
        </div>
      </div>

      {/* Filtering Row */}
      <TaskFilters
        projects={projects}
        sprints={allSprints}
        phases={allPhases}
        assignees={users}
        search={search}
        projectId={selectedProjectId}
        sprintId={selectedSprintId}
        assigneeId={selectedAssigneeId}
        phaseId={selectedPhaseId}
        status={selectedStatus}
        priority={selectedPriority}
        onSearchChange={setSearch}
        onProjectChange={setSelectedProjectId}
        onSprintChange={setSelectedSprintId}
        onAssigneeChange={setSelectedAssigneeId}
        onPhaseChange={setSelectedPhaseId}
        onStatusChange={setSelectedStatus}
        onPriorityChange={setSelectedPriority}
        onClearFilters={clearFilters}
      />

      {/* Main Workspace Layout */}
      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* Workspace views conditional render */}
        <div className="flex-1 w-full overflow-hidden">
          {activeView === 'board' && (
            <TaskBoard
              tasks={filteredTasks}
              projects={projects}
              sprints={allSprints}
              phases={allPhases}
              assignees={users}
              onTaskClick={setSelectedTask}
              onMoveTask={handleMoveTask}
            />
          )}

          {activeView === 'list' && (
            <TaskTable
              tasks={filteredTasks}
              projects={projects}
              sprints={allSprints}
              phases={allPhases}
              assignees={users}
              onTaskClick={setSelectedTask}
            />
          )}

          {activeView === 'analytics' && (
            <TaskAnalytics
              tasks={filteredTasks}
              assignees={users}
            />
          )}
        </div>

        {/* Collapsible Activity Sidebar */}
        <AnimatePresence>
          {isActivityFeedOpen && activeView !== 'analytics' && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 340, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="w-full lg:w-[340px] flex-shrink-0"
            >
              <TaskActivityFeed
                activities={combinedActivities}
                projects={projects}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {projects.map((p) => (
        <ProjectRoomConnector key={p.id} projectId={p.id} isConnected={isConnected} active={!!currentUser} />
      ))}

      {/* Task Drawer */}
      <TaskDrawer
        task={selectedTask}
        isOpen={!!selectedTask}
        onClose={() => setSelectedTask(null)}
        projects={projects}
        sprints={allSprints}
        phases={allPhases}
        assignees={users}
        onUpdateTask={handleUpdateTask}
        onDeleteTask={handleDeleteTask}
      />

      {/* Create Task Modal Overlay */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddModal(false)}
              className="absolute inset-0 bg-background/60 backdrop-blur-sm"
            />

            {/* Modal Body */}
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-xl glass-panel-heavy border border-border rounded-2xl shadow-2xl overflow-hidden z-10 flex flex-col max-h-[90vh]"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-5 border-b border-border">
                <div className="flex items-center space-x-2">
                  <span className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
                    <Sparkles className="w-4 h-4" />
                  </span>
                  <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">Create New Workspace Task</h3>
                </div>
                <button
                  onClick={() => setShowAddModal(false)}
                  className="p-1.5 rounded-lg bg-muted hover:bg-accent text-muted-foreground hover:text-foreground transition-all cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Form */}
              <form onSubmit={handleCreateTask} className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
                
                {/* Title */}
                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest block">Task Title *</label>
                  <input
                    type="text"
                    required
                    placeholder="Provide a short name for the sprint deliverable..."
                    value={newTaskName}
                    onChange={(e) => setNewTaskName(e.target.value)}
                    className="w-full px-4 py-2.5 glass-input rounded-xl text-xs text-foreground placeholder-muted-foreground focus:outline-none"
                  />
                </div>

                {/* Description */}
                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest block">Description</label>
                  <textarea
                    rows={3}
                    placeholder="Provide specific notes, requirements, and testing criteria..."
                    value={newTaskDescription}
                    onChange={(e) => setNewTaskDescription(e.target.value)}
                    className="w-full px-4 py-2.5 glass-input rounded-xl text-xs text-foreground placeholder-muted-foreground focus:outline-none resize-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Project */}
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest block">Project *</label>
                    <select
                      required
                      value={newTaskProjectId}
                      onChange={(e) => {
                        setNewTaskProjectId(e.target.value);
                        setNewTaskSprintId('');
                        setNewTaskPhaseId('');
                      }}
                      className="w-full px-3 py-2.5 glass-input text-foreground text-xs rounded-xl focus:outline-none [&>option]:bg-background [&>option]:text-foreground"
                    >
                      <option value="">Select Project</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Assignee */}
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest block">Assignee</label>
                    <select
                      value={newTaskAssigneeId}
                      onChange={(e) => setNewTaskAssigneeId(e.target.value)}
                      className="w-full px-3 py-2.5 glass-input text-foreground text-xs rounded-xl focus:outline-none [&>option]:bg-background [&>option]:text-foreground"
                    >
                      <option value="">Unassigned</option>
                      {filteredUsers.map((u: any) => (
                        <option key={u.id} value={u.id}>
                          {u.firstName} {u.lastName}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Sprint */}
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest block">Sprint</label>
                    <select
                      value={newTaskSprintId}
                      disabled={!newTaskProjectId}
                      onChange={(e) => setNewTaskSprintId(e.target.value)}
                      className="w-full px-3 py-2.5 glass-input text-foreground text-xs rounded-xl focus:outline-none disabled:opacity-50 [&>option]:bg-background [&>option]:text-foreground"
                    >
                      <option value="">No Sprint</option>
                      {filteredSprintsForNewTask.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.status})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Phase */}
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest block">Project Phase</label>
                    <select
                      value={newTaskPhaseId}
                      disabled={!newTaskProjectId}
                      onChange={(e) => setNewTaskPhaseId(e.target.value)}
                      className="w-full px-3 py-2.5 glass-input text-foreground text-xs rounded-xl focus:outline-none disabled:opacity-50 [&>option]:bg-background [&>option]:text-foreground"
                    >
                      <option value="">No Phase</option>
                      {filteredPhasesForNewTask.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.status})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Priority */}
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest block">Priority</label>
                    <select
                      value={newTaskPriority}
                      onChange={(e) => setNewTaskPriority(e.target.value)}
                      className="w-full px-3 py-2.5 glass-input text-foreground text-xs rounded-xl focus:outline-none [&>option]:bg-background [&>option]:text-foreground"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="critical">Critical</option>
                    </select>
                  </div>

                  {/* Story Points */}
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest block">Story Weight (SP)</label>
                    <select
                      value={newTaskStoryPoints}
                      onChange={(e) => setNewTaskStoryPoints(Number(e.target.value))}
                      className="w-full px-3 py-2.5 glass-input text-foreground text-xs rounded-xl focus:outline-none [&>option]:bg-background [&>option]:text-foreground"
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
                    <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest block">Due Date</label>
                    <input
                      type="date"
                      value={newTaskDueDate}
                      onChange={(e) => setNewTaskDueDate(e.target.value)}
                      className="w-full px-3 py-2.5 glass-input text-foreground text-xs rounded-xl focus:outline-none cursor-pointer"
                    />
                  </div>
                </div>

                {/* Submit buttons */}
                <div className="flex items-center justify-end space-x-3 pt-4 border-t border-border">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="px-4 py-2 rounded-xl bg-muted hover:bg-accent text-muted-foreground hover:text-foreground text-xs font-bold transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isCreatingTask}
                    className="flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all disabled:opacity-50 cursor-pointer"
                  >
                    {isCreatingTask ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Provisioning DB...</span>
                      </>
                    ) : (
                      <span>Create Task</span>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
