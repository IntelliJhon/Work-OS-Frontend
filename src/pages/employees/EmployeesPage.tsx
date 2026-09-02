import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { usersApi, type User } from '../../services/api/users';
import { tasksApi, type Task } from '../../services/api/tasks.api';
import { projectsApi, type Project } from '../../services/api/projects';
import {
  Users,
  Search,
  CheckCircle2,
  Clock,
  Sparkles,
  AlertCircle,
  X,
  Briefcase,
  Calendar,
  CheckSquare,
  RefreshCw,
  UserCheck,
  Mail,
  Layers,
  LayoutGrid,
  Table as TableIcon,
  ChevronRight,
  AlertTriangle
} from 'lucide-react';

type TaskStatusCategory = 'all' | 'done' | 'in_progress' | 'in_review' | 'to_do';

export const EmployeesPage: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [selectedEmployee, setSelectedEmployee] = useState<User | null>(null);

  // 1. Fetch Users (Employees)
  const {
    data: usersData,
    isLoading: isUsersLoading,
    isError: isUsersError,
    refetch: refetchUsers,
    isFetching: isUsersFetching,
  } = useQuery({
    queryKey: ['employees-list'],
    queryFn: async () => {
      const res = await usersApi.list({ limit: 100 });
      return Array.isArray(res) ? res : res?.users || [];
    },
    staleTime: 60000,
  });

  // 2. Fetch Tasks
  const {
    data: tasksData = [],
    isLoading: isTasksLoading,
    refetch: refetchTasks,
    isFetching: isTasksFetching,
  } = useQuery({
    queryKey: ['all-tasks-list'],
    queryFn: tasksApi.list,
    staleTime: 30000,
  });

  // 3. Fetch Projects (for mapping project name)
  const { data: projectsData = [] } = useQuery({
    queryKey: ['projects-list'],
    queryFn: projectsApi.list,
    staleTime: 60000,
  });

  const allUsers: User[] = usersData || [];

  // Exclude Tenant Admin / Admin users from the employees list
  const employees = useMemo(() => {
    return allUsers.filter((u) => {
      const role = (u.roleName || '').toLowerCase().trim();
      return !(
        role === 'tenant admin' ||
        role === 'admin' ||
        role === 'tenant_admin' ||
        role.includes('tenant admin')
      );
    });
  }, [allUsers]);

  // Project map for quick name lookup
  const projectMap = useMemo(() => {
    const map = new Map<string, string>();
    projectsData.forEach((p: Project) => {
      map.set(p.id, p.name);
    });
    return map;
  }, [projectsData]);

  // Helper: Categorize task status
  const getTaskCategory = (status: string): 'done' | 'in_progress' | 'in_review' | 'to_do' => {
    const s = (status || '').toLowerCase();
    if (s === 'done' || s === 'completed') return 'done';
    if (s === 'in_progress' || s === 'doing' || s === 'active') return 'in_progress';
    if (s === 'in_review' || s === 'review' || s === 'testing' || s === 'qa') return 'in_review';
    return 'to_do';
  };

  // Helper: Get employee's assigned tasks
  const getEmployeeTasks = (userId: string, userEmail: string, userFullName: string) => {
    const emailLower = (userEmail || '').toLowerCase();
    const nameLower = (userFullName || '').toLowerCase();

    return tasksData.filter((t: Task) => {
      if (t.assigneeId === userId) return true;
      if (t.customFields?.assigneeName) {
        const cName = t.customFields.assigneeName.toLowerCase();
        if (cName.includes(emailLower) || cName.includes(nameLower) || nameLower.includes(cName)) {
          return true;
        }
      }
      return false;
    });
  };

  // Unique roles for filter dropdown
  const uniqueRoles = useMemo(() => {
    const roles = new Set<string>();
    employees.forEach((u) => {
      if (u.roleName) roles.add(u.roleName);
    });
    return Array.from(roles);
  }, [employees]);

  // Filtered employees list
  const filteredEmployees = useMemo(() => {
    return employees.filter((emp) => {
      const fullName = `${emp.firstName || ''} ${emp.lastName || ''}`.trim().toLowerCase();
      const email = (emp.email || '').toLowerCase();
      const q = searchQuery.toLowerCase().trim();

      const matchesSearch = !q || fullName.includes(q) || email.includes(q);
      const matchesRole = roleFilter === 'all' || emp.roleName === roleFilter;

      return matchesSearch && matchesRole;
    });
  }, [employees, searchQuery, roleFilter]);

  // Overall Statistics
  const totalEmployees = employees.length;
  
  const completedTasksCount = useMemo(() => {
    return tasksData.filter((t) => getTaskCategory(t.status) === 'done').length;
  }, [tasksData]);

  const inProgressTasksCount = useMemo(() => {
    return tasksData.filter((t) => getTaskCategory(t.status) === 'in_progress').length;
  }, [tasksData]);

  const inReviewTasksCount = useMemo(() => {
    return tasksData.filter((t) => getTaskCategory(t.status) === 'in_review').length;
  }, [tasksData]);

  const isRefreshing = isUsersFetching || isTasksFetching;

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="space-y-1">
          <h2 className="text-xl font-bold flex items-center space-x-2 text-slate-900 dark:text-white">
            <UserCheck className="w-5 h-5 text-indigo-500" />
            <span>Company Employees</span>
          </h2>
          <p className="text-xs text-muted-foreground font-light">
            Manage company team members, track workload distribution, and review task progress.
          </p>
        </div>

        <div className="flex items-center space-x-2.5">
          {/* View Mode Toggle */}
          <div className="flex items-center p-1 rounded-xl bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                viewMode === 'grid'
                  ? 'bg-white dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200'
              }`}
              title="Grid View"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                viewMode === 'table'
                  ? 'bg-white dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200'
              }`}
              title="Table View"
            >
              <TableIcon className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={() => {
              refetchUsers();
              refetchTasks();
            }}
            disabled={isRefreshing}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-xs font-bold text-slate-700 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-800/80 transition shadow-sm cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-indigo-500 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* ── Summary Stats Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="glass-panel rounded-2xl p-4 border border-slate-100 dark:border-white/5 flex items-center space-x-3.5">
          <div className="p-2.5 rounded-xl text-indigo-500 bg-indigo-500/10 shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] uppercase font-black tracking-wider text-slate-400">TOTAL EMPLOYEES</p>
            <h4 className="text-xl font-extrabold text-slate-900 dark:text-white mt-0.5">{totalEmployees}</h4>
          </div>
        </div>

        <div className="glass-panel rounded-2xl p-4 border border-slate-100 dark:border-white/5 flex items-center space-x-3.5">
          <div className="p-2.5 rounded-xl text-blue-500 bg-blue-500/10 shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] uppercase font-black tracking-wider text-slate-400">IN PROGRESS TASKS</p>
            <h4 className="text-xl font-extrabold text-slate-900 dark:text-white mt-0.5">{inProgressTasksCount}</h4>
          </div>
        </div>

        <div className="glass-panel rounded-2xl p-4 border border-slate-100 dark:border-white/5 flex items-center space-x-3.5">
          <div className="p-2.5 rounded-xl text-purple-500 bg-purple-500/10 shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] uppercase font-black tracking-wider text-slate-400">IN REVIEW TASKS</p>
            <h4 className="text-xl font-extrabold text-slate-900 dark:text-white mt-0.5">{inReviewTasksCount}</h4>
          </div>
        </div>

        <div className="glass-panel rounded-2xl p-4 border border-slate-100 dark:border-white/5 flex items-center space-x-3.5">
          <div className="p-2.5 rounded-xl text-emerald-500 bg-emerald-500/10 shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] uppercase font-black tracking-wider text-slate-400">COMPLETED TASKS</p>
            <h4 className="text-xl font-extrabold text-slate-900 dark:text-white mt-0.5">{completedTasksCount}</h4>
          </div>
        </div>
      </div>

      {/* ── Search & Filter Controls ── */}
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-slate-50/50 dark:bg-zinc-900/10 border border-slate-200 dark:border-zinc-800 p-4 rounded-2xl">
        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto items-stretch sm:items-center">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search employee by name, email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-xl bg-white dark:bg-background border border-slate-200 dark:border-zinc-850 text-xs text-slate-700 dark:text-zinc-200 focus:outline-none focus:border-indigo-500 font-medium"
            />
          </div>

          {/* Role Filter */}
          {uniqueRoles.length > 0 && (
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="px-3 py-2 rounded-xl bg-white dark:bg-background border border-slate-200 dark:border-zinc-850 text-xs font-semibold text-slate-700 dark:text-zinc-300 focus:outline-none focus:border-indigo-500 cursor-pointer"
            >
              <option value="all">All Roles</option>
              {uniqueRoles.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          )}
        </div>

        <div className="text-xs text-slate-500 dark:text-zinc-400 font-semibold self-end sm:self-auto">
          Showing {filteredEmployees.length} of {totalEmployees} employees
        </div>
      </div>

      {/* ── Main Content Area ── */}
      {isUsersLoading || isTasksLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-44 rounded-2xl bg-slate-100/60 dark:bg-white/5 animate-pulse border border-slate-100 dark:border-zinc-850" />
          ))}
        </div>
      ) : isUsersError ? (
        <div className="text-center py-16 border border-rose-200 dark:border-rose-900/40 bg-rose-50/30 dark:bg-rose-950/10 rounded-3xl space-y-3">
          <AlertTriangle className="w-10 h-10 mx-auto text-rose-500" />
          <h4 className="text-sm font-bold text-slate-900 dark:text-zinc-100">Failed to Load Employees</h4>
          <p className="text-xs text-muted-foreground font-light max-w-sm mx-auto">
            An error occurred while retrieving employee records. Please try again.
          </p>
          <button
            onClick={() => refetchUsers()}
            className="mt-2 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition shadow-sm cursor-pointer inline-flex items-center space-x-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Try Again</span>
          </button>
        </div>
      ) : filteredEmployees.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-slate-250 dark:border-zinc-800 rounded-3xl space-y-2">
          <Users className="w-10 h-10 mx-auto text-slate-350 dark:text-zinc-650" />
          <h4 className="text-sm font-bold text-slate-800 dark:text-zinc-300">No Employees Found</h4>
          <p className="text-xs text-muted-foreground font-light max-w-xs mx-auto">
            {searchQuery || roleFilter !== 'all'
              ? 'No team members match your search parameters.'
              : 'There are currently no registered users in this company.'}
          </p>
        </div>
      ) : viewMode === 'grid' ? (
        /* ── GRID VIEW ── */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredEmployees.map((emp) => {
            const fullName = `${emp.firstName || ''} ${emp.lastName || ''}`.trim() || emp.email.split('@')[0];
            const empTasks = getEmployeeTasks(emp.id, emp.email, fullName);
            
            const doneTasks = empTasks.filter((t) => getTaskCategory(t.status) === 'done').length;
            const inProgressTasks = empTasks.filter((t) => getTaskCategory(t.status) === 'in_progress').length;
            const inReviewTasks = empTasks.filter((t) => getTaskCategory(t.status) === 'in_review').length;
            const toDoTasks = empTasks.filter((t) => getTaskCategory(t.status) === 'to_do').length;
            const totalEmpTasks = empTasks.length;

            const completionRate = totalEmpTasks > 0 ? Math.round((doneTasks / totalEmpTasks) * 100) : 0;

            return (
              <div
                key={emp.id}
                onClick={() => setSelectedEmployee(emp)}
                className="group glass-panel rounded-2xl p-5 border border-slate-200/70 dark:border-zinc-800/80 hover:border-indigo-400/80 dark:hover:border-indigo-500/80 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200 cursor-pointer flex flex-col justify-between space-y-4 bg-white/60 dark:bg-zinc-950/40 relative overflow-hidden"
              >
                {/* Accent top gradient line on hover */}
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-blue-500 opacity-0 group-hover:opacity-100 transition-opacity" />

                {/* Card Header: Avatar & Info */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-indigo-600 to-purple-600 text-white font-black text-sm flex items-center justify-center shadow-md shadow-indigo-500/10 shrink-0 uppercase">
                      {fullName.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-slate-900 dark:text-zinc-100 truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                        {fullName}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-zinc-400 truncate flex items-center gap-1 mt-0.5 font-medium">
                        <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                        <span className="truncate">{emp.email}</span>
                      </p>
                    </div>
                  </div>

                  {emp.roleName && (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/60 shrink-0">
                      {emp.roleName}
                    </span>
                  )}
                </div>

                {/* Task Breakdown Stats Bar */}
                <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-zinc-900">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-700 dark:text-zinc-300 flex items-center gap-1.5">
                      <CheckSquare className="w-3.5 h-3.5 text-indigo-500" />
                      <span>Workload Progress</span>
                    </span>
                    <span className="font-mono text-[11px] font-bold text-indigo-600 dark:text-indigo-400">
                      {doneTasks}/{totalEmpTasks} Tasks ({completionRate}%)
                    </span>
                  </div>

                  {/* Multi-segmented Progress Bar */}
                  <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden flex">
                    {totalEmpTasks > 0 ? (
                      <>
                        <div
                          style={{ width: `${(doneTasks / totalEmpTasks) * 100}%` }}
                          className="bg-emerald-500 h-full transition-all"
                          title={`Done: ${doneTasks}`}
                        />
                        <div
                          style={{ width: `${(inProgressTasks / totalEmpTasks) * 100}%` }}
                          className="bg-blue-500 h-full transition-all"
                          title={`In Progress: ${inProgressTasks}`}
                        />
                        <div
                          style={{ width: `${(inReviewTasks / totalEmpTasks) * 100}%` }}
                          className="bg-purple-500 h-full transition-all"
                          title={`In Review: ${inReviewTasks}`}
                        />
                        <div
                          style={{ width: `${(toDoTasks / totalEmpTasks) * 100}%` }}
                          className="bg-amber-400 h-full transition-all"
                          title={`To Do: ${toDoTasks}`}
                        />
                      </>
                    ) : (
                      <div className="w-full h-full bg-slate-200 dark:bg-zinc-800" title="No tasks assigned" />
                    )}
                  </div>
                </div>

                {/* Status Badges Quick Summary */}
                <div className="grid grid-cols-4 gap-1.5 text-center pt-1">
                  <div className="p-1.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200/50 dark:border-emerald-900/30">
                    <p className="text-[9px] font-black uppercase text-emerald-600 dark:text-emerald-400">Done</p>
                    <p className="text-xs font-extrabold text-emerald-700 dark:text-emerald-300">{doneTasks}</p>
                  </div>
                  <div className="p-1.5 rounded-xl bg-blue-50/70 dark:bg-blue-950/20 border border-blue-200/50 dark:border-blue-900/30">
                    <p className="text-[9px] font-black uppercase text-blue-600 dark:text-blue-400">Active</p>
                    <p className="text-xs font-extrabold text-blue-700 dark:text-blue-300">{inProgressTasks}</p>
                  </div>
                  <div className="p-1.5 rounded-xl bg-purple-50/70 dark:bg-purple-950/20 border border-purple-200/50 dark:border-purple-900/30">
                    <p className="text-[9px] font-black uppercase text-purple-600 dark:text-purple-400">Review</p>
                    <p className="text-xs font-extrabold text-purple-700 dark:text-purple-300">{inReviewTasks}</p>
                  </div>
                  <div className="p-1.5 rounded-xl bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-900/30">
                    <p className="text-[9px] font-black uppercase text-amber-600 dark:text-amber-400">To Do</p>
                    <p className="text-xs font-extrabold text-amber-700 dark:text-amber-300">{toDoTasks}</p>
                  </div>
                </div>

                {/* Footer Action */}
                <div className="pt-2 flex items-center justify-between text-xs font-bold text-indigo-600 dark:text-indigo-400 group-hover:translate-x-0.5 transition-transform">
                  <span>View Task Distribution</span>
                  <ChevronRight className="w-4 h-4" />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* ── TABLE VIEW ── */
        <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-background/25">
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead>
              <tr className="border-b border-slate-200 dark:border-zinc-850 bg-slate-50/70 dark:bg-zinc-900/50">
                <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-500 dark:text-zinc-400 tracking-wider">Employee</th>
                <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-500 dark:text-zinc-400 tracking-wider">Email</th>
                <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-500 dark:text-zinc-400 tracking-wider">Role</th>
                <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-500 dark:text-zinc-400 tracking-wider text-center">Done</th>
                <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-500 dark:text-zinc-400 tracking-wider text-center">Active</th>
                <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-500 dark:text-zinc-400 tracking-wider text-center">In Review</th>
                <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-500 dark:text-zinc-400 tracking-wider text-center">To Do</th>
                <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-500 dark:text-zinc-400 tracking-wider text-center">Total</th>
                <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-500 dark:text-zinc-400 tracking-wider text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-150 dark:divide-zinc-850">
              {filteredEmployees.map((emp) => {
                const fullName = `${emp.firstName || ''} ${emp.lastName || ''}`.trim() || emp.email.split('@')[0];
                const empTasks = getEmployeeTasks(emp.id, emp.email, fullName);

                const doneTasks = empTasks.filter((t) => getTaskCategory(t.status) === 'done').length;
                const inProgressTasks = empTasks.filter((t) => getTaskCategory(t.status) === 'in_progress').length;
                const inReviewTasks = empTasks.filter((t) => getTaskCategory(t.status) === 'in_review').length;
                const toDoTasks = empTasks.filter((t) => getTaskCategory(t.status) === 'to_do').length;
                const totalEmpTasks = empTasks.length;

                return (
                  <tr
                    key={emp.id}
                    onClick={() => setSelectedEmployee(emp)}
                    className="hover:bg-slate-50/80 dark:hover:bg-zinc-900/40 transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-3.5 align-middle">
                      <div className="flex items-center space-x-2.5">
                        <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-bold text-xs flex items-center justify-center border border-indigo-200 dark:border-indigo-800/40 shrink-0 uppercase">
                          {fullName.charAt(0)}
                        </div>
                        <span className="text-xs font-bold text-slate-900 dark:text-zinc-100">{fullName}</span>
                      </div>
                    </td>

                    <td className="px-4 py-3.5 align-middle text-xs text-slate-600 dark:text-zinc-300 font-medium">
                      {emp.email}
                    </td>

                    <td className="px-4 py-3.5 align-middle">
                      {emp.roleName ? (
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/60">
                          {emp.roleName}
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400">-</span>
                      )}
                    </td>

                    <td className="px-4 py-3.5 align-middle text-center">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-900/50">
                        {doneTasks}
                      </span>
                    </td>

                    <td className="px-4 py-3.5 align-middle text-center">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200/60 dark:border-blue-900/50">
                        {inProgressTasks}
                      </span>
                    </td>

                    <td className="px-4 py-3.5 align-middle text-center">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 border border-purple-200/60 dark:border-purple-900/50">
                        {inReviewTasks}
                      </span>
                    </td>

                    <td className="px-4 py-3.5 align-middle text-center">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-200/60 dark:border-amber-900/50">
                        {toDoTasks}
                      </span>
                    </td>

                    <td className="px-4 py-3.5 align-middle text-center text-xs font-bold text-slate-800 dark:text-zinc-200">
                      {totalEmpTasks}
                    </td>

                    <td className="px-4 py-3.5 align-middle text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedEmployee(emp);
                        }}
                        className="px-2.5 py-1 rounded-xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/60 text-indigo-600 dark:text-indigo-300 text-xs font-bold transition inline-flex items-center gap-1 cursor-pointer"
                      >
                        <span>View Tasks</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────── */}
      {/* ── EMPLOYEE TASK BREAKDOWN MODAL ───────────────────────── */}
      {/* ────────────────────────────────────────────────────────── */}
      {selectedEmployee && (
        <EmployeeTaskModal
          employee={selectedEmployee}
          allTasks={tasksData}
          projectMap={projectMap}
          onClose={() => setSelectedEmployee(null)}
        />
      )}
    </div>
  );
};

// ── Interactive Employee Task Modal Component ──
interface EmployeeTaskModalProps {
  employee: User;
  allTasks: Task[];
  projectMap: Map<string, string>;
  onClose: () => void;
}

const EmployeeTaskModal: React.FC<EmployeeTaskModalProps> = ({
  employee,
  allTasks,
  projectMap,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<TaskStatusCategory>('all');
  const [taskSearch, setTaskSearch] = useState('');

  const fullName = `${employee.firstName || ''} ${employee.lastName || ''}`.trim() || employee.email.split('@')[0];
  const emailLower = (employee.email || '').toLowerCase();
  const nameLower = fullName.toLowerCase();

  // Categorize task helper
  const getTaskCategory = (status: string): 'done' | 'in_progress' | 'in_review' | 'to_do' => {
    const s = (status || '').toLowerCase();
    if (s === 'done' || s === 'completed') return 'done';
    if (s === 'in_progress' || s === 'doing' || s === 'active') return 'in_progress';
    if (s === 'in_review' || s === 'review' || s === 'testing' || s === 'qa') return 'in_review';
    return 'to_do';
  };

  // Filter tasks assigned to this employee
  const employeeTasks = useMemo(() => {
    return allTasks.filter((t) => {
      if (t.assigneeId === employee.id) return true;
      if (t.customFields?.assigneeName) {
        const cName = t.customFields.assigneeName.toLowerCase();
        if (cName.includes(emailLower) || cName.includes(nameLower) || nameLower.includes(cName)) {
          return true;
        }
      }
      return false;
    });
  }, [allTasks, employee.id, emailLower, nameLower]);

  // Counts by status
  const doneTasks = useMemo(() => employeeTasks.filter((t) => getTaskCategory(t.status) === 'done'), [employeeTasks]);
  const inProgressTasks = useMemo(() => employeeTasks.filter((t) => getTaskCategory(t.status) === 'in_progress'), [employeeTasks]);
  const inReviewTasks = useMemo(() => employeeTasks.filter((t) => getTaskCategory(t.status) === 'in_review'), [employeeTasks]);
  const toDoTasks = useMemo(() => employeeTasks.filter((t) => getTaskCategory(t.status) === 'to_do'), [employeeTasks]);

  // Filtered tasks for current tab & search query
  const displayedTasks = useMemo(() => {
    let list = employeeTasks;

    if (activeTab === 'done') list = doneTasks;
    else if (activeTab === 'in_progress') list = inProgressTasks;
    else if (activeTab === 'in_review') list = inReviewTasks;
    else if (activeTab === 'to_do') list = toDoTasks;

    if (!taskSearch.trim()) return list;

    const q = taskSearch.toLowerCase().trim();
    return list.filter((t) => {
      const name = (t.name || '').toLowerCase();
      const desc = (t.description || '').toLowerCase();
      const proj = (t.projectId ? projectMap.get(t.projectId) || '' : '').toLowerCase();
      return name.includes(q) || desc.includes(q) || proj.includes(q);
    });
  }, [employeeTasks, doneTasks, inProgressTasks, inReviewTasks, toDoTasks, activeTab, taskSearch, projectMap]);

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[9998] bg-slate-950/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal Dialog */}
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 overflow-y-auto">
        <div className="relative w-full max-w-3xl bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] my-auto animate-scale-in">
          {/* Modal Header */}
          <div className="p-6 border-b border-slate-200 dark:border-zinc-800 bg-slate-50/90 dark:bg-zinc-900/90 shrink-0 space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center space-x-3.5">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-600 to-purple-600 text-white font-black text-lg flex items-center justify-center shadow-lg shadow-indigo-500/20 shrink-0 uppercase">
                  {fullName.charAt(0)}
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">{fullName}</h3>
                    {employee.roleName && (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                        {employee.roleName}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                    <Mail className="w-3.5 h-3.5 text-slate-400" />
                    <span>{employee.email}</span>
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg bg-slate-200/70 hover:bg-slate-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-500 dark:text-zinc-400 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Stat Pill Highlights */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-2">
              <button
                type="button"
                onClick={() => setActiveTab('all')}
                className={`p-2 rounded-xl border text-left transition cursor-pointer ${
                  activeTab === 'all'
                    ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-300 dark:border-indigo-700'
                    : 'bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 hover:border-slate-300'
                }`}
              >
                <p className="text-[9px] font-black uppercase text-slate-400">Total Tasks</p>
                <p className="text-sm font-extrabold text-slate-900 dark:text-white mt-0.5">{employeeTasks.length}</p>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('done')}
                className={`p-2 rounded-xl border text-left transition cursor-pointer ${
                  activeTab === 'done'
                    ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-700'
                    : 'bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 hover:border-slate-300'
                }`}
              >
                <p className="text-[9px] font-black uppercase text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-2.5 h-2.5" />
                  <span>Done</span>
                </p>
                <p className="text-sm font-extrabold text-emerald-700 dark:text-emerald-300 mt-0.5">{doneTasks.length}</p>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('in_progress')}
                className={`p-2 rounded-xl border text-left transition cursor-pointer ${
                  activeTab === 'in_progress'
                    ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-300 dark:border-blue-700'
                    : 'bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 hover:border-slate-300'
                }`}
              >
                <p className="text-[9px] font-black uppercase text-blue-600 dark:text-blue-400 flex items-center gap-1">
                  <Clock className="w-2.5 h-2.5" />
                  <span>In Progress</span>
                </p>
                <p className="text-sm font-extrabold text-blue-700 dark:text-blue-300 mt-0.5">{inProgressTasks.length}</p>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('in_review')}
                className={`p-2 rounded-xl border text-left transition cursor-pointer ${
                  activeTab === 'in_review'
                    ? 'bg-purple-50 dark:bg-purple-950/60 border-purple-300 dark:border-purple-700'
                    : 'bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 hover:border-slate-300'
                }`}
              >
                <p className="text-[9px] font-black uppercase text-purple-600 dark:text-purple-400 flex items-center gap-1">
                  <Sparkles className="w-2.5 h-2.5" />
                  <span>In Review</span>
                </p>
                <p className="text-sm font-extrabold text-purple-700 dark:text-purple-300 mt-0.5">{inReviewTasks.length}</p>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('to_do')}
                className={`p-2 rounded-xl border text-left transition cursor-pointer ${
                  activeTab === 'to_do'
                    ? 'bg-amber-50 dark:bg-amber-950/60 border-amber-300 dark:border-amber-700'
                    : 'bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 hover:border-slate-300'
                }`}
              >
                <p className="text-[9px] font-black uppercase text-amber-600 dark:text-amber-400 flex items-center gap-1">
                  <AlertCircle className="w-2.5 h-2.5" />
                  <span>To Do</span>
                </p>
                <p className="text-sm font-extrabold text-amber-700 dark:text-amber-300 mt-0.5">{toDoTasks.length}</p>
              </button>
            </div>
          </div>

          {/* Modal Filter / Search Bar */}
          <div className="p-4 border-b border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search assigned tasks..."
                value={taskSearch}
                onChange={(e) => setTaskSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-xs text-slate-900 dark:text-zinc-100 focus:outline-none focus:border-indigo-500 font-medium"
              />
            </div>

            <div className="text-[11px] text-muted-foreground font-semibold self-end sm:self-auto">
              Showing {displayedTasks.length} task(s)
            </div>
          </div>

          {/* Modal Tasks List Area */}
          <div className="flex-1 overflow-y-auto p-5 space-y-3 bg-slate-50/50 dark:bg-zinc-900/20 max-h-[50vh]">
            {displayedTasks.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-slate-200 dark:border-zinc-800 rounded-2xl space-y-2">
                <CheckSquare className="w-8 h-8 mx-auto text-slate-350 dark:text-zinc-650" />
                <p className="text-xs font-bold text-slate-700 dark:text-zinc-300">No tasks in this category</p>
                <p className="text-[11px] text-muted-foreground">
                  {taskSearch ? 'No tasks match your search filter.' : `This employee currently has no tasks in "${activeTab.replace('_', ' ')}".`}
                </p>
              </div>
            ) : (
              displayedTasks.map((t) => {
                const category = getTaskCategory(t.status);
                const projectName = t.projectId ? projectMap.get(t.projectId) || 'Workspace Project' : 'General Task';
                const subtasks = t.customFields?.subtasks || [];
                const doneSubtasks = subtasks.filter((st) => st.done || st.status === 'done').length;
                const priority = t.customFields?.priority || 'medium';

                const statusBadgeStyle = {
                  done: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
                  in_progress: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800',
                  in_review: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800',
                  to_do: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',
                }[category];

                const priorityBadgeStyle = {
                  critical: 'text-rose-600 bg-rose-50 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-900',
                  high: 'text-orange-600 bg-orange-50 border-orange-200 dark:bg-orange-950/40 dark:text-orange-400 dark:border-orange-900',
                  medium: 'text-indigo-600 bg-indigo-50 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-400 dark:border-indigo-900',
                  low: 'text-slate-600 bg-slate-100 border-slate-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700',
                }[priority] || 'text-indigo-600 bg-indigo-50 border-indigo-200';

                return (
                  <div
                    key={t.id}
                    className="p-4 rounded-2xl bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 shadow-sm hover:shadow-md transition space-y-2.5"
                  >
                    {/* Task Title & Status Pill */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-0.5 min-w-0">
                        <div className="flex items-center space-x-2">
                          <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider flex items-center gap-1">
                            <Briefcase className="w-3 h-3" />
                            {projectName}
                          </span>
                        </div>
                        <h4 className="text-xs font-bold text-slate-900 dark:text-zinc-100 leading-snug">
                          {t.name}
                        </h4>
                      </div>

                      <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border shrink-0 ${statusBadgeStyle}`}>
                        {t.status ? t.status.replace('_', ' ') : category}
                      </span>
                    </div>

                    {/* Task Description snippet if available */}
                    {t.description && (
                      <p className="text-[11px] text-slate-600 dark:text-zinc-400 line-clamp-2 leading-relaxed">
                        {t.description}
                      </p>
                    )}

                    {/* Metadata Footer */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-zinc-900 text-[10px] text-slate-500 dark:text-zinc-400 font-medium">
                      <div className="flex items-center space-x-3">
                        {/* Priority Badge */}
                        <span className={`px-2 py-0.2 rounded-md font-bold uppercase tracking-wider border ${priorityBadgeStyle}`}>
                          {priority}
                        </span>

                        {/* Due Date / Date created */}
                        {t.customFields?.dueDate ? (
                          <span className="flex items-center gap-1 text-slate-700 dark:text-zinc-300 font-semibold">
                            <Calendar className="w-3 h-3 text-slate-400" />
                            <span>Due: {t.customFields.dueDate}</span>
                          </span>
                        ) : t.createdAt ? (
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-slate-400" />
                            <span>Added: {new Date(t.createdAt).toLocaleDateString()}</span>
                          </span>
                        ) : null}

                        {/* Subtasks Count */}
                        {subtasks.length > 0 && (
                          <span className="flex items-center gap-1 font-semibold text-slate-700 dark:text-zinc-300">
                            <Layers className="w-3 h-3 text-slate-400" />
                            <span>Subtasks: {doneSubtasks}/{subtasks.length}</span>
                          </span>
                        )}
                      </div>

                      {t.completedAt && category === 'done' && (
                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Finished {new Date(t.completedAt).toLocaleDateString()}</span>
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Modal Footer */}
          <div className="p-4 border-t border-slate-200 dark:border-zinc-800 bg-slate-50/90 dark:bg-zinc-900/90 flex items-center justify-between shrink-0">
            <span className="text-xs text-muted-foreground font-medium">
              Employee ID: <code className="font-mono text-[11px] text-slate-800 dark:text-zinc-200">{employee.id}</code>
            </span>

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md transition cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
};

export default EmployeesPage;
