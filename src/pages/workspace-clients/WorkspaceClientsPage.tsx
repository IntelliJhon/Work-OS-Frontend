import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, ArchiveRestore, Archive, ArrowLeft, Building2, FolderKanban, CalendarDays, FileText, Hash, Image as ImageIcon, Loader2, Mail, MapPin,
  MessageCircle, Paperclip, Pencil, Phone, Plus, Search, StickyNote, Tag, Trash2, Upload, User, X,
} from 'lucide-react';
import { useToast } from '../../components/ui/Toast';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import {
  STATUS_LABELS, formatPhone, workspaceClientsApi,
  type ClientActivity, type ClientDetail, type ClientFilter, type ClientInput, type ClientStatus, type ClientSummary,
} from '../../services/api/workspaceClients';

// ─── Clients ────────────────────────────────────────────────────────────────────
// The companies this workspace works for. Everyone sees them and adds notes; Admins and Project Managers add and
// edit clients and their documents; Admins archive. Every change shows in the client's activity.

const TIME_ZONE = 'Asia/Kolkata';
const apiError = (err: unknown, fallback: string) => (err as { response?: { data?: { error?: string } } })?.response?.data?.error || fallback;
const when = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: TIME_ZONE }) : '';
const day = (iso: string | null | undefined) =>
  iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '';
const ago = (iso: string) => {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  const days = Math.round(hrs / 24);
  return days < 30 ? `${days} d ago` : new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: TIME_ZONE });
};
const fileSize = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const GST_RE = /^[0-9]{2}[A-Z0-9]{13}$/;
const MAX_FILES = 10;
const MAX_BYTES = 15 * 1024 * 1024;

const inputClass =
  'w-full px-3 py-2 rounded-xl border border-border bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50 disabled:opacity-60';
const labelClass = 'text-xs font-semibold text-foreground';
const primaryButton = 'flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold disabled:opacity-50 cursor-pointer';
const secondaryButton = 'flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-border text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-50 cursor-pointer';

function phoneProblem(raw: string) {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return 'Enter the WhatsApp number';
  if (digits.length < 10 || digits.length > 15) return 'Enter a valid number, e.g. 98765 43210 or +91 98765 43210';
  return '';
}

const STATUS_TONES: Record<ClientStatus | 'archived', string> = {
  active: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20',
  on_hold: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20',
  former: 'bg-muted text-muted-foreground border-border',
  archived: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
};

const StatusBadge: React.FC<{ status: ClientStatus; archived?: boolean }> = ({ status, archived }) => (
  <span className={`inline-flex items-center px-2 py-0.5 rounded-lg border text-[11px] font-semibold whitespace-nowrap ${STATUS_TONES[archived ? 'archived' : status]}`}>
    {archived ? 'Archived' : STATUS_LABELS[status]}
  </span>
);

const Initials: React.FC<{ name: string; big?: boolean }> = ({ name, big }) => {
  const letters = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('');
  return (
    <span className={`${big ? 'w-12 h-12 text-base' : 'w-9 h-9 text-xs'} shrink-0 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 flex items-center justify-center font-bold`}>
      {letters || '?'}
    </span>
  );
};

const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 bg-background/70 backdrop-blur-sm overflow-y-auto" role="dialog" aria-modal="true" aria-label={title}>
    <div className="w-full max-w-2xl rounded-2xl border border-border bg-card shadow-2xl my-8">
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

// ─── Add / edit ─────────────────────────────────────────────────────────────────

