import React, { useState } from 'react';
import { useParams, Outlet, Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { projectsApi } from '../../services/api/projects';
import {
  FolderKanban,
  GitBranch,
  ShieldCheck,
  Activity,
  ArrowLeft,
  Radio,
  ChevronRight,
  Loader2,
  Clock,
  Users
} from 'lucide-react';
import { useSocket } from '../../services/socket/socket-context';
import TeamPresence from '../../components/collaboration/TeamPresence';
import ProjectMembersDrawer from '../../components/projects/ProjectMembersDrawer';

export const ProjectDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const { isConnected } = useSocket();
  const [membersDrawerOpen, setMembersDrawerOpen] = useState(false);

  const getCurrentPageName = (): 'workflow' | 'sprints' | 'gates' => {
    if (location.pathname.endsWith('/sprints')) return 'sprints';
    if (location.pathname.endsWith('/gates')) return 'gates';
    return 'workflow';
  };

  const { data: project, isLoading, error, refetch } = useQuery({
    queryKey: ['project', id],
    queryFn: () => projectsApi.getById(id!),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="w-full h-[60vh] flex flex-col items-center justify-center space-y-4">
        <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
        <span className="text-xs font-light text-muted-foreground tracking-widest uppercase animate-pulse">
          Retrieving governance metadata
        </span>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="glass-panel rounded-2xl p-8 text-center border border-border space-y-4 max-w-md mx-auto mt-12">
        <FolderKanban className="w-12 h-12 text-red-400 mx-auto" />
        <div>
          <h3 className="text-lg font-bold text-white">Deliverable Load Error</h3>
          <p className="text-xs text-muted-foreground mt-1 font-light">
            We were unable to locate the requested deliverable context or verify active RLS permissions.
          </p>
        </div>
        <Link
          to="/projects"
          className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Return to Workspace</span>
        </Link>
      </div>
    );
  }

  // Calculate timelines / progress / status based on phases
  const phases = project.phases || [];
  const completedPhases = phases.filter((p) => p.status === 'completed').length;
  const activePhase = phases.find((p) => p.status === 'active');
  const progressPercent = phases.length > 0 ? Math.round((completedPhases / phases.length) * 100) : 0;
  const isFullyComplete = phases.length > 0 && completedPhases === phases.length;
  const projectStatus = isFullyComplete ? 'completed' : (project.status === 'completed' ? 'active' : project.status);

  const tabs = [
    { name: 'Workflow Timeline', path: `/projects/${id}/workflow`, icon: GitBranch },
    { name: 'Sprints Planner', path: `/projects/${id}/sprints`, icon: Activity },
    { name: 'Quality Gates Checklist', path: `/projects/${id}/gates`, icon: ShieldCheck },
    { name: 'Operational Timeline', path: `/projects/${id}/activity`, icon: Clock },
  ];

  return (
    <div className="space-y-6 text-foreground animate-fade-in">
      {/* Workspace Breadcrumbs & Active Indicator */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center space-y-4 sm:space-y-0 pb-4 border-b border-border">
        <div className="space-y-1.5">
          <div className="flex items-center space-x-1 text-xs text-zinc-500 font-medium">
            <Link to="/dashboard" className="hover:text-zinc-900 dark:hover:text-white transition-all">Overview</Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <Link to="/projects" className="hover:text-zinc-900 dark:hover:text-white transition-all">Workspace Deliverables</Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-zinc-400 select-none truncate max-w-[120px]">{project.name}</span>
          </div>
          <div className="flex items-center space-x-2.5">
            <h1 className="text-2xl font-extrabold text-zinc-900 dark:text-white tracking-tight">
              {project.name}
            </h1>
            <span
              className={`text-[9px] uppercase font-extrabold tracking-widest px-2.5 py-0.5 rounded-full border ${
                projectStatus === 'active'
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                  : 'bg-red-500/10 border-red-500/20 text-red-400'
              }`}
            >
              {projectStatus}
            </span>
          </div>
          {project.description && (
            <p className="text-xs text-muted-foreground font-light leading-relaxed max-w-2xl">
              {project.description}
            </p>
          )}
        </div>

        {/* Action Widgets / Context badge */}
        <div className="flex flex-wrap items-center gap-3">
          {project && (
            <TeamPresence projectId={project.id} currentPage={getCurrentPageName()} />
          )}

          <div
            className={`flex items-center space-x-1.5 px-3 py-1 rounded-full text-[10px] font-semibold border uppercase tracking-wider ${
              isConnected
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                : 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400'
            }`}
          >
            <Radio className={`w-3 h-3 ${isConnected ? 'animate-pulse' : ''}`} />
            <span>{isConnected ? 'Sync Active' : 'Disconnected'}</span>
          </div>

          <button
            onClick={() => setMembersDrawerOpen(true)}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white transition-all text-xs font-semibold shadow-lg hover:shadow-blue-500/10 active:scale-95"
          >
            <Users className="w-3.5 h-3.5" />
            <span>Members</span>
          </button>

          <Link
            to="/projects"
            className="flex items-center space-x-1 px-3.5 py-2 rounded-xl bg-white/5 border border-border text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-all text-xs font-semibold"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Workspace</span>
          </Link>
        </div>
      </div>

      {/* Deliverable Metrics and Current Phase Context */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass-panel rounded-xl p-4 border border-border flex flex-col justify-between">
          <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
            Timeline Progress
          </div>
          <div className="flex items-end justify-between mt-2">
            <span className="text-2xl font-extrabold text-zinc-900 dark:text-white">{progressPercent}%</span>
            <span className="text-xs font-semibold text-zinc-500">
              {completedPhases} of {phases.length} Phases Completed
            </span>
          </div>
          <div className="w-full bg-white/5 rounded-full h-1.5 overflow-hidden border border-white/5 mt-3">
            <div
              className="bg-gradient-to-r from-blue-500 to-indigo-600 h-full rounded-full transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        <div className="glass-panel rounded-xl p-4 border border-border flex flex-col justify-between">
          <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
            Current Stage Gate
          </div>
          <div className="mt-2.5">
            {activePhase ? (
              <div className="flex items-center justify-between">
                <span className="text-base font-bold text-blue-400 truncate">
                  {activePhase.name}
                </span>
                <span className="text-[9px] uppercase font-extrabold tracking-wider bg-blue-500/10 border border-blue-500/20 text-blue-400 px-2 py-0.5 rounded">
                  Active
                </span>
              </div>
            ) : (
              <div className="text-zinc-500 text-xs italic font-light">
                No active phase. Initialize timeline nodes below.
              </div>
            )}
          </div>
          <div className="text-[10px] text-muted-foreground font-light mt-2 border-t border-white/5 pt-2 flex justify-between">
            <span>Sprints in Phase: {project.sprints?.filter((s) => s.phaseId === activePhase?.id).length || 0}</span>
            <span>Quality Gates: {project.gates?.filter((g) => g.phaseId === activePhase?.id).length || 0}</span>
          </div>
        </div>

        <div className="glass-panel rounded-xl p-4 border border-border flex flex-col justify-between">
          <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
            RLS Audit Context
          </div>
          <div className="text-xs font-light text-zinc-400 mt-2 space-y-1">
            <div className="flex justify-between">
              <span>Workspace ID:</span>
              <span className="font-mono text-[10px] text-zinc-900 dark:text-white truncate max-w-[120px]">{project.id}</span>
            </div>
            <div className="flex justify-between">
              <span>Acme Domain:</span>
              <span className="text-emerald-400 font-semibold select-none">rls-secured-tx</span>
            </div>
          </div>
          <div className="text-[9px] text-zinc-500 font-semibold uppercase tracking-wider mt-2 flex items-center space-x-1 justify-end">
            <span>Standard Security Verified</span>
          </div>
        </div>
      </div>

      {/* Sub-tab Navigation */}
      <div className="flex space-x-2 border-b border-border pb-px overflow-x-auto">
        {tabs.map((tab) => {
          const TabIcon = tab.icon;
          const isActive = location.pathname.startsWith(tab.path) || 
            (tab.path.endsWith('/workflow') && (location.pathname === `/projects/${id}` || location.pathname === `/projects/${id}/`));
          
          return (
            <Link
              key={tab.name}
              to={tab.path}
              className={`flex items-center space-x-2 px-5 py-3 text-xs font-bold border-b-2 transition-all capitalize whitespace-nowrap ${
                isActive
                  ? 'border-blue-500 text-blue-400 bg-blue-500/5'
                  : 'border-transparent text-muted-foreground hover:text-zinc-900 dark:hover:text-white hover:bg-white/5'
              }`}
            >
              <TabIcon className="w-4 h-4" />
              <span>{tab.name}</span>
            </Link>
          );
        })}
      </div>

      {/* Tab Contents Nested Route mounting point */}
      <div className="pt-2">
        <Outlet context={{ project, refetch }} />
      </div>

      {/* Project Members Drawer */}
      {project && (
        <ProjectMembersDrawer
          projectId={project.id}
          projectName={project.name}
          isOpen={membersDrawerOpen}
          onClose={() => setMembersDrawerOpen(false)}
        />
      )}
    </div>
  );
};
export default ProjectDetail;
