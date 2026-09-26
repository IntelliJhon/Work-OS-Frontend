import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Bot, Copy, Loader2, Pencil, Search, ShieldCheck } from 'lucide-react';
import { platformApi } from '../../services/api/platform';
import type { PlatformWorkspace, SaveBotPayload } from '../../services/api/platform';
import { useToast } from '../../components/ui/Toast';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { BotForm } from './BotForm';

const QUERY_KEY = ['platform', 'whatsapp-bots'];
// Base of the n8n "WAAU Webhook (Workspace Bot)" URL; each workspace bot calls <base>/<phone number id>
const WEBHOOK_URL = String(import.meta.env.VITE_WHATSAPP_WEBHOOK_URL || '').replace(/\/+$/, '');

const apiError = (err: any, fallback: string) =>
  err?.response?.data?.details?.[0]?.message || err?.response?.data?.error || fallback;

/** Platform admins only: which WhatsApp bot each workspace uses for Work OS voice/typed work. */
export const WhatsAppBotsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const { data: me, isLoading: meLoading } = useQuery({ queryKey: ['platform', 'me'], queryFn: platformApi.me });
  const { data, isLoading, isError, error } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: platformApi.listWhatsAppBots,
    enabled: !!me?.isPlatformAdmin,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: QUERY_KEY });

  const save = useMutation({
    mutationFn: ({ tenantId, payload }: { tenantId: string; payload: SaveBotPayload }) => platformApi.saveWhatsAppBot(tenantId, payload),
    onSuccess: () => {
      toast.success('WhatsApp bot saved.');
      setEditing(null);
      refresh();
    },
    onError: (err) => toast.error(apiError(err, 'Could not save the bot.')),
  });

  const remove = useMutation({
    mutationFn: (tenantId: string) => platformApi.removeWhatsAppBot(tenantId),
    onSuccess: () => {
      toast.success('The workspace now uses the default bot.');
      setEditing(null);
      refresh();
    },
    onError: (err) => toast.error(apiError(err, 'Could not remove the bot.')),
  });

  const handleRemove = async (ws: PlatformWorkspace) => {
    const ok = await confirm({
      title: `Use the default bot for ${ws.name}?`,
      message: 'Their own bot settings (including the access token) will be deleted. Voice notes must then be sent to the default bot.',
      confirmLabel: 'Use default bot',
      variant: 'danger',
    });
    if (ok) remove.mutate(ws.tenantId);
  };

  const workspaces = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = data?.workspaces ?? [];
    return q ? list.filter((w) => w.name.toLowerCase().includes(q) || w.slug.toLowerCase().includes(q)) : list;
  }, [data, search]);

  const copyWebhook = async (botId: string) => {
    const url = `${WEBHOOK_URL}/${botId}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Webhook URL copied.');
    } catch {
      toast.info(url, 'Webhook URL');
    }
  };

  if (meLoading) {
    return <div className="flex justify-center p-10"><Loader2 className="w-5 h-5 animate-spin text-blue-400" /></div>;
  }
  if (!me?.isPlatformAdmin) {
    return (
      <div className="glass-panel rounded-2xl p-6 border border-border bg-card/40 text-sm text-muted-foreground">
        This page is only available to platform admins.
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-start gap-3">
        <span className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
          <Bot className="w-5 h-5" />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">WhatsApp Bots</h1>
          <p className="text-xs text-muted-foreground mt-1 font-light max-w-2xl">
            Platform admin. Choose which WAAU channel each workspace uses for Work OS: verification codes, confirmations,
            replies and work templates are sent from that channel. Workspaces without their own bot use the default bot.
          </p>
        </div>
      </div>

      {data && !data.encryptionConfigured && (
        <div className="glass-panel rounded-2xl p-4 border border-amber-500/30 bg-amber-500/5 flex items-center gap-3 text-xs text-amber-500 dark:text-amber-400">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>SECRETS_ENCRYPTION_KEY is not set on the server, so bots cannot be saved yet.</span>
        </div>
      )}

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <input className="w-full pl-9 pr-3 py-2 glass-input rounded-xl text-xs text-foreground placeholder-muted-foreground focus:outline-none"
          placeholder="Search workspaces" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {isLoading ? (
        <div className="flex justify-center p-10"><Loader2 className="w-5 h-5 animate-spin text-blue-400" /></div>
      ) : isError ? (
        <div className="text-xs text-rose-400">{apiError(error, 'Failed to load workspaces.')}</div>
      ) : (
        <div className="space-y-3">
          {workspaces.map((ws) => (
            <div key={ws.tenantId} className="glass-panel rounded-2xl p-4 border border-border bg-card/40">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-foreground truncate">
                    {ws.name}
                    {!ws.isActive && <span className="ml-2 text-[10px] font-normal text-muted-foreground">(inactive)</span>}
                  </p>
                  {ws.bot ? (
                    <p className="text-[11px] text-emerald-500 flex items-center gap-1 mt-0.5">
                      <ShieldCheck className="w-3 h-3" />
                      Own bot {ws.bot.businessPhone ?? ''} · ID {ws.bot.phoneNumberId} · token {ws.bot.accessTokenMasked}
                    </p>
                  ) : (
                    <p className="text-[11px] text-muted-foreground mt-0.5">Default bot</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {ws.bot && WEBHOOK_URL && (
                    <button type="button" onClick={() => copyWebhook(ws.bot!.phoneNumberId)} title="Copy the webhook URL for this bot's WAAU flow"
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-muted hover:bg-accent text-muted-foreground text-xs font-bold cursor-pointer">
                      <Copy className="w-3.5 h-3.5" />
                      <span>Webhook URL</span>
                    </button>
                  )}
                  {editing !== ws.tenantId && (
                    <button type="button" onClick={() => setEditing(ws.tenantId)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-muted hover:bg-accent text-foreground text-xs font-bold cursor-pointer">
                      <Pencil className="w-3.5 h-3.5" />
                      <span>{ws.bot ? 'Edit' : 'Set own bot'}</span>
                    </button>
                  )}
                </div>
              </div>
              {editing === ws.tenantId && (
                <BotForm
                  key={ws.tenantId + (ws.bot?.updatedAt ?? '')}
                  workspace={ws}
                  isSaving={save.isPending}
                  isRemoving={remove.isPending}
                  onSave={(payload) => save.mutate({ tenantId: ws.tenantId, payload })}
                  onRemove={() => handleRemove(ws)}
                  onCancel={() => setEditing(null)}
                />
              )}
            </div>
          ))}
          {workspaces.length === 0 && <p className="text-xs text-muted-foreground">No workspaces match.</p>}
        </div>
      )}
    </div>
  );
};

export default WhatsAppBotsPage;
