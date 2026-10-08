import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ListChecks, Loader2, Pin, PinOff, RefreshCw, Search, Sparkles, X } from 'lucide-react';
import { useToast } from '../../components/ui/Toast';
import { fileLabel, groupsApi, type ChatMessage, type GroupChatSummary, type GroupDetail } from '../../services/api/groups';

// Group chat tools: AI summary, task from a message, search and pinned messages.

const TIME_ZONE = 'Asia/Kolkata';
const apiError = (err: any, fallback: string) => err?.response?.data?.error || fallback;
const dayKey = (offset = 0) => new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(new Date(Date.now() + offset * 86_400_000));
const inputClass = 'w-full px-3 py-2 rounded-xl border border-border bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50';
const primaryButton = 'flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold disabled:opacity-50 cursor-pointer';
const secondaryButton = 'flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-border text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-50 cursor-pointer';
const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

export const ToolModal: React.FC<{ title: string; icon?: React.ReactNode; onClose: () => void; children: React.ReactNode; wide?: boolean }> = ({ title, icon, onClose, children, wide }) => (
  <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 bg-background/70 backdrop-blur-sm overflow-y-auto" role="dialog" aria-modal="true" aria-label={title}>
    <div className={`w-full ${wide ? 'max-w-2xl' : 'max-w-md'} rounded-2xl border border-border bg-card shadow-2xl my-8`}>
      <div className="flex items-center justify-between gap-3 p-5 border-b border-border">
        <h2 className="text-base font-bold text-foreground truncate flex items-center gap-2">{icon}{title}</h2>
        <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted cursor-pointer"><X className="w-4 h-4" /></button>
      </div>
      <div className="p-5">{children}</div>
    </div>
  </div>
);

// ─── Task from a message or an action item ───────────────────────────────────────

