import React, { useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, BellRing, Check, CheckCircle2, FileText, Image as ImageIcon, Loader2, Paperclip, Pencil, Plus, Repeat, Upload, User, X,
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useToast } from '../../components/ui/Toast';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { usersApi } from '../../services/api/users';
import {
  CATEGORY_LABELS,
  dueText,
  formatAmount,
  formatDue,
  remindersApi,
  repeatText,
  type Reminder,
  type ReminderCategory,
  type ReminderDetail,
  type ReminderInput,
  type ReminderRepeat,
} from '../../services/api/reminders';

// ─── Reminders ──────────────────────────────────────────────────────────────────
// Bills, renewals, subscriptions, taxes. WhatsApp reminds the person responsible a day before the due date, then
// twice a day until it is marked done with a report and proof. Admins see everyone's; others their own.

const TIME_ZONE = 'Asia/Kolkata';
const todayKey = () => new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(new Date());
const apiError = (err: any, fallback: string) => err?.response?.data?.error || fallback;
const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: TIME_ZONE }) : '';

const inputClass =
  'w-full px-3 py-2 rounded-xl border border-border bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50 disabled:opacity-60';
const labelClass = 'text-xs font-semibold text-foreground';
const primaryButton = 'flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold disabled:opacity-50 cursor-pointer';
const secondaryButton = 'flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-border text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-50 cursor-pointer';
const MAX_FILES = 5;
const MAX_BYTES = 10 * 1024 * 1024;