export const ClientForm: React.FC<{ initial?: ClientDetail; onClose: () => void; onSaved: (c: ClientDetail) => void }> = ({ initial, onClose, onSaved }) => {
  const { toast } = useToast();
  const [f, setF] = useState({
    name: initial?.name ?? '',
    phone: initial ? formatPhone(initial.phone) : '',
    contactPerson: initial?.contactPerson ?? '',
    email: initial?.email ?? '',
    category: initial?.category ?? '',
    gstNumber: initial?.gstNumber ?? '',
    city: initial?.city ?? '',
    address: initial?.address ?? '',
    clientSince: initial?.clientSince ?? '',
    status: (initial?.status ?? 'active') as ClientStatus,
    accountManagerId: initial?.accountManagerId ?? '',
    notes: initial?.notes ?? '',
  });
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [tagDraft, setTagDraft] = useState('');
  const [tried, setTried] = useState(false);
  const set = (key: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((s) => ({ ...s, [key]: e.target.value }));
  const { data: people = [] } = useQuery({ queryKey: ['workspace-clients', 'people'], queryFn: workspaceClientsApi.people, staleTime: 60_000 });
  const { data: categories = [] } = useQuery({ queryKey: ['workspace-clients', 'categories'], queryFn: workspaceClientsApi.categories, staleTime: 60_000 });

  const gst = f.gstNumber.trim().toUpperCase().replace(/\s+/g, '');
  const problems = {
    name: f.name.trim().length < 2 ? 'Enter the client or company name' : '',
    phone: phoneProblem(f.phone),
    email: f.email.trim() && !EMAIL_RE.test(f.email.trim()) ? 'Enter a valid email address, e.g. owner@company.com' : '',
    gstNumber: gst && !GST_RE.test(gst) ? 'A GST number has 15 letters and digits, e.g. 32ABCDE1234F1Z5' : '',
  };
  const invalid = Object.values(problems).some(Boolean);

  const addTag = () => {
    const t = tagDraft.trim().replace(/,$/, '');
    if (t && !tags.some((x) => x.toLowerCase() === t.toLowerCase()) && tags.length < 20) setTags([...tags, t.slice(0, 40)]);
    setTagDraft('');
  };

  const save = useMutation({
    mutationFn: () => {
      const input: ClientInput = {
        name: f.name.trim(),
        phone: f.phone,
        contactPerson: f.contactPerson.trim() || null,
        email: f.email.trim() || null,
        category: f.category.trim() || null,
        gstNumber: gst || null,
        city: f.city.trim() || null,
        address: f.address.trim() || null,
        clientSince: f.clientSince || null,
        status: f.status,
        accountManagerId: f.accountManagerId || null,
        notes: f.notes.trim() || null,
        tags: tagDraft.trim() ? [...tags, tagDraft.trim()] : tags,
      };
      return initial ? workspaceClientsApi.update(initial.id, input) : workspaceClientsApi.create(input);
    },
    onSuccess: (c) => { toast.success(initial ? 'Client updated.' : `${c.name} added.`, 'Clients'); onSaved(c); },
    onError: (err) => toast.error(apiError(err, 'Could not save the client.'), 'Clients'),
  });
  const err = (key: keyof typeof problems) => tried && problems[key] ? <p className="mt-1 text-[11px] text-red-500">{problems[key]}</p> : null;
  const section = 'text-[11px] font-bold uppercase tracking-wider text-muted-foreground';

  return (
    <Modal title={initial ? `Edit ${initial.name}` : 'Add client'} onClose={onClose}>
      <form noValidate onSubmit={(e) => { e.preventDefault(); setTried(true); if (!invalid) save.mutate(); }} className="space-y-5">
        <div className="space-y-3">
          <p className={section}>Client</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5 sm:col-span-2">
              <label htmlFor="cl-name" className={labelClass}>Client / company name <span className="text-red-500">*</span></label>
              <input id="cl-name" autoFocus value={f.name} maxLength={160} onChange={set('name')} placeholder="e.g. Navya Bakes" className={inputClass} />
              {err('name')}
            </div>
            <div className="space-y-1.5">
              <label htmlFor="cl-phone" className={labelClass}>WhatsApp number <span className="text-red-500">*</span></label>
              <input id="cl-phone" type="tel" inputMode="tel" value={f.phone} maxLength={25} onChange={set('phone')} placeholder="98765 43210" className={inputClass} />
              {err('phone')}
            </div>
            <div className="space-y-1.5">
              <label htmlFor="cl-contact" className={labelClass}>Contact person</label>
              <input id="cl-contact" value={f.contactPerson} maxLength={120} onChange={set('contactPerson')} placeholder="e.g. Anil Kumar (Owner)" className={inputClass} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <label htmlFor="cl-email" className={labelClass}>Email</label>
              <input id="cl-email" type="email" value={f.email} maxLength={255} onChange={set('email')} placeholder="owner@company.com" className={inputClass} />
              {err('email')}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <p className={section}>Business</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="cl-category" className={labelClass}>Category</label>
              <input id="cl-category" list="cl-categories" value={f.category} maxLength={60} onChange={set('category')} placeholder="e.g. Restaurant, Retail, IT" className={inputClass} />
              <datalist id="cl-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="cl-gst" className={labelClass}>GST number</label>
              <input id="cl-gst" value={f.gstNumber} maxLength={20} onChange={set('gstNumber')} placeholder="32ABCDE1234F1Z5" className={`${inputClass} uppercase placeholder:normal-case`} />
              {err('gstNumber')}
            </div>
            <div className="space-y-1.5">
              <label htmlFor="cl-city" className={labelClass}>City</label>
              <input id="cl-city" value={f.city} maxLength={80} onChange={set('city')} placeholder="e.g. Kochi" className={inputClass} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="cl-since" className={labelClass}>Client since</label>
              <input id="cl-since" type="date" value={f.clientSince} onChange={set('clientSince')} className={inputClass} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <label htmlFor="cl-address" className={labelClass}>Address</label>
              <textarea id="cl-address" rows={2} value={f.address} maxLength={500} onChange={set('address')} className={`${inputClass} resize-y`} />
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <p className={section}>Our side</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="cl-manager" className={labelClass}>Account manager</label>
              <select id="cl-manager" value={f.accountManagerId} onChange={set('accountManagerId')} className={`${inputClass} [&>option]:bg-background`}>
                <option value="">Nobody yet</option>
                {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="cl-status" className={labelClass}>Status</label>
              <select id="cl-status" value={f.status} onChange={set('status')} className={`${inputClass} [&>option]:bg-background`}>
                {(Object.keys(STATUS_LABELS) as ClientStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <label htmlFor="cl-tags" className={labelClass}>Tags</label>
              <div className={`${inputClass} flex flex-wrap items-center gap-1.5 py-1.5`}>
                {tags.map((t) => (
                  <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-blue-500/10 text-blue-700 dark:text-blue-300 text-xs font-semibold">
                    {t}
                    <button type="button" aria-label={`Remove ${t}`} onClick={() => setTags(tags.filter((x) => x !== t))} className="cursor-pointer"><X className="w-3 h-3" /></button>
                  </span>
                ))}
                <input
                  id="cl-tags" value={tagDraft} maxLength={40}
                  onChange={(e) => setTagDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); } else if (e.key === 'Backspace' && !tagDraft && tags.length) setTags(tags.slice(0, -1)); }}
                  onBlur={addTag}
                  placeholder={tags.length ? '' : 'e.g. AMC, VIP — press Enter after each'}
                  className="flex-1 min-w-[8rem] bg-transparent outline-none text-sm py-0.5"
                />
              </div>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <label htmlFor="cl-notes" className={labelClass}>About this client</label>
              <textarea id="cl-notes" rows={3} value={f.notes} maxLength={2000} onChange={set('notes')} placeholder="What we do for them, plan, important details…" className={`${inputClass} resize-y`} />
            </div>
          </div>
        </div>

        {tried && invalid && <p className="text-xs text-red-500">Please fix the highlighted fields.</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={secondaryButton}>Cancel</button>
          <button type="submit" disabled={save.isPending} className={primaryButton}>
            {save.isPending && <Loader2 className="w-4 h-4 animate-spin" />} {initial ? 'Save changes' : 'Add client'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

// ─── Client page: details, notes & activity, documents ────────────────────────

const ActivityIcon: React.FC<{ kind: ClientActivity['kind'] }> = ({ kind }) => {
  const Icon = kind === 'note' ? StickyNote : kind === 'file_added' || kind === 'file_removed' ? Paperclip : kind === 'archived' ? Archive : kind === 'restored' ? ArchiveRestore : kind === 'created' ? Plus : Pencil;
  const tone = kind === 'note' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' : 'bg-muted text-muted-foreground';
  return <span className={`w-7 h-7 shrink-0 rounded-lg flex items-center justify-center ${tone}`}><Icon className="w-3.5 h-3.5" /></span>;
};

const ActivityPanel: React.FC<{ clientId: string; archived: boolean }> = ({ clientId, archived }) => {
  const { toast } = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  const [older, setOlder] = useState<ClientActivity[]>([]);
  const [hasMoreOlder, setHasMoreOlder] = useState<boolean | null>(null);
  const key = ['workspace-clients', 'activity', clientId];
  const { data, isLoading } = useQuery({ queryKey: key, queryFn: () => workspaceClientsApi.activity(clientId) });
  const items = [...(data?.items ?? []), ...older];
  const hasMore = hasMoreOlder ?? data?.hasMore ?? false;

  const add = useMutation({
    mutationFn: () => workspaceClientsApi.addNote(clientId, draft.trim()),
    onSuccess: () => { setDraft(''); queryClient.invalidateQueries({ queryKey: key }); queryClient.invalidateQueries({ queryKey: ['workspace-clients', 'list'] }); },
    onError: (err) => toast.error(apiError(err, 'Could not add the note.'), 'Clients'),
  });
  const remove = useMutation({
    mutationFn: (noteId: string) => workspaceClientsApi.deleteNote(clientId, noteId),
    onSuccess: (_d, noteId) => { setOlder((o) => o.filter((a) => a.id !== noteId)); queryClient.invalidateQueries({ queryKey: key }); },
    onError: (err) => toast.error(apiError(err, 'Could not delete the note.'), 'Clients'),
  });
  const loadOlder = async () => {
    const last = items[items.length - 1];
    if (!last) return;
    try {
      const page = await workspaceClientsApi.activity(clientId, last.createdAt);
      setOlder((o) => [...o, ...page.items]);
      setHasMoreOlder(page.hasMore);
    } catch (err) {
      toast.error(apiError(err, 'Could not load older activity.'), 'Clients');
    }
  };

  return (
    <div className="space-y-4">
      {!archived && (
        <form onSubmit={(e) => { e.preventDefault(); if (draft.trim()) add.mutate(); }} className="space-y-2">
          <label htmlFor="cl-note" className="sr-only">Add a note</label>
          <textarea
            id="cl-note" rows={2} value={draft} maxLength={4000} onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && draft.trim()) add.mutate(); }}
            placeholder="Add a note: a call, a meeting, a request from the client…"
            className={`${inputClass} resize-y`}
          />
          <div className="flex justify-end">
            <button type="submit" disabled={!draft.trim() || add.isPending} className={primaryButton}>
              {add.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <StickyNote className="w-4 h-4" />} Add note
            </button>
          </div>
        </form>
      )}
      {isLoading ? (
        <div className="flex justify-center p-6"><Loader2 className="w-5 h-5 animate-spin text-blue-500" /></div>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">Nothing here yet.</p>
      ) : (
        <ol className="space-y-3">
          {items.map((a) => (
            <li key={a.id} className="flex gap-3">
              <ActivityIcon kind={a.kind} />
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">{a.actorName ?? 'Someone'}</span>
                  {a.kind === 'note' ? ' added a note' : ''} · <time dateTime={a.createdAt} title={when(a.createdAt)}>{ago(a.createdAt)}</time>
                </p>
                {a.body && (
                  <p className={`text-sm mt-0.5 whitespace-pre-wrap break-words ${a.kind === 'note' ? 'text-foreground rounded-xl bg-amber-500/5 border border-amber-500/15 px-3 py-2 mt-1' : 'text-muted-foreground'}`}>{a.body}</p>
                )}
              </div>
              {a.canDelete && (
                <button
                  type="button" aria-label="Delete note" disabled={remove.isPending}
                  onClick={async () => { if (await confirm({ title: 'Delete this note?', message: 'It will be removed for everyone.', confirmLabel: 'Delete', variant: 'danger' })) remove.mutate(a.id); }}
                  className="p-1.5 h-fit rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-500/10 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
      {hasMore && <button type="button" onClick={loadOlder} className={`${secondaryButton} w-full`}>Show older</button>}
    </div>
  );
};

const DocumentsPanel: React.FC<{ clientId: string; canManage: boolean }> = ({ clientId, canManage }) => {
  const { toast } = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const key = ['workspace-clients', 'documents', clientId];
  const { data: docs = [], isLoading } = useQuery({ queryKey: key, queryFn: () => workspaceClientsApi.documents(clientId) });
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: key });
    queryClient.invalidateQueries({ queryKey: ['workspace-clients', 'activity', clientId] });
    queryClient.invalidateQueries({ queryKey: ['workspace-clients', 'list'] });
  };
  const upload = useMutation({
    mutationFn: (files: File[]) => workspaceClientsApi.addDocuments(clientId, files),
    onSuccess: (_d, files) => { toast.success(files.length === 1 ? 'Document added.' : `${files.length} documents added.`, 'Clients'); refresh(); },
    onError: (err) => toast.error(apiError(err, 'Could not add the documents.'), 'Clients'),
  });
  const remove = useMutation({
    mutationFn: (docId: string) => workspaceClientsApi.deleteDocument(clientId, docId),
    onSuccess: () => { toast.success('Document removed.', 'Clients'); refresh(); },
    onError: (err) => toast.error(apiError(err, 'Could not remove the document.'), 'Clients'),
  });
  const pick = (list: FileList | null) => {
    const files = Array.from(list ?? []);
    if (fileInput.current) fileInput.current.value = '';
    if (!files.length) return;
    if (files.length > MAX_FILES) return toast.error(`Add at most ${MAX_FILES} files at a time.`, 'Clients');
    const big = files.find((f) => f.size > MAX_BYTES);
    if (big) return toast.error(`"${big.name}" is larger than 15 MB.`, 'Clients');
    upload.mutate(files);
  };
  const open = async (docId: string) => {
    // Open the tab first so the browser doesn't block it, then point it at the file
    const tab = window.open('', '_blank');
    try {
      const url = await workspaceClientsApi.documentUrl(clientId, docId);
      if (tab) tab.location.href = url; else window.location.assign(url);
    } catch (err) {
      tab?.close();
      toast.error(apiError(err, 'Could not open the document.'), 'Clients');
    }
  };

  return (
    <div className="space-y-3">
      {canManage && (
        <>
          <input ref={fileInput} type="file" multiple hidden onChange={(e) => pick(e.target.files)}
            accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.heic,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip" />
          <button type="button" disabled={upload.isPending} onClick={() => fileInput.current?.click()}
            className="w-full flex items-center justify-center gap-2 px-4 py-4 rounded-xl border-2 border-dashed border-border text-sm font-semibold text-muted-foreground hover:text-foreground hover:border-blue-500/40 hover:bg-blue-500/5 cursor-pointer disabled:opacity-60">
            {upload.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {upload.isPending ? 'Uploading…' : 'Add documents (contracts, KYC, invoices) · up to 15 MB each'}
          </button>
        </>
      )}
      {isLoading ? (
        <div className="flex justify-center p-6"><Loader2 className="w-5 h-5 animate-spin text-blue-500" /></div>
      ) : docs.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">No documents yet.</p>
      ) : (
        <ul className="rounded-xl border border-border divide-y divide-border overflow-hidden">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center gap-3 px-3 py-2.5">
              {d.mimeType.startsWith('image/') ? <ImageIcon className="w-4 h-4 shrink-0 text-blue-500" /> : <FileText className="w-4 h-4 shrink-0 text-red-500" />}
              <button type="button" onClick={() => open(d.id)} className="min-w-0 flex-1 text-left cursor-pointer group">
                <p className="text-sm font-semibold text-foreground truncate group-hover:underline">{d.name}</p>
                <p className="text-[11px] text-muted-foreground">{fileSize(d.size)} · {d.uploadedBy ?? 'Someone'} · {ago(d.uploadedAt)}</p>
              </button>
              {canManage && (
                <button type="button" aria-label={`Remove ${d.name}`} disabled={remove.isPending}
                  onClick={async () => { if (await confirm({ title: 'Remove this document?', message: `"${d.name}" will be deleted for everyone.`, confirmLabel: 'Remove', variant: 'danger' })) remove.mutate(d.id); }}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-500/10 cursor-pointer">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

const ProjectsPanel: React.FC<{ clientId: string }> = ({ clientId }) => {
  const { data: projects = [], isLoading, isError, refetch } = useQuery({ queryKey: ['workspace-clients', 'projects', clientId], queryFn: () => workspaceClientsApi.projects(clientId) });
  return (
    <section aria-label="Projects" className="rounded-2xl border border-border bg-card p-5 space-y-3">
      <h2 className="text-sm font-bold text-foreground flex items-center gap-2"><FolderKanban className="w-4 h-4 text-blue-500" /> Projects {!isError && !isLoading && <span className="text-xs font-semibold text-muted-foreground">{projects.length}</span>}</h2>
      {isLoading ? (
        <div className="flex justify-center p-4"><Loader2 className="w-4 h-4 animate-spin text-blue-500" /></div>
      ) : isError ? (
        <p className="text-xs text-red-600 dark:text-red-400 flex flex-wrap items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5" /> Couldn't load the projects.
          <button type="button" onClick={() => refetch()} className="font-semibold underline cursor-pointer">Try again</button>
        </p>
      ) : projects.length === 0 ? (
        <p className="text-xs text-muted-foreground">No projects for this client yet. Choose this client when you create a project.</p>
      ) : (
        <ul className="divide-y divide-border -mx-1">
          {projects.map((p) => {
            const total = p.openTasks + p.doneTasks;
            return (
              <li key={p.id}>
                <Link to={`/projects/${p.id}`} className="flex items-center gap-3 px-1 py-2.5 rounded-lg hover:bg-muted/60">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground truncate">{p.name}</p>
                    <p className="text-[11px] text-muted-foreground">{total ? `${p.doneTasks}/${total} tasks done` : 'No tasks yet'}{p.pmName ? ` · PM ${p.pmName}` : ''}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-lg border text-[11px] font-semibold capitalize ${p.status === 'completed' ? STATUS_TONES.active : p.status === 'archived' ? STATUS_TONES.former : 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20'}`}>{p.status}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};

const Detail: React.FC<{ icon: React.ElementType; label: string; children: React.ReactNode }> = ({ icon: Icon, label, children }) => (
  <div className="flex gap-3">
    <Icon className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
    <div className="min-w-0">
      <p className="text-[11px] font-semibold text-muted-foreground">{label}</p>
      <div className="text-sm text-foreground break-words">{children}</div>
    </div>
  </div>
);

const ClientProfile: React.FC<{ id: string }> = ({ id }) => {
  const { toast } = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState<'activity' | 'documents'>('activity');
  const { data, isLoading, isError, error } = useQuery({ queryKey: ['workspace-clients', 'detail', id], queryFn: () => workspaceClientsApi.get(id) });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['workspace-clients'] });
  const archive = useMutation({
    mutationFn: () => workspaceClientsApi.archive(id),
    onSuccess: () => { toast.success('Client archived.', 'Clients'); refresh(); navigate('/clients'); },
    onError: (err) => toast.error(apiError(err, 'Could not archive the client.'), 'Clients'),
  });
  const restore = useMutation({
    mutationFn: () => workspaceClientsApi.restore(id),
    onSuccess: () => { toast.success('Client restored.', 'Clients'); refresh(); },
    onError: (err) => toast.error(apiError(err, 'Could not restore the client.'), 'Clients'),
  });

  if (isLoading) return <div className="flex justify-center p-10"><Loader2 className="w-5 h-5 animate-spin text-blue-500" /></div>;
  if (isError || !data) {
    return (
      <div className="space-y-4 max-w-5xl">
        <Link to="/clients" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"><ArrowLeft className="w-4 h-4" /> All clients</Link>
        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-600 flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> {apiError(error, 'Could not load this client.')}</div>
      </div>
    );
  }
  const c = data.data;
  const archived = !!c.archivedAt;
  const canManage = data.canManage && !archived;

  return (
    <div className="space-y-5 max-w-5xl">
      <Link to="/clients" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"><ArrowLeft className="w-4 h-4" /> All clients</Link>

      <div className="rounded-2xl border border-border bg-card p-5 flex flex-wrap items-start gap-4">
        <Initials name={c.name} big />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground break-words">{c.name}</h1>
            <StatusBadge status={c.status} archived={archived} />
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {[c.category, c.city].filter(Boolean).join(' · ') || 'No category yet'}
            {c.createdByName && <> · Added by {c.createdByName}</>}
          </p>
          {c.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {c.tags.map((t) => <span key={t} className="px-2 py-0.5 rounded-lg bg-blue-500/10 text-blue-700 dark:text-blue-300 text-[11px] font-semibold">{t}</span>)}
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          <a href={`https://wa.me/${c.phone}`} target="_blank" rel="noreferrer" className={secondaryButton}><MessageCircle className="w-4 h-4 text-emerald-600" /> WhatsApp</a>
          <a href={`tel:+${c.phone}`} className={secondaryButton}><Phone className="w-4 h-4" /> Call</a>
          {canManage && <button type="button" onClick={() => setEditing(true)} className={primaryButton}><Pencil className="w-4 h-4" /> Edit</button>}
        </div>
      </div>

      {archived && (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-700 dark:text-red-400 flex flex-wrap items-center justify-between gap-3">
          <span className="flex items-center gap-2"><Archive className="w-4 h-4" /> Archived on {when(c.archivedAt)}. It is hidden from the client list.</span>
          {data.isAdmin && (
            <button type="button" disabled={restore.isPending} onClick={() => restore.mutate()} className={secondaryButton}>
              <ArchiveRestore className="w-4 h-4" /> Restore
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] gap-5 items-start">
        <div className="space-y-5">
        <section aria-label="Client details" className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <Detail icon={Phone} label="WhatsApp"><a href={`https://wa.me/${c.phone}`} target="_blank" rel="noreferrer" className="hover:underline">{formatPhone(c.phone)}</a></Detail>
          {c.contactPerson && <Detail icon={User} label="Contact person">{c.contactPerson}</Detail>}
          {c.email && <Detail icon={Mail} label="Email"><a href={`mailto:${c.email}`} className="hover:underline">{c.email}</a></Detail>}
          {(c.address || c.city) && <Detail icon={MapPin} label="Address"><span className="whitespace-pre-wrap">{[c.address, c.city].filter(Boolean).join('\n')}</span></Detail>}
          {c.gstNumber && <Detail icon={Hash} label="GST number"><span className="font-mono">{c.gstNumber}</span></Detail>}
          <Detail icon={User} label="Account manager">{c.accountManagerName ?? <span className="text-muted-foreground">Nobody yet</span>}</Detail>
          {c.clientSince && <Detail icon={CalendarDays} label="Client since">{day(c.clientSince)}</Detail>}
          {c.notes && <Detail icon={Tag} label="About"><span className="whitespace-pre-wrap">{c.notes}</span></Detail>}
          <p className="text-[11px] text-muted-foreground pt-2 border-t border-border">
            Last changed {when(c.updatedAt)}{c.updatedByName ? ` by ${c.updatedByName}` : ''}
          </p>
          {data.isAdmin && !archived && (
            <button
              type="button" disabled={archive.isPending}
              onClick={async () => {
                if (await confirm({ title: `Archive ${c.name}?`, message: 'It will be hidden from the client list. Notes and documents are kept, and you can restore it later.', confirmLabel: 'Archive', cancelLabel: 'Keep it', variant: 'warning' })) archive.mutate();
              }}
              className="text-sm font-semibold text-red-600 dark:text-red-400 hover:underline cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
            >
              <Archive className="w-4 h-4" /> Archive client
            </button>
          )}
        </section>

        <ProjectsPanel clientId={c.id} />
        </div>

        <section aria-label="Notes and documents" className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <div role="tablist" aria-label="Client tabs" className="inline-flex rounded-xl border border-border p-1 bg-background">
            {([['activity', 'Notes & activity'], ['documents', 'Documents']] as const).map(([key, label]) => (
              <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${tab === key ? 'bg-blue-600 text-white' : 'text-muted-foreground hover:text-foreground'}`}>
                {label}
              </button>
            ))}
          </div>
          {tab === 'activity' ? <ActivityPanel clientId={c.id} archived={archived} /> : <DocumentsPanel clientId={c.id} canManage={canManage} />}
        </section>
      </div>

      {editing && <ClientForm initial={c} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); refresh(); }} />}
    </div>
  );
};

// ─── List ───────────────────────────────────────────────────────────────────────

type StatusTab = '' | ClientStatus | 'archived';

const ClientsList: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<StatusTab>('');
  const [category, setCategory] = useState('');
  const [managerId, setManagerId] = useState('');
  const [adding, setAdding] = useState(false);

  // Search as you type, a moment after the last key
  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const filter: ClientFilter = { q, status, category, managerId };
  const { data, isLoading, isError, error, isFetching } = useQuery({ queryKey: ['workspace-clients', 'list', filter], queryFn: () => workspaceClientsApi.list(filter), placeholderData: (prev) => prev });
  // Counts per status (whole workspace, not filtered)
  const { data: everyone } = useQuery({ queryKey: ['workspace-clients', 'list', {}], queryFn: () => workspaceClientsApi.list({}) });
  const { data: categories = [] } = useQuery({ queryKey: ['workspace-clients', 'categories'], queryFn: workspaceClientsApi.categories, staleTime: 60_000 });
  const { data: people = [] } = useQuery({ queryKey: ['workspace-clients', 'people'], queryFn: workspaceClientsApi.people, staleTime: 60_000 });

  const clients = data?.data ?? [];
  const canManage = !!data?.canManage;
  const counts = useMemo(() => {
    const all = everyone?.data ?? [];
    return { '': all.length, active: all.filter((c) => c.status === 'active').length, on_hold: all.filter((c) => c.status === 'on_hold').length, former: all.filter((c) => c.status === 'former').length };
  }, [everyone]);
  const filtered = !!(q || category || managerId);
  const tabs: [StatusTab, string][] = [['', 'All'], ['active', 'Active'], ['on_hold', 'On hold'], ['former', 'Former'], ['archived', 'Archived']];

  return (
    <div className="space-y-5 max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="p-2 rounded-xl bg-blue-500/10 text-blue-500 border border-blue-500/20"><Building2 className="w-5 h-5" /></span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Clients</h1>
            <p className="text-xs text-muted-foreground mt-1 max-w-xl">
              The companies you work for: contacts, documents and notes in one place.{canManage ? '' : ' Admins and Project Managers add and edit clients; everyone can add notes.'}
            </p>
          </div>
        </div>
        {canManage && <button type="button" onClick={() => setAdding(true)} className={primaryButton}><Plus className="w-4 h-4" /> Add client</button>}
      </div>

      <div className="flex flex-col lg:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <label htmlFor="cl-search" className="sr-only">Search clients</label>
          <input id="cl-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, contact, phone, city, GST or tag" className={`${inputClass} pl-9`} />
          {isFetching && !isLoading && <Loader2 className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />}
        </div>
        <div className="grid grid-cols-2 gap-3 lg:w-[26rem]">
          <select aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)} className={`${inputClass} [&>option]:bg-background`}>
            <option value="">All categories</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select aria-label="Account manager" value={managerId} onChange={(e) => setManagerId(e.target.value)} className={`${inputClass} [&>option]:bg-background`}>
            <option value="">All account managers</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      </div>

      <div role="tablist" aria-label="Client status" className="flex gap-2 overflow-x-auto pb-1">
        {tabs.map(([key, label]) => (
          <button key={key || 'all'} type="button" role="tab" aria-selected={status === key} onClick={() => setStatus(key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border whitespace-nowrap cursor-pointer ${
              status === key ? 'bg-blue-600 border-blue-600 text-white' : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted'}`}>
            {label} {key !== 'archived' && <span className="opacity-70">{counts[key as keyof typeof counts]}</span>}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center p-10"><Loader2 className="w-5 h-5 animate-spin text-blue-500" /></div>
      ) : isError ? (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-600 flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> {apiError(error, 'Could not load clients.')}</div>
      ) : clients.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center">
          <Building2 className="w-8 h-8 text-muted-foreground mx-auto" />
          <p className="text-sm font-semibold text-foreground mt-3">
            {filtered ? 'No clients match' : status === 'archived' ? 'No archived clients' : status ? `No ${STATUS_LABELS[status as ClientStatus].toLowerCase()} clients` : 'No clients yet'}
          </p>
          {!filtered && !status && (
            <p className="text-xs text-muted-foreground mt-1">{canManage ? 'Add your first client to keep their contacts, documents and notes together.' : 'Admins and Project Managers can add clients.'}</p>
          )}
          {!filtered && !status && canManage && (
            <button type="button" onClick={() => setAdding(true)} className={`${primaryButton} mx-auto mt-4`}><Plus className="w-4 h-4" /> Add client</button>
          )}
        </div>
      ) : (
        <ul className="rounded-2xl border border-border bg-card divide-y divide-border overflow-hidden">
          {clients.map((c: ClientSummary) => (
            <li key={c.id}>
              <button type="button" onClick={() => navigate(`/clients/${c.id}`)} className="w-full text-left flex items-center gap-3 px-4 py-3.5 hover:bg-muted/60 cursor-pointer">
                <Initials name={c.name} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground truncate">{c.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                    {c.contactPerson && <span className="flex items-center gap-1"><User className="w-3 h-3" />{c.contactPerson}</span>}
                    <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{formatPhone(c.phone)}</span>
                    {c.city && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{c.city}</span>}
                    {c.documents > 0 && <span className="flex items-center gap-1"><Paperclip className="w-3 h-3" />{c.documents}</span>}
                  </p>
                </div>
                <div className="hidden md:block text-right shrink-0 w-44">
                  <p className="text-xs font-semibold text-foreground truncate">{c.accountManagerName ?? '—'}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{c.category ?? 'No category'}</p>
                </div>
                <StatusBadge status={c.status} archived={!!c.archivedAt} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {adding && (
        <ClientForm
          onClose={() => setAdding(false)}
          onSaved={(c) => { setAdding(false); queryClient.invalidateQueries({ queryKey: ['workspace-clients'] }); navigate(`/clients/${c.id}`); }}
        />
      )}
    </div>
  );
};

const WorkspaceClientsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  return id ? <ClientProfile key={id} id={id} /> : <ClientsList />;
};

export default WorkspaceClientsPage;
