import React from 'react';
import { Search, X, Filter } from 'lucide-react';
import type { Project, Sprint, Phase } from '../../services/api/projects';
import type { User } from '../../services/api/users';

interface TaskFiltersProps {
  projects: Project[];
  sprints: Sprint[];
  phases: Phase[];
  assignees: User[];
  
  // Selected filter values
  search: string;
  projectId: string;
  sprintId: string;
  assigneeId: string;
  phaseId: string;
  status: string;
  priority: string;

  // Filter setters
  onSearchChange: (val: string) => void;
  onProjectChange: (val: string) => void;
  onSprintChange: (val: string) => void;
  onAssigneeChange: (val: string) => void;
  onPhaseChange: (val: string) => void;
  onStatusChange: (val: string) => void;
  onPriorityChange: (val: string) => void;
  onClearFilters: () => void;
}

export const TaskFilters: React.FC<TaskFiltersProps> = ({
  projects,
  sprints,
  phases,
  assignees,
  search,
  projectId,
  sprintId,
  assigneeId,
  phaseId,
  status,
  priority,
  onSearchChange,
  onProjectChange,
  onSprintChange,
  onAssigneeChange,
  onPhaseChange,
  onStatusChange,
  onPriorityChange,
  onClearFilters,
}) => {
  // Filter sprints and phases based on selected project
  const filteredSprints = projectId
    ? sprints.filter((s) => s.projectId === projectId)
    : sprints;

  const filteredPhases = projectId
    ? phases.filter((p) => p.projectId === projectId)
    : phases;

  return (
    <div className="glass-panel rounded-2xl p-5 border border-border space-y-4 glow-primary">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search tasks by name or description..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-11 pr-4 py-2.5 glass-input rounded-xl text-xs text-foreground placeholder-muted-foreground focus:outline-none transition-all font-light"
          />
          {search && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-all cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Clear Filters Actions */}
        <div className="flex items-center justify-between xl:justify-end gap-3 text-xs">
          <span className="flex items-center space-x-1.5 text-muted-foreground font-medium">
            <Filter className="w-3.5 h-3.5" />
            <span>Active Filters</span>
          </span>
          {(projectId || sprintId || assigneeId || phaseId || status || priority || search) && (
            <button
              onClick={onClearFilters}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 font-bold transition-all cursor-pointer"
            >
              <X className="w-3 h-3" />
              <span>Clear All</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter Selectors Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
        {/* Project Selector */}
        <div className="space-y-1">
          <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Project</label>
          <select
            value={projectId}
            onChange={(e) => onProjectChange(e.target.value)}
            className="w-full px-3 py-2 glass-input text-foreground text-xs rounded-xl focus:outline-none transition-all cursor-pointer font-light [&>option]:bg-background [&>option]:text-foreground"
          >
            <option value="">All Projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {/* Sprint Selector */}
        <div className="space-y-1">
          <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Sprint</label>
          <select
            value={sprintId}
            onChange={(e) => onSprintChange(e.target.value)}
            className="w-full px-3 py-2 glass-input text-foreground text-xs rounded-xl focus:outline-none transition-all cursor-pointer font-light [&>option]:bg-background [&>option]:text-foreground"
          >
            <option value="">All Sprints</option>
            {filteredSprints.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.status})
              </option>
            ))}
          </select>
        </div>

        {/* Assignee Selector */}
        <div className="space-y-1">
          <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Assignee</label>
          <select
            value={assigneeId}
            onChange={(e) => onAssigneeChange(e.target.value)}
            className="w-full px-3 py-2 glass-input text-foreground text-xs rounded-xl focus:outline-none transition-all cursor-pointer font-light [&>option]:bg-background [&>option]:text-foreground"
          >
            <option value="">All Assignees</option>
            {assignees.map((u) => (
              <option key={u.id} value={u.id}>
                {u.firstName} {u.lastName}
              </option>
            ))}
          </select>
        </div>

        {/* Phase Selector */}
        <div className="space-y-1">
          <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Phase</label>
          <select
            value={phaseId}
            onChange={(e) => onPhaseChange(e.target.value)}
            className="w-full px-3 py-2 glass-input text-foreground text-xs rounded-xl focus:outline-none transition-all cursor-pointer font-light [&>option]:bg-background [&>option]:text-foreground"
          >
            <option value="">All Phases</option>
            {filteredPhases.map((ph) => (
              <option key={ph.id} value={ph.id}>
                {ph.name} ({ph.status})
              </option>
            ))}
          </select>
        </div>

        {/* Status Selector */}
        <div className="space-y-1">
          <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Status</label>
          <select
            value={status}
            onChange={(e) => onStatusChange(e.target.value)}
            className="w-full px-3 py-2 glass-input text-foreground text-xs rounded-xl focus:outline-none transition-all cursor-pointer font-light [&>option]:bg-background [&>option]:text-foreground"
          >
            <option value="">All Statuses</option>
            <option value="to_do">To Do</option>
            <option value="in_progress">In Progress</option>
            <option value="in_review">In Review</option>
            <option value="done">Done</option>
            <option value="blocked">Blocked</option>
          </select>
        </div>

        {/* Priority Selector */}
        <div className="space-y-1">
          <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Priority</label>
          <select
            value={priority}
            onChange={(e) => onPriorityChange(e.target.value)}
            className="w-full px-3 py-2 glass-input text-foreground text-xs rounded-xl focus:outline-none transition-all cursor-pointer font-light [&>option]:bg-background [&>option]:text-foreground"
          >
            <option value="">All Priorities</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </div>
      </div>
    </div>
  );
};