const StatusBadge: React.FC<{ r: Reminder }> = ({ r }) => {
  const tone = r.status === 'done'
    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
    : r.overdue ? 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20'
      : r.dueInDays <= 1 ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20'
        : 'bg-muted text-muted-foreground border-border';
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-lg border text-[11px] font-semibold whitespace-nowrap ${tone}`}>{dueText(r)}</span>;
};

const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }> = ({ title, onClose, children, wide }) => (
  <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 bg-background/70 backdrop-blur-sm overflow-y-auto" role="dialog" aria-modal="true" aria-label={title}>
    <div className={`w-full ${wide ? 'max-w-2xl' : 'max-w-lg'} rounded-2xl border border-border bg-card shadow-2xl my-8`}>
      <div className="flex items-center justify-between gap-3 p-5 border-b border-border">
        <h2 className="text-base font-bold text-foreground truncate">{title}</h2>
        <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted cursor-pointer">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="p-5">{children}</div>
    </div>
  </div>
);

// ─── Create / edit ───────────────────────────────────────────────────────────────

const ReminderForm: React.FC<{ initial?: Reminder; onClose: () => void; onSaved: (r: Reminder) => void }> = ({ initial, onClose, onSaved }) => {
  const { toast } = useToast();
  const me = useAuthStore((s) => s.user);
  const [title, setTitle] = useState(initial?.title ?? '');
  const [category, setCategory] = useState<ReminderCategory>(initial?.category ?? 'bill');
  const [amount, setAmount] = useState(initial?.amount != null ? String(initial.amount) : '');
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? '');
  const [repeat, setRepeat] = useState<ReminderRepeat>(initial?.repeat ?? 'monthly');
  const [everyN, setEveryN] = useState(String(initial?.everyN ?? 3));
  const [everyUnit, setEveryUnit] = useState<'day' | 'week' | 'month'>(initial?.everyUnit ?? 'month');
  const [ownerId, setOwnerId] = useState(initial?.ownerId ?? me?.id ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [tried, setTried] = useState(false);
  const { data: people = [] } = useQuery({ queryKey: ['users', 'all-members'], queryFn: () => usersApi.list({ limit: 200 }), staleTime: 60_000 });

  const problems = {
    title: title.trim().length < 2 ? 'Give it a title, e.g. "Office internet bill"' : '',
    dueDate: !dueDate ? 'Choose the due date' : '',
    amount: amount && (!Number.isFinite(Number(amount)) || Number(amount) < 0) ? 'Enter the amount in rupees, e.g. 4500' : '',
    everyN: repeat === 'custom' && (!Number.isInteger(Number(everyN)) || Number(everyN) < 1 || Number(everyN) > 365) ? 'Enter a number from 1 to 365' : '',
  };
  const invalid = Object.values(problems).some(Boolean);

  const save = useMutation({
    mutationFn: () => {
      const input: ReminderInput = {
        title: title.trim(), category, amount: amount ? Number(amount) : null, dueDate, repeat,
        everyN: repeat === 'custom' ? Number(everyN) : null, everyUnit: repeat === 'custom' ? everyUnit : null,
        ownerId: ownerId || null, notes: notes.trim() || null,
      };
      return initial ? remindersApi.update(initial.id, input) : remindersApi.create(input);
    },
    onSuccess: (r) => { toast.success(initial ? 'Reminder updated.' : 'Reminder added.', 'Reminders'); onSaved(r); },
    onError: (err) => toast.error(apiError(err, 'Could not save the reminder.'), 'Reminders'),
  });
  const err = (key: keyof typeof problems) => tried && problems[key] ? <p className="mt-1 text-[11px] text-red-500">{problems[key]}</p> : null;

  return (
    <Modal title={initial ? 'Edit reminder' : 'New reminder'} onClose={onClose}>
      <form
        noValidate
        onSubmit={(e) => { e.preventDefault(); setTried(true); if (!invalid) save.mutate(); }}
        className="space-y-4"
      >
        <div className="space-y-1.5">
          <label htmlFor="rem-title" className={labelClass}>What is it?</label>
          <input id="rem-title" autoFocus value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Office internet bill" className={inputClass} />
          {err('title')}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label htmlFor="rem-category" className={labelClass}>Category</label>
            <select id="rem-category" value={category} onChange={(e) => setCategory(e.target.value as ReminderCategory)} className={`${inputClass} [&>option]:bg-background`}>
              {(Object.keys(CATEGORY_LABELS) as ReminderCategory[]).map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="rem-amount" className={labelClass}>Amount (₹, optional)</label>
            <input id="rem-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} placeholder="e.g. 4500" className={inputClass} />
            {err('amount')}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label htmlFor="rem-due" className={labelClass}>Due date</label>
            <input id="rem-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputClass} />
            {err('dueDate')}
          </div>
          <div className="space-y-1.5">
            <label htmlFor="rem-owner" className={labelClass}>Responsible</label>
            <select id="rem-owner" value={ownerId} onChange={(e) => setOwnerId(e.target.value)} className={`${inputClass} [&>option]:bg-background`}>
              {me && <option value={me.id}>Me</option>}
              {(people as any[]).filter((p) => p.id !== me?.id).map((p) => <option key={p.id} value={p.id}>{`${p.firstName} ${p.lastName}`.trim()}</option>)}
            </select>
          </div>
        </div>
        <div className="space-y-1.5">
          <span className={labelClass}>Repeat</span>
          <div role="radiogroup" aria-label="Repeat" className="flex flex-wrap gap-2">
            {(['once', 'monthly', 'yearly', 'custom'] as ReminderRepeat[]).map((v) => (
              <button
                key={v} type="button" role="radio" aria-checked={repeat === v} onClick={() => setRepeat(v)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border cursor-pointer ${repeat === v ? 'bg-blue-600 border-blue-600 text-white' : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted'}`}
              >
                {v === 'once' ? 'Once' : v === 'monthly' ? 'Every month' : v === 'yearly' ? 'Every year' : 'Custom'}
              </button>
            ))}
          </div>
          {repeat === 'custom' && (
            <div className="flex items-center gap-2 pt-1">
              <span className="text-sm text-foreground">Every</span>
              <input aria-label="Repeat every" inputMode="numeric" value={everyN} onChange={(e) => setEveryN(e.target.value.replace(/\D/g, ''))} className={`${inputClass} w-20`} />
              <select aria-label="Unit" value={everyUnit} onChange={(e) => setEveryUnit(e.target.value as 'day' | 'week' | 'month')} className={`${inputClass} w-32 [&>option]:bg-background`}>
                <option value="day">days</option>
                <option value="week">weeks</option>
                <option value="month">months</option>
              </select>
            </div>
          )}
          {err('everyN')}
        </div>
        <div className="space-y-1.5">
          <label htmlFor="rem-notes" className={labelClass}>Notes (optional)</label>
          <textarea id="rem-notes" rows={2} value={notes} maxLength={2000} onChange={(e) => setNotes(e.target.value)} placeholder="Account number, where to pay, contact…" className={`${inputClass} resize-none`} />
        </div>
        <p className="text-[11px] text-muted-foreground">
          WhatsApp reminds the responsible person a day before the due date, then twice a day (8 am and 8 pm) until it is marked done.
        </p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={secondaryButton}>Cancel</button>
          <button type="submit" disabled={save.isPending} className={primaryButton}>
            {save.isPending && <Loader2 className="w-4 h-4 animate-spin" />} {initial ? 'Save' : 'Add reminder'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

// ─── Detail + mark as done ───────────────────────────────────────────────────────

const ProofList: React.FC<{ reminderId: string; proofs: ReminderDetail['proofs'] }> = ({ reminderId, proofs }) => {
  const { toast } = useToast();
  const open = async (uploadId: string) => {
    // Open the tab first so the browser doesn't block it, then point it at the file
    const tab = window.open('', '_blank');
    try {
      const url = await remindersApi.proofUrl(reminderId, uploadId);
      if (tab) tab.location.href = url; else window.location.href = url;
    } catch (err) {
      tab?.close();
      toast.error(apiError(err, 'Could not open the file.'), 'Reminders');
    }
  };
  if (!proofs.length) return null;
  return (
    <ul className="flex flex-wrap gap-2">
      {proofs.map((p) => (
        <li key={p.id}>
          <button type="button" onClick={() => open(p.id)} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border text-xs text-foreground hover:bg-muted cursor-pointer max-w-[16rem]">
            {p.mimeType.startsWith('image/') ? <ImageIcon className="w-3.5 h-3.5 shrink-0 text-blue-500" /> : <FileText className="w-3.5 h-3.5 shrink-0 text-red-500" />}
            <span className="truncate">{p.name}</span>
          </button>
        </li>
      ))}
    </ul>
  );
};

const CompleteForm: React.FC<{ reminder: ReminderDetail; onDone: () => void }> = ({ reminder, onDone }) => {
  const { toast } = useToast();
  const [report, setReport] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [tried, setTried] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const picked = Array.from(list);
    const bad = picked.find((f) => !(f.type.startsWith('image/') || f.type === 'application/pdf'));
    if (bad) toast.error(`${bad.name}: only photos and PDFs can be attached.`, 'Reminders');
    const big = picked.find((f) => f.size > MAX_BYTES);
    if (big) toast.error(`${big.name} is larger than 10 MB.`, 'Reminders');
    const ok = picked.filter((f) => (f.type.startsWith('image/') || f.type === 'application/pdf') && f.size <= MAX_BYTES);
    setFiles((prev) => [...prev, ...ok].slice(0, MAX_FILES));
    if (input.current) input.current.value = '';
  };

  const complete = useMutation({
    mutationFn: () => remindersApi.complete(reminder.id, report.trim(), files),
    onSuccess: (res) => {
      toast.success(res.next ? `Marked as done. Next one is due ${formatDue(res.next.dueDate)}.` : 'Marked as done.', 'Reminders');
      onDone();
    },
    onError: (err) => toast.error(apiError(err, 'Could not mark it as done.'), 'Reminders'),
  });
  const reportProblem = report.trim().length < 2 ? 'Write what was done, e.g. "Paid ₹4,500 by UPI, ref 2210…"' : '';
  const filesProblem = files.length === 0 ? 'Attach at least one proof: a photo or PDF of the receipt' : '';

  return (
    <form
      noValidate
      onSubmit={(e) => { e.preventDefault(); setTried(true); if (!reportProblem && !filesProblem) complete.mutate(); }}
      className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] p-4 space-y-3"
    >
      <h3 className="text-sm font-bold text-foreground flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-600" /> Mark as done</h3>
      <div className="space-y-1.5">
        <label htmlFor="rem-report" className={labelClass}>Report</label>
        <textarea id="rem-report" rows={3} value={report} maxLength={2000} onChange={(e) => setReport(e.target.value)} placeholder="What was done? e.g. Paid ₹4,500 by UPI on 2 Oct, ref 221045…" className={`${inputClass} resize-none`} />
        {tried && reportProblem && <p className="text-[11px] text-red-500">{reportProblem}</p>}
      </div>
      <div className="space-y-1.5">
        <span className={labelClass}>Proof (photo or PDF, up to {MAX_FILES})</span>
        <input ref={input} type="file" accept="image/*,application/pdf" multiple onChange={(e) => addFiles(e.target.files)} className="hidden" id="rem-proof" />
        <label htmlFor="rem-proof" className={`${secondaryButton} w-full border-dashed`}>
          <Upload className="w-4 h-4" /> {files.length ? 'Add more' : 'Choose files or take a photo'}
        </label>
        {files.length > 0 && (
          <ul className="space-y-1">
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2 text-xs text-foreground">
                <span className="flex items-center gap-1.5 min-w-0"><Paperclip className="w-3.5 h-3.5 shrink-0 text-muted-foreground" /><span className="truncate">{f.name}</span></span>
                <button type="button" onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))} aria-label={`Remove ${f.name}`} className="p-1 rounded text-muted-foreground hover:text-red-500 cursor-pointer">
                  <X className="w-3.5 h-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {tried && filesProblem && <p className="text-[11px] text-red-500">{filesProblem}</p>}
      </div>
      <button type="submit" disabled={complete.isPending} className={`${primaryButton} w-full !bg-emerald-600 hover:!bg-emerald-500`}>
        {complete.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Mark as done
      </button>
    </form>
  );
};

