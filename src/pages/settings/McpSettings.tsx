import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Bot, Check, Copy, KeyRound, Loader2, Plus, Trash2, X } from 'lucide-react';
import { apiClient } from '../../services/api/client';
import { useToast } from '../../components/ui/Toast';
import { useConfirm } from '../../components/ui/ConfirmDialog';

// Settings → AI & MCP: access keys that let AI tools (n8n, Claude, ChatGPT) read this workspace through the
// Work OS MCP server. Read-only; each key reads only the sections it was given; Admins only.

interface McpKey {
  id: string;
  name: string;
  prefix: string;
  sections: string[];
  createdBy: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  useCount: number;
  revokedAt: string | null;
}
interface KeysResponse { data: McpKey[]; sections: Record<string, string>; tools: { name: string; section: string | null; title: string }[] }

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const MCP_URL = `${API_URL.replace(/\/api\/?$/, '')}/mcp`;
const apiError = (err: unknown, fallback: string) => (err as { response?: { data?: { error?: string } } })?.response?.data?.error || fallback;
const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : 'Never';

const inputClass = 'w-full px-3 py-2 rounded-xl border border-border bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/30';
const primaryButton = 'flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold disabled:opacity-50 cursor-pointer';
const secondaryButton = 'flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-border text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-50 cursor-pointer';

const CopyField: React.FC<{ label: string; value: string; secret?: boolean }> = ({ label, value, secret }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked: the text can still be selected by hand
    }
  };
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold text-foreground">{label}</p>
      <div className="flex items-center gap-2">
        <code className={`flex-1 min-w-0 px-3 py-2 rounded-xl border text-xs break-all select-all ${secret ? 'border-amber-500/40 bg-amber-500/5' : 'border-border bg-muted/40'}`}>{value}</code>
        <button type="button" onClick={copy} aria-label={`Copy ${label}`} className={secondaryButton}>
          {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
};