export const CreateTaskModal: React.FC<{
  group: GroupDetail;
  initialName: string;
  initialAssigneeId?: string | null;
  messageId?: string | null;
  note?: string | null;
  onClose: () => void;
  onCreated?: (workId: string | null) => void;
}> = ({ group, initialName, initialAssigneeId, messageId, note, onClose, onCreated }) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState(initialName.slice(0, 255));
  const [assigneeId, setAssigneeId] = useState(initialAssigneeId ?? '');
  const [dueDate, setDueDate] = useState('');
  const create = useMutation({
    mutationFn: () => groupsApi.createTask(group.id, { messageId: messageId ?? null, name: name.trim(), assigneeId, dueDate: dueDate || null }),
    onSuccess: (t) => {
      toast.success(`${t.workId ?? 'Task'} created for ${t.assigneeName}.`, 'Groups');
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      onCreated?.(t.workId);
      onClose();
    },
    onError: (err) => toast.error(apiError(err, 'Could not create the task.'), 'Groups'),
  });
  return (
    <ToolModal title="Create task" icon={<ListChecks className="w-4 h-4 text-blue-500" />} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); if (name.trim().length >= 2 && assigneeId) create.mutate(); }} className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="gt-name" className="text-xs font-semibold text-foreground">Task</label>
          <textarea id="gt-name" rows={2} maxLength={255} value={name} onChange={(e) => setName(e.target.value)} className={`${inputClass} resize-none`} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label htmlFor="gt-who" className="text-xs font-semibold text-foreground">Assign to</label>
            <select id="gt-who" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} className={`${inputClass} [&>option]:bg-background`}>
              <option value="">Choose…</option>
              {group.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="gt-due" className="text-xs font-semibold text-foreground">Due date (optional)</label>
            <input id="gt-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputClass} />
          </div>
        </div>
        {note && <p className="text-[11px] text-muted-foreground">Mentioned in the chat: {note}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={secondaryButton}>Cancel</button>
          <button type="submit" disabled={name.trim().length < 2 || !assigneeId || create.isPending} className={primaryButton}>
            {create.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Create task
          </button>
        </div>
      </form>
    </ToolModal>
  );
};

// ─── AI summary ──────────────────────────────────────────────────────────────────

type Range = 'today' | 'yesterday' | 'week' | 'custom';

export const SummaryModal: React.FC<{ group: GroupDetail; onClose: () => void }> = ({ group, onClose }) => {
  const [range, setRange] = useState<Range>('today');
  const [from, setFrom] = useState(dayKey());
  const [to, setTo] = useState(dayKey());
  const [result, setResult] = useState<GroupChatSummary | null>(null);
  const [error, setError] = useState('');
  const [taskFor, setTaskFor] = useState<{ text: string; personId: string | null; due: string | null } | null>(null);
  const [made, setMade] = useState<Record<number, string>>({});

  const dates = (): [string, string] => range === 'today' ? [dayKey(), dayKey()] : range === 'yesterday' ? [dayKey(-1), dayKey(-1)] : range === 'week' ? [dayKey(-6), dayKey()] : [from, to];
  const run = useMutation({
    mutationFn: (refresh: boolean) => { const [f, t] = dates(); return groupsApi.summary(group.id, f, t, refresh); },
    onMutate: () => { setError(''); },
    onSuccess: (r) => { setResult(r); setMade({}); },
    onError: (err) => { setResult(null); setError(apiError(err, 'Could not write the summary.')); },
  });
  // Today's summary right away
  useEffect(() => { run.mutate(false); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const c = result?.content;
  const section = (title: string, items: string[]) => items.length > 0 && (
    <section>
      <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">{title}</h3>
      <ul className="space-y-1 list-disc pl-5 text-sm text-foreground">{items.map((x, i) => <li key={i}>{x}</li>)}</ul>
    </section>
  );

  return (
    <ToolModal title={`Summary · ${group.name}`} icon={<Sparkles className="w-4 h-4 text-violet-500" />} onClose={onClose} wide>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {([['today', 'Today'], ['yesterday', 'Yesterday'], ['week', 'Last 7 days'], ['custom', 'Dates…']] as [Range, string][]).map(([k, label]) => (
            <button key={k} type="button" onClick={() => setRange(k)} aria-pressed={range === k}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border cursor-pointer ${range === k ? 'bg-violet-600 border-violet-600 text-white' : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted'}`}>
              {label}
            </button>
          ))}
          {range === 'custom' && (
            <span className="flex items-center gap-2">
              <input type="date" aria-label="From" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className={`${inputClass} !w-auto py-1`} />
              <span className="text-xs text-muted-foreground">to</span>
              <input type="date" aria-label="To" value={to} min={from} onChange={(e) => setTo(e.target.value)} className={`${inputClass} !w-auto py-1`} />
            </span>
          )}
          <button type="button" onClick={() => run.mutate(false)} disabled={run.isPending} className={`${primaryButton} !bg-violet-600 hover:!bg-violet-500 ml-auto`}>
            {run.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Summarise
          </button>
        </div>

        {run.isPending ? (
          <div className="flex flex-col items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="w-6 h-6 animate-spin text-violet-500" /> Reading the messages…</div>
        ) : error ? (
          <p className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-600 dark:text-red-400">{error}</p>
        ) : result?.empty ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No messages in those days.</p>
        ) : c ? (
          <div className="space-y-4">
            <p className="text-[11px] text-muted-foreground">
              From {result!.messageCount} message{result!.messageCount === 1 ? '' : 's'}{result!.truncated ? ' (only the first 1,500 were read)' : ''} · written {result!.createdAt ? when(result!.createdAt) : ''}
              {result!.cached && ' · saved earlier, no new messages since'}
            </p>
            {section('Key points', c.keyPoints)}
            {section('Decisions', c.decisions)}
            {c.actionItems.length > 0 && (
              <section>
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Action items</h3>
                <ul className="rounded-xl border border-border divide-y divide-border">
                  {c.actionItems.map((a, i) => (
                    <li key={i} className="flex flex-wrap items-start justify-between gap-2 p-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-foreground">{a.text}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{[a.person ?? 'Nobody named', a.due ? `due ${a.due}` : null].filter(Boolean).join(' · ')}</p>
                      </div>
                      {made[i] ? (
                        <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="w-3.5 h-3.5" /> {made[i]}</span>
                      ) : (
                        <button type="button" onClick={() => setTaskFor({ ...a, text: a.text })} className="px-2.5 py-1 rounded-lg border border-border text-xs font-semibold text-foreground hover:bg-muted cursor-pointer">Create task</button>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {section('Open questions', c.openQuestions)}
            {!c.keyPoints.length && !c.decisions.length && !c.actionItems.length && !c.openQuestions.length && (
              <p className="text-sm text-muted-foreground">Nothing worth summarising in those messages.</p>
            )}
            <div className="flex justify-end">
              <button type="button" onClick={() => run.mutate(true)} className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground cursor-pointer"><RefreshCw className="w-3.5 h-3.5" /> Write it again</button>
            </div>
          </div>
        ) : null}
      </div>
      {taskFor && (
        <CreateTaskModal
          group={group}
          initialName={taskFor.text}
          initialAssigneeId={taskFor.personId}
          note={taskFor.due ? `due ${taskFor.due}` : null}
          onClose={() => setTaskFor(null)}
          onCreated={(workId) => { const i = c!.actionItems.findIndex((a) => a.text === taskFor.text); if (i >= 0) setMade((m) => ({ ...m, [i]: workId ?? 'Created' })); }}
        />
      )}
    </ToolModal>
  );
};

// ─── Search and pinned ───────────────────────────────────────────────────────────

const ResultRow: React.FC<{ m: ChatMessage; action?: React.ReactNode }> = ({ m, action }) => (
  <li className="flex items-start gap-3 p-3">
    <div className="min-w-0 flex-1">
      <p className="text-xs text-muted-foreground"><span className="font-semibold text-foreground">{m.senderName}</span> · {when(m.createdAt)}</p>
      <p className="text-sm text-foreground whitespace-pre-wrap break-words mt-0.5">{m.body || (m.attachments[0] ? m.attachments.map((a) => fileLabel(a.name, a.voice)).join(', ') : '')}</p>
    </div>
    {action}
  </li>
);

export const SearchModal: React.FC<{ group: GroupDetail; onClose: () => void }> = ({ group, onClose }) => {
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  useEffect(() => { const t = setTimeout(() => setTerm(q.trim()), 300); return () => clearTimeout(t); }, [q]);
  const { data = [], isFetching } = useQuery({ queryKey: ['groups', 'search', group.id, term], queryFn: () => groupsApi.search(group.id, term), enabled: term.length >= 2 });
  return (
    <ToolModal title={`Search · ${group.name}`} icon={<Search className="w-4 h-4 text-blue-500" />} onClose={onClose} wide>
      <div className="space-y-3">
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Words in messages or file names" aria-label="Search messages" className={inputClass} />
        {term.length < 2 ? <p className="text-xs text-muted-foreground">Type at least 2 letters.</p>
          : isFetching ? <div className="flex justify-center p-4"><Loader2 className="w-4 h-4 animate-spin text-blue-500" /></div>
            : data.length === 0 ? <p className="text-xs text-muted-foreground">Nothing found.</p>
              : <ul className="rounded-xl border border-border divide-y divide-border max-h-[60vh] overflow-y-auto">{data.map((m) => <ResultRow key={m.id} m={m} />)}</ul>}
      </div>
    </ToolModal>
  );
};

export const PinnedModal: React.FC<{ group: GroupDetail; onClose: () => void }> = ({ group, onClose }) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data = [], isLoading } = useQuery({ queryKey: ['groups', 'pinned', group.id], queryFn: () => groupsApi.pinned(group.id) });
  const unpin = async (m: ChatMessage) => {
    try {
      await groupsApi.unpin(group.id, m.id);
      queryClient.invalidateQueries({ queryKey: ['groups', 'pinned', group.id] });
    } catch (err) {
      toast.error(apiError(err, 'Could not unpin it.'), 'Groups');
    }
  };
  return (
    <ToolModal title="Pinned messages" icon={<Pin className="w-4 h-4 text-amber-500" />} onClose={onClose} wide>
      {isLoading ? <div className="flex justify-center p-4"><Loader2 className="w-4 h-4 animate-spin text-blue-500" /></div>
        : data.length === 0 ? <p className="text-sm text-muted-foreground">Nothing is pinned.{group.canManage ? ' Group admins can pin a message from its menu.' : ''}</p>
          : (
            <ul className="rounded-xl border border-border divide-y divide-border max-h-[60vh] overflow-y-auto">
              {data.map((m) => (
                <ResultRow key={m.id} m={m} action={group.canManage ? (
                  <button type="button" onClick={() => unpin(m)} aria-label="Unpin" title="Unpin" className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted cursor-pointer"><PinOff className="w-4 h-4" /></button>
                ) : undefined} />
              ))}
            </ul>
          )}
    </ToolModal>
  );
};
