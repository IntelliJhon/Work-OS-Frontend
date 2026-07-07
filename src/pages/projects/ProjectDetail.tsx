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
  Users,
  BarChart3,
  Pencil,
  X,
  ClipboardList,
  Bug
} from 'lucide-react';
import { useSocket } from '../../services/socket/socket-context';
import TeamPresence from '../../components/collaboration/TeamPresence';
import ProjectMembersDrawer from '../../components/projects/ProjectMembersDrawer';

export const ProjectDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const { isConnected } = useSocket();
  const [membersDrawerOpen, setMembersDrawerOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  const getCurrentPageName = (): 'scopes' | 'workflow' | 'activities' | 'gates' | 'analytics' | 'error-logs' => {
    if (location.pathname.endsWith('/scopes')) return 'scopes';
    if (location.pathname.endsWith('/sprints') || location.pathname.endsWith('/activities')) return 'activities';
    if (location.pathname.endsWith('/error-logs')) return 'error-logs';
    if (location.pathname.endsWith('/gates')) return 'gates';
    if (location.pathname.endsWith('/analytics')) return 'analytics';
    return 'workflow';
  };

  const { data: project, isLoading, error, refetch } = useQuery({
    queryKey: ['project', id],
    queryFn: () => projectsApi.getById(id!),
    enabled: !!id,
  });

  const handleSaveChanges = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project) return;
    if (!editName.trim()) {
      setUpdateError('Project name cannot be empty');
      return;
    }
    try {
      setIsUpdating(true);
      setUpdateError(null);
      await projectsApi.update(project.id, {
        name: editName.trim(),
        description: editDesc.trim() || null,
      });
      await refetch();
      setIsEditModalOpen(false);
    } catch (err: any) {
      console.error(err);
      setUpdateError(err.response?.data?.message || 'Failed to update project details');
    } finally {
      setIsUpdating(false);
    }
  };

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
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">Deliverable Load Error</h3>
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
    { name: 'Scopes & Objectives', path: `/projects/${id}/scopes`, icon: ClipboardList },
    { name: 'Analytics', path: `/projects/${id}/analytics`, icon: BarChart3 },
    { name: 'Workflow Timeline', path: `/projects/${id}/workflow`, icon: GitBranch },
    { name: 'Task Planner', path: `/projects/${id}/activities`, icon: Activity },
    { name: 'Error Logs', path: `/projects/${id}/error-logs`, icon: Bug },
    { name: 'Quality Gates Checklist', path: `/projects/${id}/gates`, icon: ShieldCheck },
  ];

  return (
    <div className="space-y-6 text-foreground animate-fade-in">
      {/* Workspace Breadcrumbs & Active Indicator */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center space-y-4 sm:space-y-0 pb-4 border-b border-border">
        <div className="space-y-1.5">
          <div className="flex items-center space-x-1 text-xs text-slate-500 dark:text-zinc-500 font-medium">
            <Link to="/dashboard" className="hover:text-zinc-900 dark:hover:text-white transition-all">Overview</Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <Link to="/projects" className="hover:text-zinc-900 dark:hover:text-white transition-all">Workspace Deliverables</Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-slate-600 dark:text-zinc-400 select-none truncate max-w-[120px]">{project.name}</span>
          </div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-extrabold text-zinc-900 dark:text-white tracking-tight">
              {project.name}
            </h1>
            
            <button
              onClick={() => {
                setEditName(project.name);
                setEditDesc(project.description || '');
                setIsEditModalOpen(true);
                setUpdateError(null);
              }}
              className="p-1 rounded-lg text-slate-400 hover:text-blue-500 hover:bg-blue-500/5 transition cursor-pointer"
              title="Edit project details"
            >
              <Pencil className="w-4 h-4" />
            </button>

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
          {project.description ? (
            <p className="text-xs text-muted-foreground font-light leading-relaxed max-w-2xl">
              {project.description}
            </p>
          ) : (
            <p className="text-xs text-zinc-400/50 dark:text-zinc-500/50 italic font-light">
              No description provided. Click the edit icon to add one.
            </p>
          )}
        </div>

        {/* Action Widgets / Context badge */}
        <div className="flex flex-wrap items-center gap-3">
          {project && (
            <TeamPresence 
              projectId={project.id} 
              currentPage={getCurrentPageName()} 
            />
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
            className="flex items-center space-x-1 px-3.5 py-2 rounded-xl bg-slate-100/60 dark:bg-white/5 border border-border text-slate-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-all text-xs font-semibold"
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
            <span className="text-2xl font-extrabold text-zinc-900 dark:text-slate-900 dark:text-white">{progressPercent}%</span>
            <span className="text-xs font-semibold text-slate-500 dark:text-zinc-500">
              {completedPhases} of {phases.length} Phases Completed
            </span>
          </div>
          <div className="w-full bg-slate-100/60 dark:bg-white/5 rounded-full h-1.5 overflow-hidden border border-slate-100 dark:border-white/5 mt-3">
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
              <div className="text-slate-500 dark:text-zinc-500 text-xs italic font-light">
                No active phase. Initialize timeline nodes below.
              </div>
            )}
          </div>
          <div className="text-[10px] text-muted-foreground font-light mt-2 border-t border-slate-100 dark:border-white/5 pt-2 flex justify-between">
            <span>Activities in Phase: {project.sprints?.filter((s) => s.phaseId === activePhase?.id).length || 0}</span>
            <span>Quality Gates: {project.gates?.filter((g) => g.phaseId === activePhase?.id).length || 0}</span>
          </div>
        </div>

        <div className="glass-panel rounded-xl p-4 border border-border flex flex-col justify-between">
          <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
            RLS Audit Context
          </div>
          <div className="text-xs font-light text-slate-600 dark:text-zinc-400 mt-2 space-y-1">
            <div className="flex justify-between">
              <span>Workspace ID:</span>
              <span className="font-mono text-[10px] text-zinc-900 dark:text-slate-900 dark:text-white truncate max-w-[120px]">{project.id}</span>
            </div>
            <div className="flex justify-between">
              <span>Company ID:</span>
              <span className="text-emerald-400 font-semibold select-none">{project.tenantSlug || 'rls-secured-tx'}</span>
            </div>
          </div>
          <div className="text-[9px] text-slate-500 dark:text-zinc-500 font-semibold uppercase tracking-wider mt-2 flex items-center space-x-1 justify-end">
            <span>Standard Security Verified</span>
          </div>
        </div>
      </div>

      {/* Sub-tab Navigation */}
      <div className="flex space-x-2 border-b border-border pb-px overflow-x-auto">
        {tabs.map((tab) => {
          const TabIcon = tab.icon;
          const isActive = location.pathname.startsWith(tab.path) || 
            (tab.path.endsWith('/scopes') && (location.pathname === `/projects/${id}` || location.pathname === `/projects/${id}/`));
          
          return (
            <Link
              key={tab.name}
              to={tab.path}
              className={`flex items-center space-x-2 px-5 py-3 text-xs font-bold border-b-2 transition-all capitalize whitespace-nowrap ${
                isActive
                  ? 'border-blue-500 text-blue-400 bg-blue-500/5'
                  : 'border-transparent text-muted-foreground hover:text-zinc-900 dark:hover:text-white hover:bg-slate-100/60 dark:bg-white/5'
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

      {/* Edit Project Modal */}
      {isEditModalOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-[9998] bg-black/45 backdrop-blur-[2px] transition-opacity duration-200"
            onClick={() => !isUpdating && setIsEditModalOpen(false)}
          />

          {/* Modal Container */}
          <div className="fixed z-[9999] inset-0 flex items-center justify-center p-4">
            <form
              onSubmit={handleSaveChanges}
              className="w-full max-w-md bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden transition-all duration-200 scale-100"
            >
              {/* Top Accent Line */}
              <div className="h-1 w-full bg-gradient-to-r from-blue-500 to-indigo-500" />

              <div className="p-6 space-y-4">
                {/* Header */}
                <div className="flex items-center justify-between pb-2 border-b border-border">
                  <div className="flex items-center space-x-2.5">
                    <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-500">
                      <Pencil className="w-4 h-4" />
                    </div>
                    <h3 className="text-sm font-black uppercase tracking-wider text-slate-800 dark:text-zinc-200">
                      Edit Deliverable
                    </h3>
                  </div>
                  <button
                    type="button"
                    disabled={isUpdating}
                    onClick={() => setIsEditModalOpen(false)}
                    className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 text-slate-400 hover:text-slate-700 dark:hover:text-white transition cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Form fields */}
                <div className="space-y-4">
                  {updateError && (
                    <div className="p-3 text-xs bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 font-medium">
                      {updateError}
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">
                      Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      disabled={isUpdating}
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="Enter deliverable name"
                      className="w-full bg-slate-50 dark:bg-background border border-slate-200 dark:border-zinc-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white transition outline-none font-medium"
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">
                      Description
                    </label>
                    <textarea
                      disabled={isUpdating}
                      value={editDesc}
                      onChange={(e) => setEditDesc(e.target.value)}
                      placeholder="Describe the deliverable goal, scope or requirements..."
                      rows={4}
                      className="w-full bg-slate-50 dark:bg-background border border-slate-200 dark:border-zinc-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white transition outline-none font-medium resize-none leading-relaxed"
                    />
                  </div>
                </div>

                {/* Footer Action buttons */}
                <div className="flex items-center justify-end space-x-2 pt-2 border-t border-border">
                  <button
                    type="button"
                    disabled={isUpdating}
                    onClick={() => setIsEditModalOpen(false)}
                    className="px-4 py-2 rounded-xl border border-slate-200 dark:border-zinc-800 text-xs font-bold text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-white/5 transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isUpdating}
                    className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-black uppercase tracking-wider shadow-lg shadow-blue-500/10 hover:shadow-blue-500/20 transition active:scale-95 flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {isUpdating ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Saving...</span>
                      </>
                    ) : (
                      <span>Save Changes</span>
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  );
};
export default ProjectDetail;
