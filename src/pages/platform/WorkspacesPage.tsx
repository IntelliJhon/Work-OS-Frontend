import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Loader2, Search } from 'lucide-react';
import { platformApi } from '../../services/api/platform';
import { SECTION_LABELS, workspaceApi, type PlatformWorkspaceSections, type Section } from '../../services/api/workspace';
import { useToast } from '../../components/ui/Toast';

const QUERY_KEY = ['platform', 'workspaces'];
const ORDER: Section[] = ['tasks', 'projects', 'calendar', 'voice_notes', 'attendance', 'leave', 'reminders'];
// Built on work items: off whenever Tasks is off
const NEEDS_TASKS: Section[] = ['projects', 'calendar', 'voice_notes'];

const apiError = (err: any, fallback: string) =>
  err?.response?.data?.details?.[0]?.message || err?.response?.data?.error || fallback;

const Switch: React.FC<{ on: boolean; disabled?: boolean; label: string; onChange: (on: boolean) => void }> = ({ on, disabled, label, onChange }) => (
  <button
    type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}
    className={`relative w-9 h-5 rounded-full transition-colors shrink-0 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 ${on ? 'bg-emerald-500' : 'bg-muted border border-border'}`}
  >
    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
  </button>
);

const WorkspaceCard: React.FC<{ ws: PlatformWorkspaceSections }> = ({ ws }) => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const save = useMutation({
    mutationFn: (change: Partial<Record<Section, boolean>>) => workspaceApi.setSections(ws.id, change),
    onSuccess: (sections) => {
      queryClient.setQueryData<PlatformWorkspaceSections[]>(QUERY_KEY, (old) => old?.map((w) => (w.id === ws.id ? { ...w, sections } : w)));
      toast.success(`${ws.name} updated.`, 'Workspaces');
    },
    onError: (err) => toast.error(apiError(err, 'Could not save.'), 'Workspaces'),
  });

  return (
    <div className="glass-panel rounded-2xl p-4 border border-border bg-card/40 space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-bold text-foreground">{ws.name}</p>
        <p className="text-[11px] text-muted-foreground">{ws.members} member{ws.members === 1 ? '' : 's'} · {ws.slug}</p>
      </div>
      <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {ORDER.map((key) => {
          const blocked = NEEDS_TASKS.includes(key) && !ws.sections.tasks;
          return (
            <div key={key} className="flex items-center justify-between gap-3 rounded-xl border border-border/60 px-3 py-2">
              <div className="min-w-0">
                <p className="text-xs font-bold text-foreground">{SECTION_LABELS[key]}</p>
                {blocked && <p className="text-[10px] text-muted-foreground">Needs Tasks</p>}
              </div>
              <Switch
                on={ws.sections[key]} disabled={blocked || save.isPending} label={`${SECTION_LABELS[key]} for ${ws.name}`}
                onChange={(on) => save.mutate({ [key]: on })}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};

/** Platform admins only: which sections each workspace has. */
export const WorkspacesPage: React.FC = () => {
  const [search, setSearch] = useState('');
  const { data: me, isLoading: meLoading } = useQuery({ queryKey: ['platform', 'me'], queryFn: platformApi.me });
  const { data = [], isLoading, isError, error } = useQuery({ queryKey: QUERY_KEY, queryFn: workspaceApi.platformWorkspaces, enabled: !!me?.isPlatformAdmin });

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? data.filter((w) => w.name.toLowerCase().includes(q) || w.slug.toLowerCase().includes(q)) : data;
  }, [data, search]);

  if (meLoading) return <div className="flex justify-center p-10"><Loader2 className="w-5 h-5 animate-spin text-blue-400" /></div>;
  if (!me?.isPlatformAdmin) {
    return (
      <div className="glass-panel rounded-2xl p-6 border border-border bg-card/40 text-sm text-muted-foreground">
        This page is only available to platform admins.
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-start gap-3">
        <span className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
          <Building2 className="w-5 h-5" />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Workspaces</h1>
          <p className="text-xs text-muted-foreground mt-1 font-light max-w-2xl">
            Platform admin. Switch sections on or off for each workspace. A section that is off disappears from that workspace's
            menu and its data can't be opened. Inside a workspace, roles (Settings → Roles) still decide who sees each section.
          </p>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <input
          className="w-full pl-9 pr-3 py-2 glass-input rounded-xl text-xs text-foreground placeholder-muted-foreground focus:outline-none"
          placeholder="Search workspaces" aria-label="Search workspaces" value={search} onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center p-10"><Loader2 className="w-5 h-5 animate-spin text-blue-400" /></div>
      ) : isError ? (
        <div className="text-xs text-rose-400">{apiError(error, 'Failed to load workspaces.')}</div>
      ) : (
        <div className="space-y-3">{list.map((ws) => <WorkspaceCard key={ws.id} ws={ws} />)}</div>
      )}
    </div>
  );
};

export default WorkspacesPage;