const ReminderDetailModal: React.FC<{ id: string; onClose: () => void; onChanged: () => void }> = ({ id, onClose, onChanged }) => {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const { data: r, isLoading, isError, error, refetch } = useQuery({ queryKey: ['reminders', 'detail', id], queryFn: () => remindersApi.get(id) });
  const stop = useMutation({
    mutationFn: () => remindersApi.cancel(id),
    onSuccess: () => { toast.success('Reminder stopped.', 'Reminders'); onChanged(); onClose(); },
    onError: (err) => toast.error(apiError(err, 'Could not stop the reminder.'), 'Reminders'),
  });

  if (editing && r) {
    return <ReminderForm initial={r} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); refetch(); onChanged(); }} />;
  }
  return (
    <Modal title={r?.title ?? 'Reminder'} onClose={onClose} wide>
      {isLoading ? (
        <div className="flex justify-center p-8"><Loader2 className="w-5 h-5 animate-spin text-blue-500" /></div>
      ) : isError || !r ? (
        <p className="text-sm text-red-500">{apiError(error, 'Could not load this reminder.')}</p>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge r={r} />
            <span className="text-xs text-muted-foreground">{CATEGORY_LABELS[r.category]} · {repeatText(r)}</span>
          </div>
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3 text-sm">
            <div><dt className="text-[11px] text-muted-foreground">Due date</dt><dd className="font-semibold text-foreground">{formatDue(r.dueDate)}</dd></div>
            <div><dt className="text-[11px] text-muted-foreground">Amount</dt><dd className="font-semibold text-foreground">{formatAmount(r.amount) || '—'}</dd></div>
            <div><dt className="text-[11px] text-muted-foreground">Responsible</dt><dd className="font-semibold text-foreground">{r.ownerName}</dd></div>
            {r.status === 'active' && (
              <div className="col-span-2 sm:col-span-3">
                <dt className="text-[11px] text-muted-foreground">WhatsApp reminders</dt>
                <dd className="text-foreground">
                  {r.notifyCount ? `${r.notifyCount} sent, last ${when(r.lastNotifiedAt)}. ` : ''}
                  {r.nextNotifyAt ? `Next ${when(r.nextNotifyAt)}.` : ''}
                  {r.escalatedAt ? ' Admins were told it is overdue.' : ''}
                </dd>
              </div>
            )}
          </dl>
          {r.notes && <p className="text-sm text-foreground whitespace-pre-wrap rounded-xl bg-muted/60 p-3">{r.notes}</p>}

          {r.status === 'done' ? (
            <div className="rounded-2xl border border-border p-4 space-y-2">
              <p className="text-sm font-semibold text-foreground flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-600" /> Done by {r.completedByName ?? 'someone'} · {when(r.completedAt)}</p>
              {r.report && <p className="text-sm text-foreground whitespace-pre-wrap">{r.report}</p>}
              <ProofList reminderId={r.id} proofs={r.proofs} />
            </div>
          ) : r.status === 'active' ? (
            <CompleteForm reminder={r} onDone={() => { refetch(); onChanged(); }} />
          ) : null}

          {r.history.length > 0 && (
            <section>
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Earlier</h3>
              <ul className="rounded-2xl border border-border divide-y divide-border">
                {r.history.map((h) => (
                  <li key={h.id} className="p-3 space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span className="font-semibold text-foreground">{formatDue(h.dueDate)}</span>
                      <span className="text-xs text-muted-foreground">
                        {h.status === 'done' ? `Done by ${h.completedByName ?? 'someone'} · ${when(h.completedAt)}` : dueText(h)}
                      </span>
                    </div>
                    {h.report && <p className="text-xs text-muted-foreground whitespace-pre-wrap">{h.report}</p>}
                    <ProofList reminderId={r.id} proofs={h.proofs} />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {r.status === 'active' && (
            <div className="flex flex-wrap justify-between gap-2 pt-1">
              <button
                type="button" disabled={stop.isPending}
                onClick={async () => {
                  if (await confirm({ title: 'Stop this reminder?', message: 'No more WhatsApp reminders will be sent for it, and it will not repeat.', confirmLabel: 'Stop reminder', cancelLabel: 'Keep it', variant: 'danger' })) stop.mutate();
                }}
                className="text-sm font-semibold text-red-600 dark:text-red-400 hover:underline cursor-pointer disabled:opacity-50"
              >
                Stop reminder
              </button>
              <button type="button" onClick={() => setEditing(true)} className={secondaryButton}><Pencil className="w-4 h-4" /> Edit</button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};

// ─── Page ────────────────────────────────────────────────────────────────────────

type Tab = 'upcoming' | 'overdue' | 'done';

export const RemindersPage: React.FC = () => {
  const { id: openId } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const [tab, setTab] = useState<Tab>('upcoming');
  const [creating, setCreating] = useState(false);
  const { data, isLoading, isError, error } = useQuery({ queryKey: ['reminders', 'list', scope], queryFn: () => remindersApi.list(scope) });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['reminders'] });

  const all = data?.reminders ?? [];
  const isAdmin = !!data?.isAdmin;
  const groups = useMemo(() => ({
    upcoming: all.filter((r) => r.status === 'active' && !r.overdue),
    overdue: all.filter((r) => r.status === 'active' && r.overdue),
    done: all.filter((r) => r.status === 'done').sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? '')),
  }), [all]);
  const month = todayKey().slice(0, 7);
  const sum = (list: Reminder[]) => list.reduce((s, r) => s + (r.amount ?? 0), 0);
  const thisMonth = all.filter((r) => r.status !== 'cancelled' && r.dueDate.startsWith(month));
  const next7 = groups.upcoming.filter((r) => r.dueInDays <= 7);
  const shown = groups[tab];

  return (
    <div className="space-y-5 max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="p-2 rounded-xl bg-blue-500/10 text-blue-500 border border-blue-500/20"><BellRing className="w-5 h-5" /></span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Reminders</h1>
            <p className="text-xs text-muted-foreground mt-1 max-w-xl">
              Bills, renewals and other payments. WhatsApp reminds the person responsible a day before, then twice a day until it is marked done with proof.
            </p>
          </div>
        </div>
        <button type="button" onClick={() => setCreating(true)} className={primaryButton}><Plus className="w-4 h-4" /> New reminder</button>
      </div>

      {isAdmin && (
        <div role="tablist" aria-label="Whose reminders" className="inline-flex rounded-xl border border-border p-1 bg-card">
          {(['mine', 'all'] as const).map((s) => (
            <button key={s} type="button" role="tab" aria-selected={scope === s} onClick={() => setScope(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${scope === s ? 'bg-blue-600 text-white' : 'text-muted-foreground hover:text-foreground'}`}>
              {s === 'mine' ? 'Mine' : 'Everyone'}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Overdue', value: groups.overdue.length, sub: formatAmount(sum(groups.overdue)) || '—', tone: 'text-red-600 dark:text-red-400' },
          { label: 'Due in 7 days', value: next7.length, sub: formatAmount(sum(next7)) || '—', tone: 'text-amber-600 dark:text-amber-400' },
          { label: 'This month', value: thisMonth.length, sub: formatAmount(sum(thisMonth)) || '—', tone: 'text-foreground' },
          { label: 'Done this month', value: groups.done.filter((r) => (r.completedAt ?? '').startsWith(month)).length, sub: '', tone: 'text-emerald-600 dark:text-emerald-400' },
        ].map((c) => (
          <div key={c.label} className="rounded-2xl border border-border bg-card p-4">
            <p className="text-[11px] font-semibold text-muted-foreground">{c.label}</p>
            <p className={`text-2xl font-bold mt-1 ${c.tone}`}>{c.value}</p>
            {c.sub && <p className="text-xs text-muted-foreground">{c.sub}</p>}
          </div>
        ))}
      </div>

      <div role="tablist" aria-label="Filter reminders" className="flex gap-2 overflow-x-auto">
        {([['upcoming', 'Upcoming'], ['overdue', 'Overdue'], ['done', 'Done']] as [Tab, string][]).map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border whitespace-nowrap cursor-pointer ${
              tab === key ? 'bg-blue-600 border-blue-600 text-white' : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted'}`}>
            {label} <span className="opacity-70">{groups[key].length}</span>
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center p-10"><Loader2 className="w-5 h-5 animate-spin text-blue-500" /></div>
      ) : isError ? (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-600 flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> {apiError(error, 'Could not load reminders.')}</div>
      ) : shown.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center">
          <BellRing className="w-8 h-8 text-muted-foreground mx-auto" />
          <p className="text-sm font-semibold text-foreground mt-3">
            {tab === 'upcoming' ? 'No upcoming reminders' : tab === 'overdue' ? 'Nothing overdue' : 'Nothing done yet'}
          </p>
          {tab === 'upcoming' && <p className="text-xs text-muted-foreground mt-1">Add your bills and renewals, and WhatsApp will remind you in time.</p>}
        </div>
      ) : (
        <ul className="rounded-2xl border border-border bg-card divide-y divide-border overflow-hidden">
          {shown.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => navigate(`/reminders/${r.id}`)} className="w-full text-left flex flex-wrap sm:flex-nowrap items-center gap-3 px-4 py-3.5 hover:bg-muted/60 cursor-pointer">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground truncate">{r.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-2">
                    <span>{CATEGORY_LABELS[r.category]}</span>
                    <span className="flex items-center gap-1"><Repeat className="w-3 h-3" />{repeatText(r)}</span>
                    {scope === 'all' && <span className="flex items-center gap-1"><User className="w-3 h-3" />{r.ownerName}</span>}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold text-foreground">{formatAmount(r.amount)}</p>
                  <p className="text-xs text-muted-foreground">{formatDue(r.dueDate)}</p>
                </div>
                <StatusBadge r={r} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {creating && <ReminderForm onClose={() => setCreating(false)} onSaved={(r) => { setCreating(false); refresh(); navigate(`/reminders/${r.id}`); }} />}
      {openId && <ReminderDetailModal key={openId} id={openId} onClose={() => navigate('/reminders')} onChanged={refresh} />}
    </div>
  );
};

export default RemindersPage;
