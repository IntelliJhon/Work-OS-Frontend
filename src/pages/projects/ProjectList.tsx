import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { projectsApi } from '../../services/api/projects';
import {
  FolderKanban,
  Search,
  Plus,
  ArrowRight,
  Calendar,
  Sparkles,
  Trash2
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const createProjectSchema = z.object({
  name: z.string().min(3, 'Project name must be at least 3 characters'),
  description: z.string().optional(),
});

type CreateProjectFormValues = z.infer<typeof createProjectSchema>;

export const ProjectList: React.FC = () => {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'completed' | 'blocked'>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: projectsApi.list,
  });

  const createProjectMutation = useMutation({
    mutationFn: projectsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setShowCreateModal(false);
      reset();
    },
  });

  const deleteProjectMutation = useMutation({
    mutationFn: projectsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateProjectFormValues>({
    resolver: zodResolver(createProjectSchema),
  });

  const onSubmit = (values: CreateProjectFormValues) => {
    createProjectMutation.mutate(values);
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    if (confirm('Are you absolutely sure you want to terminate this project deliverable and all associated phases?')) {
      deleteProjectMutation.mutate(id);
    }
  };

  const filteredProjects = projects.filter((project) => {
    const matchesSearch = project.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      (project.description && project.description.toLowerCase().includes(searchTerm.toLowerCase()));
    
    // Derive effective status from phases so 'completed' filter works
    const phasesList = (project as any).phases ?? [];
    const total = phasesList.length;
    const completedCount = phasesList.filter((ph: any) => ph.status === 'completed').length;
    const isFullyComplete = total > 0 && completedCount === total;
    const effectiveStatus = isFullyComplete ? 'completed' : project.status;

    const matchesFilter = statusFilter === 'all' || effectiveStatus === statusFilter;
    
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="space-y-6 text-foreground animate-fade-in">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center space-y-4 sm:space-y-0 pb-4 border-b border-border">
        <div>
          <h1 className="text-2xl font-extrabold text-zinc-900 dark:text-slate-900 dark:text-white flex items-center space-x-2">
            <FolderKanban className="w-7 h-7 text-blue-500" />
            <span>Workspace Deliverables</span>
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Enforce lifecycle checkpoints, governance rules, and sprint restrictions across teams.
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-lg transition-all glow-primary"
        >
          <Plus className="w-4 h-4" />
          <span>Provision Project</span>
        </button>
      </div>

      {/* Filter and Search Panel */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-slate-100/60 dark:bg-white/5 border border-border p-4 rounded-xl">
        <div className="relative w-full md:max-w-xs">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500 dark:text-zinc-500" />
          <input
            type="text"
            placeholder="Search deliverables..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg bg-background border border-border text-xs text-zinc-900 dark:text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="flex space-x-2 w-full md:w-auto overflow-x-auto">
          {(['all', 'active', 'completed', 'blocked'] as const).map((filter) => (
            <button
              key={filter}
              onClick={() => setStatusFilter(filter)}
              className={`px-4 py-2 rounded-lg text-xs font-semibold capitalize whitespace-nowrap transition-all border ${
                statusFilter === filter
                  ? filter === 'completed'
                    ? 'bg-teal-600 border-teal-500 text-white'
                    : 'bg-blue-600 border-blue-500 text-white'
                  : 'bg-background border-border text-muted-foreground hover:text-zinc-900 dark:hover:text-white'
              }`}
            >
              {filter} Deliverables
            </button>
          ))}
        </div>
      </div>

      {/* Projects Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-44 rounded-2xl bg-slate-100/60 dark:bg-white/5 animate-pulse border border-border/20" />
          ))}
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="glass-panel rounded-2xl p-16 text-center border border-border flex flex-col items-center justify-center space-y-4">
          <FolderKanban className="w-16 h-16 text-slate-500 dark:text-zinc-500" />
          <div>
            <h3 className="text-base font-bold text-zinc-900 dark:text-slate-900 dark:text-white">No deliverables found</h3>
            <p className="text-xs text-muted-foreground max-w-sm mt-1 mx-auto font-light">
              Clear your filters or provision a new project workspace to setup state timeline charts.
            </p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-semibold"
          >
            Provision Project
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {filteredProjects.map((project) => (
            <div
              key={project.id}
              className="glass-panel-heavy rounded-2xl p-6 border border-border hover:border-slate-200/60 dark:border-white/10 transition-all duration-300 flex flex-col justify-between relative group"
            >
              {/* Delete button */}
              <button
                onClick={(e) => handleDelete(project.id, e)}
                className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-red-500/10 text-slate-500 dark:text-zinc-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all duration-200"
              >
                <Trash2 className="w-4 h-4" />
              </button>

              <div className="space-y-3">
                <div className="flex justify-between items-start pr-8">
                  <h3 className="font-extrabold text-zinc-900 dark:text-slate-900 dark:text-white text-lg">
                    {project.name}
                  </h3>
                  {/* Derive badge status: 100% phases = completed, regardless of DB field */}
                  {(() => {
                    const phasesList = (project as any).phases ?? [];
                    const total = phasesList.length;
                    const completedCount = phasesList.filter((ph: any) => ph.status === 'completed').length;
                    const isFullyComplete = total > 0 && completedCount === total;
                    const displayStatus = isFullyComplete ? 'completed' : project.status;
                    return (
                      <span
                        className={`text-[9px] uppercase font-extrabold tracking-widest px-2.5 py-0.5 rounded-full border ${
                          displayStatus === 'completed'
                            ? 'bg-teal-500/10 border-teal-500/25 text-teal-400'
                            : displayStatus === 'active'
                            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                            : displayStatus === 'archived'
                            ? 'bg-zinc-500/10 border-zinc-500/20 text-slate-600 dark:text-zinc-400'
                            : 'bg-red-500/10 border-red-500/20 text-red-400'
                        }`}
                      >
                        {displayStatus}
                      </span>
                    );
                  })()}
                </div>

                <p className="text-xs font-light text-muted-foreground line-clamp-2 leading-relaxed">
                  {project.description || 'No deliverable description configured.'}
                </p>

                {/* Real timeline completion computed from phases */}
                {(() => {
                  const phasesList = project.phases ?? [];
                  const total = phasesList.length;
                  const completed = phasesList.filter((ph: any) => ph.status === 'completed').length;
                  const pct = total === 0 ? 0 : Math.round((completed / total) * 100);
                  const barColor = pct === 100
                    ? 'from-emerald-500 to-teal-500'
                    : pct >= 50
                    ? 'from-blue-500 to-indigo-600'
                    : 'from-blue-600 to-purple-600';
                  const textColor = pct === 100 ? 'text-emerald-400' : 'text-blue-400';
                  return (
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] font-bold text-slate-500 dark:text-zinc-500">
                        <span>TIMELINE COMPLETION</span>
                        <span className={textColor}>{pct}%</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden border border-border/20">
                        <div
                          className={`bg-gradient-to-r ${barColor} h-full rounded-full transition-all duration-700`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      {total > 0 && (
                        <p className="text-[9px] text-zinc-600">{completed}/{total} phases complete</p>
                      )}
                    </div>
                  );
                })()}
              </div>

              <div className="flex items-center justify-between border-t border-slate-100 dark:border-white/5 pt-4 mt-5 text-xs">
                <span className="text-slate-500 dark:text-zinc-500 flex items-center space-x-1.5">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>{new Date(project.createdAt).toLocaleDateString()}</span>
                </span>

                <Link
                  to={`/projects/${project.id}/workflow`}
                  className="px-4 py-2.5 rounded-xl bg-blue-600/10 border border-blue-500/20 text-blue-400 hover:bg-blue-600 hover:text-white transition-all font-semibold flex items-center space-x-1"
                >
                  <span>Governance Suite</span>
                  <ArrowRight className="w-3.5 h-3.5 animate-pulse" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Provision Project Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md">
          <div className="w-full max-w-md glass-panel-heavy rounded-2xl p-6 border border-border shadow-2xl animate-scale-in">
            <div className="flex items-center justify-between border-b border-border pb-3 mb-5">
              <div className="flex items-center space-x-2 text-zinc-900 dark:text-slate-900 dark:text-white">
                <Sparkles className="w-5 h-5 text-blue-500" />
                <h4 className="font-bold text-base">Provision New Project</h4>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-slate-100/60 dark:bg-white/5 text-muted-foreground hover:text-zinc-900 dark:hover:text-white transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                  Project Title
                </label>
                <input
                  type="text"
                  placeholder="e.g. Apollo Go-Live Suite"
                  {...register('name')}
                  className="w-full px-4 py-3 rounded-xl glass-input text-zinc-900 dark:text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all font-light"
                />
                {errors.name && (
                  <p className="text-[10px] font-bold text-red-400 tracking-wider">
                    {errors.name.message}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                  Scope Description
                </label>
                <textarea
                  rows={3}
                  placeholder="Deliverable details, milestones, sprint intervals..."
                  {...register('description')}
                  className="w-full px-4 py-3 rounded-xl glass-input text-zinc-900 dark:text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all font-light"
                />
              </div>

              <div className="pt-2 flex space-x-3 justify-end text-xs">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-slate-100/60 dark:bg-white/5 font-semibold text-muted-foreground hover:text-zinc-900 dark:hover:text-white transition-all border border-transparent"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createProjectMutation.isPending}
                  className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold tracking-wide transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg glow-primary flex items-center space-x-1.5"
                >
                  {createProjectMutation.isPending ? (
                    <>
                      <div className="w-3.5 h-3.5 rounded-full border-2 border-white/20 border-t-white animate-spin" />
                      <span>Provisioning...</span>
                    </>
                  ) : (
                    <span>Provision Deliverable</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
const X = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);
export default ProjectList;