const NewKeyModal: React.FC<{ sections: Record<string, string>; onClose: () => void }> = ({ sections, onClose }) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [picked, setPicked] = useState<string[]>(Object.keys(sections));
  const [created, setCreated] = useState<{ key: string; name: string } | null>(null);
  const create = useMutation({
    mutationFn: async () => (await apiClient.post<{ data: { key: string; name: string } }>('/mcp-keys', { name: name.trim(), sections: picked })).data.data,
    onSuccess: (d) => { setCreated(d); queryClient.invalidateQueries({ queryKey: ['mcp-keys'] }); },
    onError: (err) => toast.error(apiError(err, 'Could not create the key.'), 'AI & MCP'),
  });
  const toggle = (s: string) => setPicked((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s]));

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 bg-background/70 backdrop-blur-sm overflow-y-auto" role="dialog" aria-modal="true" aria-label="New MCP access key">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card shadow-2xl my-8">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="text-base font-bold text-foreground">{created ? 'Your new key' : 'New access key'}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted cursor-pointer"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          {created ? (
            <>
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-800 dark:text-amber-300 flex gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" /> Copy the key now. It is shown only once; if it is lost, revoke it and make a new one.
              </div>
              <CopyField label="Server URL" value={MCP_URL} />
              <CopyField label={`Key: ${created.name}`} value={created.key} secret />
              <CopyField label="Header to send with it" value={`Authorization: Bearer ${created.key}`} secret />
              <div className="flex justify-end"><button type="button" onClick={onClose} className={primaryButton}>Done</button></div>
            </>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); if (name.trim().length >= 2 && picked.length) create.mutate(); }} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="mcp-name" className="text-xs font-semibold text-foreground">Name</label>
                <input id="mcp-name" autoFocus value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder='e.g. "n8n daily report"' className={inputClass} />
              </div>
              <fieldset className="space-y-2">
                <legend className="text-xs font-semibold text-foreground">What it may read</legend>
                <p className="text-[11px] text-muted-foreground">Names and roles of people are always included. Everything is read-only.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {Object.entries(sections).map(([key, label]) => (
                    <label key={key} className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border text-sm text-foreground cursor-pointer hover:bg-muted/50">
                      <input type="checkbox" checked={picked.includes(key)} onChange={() => toggle(key)} className="accent-blue-600" /> {label}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={onClose} className={secondaryButton}>Cancel</button>
                <button type="submit" disabled={create.isPending || name.trim().length < 2 || !picked.length} className={primaryButton}>
                  {create.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />} Create key
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export const McpSettings: React.FC = () => {
  const { toast } = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['mcp-keys'],
    queryFn: async () => (await apiClient.get<KeysResponse & { success: boolean }>('/mcp-keys')).data,
  });
  const revoke = useMutation({
    mutationFn: async (id: string) => apiClient.delete(`/mcp-keys/${id}`),
    onSuccess: () => { toast.success('Key revoked. Anything using it stops working now.', 'AI & MCP'); queryClient.invalidateQueries({ queryKey: ['mcp-keys'] }); },
    onError: (err) => toast.error(apiError(err, 'Could not revoke the key.'), 'AI & MCP'),
  });
  const keys = data?.data ?? [];
  const sections = data?.sections ?? {};

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="p-2 rounded-xl bg-blue-500/10 text-blue-500 border border-blue-500/20"><Bot className="w-5 h-5" /></span>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">AI & MCP</h1>
            <p className="text-xs text-muted-foreground mt-1 max-w-xl">
              Let AI tools such as n8n, Claude or ChatGPT read this workspace through the Work OS MCP server. Keys are read-only and see only the sections you choose.
            </p>
          </div>
        </div>
        <button type="button" onClick={() => setCreating(true)} disabled={!data} className={primaryButton}><Plus className="w-4 h-4" /> New key</button>
      </div>

      <section className="rounded-2xl border border-border bg-card p-5 space-y-3">
        <h2 className="text-sm font-bold text-foreground">Connect</h2>
        <CopyField label="Server URL (Streamable HTTP)" value={MCP_URL} />
        <ol className="list-decimal pl-5 text-xs text-muted-foreground space-y-1">
          <li><span className="font-semibold text-foreground">n8n:</span> add an AI Agent with an <span className="font-semibold">MCP Client Tool</span>. Endpoint = the URL above, transport HTTP Streamable, authentication Bearer = your key.</li>
          <li><span className="font-semibold text-foreground">Claude or ChatGPT:</span> add a custom connector with the URL above and the header <code>Authorization: Bearer &lt;key&gt;</code>.</li>
          <li>Ask things like "What is overdue this week?" or "Who was late today?" The AI starts with the workspace overview.</li>
        </ol>
      </section>

      {isLoading ? (
        <div className="flex justify-center p-8"><Loader2 className="w-5 h-5 animate-spin text-blue-500" /></div>
      ) : isError ? (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-600 flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> {apiError(error, 'Could not load the keys.')}</div>
      ) : keys.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <KeyRound className="w-7 h-7 text-muted-foreground mx-auto" />
          <p className="text-sm font-semibold text-foreground mt-2">No keys yet</p>
          <p className="text-xs text-muted-foreground mt-1">Create a key for each tool that connects, so each can be revoked on its own.</p>
        </div>
      ) : (
        <ul className="rounded-2xl border border-border bg-card divide-y divide-border overflow-hidden">
          {keys.map((k) => (
            <li key={k.id} className={`flex flex-wrap items-start gap-3 px-4 py-3.5 ${k.revokedAt ? 'opacity-60' : ''}`}>
              <KeyRound className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">
                  {k.name} <code className="ml-1 text-[11px] font-normal text-muted-foreground">{k.prefix}…</code>
                  {k.revokedAt && <span className="ml-2 px-1.5 py-0.5 rounded-md bg-red-500/10 text-red-600 dark:text-red-400 text-[10px] font-bold">Revoked</span>}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Reads: people, {k.sections.map((s) => (sections[s] ?? s).toLowerCase()).join(', ')}</p>
                <p className="text-[11px] text-muted-foreground">
                  Created {when(k.createdAt)}{k.createdBy ? ` by ${k.createdBy}` : ''} · Last used {when(k.lastUsedAt)}{k.useCount ? ` · ${k.useCount} requests` : ''}
                </p>
              </div>
              {!k.revokedAt && (
                <button
                  type="button" disabled={revoke.isPending}
                  onClick={async () => { if (await confirm({ title: `Revoke "${k.name}"?`, message: 'Anything using this key stops working at once. This cannot be undone.', confirmLabel: 'Revoke', variant: 'danger' })) revoke.mutate(k.id); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-500/10 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Revoke
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {creating && data && <NewKeyModal sections={sections} onClose={() => setCreating(false)} />}
    </div>
  );
};

export default McpSettings;
