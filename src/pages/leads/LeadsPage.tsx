import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, Archive, ArchiveRestore, ArrowLeft, ArrowRight, Bot, Building2, CalendarClock, CheckCircle2, ClipboardList, FileText, IndianRupee,
  Loader2, Mail, MapPin, MessageCircle, Pencil, Phone, Plus, Search, Send, StickyNote, Target, Trash2, Upload, User, X,
} from 'lucide-react';
import { useToast } from '../../components/ui/Toast';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { formatPhone } from '../../services/api/workspaceClients';
import {
  AUTO_FOLLOW_UPS, LEAD_STAGES, REJECT_LABELS, SOURCE_LABELS, STAGE_LABELS, leadsApi, rupees,
  type DuplicateLead, type LeadActivity, type LeadDetail, type LeadFilter, type LeadInput, type LeadSource, type LeadStage,
  type AcceptedAs, type LeadSummary, type RejectReason, type StageInput, type WhatsAppResult,
} from '../../services/api/leads';

// ─── Leads ──────────────────────────────────────────────────────────────────────
// Enquiries moved through stages on a board: Lead created → Contacted → Requirement collected → Proposal sent →
// Follow up → Accepted / Rejected. Some moves ask for details first (the requirement, a proposal, why it was lost).

const TIME_ZONE = 'Asia/Kolkata';
const apiError = (err: unknown, fallback: string) => (err as { response?: { data?: { error?: string } } })?.response?.data?.error || fallback;
const apiCode = (err: unknown) => (err as { response?: { data?: { code?: string } } })?.response?.data?.code;
const when = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: TIME_ZONE }) : '';
const shortWhen = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: TIME_ZONE });
const ago = (iso: string) => {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  const days = Math.round(hrs / 24);
  return days < 30 ? `${days} d ago` : new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: TIME_ZONE });
};
const daysSince = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
const fileSize = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
/** ISO → the value a datetime-local input shows (the browser's own time zone) */
const toLocalInput = (iso: string | null | undefined) => {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);
const isOverdue = (l: { nextFollowUpAt: string | null; stage: LeadStage }) =>
  !!l.nextFollowUpAt && l.stage !== 'accepted' && l.stage !== 'rejected' && new Date(l.nextFollowUpAt).getTime() < Date.now();

/** Tells the user whether the proposal reached the client on WhatsApp */
function useWhatsAppToast() {
  const { toast } = useToast();
  return (name: string, r: WhatsAppResult | undefined) => {
    if (!r) return;
    if (r.sent) toast.success(`Proposal sent to ${name} on WhatsApp.`, 'Leads');
    else toast.error(`The proposal could not be sent on WhatsApp: ${r.error ?? 'unknown error'}. You can retry from the lead page.`, 'Leads');
  };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_BYTES = 15 * 1024 * 1024;

const inputClass =
  'w-full px-3 py-2 rounded-xl border border-border bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50 disabled:opacity-60';
const labelClass = 'text-xs font-semibold text-foreground';
const primaryButton = 'flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold disabled:opacity-50 cursor-pointer';
const secondaryButton = 'flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-border text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-50 cursor-pointer';

const STAGE_TONES: Record<LeadStage, { badge: string; dot: string }> = {
  new: { badge: 'bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/20', dot: 'bg-slate-400' },
  contacted: { badge: 'bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/20', dot: 'bg-sky-500' },
  requirement: { badge: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-500/20', dot: 'bg-indigo-500' },
  proposal: { badge: 'bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-500/20', dot: 'bg-violet-500' },
  follow_up: { badge: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20', dot: 'bg-amber-500' },
  accepted: { badge: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20', dot: 'bg-emerald-500' },
  rejected: { badge: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20', dot: 'bg-red-500' },
};

const StageBadge: React.FC<{ stage: LeadStage }> = ({ stage }) => (
  <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[11px] font-semibold whitespace-nowrap ${STAGE_TONES[stage].badge}`}>
    <span className={`w-1.5 h-1.5 rounded-full ${STAGE_TONES[stage].dot}`} /> {STAGE_LABELS[stage]}
  </span>
);

const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode; narrow?: boolean }> = ({ title, onClose, children, narrow }) => (
  <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 bg-background/70 backdrop-blur-sm overflow-y-auto" role="dialog" aria-modal="true" aria-label={title}>
    <div className={`w-full ${narrow ? 'max-w-lg' : 'max-w-2xl'} rounded-2xl border border-border bg-card shadow-2xl my-8`}>
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

function phoneProblem(raw: string) {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return 'Enter the WhatsApp number';
  if (digits.length < 10 || digits.length > 15) return 'Enter a valid number, e.g. 98765 43210 or +91 98765 43210';
  return '';
}

/** The client gets an automatic WhatsApp follow-up about the unanswered proposal at the follow-up time */
const AutoFollowUpBox: React.FC<{ checked: boolean; onChange: (v: boolean) => void; sent?: number }> = ({ checked, onChange, sent = 0 }) => (
  <label className="flex items-start gap-2.5 rounded-xl border border-border p-3 cursor-pointer">
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5" />
    <span className="text-sm">
      <span className="font-semibold text-foreground flex items-center gap-1.5"><MessageCircle className="w-4 h-4 text-emerald-600" /> Follow up with the client on WhatsApp automatically</span>
      <span className="block text-[11px] text-muted-foreground">
        At the follow-up time, if they haven't replied, Work OS sends the next follow-up about the proposal ({Math.min(sent, AUTO_FOLLOW_UPS)} of {AUTO_FOLLOW_UPS} sent). Move the lead or change the date when they reply.
      </span>
    </span>
  </label>
);
const followsUpAutomatically = (stage: LeadStage) => stage === 'proposal' || stage === 'follow_up';

// ─── Add / edit ─────────────────────────────────────────────────────────────────

const LeadForm: React.FC<{ initial?: LeadDetail; onClose: () => void; onSaved: (l: LeadDetail) => void }> = ({ initial, onClose, onSaved }) => {
  const { toast } = useToast();
  const [f, setF] = useState({
    name: initial?.name ?? '',
    phone: initial ? formatPhone(initial.phone) : '',
    company: initial?.company ?? '',
    email: initial?.email ?? '',
    city: initial?.city ?? '',
    source: (initial?.source ?? 'manual') as LeadSource,
    service: initial?.service ?? '',
    expectedValue: initial?.expectedValue ? String(Number(initial.expectedValue)) : '',
    ownerId: initial ? initial.ownerId ?? '' : 'me',
    nextFollowUpAt: toLocalInput(initial?.nextFollowUpAt),
    notes: initial?.notes ?? '',
  });
  const [autoFollowUp, setAutoFollowUp] = useState(initial?.autoFollowUp ?? true);
  const [tried, setTried] = useState(false);
  const [duplicates, setDuplicates] = useState<DuplicateLead[] | null>(null);
  const set = (key: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((s) => ({ ...s, [key]: e.target.value }));
  const { data: people = [] } = useQuery({ queryKey: ['leads', 'people'], queryFn: leadsApi.people, staleTime: 60_000 });

  const problems = {
    name: f.name.trim().length < 2 ? 'Enter the lead\'s name' : '',
    phone: phoneProblem(f.phone),
    email: f.email.trim() && !EMAIL_RE.test(f.email.trim()) ? 'Enter a valid email address' : '',
    expectedValue: f.expectedValue && !(Number(f.expectedValue) >= 0) ? 'Enter the amount in rupees, e.g. 25000' : '',
  };
  const invalid = Object.values(problems).some(Boolean);

  const save = useMutation({
    mutationFn: (allowDuplicate: boolean) => {
      const input: LeadInput = {
        name: f.name.trim(),
        phone: f.phone,
        company: f.company.trim() || null,
        email: f.email.trim() || null,
        city: f.city.trim() || null,
        source: f.source,
        service: f.service.trim() || null,
        expectedValue: f.expectedValue ? Number(f.expectedValue) : null,
        ownerId: f.ownerId || null,
        nextFollowUpAt: fromLocalInput(f.nextFollowUpAt),
        notes: f.notes.trim() || null,
        ...(initial ? { autoFollowUp } : {}),
      };
      // "Me" leaves the owner out: the server makes whoever adds the lead its owner
      if (f.ownerId === 'me') delete (input as Partial<LeadInput>).ownerId;
      return initial ? leadsApi.update(initial.id, input) : leadsApi.create(input, allowDuplicate);
    },
    onSuccess: (l) => { toast.success(initial ? 'Lead updated.' : `${l.name} added.`, 'Leads'); onSaved(l); },
    onError: (err) => {
      if (apiCode(err) === 'duplicate_phone') {
        setDuplicates((err as unknown as { response: { data: { data: { leads: DuplicateLead[] } } } }).response.data.data.leads);
        return;
      }
      toast.error(apiError(err, 'Could not save the lead.'), 'Leads');
    },
  });
  const err = (key: keyof typeof problems) => tried && problems[key] ? <p className="mt-1 text-[11px] text-red-500">{problems[key]}</p> : null;

  return (
    <Modal title={initial ? `Edit ${initial.name}` : 'Add lead'} onClose={onClose}>
      <form noValidate onSubmit={(e) => { e.preventDefault(); setTried(true); if (!invalid) save.mutate(false); }} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label htmlFor="ld-name" className={labelClass}>Name <span className="text-red-500">*</span></label>
            <input id="ld-name" autoFocus value={f.name} maxLength={120} onChange={set('name')} placeholder="e.g. Anil Kumar" className={inputClass} />
            {err('name')}
          </div>
          <div className="space-y-1.5">
            <label htmlFor="ld-phone" className={labelClass}>WhatsApp number <span className="text-red-500">*</span></label>
            <input id="ld-phone" type="tel" inputMode="tel" value={f.phone} maxLength={25} onChange={(e) => { set('phone')(e); setDuplicates(null); }} placeholder="98765 43210" className={inputClass} />
            {err('phone')}
          </div>
          <div className="space-y-1.5">
            <label htmlFor="ld-company" className={labelClass}>Company</label>
            <input id="ld-company" value={f.company} maxLength={160} onChange={set('company')} placeholder="e.g. Navya Bakes" className={inputClass} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="ld-email" className={labelClass}>Email</label>
            <input id="ld-email" type="email" value={f.email} maxLength={255} onChange={set('email')} placeholder="anil@company.com" className={inputClass} />
            {err('email')}
          </div>
          <div className="space-y-1.5">
            <label htmlFor="ld-service" className={labelClass}>Interested in</label>
            <input id="ld-service" value={f.service} maxLength={120} onChange={set('service')} placeholder="e.g. WhatsApp bot, Website" className={inputClass} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="ld-source" className={labelClass}>Came from</label>
            <select id="ld-source" value={f.source} onChange={set('source')} className={`${inputClass} [&>option]:bg-background`}>
              {(Object.keys(SOURCE_LABELS) as LeadSource[]).map((s) => <option key={s} value={s}>{SOURCE_LABELS[s]}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="ld-value" className={labelClass}>Expected value (₹)</label>
            <input id="ld-value" type="number" min={0} step={1} inputMode="numeric" value={f.expectedValue} onChange={set('expectedValue')} placeholder="e.g. 50000" className={inputClass} />
            {err('expectedValue')}
          </div>
          <div className="space-y-1.5">
            <label htmlFor="ld-city" className={labelClass}>City</label>
            <input id="ld-city" value={f.city} maxLength={80} onChange={set('city')} placeholder="e.g. Kochi" className={inputClass} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="ld-owner" className={labelClass}>Owner</label>
            <select id="ld-owner" value={f.ownerId} onChange={set('ownerId')} className={`${inputClass} [&>option]:bg-background`}>
              {!initial && <option value="me">Me</option>}
              <option value="">Nobody yet</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="ld-follow" className={labelClass}>Next follow-up</label>
            <input id="ld-follow" type="datetime-local" value={f.nextFollowUpAt} onChange={set('nextFollowUpAt')} className={inputClass} />
          </div>
          {initial && followsUpAutomatically(initial.stage) && (
            <div className="sm:col-span-2"><AutoFollowUpBox checked={autoFollowUp} onChange={setAutoFollowUp} sent={initial.autoFollowUpsSent} /></div>
          )}
          <div className="space-y-1.5 sm:col-span-2">
            <label htmlFor="ld-notes" className={labelClass}>About this lead</label>
            <textarea id="ld-notes" rows={3} value={f.notes} maxLength={2000} onChange={set('notes')} placeholder="How they found us, what they said…" className={`${inputClass} resize-y`} />
          </div>
        </div>

        {duplicates && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm space-y-2">
            <p className="font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> This number is already on a lead</p>
            <ul className="space-y-1">
              {duplicates.map((d) => (
                <li key={d.id}><Link to={`/leads/${d.id}`} onClick={onClose} className="underline font-semibold text-foreground">{d.name}</Link> <span className="text-muted-foreground">· {d.stageLabel}</span></li>
              ))}
            </ul>
            <button type="button" disabled={save.isPending} onClick={() => save.mutate(true)} className={secondaryButton}>Add as a new lead anyway</button>
          </div>
        )}

        {tried && invalid && <p className="text-xs text-red-500">Please fix the highlighted fields.</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={secondaryButton}>Cancel</button>
          <button type="submit" disabled={save.isPending} className={primaryButton}>
            {save.isPending && <Loader2 className="w-4 h-4 animate-spin" />} {initial ? 'Save changes' : 'Add lead'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

// ─── Stage moves that need details ──────────────────────────────────────────────

type Move = {
  lead: Pick<LeadSummary, 'id' | 'name' | 'stage' | 'nextFollowUpAt'> & { autoFollowUp?: boolean; autoFollowUpsSent?: number; service?: string | null; requirement?: string | null; budget?: string | null; timeline?: string | null };
  to: LeadStage;
};
/** The latest proposal of the lead being moved (null = none yet) */
type LatestProposal = { version: number; hasFile: boolean } | null;

/** Requirement collected, Follow up and Rejected ask for details; other stages move straight away */
const StageDialog: React.FC<{ move: Move; onClose: () => void; onMoved: () => void; editOnly?: boolean }> = ({ move, onClose, onMoved, editOnly }) => {
  const { toast } = useToast();
  const { lead, to } = move;
  const [requirement, setRequirement] = useState(lead.requirement ?? '');
  const [budget, setBudget] = useState(lead.budget ?? '');
  const [timeline, setTimeline] = useState(lead.timeline ?? '');
  const [reason, setReason] = useState<RejectReason | ''>('');
  const [note, setNote] = useState('');
  const [followUp, setFollowUp] = useState(toLocalInput(lead.nextFollowUpAt));
  const [autoFollowUp, setAutoFollowUp] = useState(lead.autoFollowUp ?? true);
  const [acceptAs, setAcceptAs] = useState<AcceptedAs | ''>(/\bbots?\b/i.test(lead.service ?? '') ? 'bot' : '');
  const [tried, setTried] = useState(false);
  const problem = to === 'requirement' && !requirement.trim() ? 'Write down what they need'
    : to === 'rejected' && !reason ? 'Choose why it was rejected'
      : to === 'accepted' && !acceptAs ? 'Choose what they bought' : '';

  const save = useMutation({
    mutationFn: () => {
      // Editing the requirement keeps the lead where it is
      if (editOnly) return leadsApi.update(lead.id, { requirement: requirement.trim(), budget: budget.trim() || null, timeline: timeline.trim() || null });
      const input: StageInput = { stage: to };
      if (to === 'requirement') Object.assign(input, { requirement: requirement.trim(), budget: budget.trim() || null, timeline: timeline.trim() || null });
      if (to === 'rejected') Object.assign(input, { rejectReason: reason, rejectNote: note.trim() || null });
      if (to === 'accepted') input.acceptAs = acceptAs as AcceptedAs;
      if (to !== 'rejected' && to !== 'accepted') input.nextFollowUpAt = fromLocalInput(followUp);
      if (followsUpAutomatically(to)) input.autoFollowUp = autoFollowUp;
      return leadsApi.moveStage(lead.id, input);
    },
    onSuccess: () => { toast.success(editOnly ? 'Requirement updated.' : `${lead.name} moved to ${STAGE_LABELS[to]}.`, 'Leads'); onMoved(); },
    onError: (err) => toast.error(apiError(err, editOnly ? 'Could not save the requirement.' : 'Could not move the lead.'), 'Leads'),
  });

  return (
    <Modal title={editOnly ? `Requirement · ${lead.name}` : `${lead.name} → ${STAGE_LABELS[to]}`} onClose={onClose} narrow>
      <form noValidate onSubmit={(e) => { e.preventDefault(); setTried(true); if (!problem) save.mutate(); }} className="space-y-3">
        {to === 'requirement' && (
          <>
            <div className="space-y-1.5">
              <label htmlFor="st-req" className={labelClass}>What do they need? <span className="text-red-500">*</span></label>
              <textarea id="st-req" autoFocus rows={5} value={requirement} maxLength={4000} onChange={(e) => setRequirement(e.target.value)}
                placeholder="Features, pages, integrations, number of users…" className={`${inputClass} resize-y`} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label htmlFor="st-budget" className={labelClass}>Budget</label>
                <input id="st-budget" value={budget} maxLength={80} onChange={(e) => setBudget(e.target.value)} placeholder="e.g. ₹40–60k" className={inputClass} />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="st-timeline" className={labelClass}>Timeline</label>
                <input id="st-timeline" value={timeline} maxLength={80} onChange={(e) => setTimeline(e.target.value)} placeholder="e.g. Before 15 Dec" className={inputClass} />
              </div>
            </div>
          </>
        )}
        {to === 'rejected' && (
          <>
            <div className="space-y-1.5">
              <label htmlFor="st-reason" className={labelClass}>Why? <span className="text-red-500">*</span></label>
              <select id="st-reason" autoFocus value={reason} onChange={(e) => setReason(e.target.value as RejectReason)} className={`${inputClass} [&>option]:bg-background`}>
                <option value="">Choose a reason</option>
                {(Object.keys(REJECT_LABELS) as RejectReason[]).map((r) => <option key={r} value={r}>{REJECT_LABELS[r]}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="st-note" className={labelClass}>Details</label>
              <textarea id="st-note" rows={3} value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} placeholder="What they said" className={`${inputClass} resize-y`} />
            </div>
          </>
        )}
        {to === 'accepted' && (
          <fieldset className="space-y-2">
            <legend className={`${labelClass} mb-1.5`}>What did they buy? <span className="text-red-500">*</span></legend>
            {([
              ['bot', Bot, 'A bot service', 'Add them in the Partner admin panel. They appear under Onboarded Clients by themselves.'],
              ['client', Building2, 'Another service', 'Added to Clients now, with their contact details and requirement.'],
            ] as const).map(([value, Icon, title, desc]) => (
              <label key={value} className={`flex gap-3 rounded-xl border p-3 cursor-pointer ${acceptAs === value ? 'border-blue-500/60 bg-blue-500/5' : 'border-border hover:bg-muted/50'}`}>
                <input type="radio" name="accept-as" value={value} checked={acceptAs === value} onChange={() => setAcceptAs(value)} className="mt-1" />
                <Icon className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-foreground">{title}</span>
                  <span className="block text-[11px] text-muted-foreground">{desc}</span>
                </span>
              </label>
            ))}
          </fieldset>
        )}
        {!editOnly && to !== 'rejected' && to !== 'accepted' && (
          <div className="space-y-1.5">
            <label htmlFor="st-follow" className={labelClass}>Next follow-up</label>
            <input id="st-follow" type="datetime-local" autoFocus={to !== 'requirement'} value={followUp} onChange={(e) => setFollowUp(e.target.value)} className={inputClass} />
          </div>
        )}
        {!editOnly && followsUpAutomatically(to) && <AutoFollowUpBox checked={autoFollowUp} onChange={setAutoFollowUp} sent={lead.autoFollowUpsSent} />}
        {tried && problem && <p className="text-xs text-red-500">{problem}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className={secondaryButton}>Cancel</button>
          <button type="submit" disabled={save.isPending} className={primaryButton}>
            {save.isPending && <Loader2 className="w-4 h-4 animate-spin" />} {editOnly ? 'Save' : `Move to ${STAGE_LABELS[to]}`}
          </button>
        </div>
      </form>
    </Modal>
  );
};

/** A new proposal version; when opened from a move to Proposal sent it moves the lead too */
const ProposalDialog: React.FC<{ lead: { id: string; name: string }; moveAfter: boolean; onClose: () => void; onDone: () => void }> = ({ lead, moveAfter, onClose, onDone }) => {
  const { toast } = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [send, setSend] = useState(moveAfter);
  const [tried, setTried] = useState(false);
  const showResult = useWhatsAppToast();
  const problem = !file && !amount ? 'Attach the proposal file or enter the amount'
    : amount && !(Number(amount) >= 0) ? 'Enter the amount in rupees, e.g. 45000' : '';

  const save = useMutation({
    mutationFn: async () => {
      const list = await leadsApi.addProposal(lead.id, { file, amount: amount ? Number(amount) : null, note: note.trim() || null });
      const whatsapp = !!file && send;
      if (moveAfter) return (await leadsApi.moveStage(lead.id, { stage: 'proposal', sendWhatsApp: whatsapp })).whatsapp;
      return whatsapp ? leadsApi.sendProposal(lead.id, list[0].id) : undefined;
    },
    onSuccess: (whatsapp) => {
      toast.success(moveAfter ? `Proposal added and ${lead.name} moved to Proposal sent.` : 'Proposal added.', 'Leads');
      showResult(lead.name, whatsapp);
      onDone();
    },
    onError: (err) => toast.error(apiError(err, 'Could not add the proposal.'), 'Leads'),
  });
  const pick = (list: FileList | null) => {
    const f = list?.[0] ?? null;
    if (fileInput.current) fileInput.current.value = '';
    if (f && f.size > MAX_BYTES) return toast.error(`"${f.name}" is larger than 15 MB.`, 'Leads');
    setFile(f);
  };

  return (
    <Modal title={moveAfter ? `${lead.name} → Proposal sent` : `New proposal for ${lead.name}`} onClose={onClose} narrow>
      <form noValidate onSubmit={(e) => { e.preventDefault(); setTried(true); if (!problem) save.mutate(); }} className="space-y-3">
        <input ref={fileInput} type="file" hidden onChange={(e) => pick(e.target.files)} accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg" />
        {file ? (
          <div className="flex items-center gap-3 rounded-xl border border-border px-3 py-2.5">
            <FileText className="w-4 h-4 text-red-500 shrink-0" />
            <span className="min-w-0 flex-1 text-sm font-semibold truncate">{file.name}</span>
            <span className="text-[11px] text-muted-foreground">{fileSize(file.size)}</span>
            <button type="button" aria-label="Remove file" onClick={() => setFile(null)} className="p-1 rounded-lg text-muted-foreground hover:bg-muted cursor-pointer"><X className="w-3.5 h-3.5" /></button>
          </div>
        ) : (
          <button type="button" onClick={() => fileInput.current?.click()}
            className="w-full flex items-center justify-center gap-2 px-4 py-4 rounded-xl border-2 border-dashed border-border text-sm font-semibold text-muted-foreground hover:text-foreground hover:border-blue-500/40 hover:bg-blue-500/5 cursor-pointer">
            <Upload className="w-4 h-4" /> Attach the proposal (PDF, Word…) · up to 15 MB
          </button>
        )}
        <div className="space-y-1.5">
          <label htmlFor="pr-amount" className={labelClass}>Amount (₹)</label>
          <input id="pr-amount" type="number" min={0} step={1} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 45000" className={inputClass} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="pr-note" className={labelClass}>Note</label>
          <input id="pr-note" value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Includes 1 year AMC; mailed on 3 Nov" className={inputClass} />
        </div>
        <label className={`flex items-start gap-2.5 rounded-xl border border-border p-3 ${file ? 'cursor-pointer' : 'opacity-60'}`}>
          <input type="checkbox" checked={!!file && send} disabled={!file} onChange={(e) => setSend(e.target.checked)} className="mt-0.5" />
          <span className="text-sm">
            <span className="font-semibold text-foreground flex items-center gap-1.5"><MessageCircle className="w-4 h-4 text-emerald-600" /> Send it to {lead.name} on WhatsApp</span>
            <span className="block text-[11px] text-muted-foreground">{file ? 'The proposal file goes with a short message saying it was emailed (no amount).' : 'Attach the proposal file to send it on WhatsApp.'}</span>
          </span>
        </label>
        {tried && problem && <p className="text-xs text-red-500">{problem}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className={secondaryButton}>Cancel</button>
          <button type="submit" disabled={save.isPending} className={primaryButton}>
            {save.isPending && <Loader2 className="w-4 h-4 animate-spin" />} {moveAfter ? 'Save and move' : 'Add proposal'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

/** Proposal sent when a proposal is already there: move, and choose whether WhatsApp sends it to the client */
const SendDialog: React.FC<{ move: Move; latest: { version: number; hasFile: boolean }; onClose: () => void; onMoved: () => void }> = ({ move, latest, onClose, onMoved }) => {
  const { toast } = useToast();
  const showResult = useWhatsAppToast();
  const [send, setSend] = useState(latest.hasFile);
  const save = useMutation({
    mutationFn: () => leadsApi.moveStage(move.lead.id, { stage: 'proposal', sendWhatsApp: latest.hasFile && send }),
    onSuccess: (l) => { toast.success(`${move.lead.name} moved to Proposal sent.`, 'Leads'); showResult(move.lead.name, l.whatsapp); onMoved(); },
    onError: (err) => toast.error(apiError(err, 'Could not move the lead.'), 'Leads'),
  });
  return (
    <Modal title={`${move.lead.name} → Proposal sent`} onClose={onClose} narrow>
      <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-3">
        <label className={`flex items-start gap-2.5 rounded-xl border border-border p-3 ${latest.hasFile ? 'cursor-pointer' : 'opacity-60'}`}>
          <input type="checkbox" checked={latest.hasFile && send} disabled={!latest.hasFile} onChange={(e) => setSend(e.target.checked)} className="mt-0.5" />
          <span className="text-sm">
            <span className="font-semibold text-foreground flex items-center gap-1.5"><MessageCircle className="w-4 h-4 text-emerald-600" /> Send proposal v{latest.version} to {move.lead.name} on WhatsApp</span>
            <span className="block text-[11px] text-muted-foreground">{latest.hasFile ? 'The proposal file goes with a short message saying it was emailed (no amount).' : 'This proposal has no file. Add a new version with the file to send it on WhatsApp.'}</span>
          </span>
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className={secondaryButton}>Cancel</button>
          <button type="submit" disabled={save.isPending} className={primaryButton}>
            {save.isPending && <Loader2 className="w-4 h-4 animate-spin" />} {latest.hasFile && send ? 'Move and send' : 'Move'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

/** Decides what a move needs: a dialog, or nothing */
function useStageMover(onMoved: () => void) {
  const { toast } = useToast();
  const [dialog, setDialog] = useState<{ kind: 'stage' | 'proposal' | 'send'; move: Move; latest?: LatestProposal } | null>(null);
  const direct = useMutation({
    mutationFn: (m: Move) => leadsApi.moveStage(m.lead.id, { stage: m.to }),
    onSuccess: (_d, m) => { toast.success(`${m.lead.name} moved to ${STAGE_LABELS[m.to]}.`, 'Leads'); onMoved(); },
    onError: (err, m) => {
      if (apiCode(err) === 'needs_proposal') return setDialog({ kind: 'proposal', move: m });
      if (apiCode(err) === 'needs_requirement') return setDialog({ kind: 'stage', move: m });
      toast.error(apiError(err, 'Could not move the lead.'), 'Leads');
    },
  });
  const request = (m: Move, latest: LatestProposal) => {
    if (m.lead.stage === m.to) return;
    if (m.to === 'requirement' || m.to === 'rejected' || m.to === 'follow_up' || m.to === 'accepted') return setDialog({ kind: 'stage', move: m });
    if (m.to === 'proposal') return setDialog(latest ? { kind: 'send', move: m, latest } : { kind: 'proposal', move: m });
    direct.mutate(m);
  };
  const close = () => setDialog(null);
  const done = () => { setDialog(null); onMoved(); };
  const element = dialog?.kind === 'stage' ? <StageDialog move={dialog.move} onClose={close} onMoved={done} />
    : dialog?.kind === 'proposal' ? <ProposalDialog lead={dialog.move.lead} moveAfter onClose={close} onDone={done} />
      : dialog?.kind === 'send' && dialog.latest ? <SendDialog move={dialog.move} latest={dialog.latest} onClose={close} onMoved={done} /> : null;
  return { request, element, pending: direct.isPending };
}

// ─── Board ──────────────────────────────────────────────────────────────────────

const LeadCard: React.FC<{ lead: LeadSummary; draggable: boolean; onOpen: () => void }> = ({ lead, draggable, onOpen }) => {
  const overdue = isOverdue(lead);
  const value = lead.proposalAmount ?? lead.expectedValue;
  return (
    <button
      type="button" draggable={draggable} onClick={onOpen}
      onDragStart={(e) => { e.dataTransfer.setData('text/lead', lead.id); e.dataTransfer.effectAllowed = 'move'; }}
      className={`w-full text-left rounded-xl border bg-card p-3 space-y-1.5 hover:border-blue-500/40 hover:shadow-sm cursor-pointer ${overdue ? 'border-red-500/40' : 'border-border'} ${draggable ? 'active:cursor-grabbing' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-foreground leading-snug break-words">{lead.name}</p>
        {value && <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 whitespace-nowrap">{rupees(value)}</span>}
      </div>
      {(lead.company || lead.service) && <p className="text-[11px] text-muted-foreground truncate">{[lead.company, lead.service].filter(Boolean).join(' · ')}</p>}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1"><User className="w-3 h-3" />{lead.ownerName ?? 'No owner'}</span>
        {lead.proposalVersion && <span className="flex items-center gap-1"><FileText className="w-3 h-3" />v{lead.proposalVersion}</span>}
        {followsUpAutomatically(lead.stage) && lead.autoFollowUp && lead.proposalVersion && (
          <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400" title="Automatic WhatsApp follow-ups to the client">
            <MessageCircle className="w-3 h-3" />{Math.min(lead.autoFollowUpsSent, AUTO_FOLLOW_UPS)}/{AUTO_FOLLOW_UPS}
          </span>
        )}
        {lead.stage === 'rejected' && lead.rejectReason && <span>{REJECT_LABELS[lead.rejectReason]}</span>}
      </div>
      {lead.nextFollowUpAt && lead.stage !== 'accepted' && lead.stage !== 'rejected' ? (
        <p className={`text-[11px] font-semibold flex items-center gap-1 ${overdue ? 'text-red-600 dark:text-red-400' : 'text-amber-700 dark:text-amber-400'}`}>
          <CalendarClock className="w-3 h-3" /> {overdue ? 'Overdue · ' : ''}{shortWhen(lead.nextFollowUpAt)}
        </p>
      ) : (
        <p className="text-[11px] text-muted-foreground">{daysSince(lead.stageChangedAt) === 0 ? 'Moved here today' : `${daysSince(lead.stageChangedAt)} d in this stage`}</p>
      )}
    </button>
  );
};

const dangerButton = 'flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-red-500/30 text-sm font-semibold text-red-600 dark:text-red-400 hover:bg-red-500/10 disabled:opacity-50 cursor-pointer';

/** Asks first, then permanently deletes an archived lead */
const useDeleteLead = (onDone: () => void) => {
  const { toast } = useToast();
  const confirm = useConfirm();
  const del = useMutation({
    mutationFn: (id: string) => leadsApi.remove(id),
    onSuccess: () => { toast.success('Lead deleted.', 'Leads'); onDone(); },
    onError: (err) => toast.error(apiError(err, 'Could not delete the lead.'), 'Leads'),
  });
  const ask = async (lead: { id: string; name: string }) => {
    if (await confirm({
      title: `Delete ${lead.name} permanently?`,
      message: 'The lead, its notes, history and proposal files are removed for good. This cannot be undone.',
      confirmLabel: 'Delete permanently', cancelLabel: 'Keep it', variant: 'danger',
    })) del.mutate(lead.id);
  };
  return { ask, pending: del.isPending, deletingId: del.isPending ? del.variables : null };
};

const ArchivedLeads: React.FC<{ leads: LeadSummary[]; isAdmin: boolean; filtered: boolean; onChanged: () => void }> = ({ leads, isAdmin, filtered, onChanged }) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const remover = useDeleteLead(onChanged);
  const restore = useMutation({
    mutationFn: (id: string) => leadsApi.restore(id),
    onSuccess: (l) => { toast.success(`${l.name} is back on the board.`, 'Leads'); onChanged(); },
    onError: (err) => toast.error(apiError(err, 'Could not restore the lead.'), 'Leads'),
  });
  if (leads.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
        <Archive className="w-6 h-6 mx-auto mb-2 opacity-60" />
        {filtered ? 'No archived leads match.' : 'No archived leads. Leads you archive appear here.'}
      </div>
    );
  }
  return (
    <ul className="rounded-2xl border border-border bg-card divide-y divide-border">
      {leads.map((l) => (
        <li key={l.id} className="p-3 sm:px-4 flex flex-wrap sm:flex-nowrap items-center gap-x-4 gap-y-2">
          <button type="button" onClick={() => navigate(`/leads/${l.id}`)} className="min-w-0 flex-1 text-left cursor-pointer group">
            <p className="text-sm font-semibold text-foreground truncate group-hover:underline">{l.name}{l.company ? <span className="font-normal text-muted-foreground"> · {l.company}</span> : null}</p>
            <p className="text-xs text-muted-foreground truncate">{formatPhone(l.phone)}{l.service ? ` · ${l.service}` : ''}</p>
          </button>
          <StageBadge stage={l.stage} />
          <p className="text-xs text-muted-foreground sm:w-52 shrink-0">
            Archived {when(l.archivedAt)}{l.archivedByName ? <><br />by {l.archivedByName}</> : null}
          </p>
          {isAdmin && (
            <div className="flex gap-2 shrink-0">
              <button type="button" disabled={restore.isPending} onClick={() => restore.mutate(l.id)} className={`${secondaryButton} !px-3 !py-1.5 !text-xs`}>
                <ArchiveRestore className="w-3.5 h-3.5" /> Restore
              </button>
              <button type="button" disabled={remover.pending} onClick={() => remover.ask(l)} aria-label={`Delete ${l.name} permanently`} className={`${dangerButton} !px-3 !py-1.5 !text-xs`}>
                {remover.deletingId === l.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />} Delete
              </button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
};

const LeadsBoard: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [adding, setAdding] = useState(false);
  const [over, setOver] = useState<LeadStage | null>(null);
  // ?view=archived shows the archived leads instead of the board (kept in the address, so Back returns here)
  const [params, setParams] = useSearchParams();
  const showArchived = params.get('view') === 'archived';
  const setShowArchived = (on: boolean) => setParams(on ? { view: 'archived' } : {}, { replace: true });

  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const filter: LeadFilter = { q, ownerId, archived: showArchived };
  const { data, isLoading, isError, error, isFetching } = useQuery({ queryKey: ['leads', 'list', filter], queryFn: () => leadsApi.list(filter), placeholderData: (prev) => prev });
  const { data: people = [] } = useQuery({ queryKey: ['leads', 'people'], queryFn: leadsApi.people, staleTime: 60_000 });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['leads'] });
  const mover = useStageMover(refresh);

  const leads = useMemo(() => data?.data ?? [], [data]);
  const canManage = !!data?.canManage;
  const columns = useMemo(() => {
    const by = new Map<LeadStage, LeadSummary[]>(LEAD_STAGES.map((s) => [s, []]));
    leads.forEach((l) => by.get(l.stage)?.push(l));
    // Overdue and soonest follow-ups first, then the longest waiting
    by.forEach((list) => list.sort((a, b) => {
      const fa = a.nextFollowUpAt ? new Date(a.nextFollowUpAt).getTime() : Infinity;
      const fb = b.nextFollowUpAt ? new Date(b.nextFollowUpAt).getTime() : Infinity;
      return fa !== fb ? fa - fb : new Date(a.stageChangedAt).getTime() - new Date(b.stageChangedAt).getTime();
    }));
    return by;
  }, [leads]);
  const open = leads.filter((l) => l.stage !== 'accepted' && l.stage !== 'rejected');
  const overdueCount = open.filter(isOverdue).length;
  const pipeline = open.reduce((sum, l) => sum + Number(l.proposalAmount ?? l.expectedValue ?? 0), 0);

  const drop = (stage: LeadStage, e: React.DragEvent) => {
    e.preventDefault();
    setOver(null);
    const lead = leads.find((l) => l.id === e.dataTransfer.getData('text/lead'));
    if (lead) mover.request({ lead, to: stage }, lead.proposalVersion ? { version: lead.proposalVersion, hasFile: lead.proposalHasFile } : null);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="p-2 rounded-xl bg-blue-500/10 text-blue-500 border border-blue-500/20"><Target className="w-5 h-5" /></span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{showArchived ? 'Archived leads' : 'Leads'}</h1>
            <p className="text-xs text-muted-foreground mt-1">
              {showArchived ? <>{leads.length} archived · hidden from the board and the pipeline</> : <>{open.length} open · {rupees(pipeline) || '₹0'} in the pipeline{overdueCount ? <> · <span className="text-red-600 dark:text-red-400 font-semibold">{overdueCount} follow-up{overdueCount === 1 ? '' : 's'} overdue</span></> : ''}
              {canManage ? ' · Drag a card to move it.' : ''}</>}
            </p>
          </div>
        </div>
        {canManage && !showArchived && <button type="button" onClick={() => setAdding(true)} className={primaryButton}><Plus className="w-4 h-4" /> Add lead</button>}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <label htmlFor="ld-search" className="sr-only">Search leads</label>
          <input id="ld-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, company, phone, city or service" className={`${inputClass} pl-9`} />
          {isFetching && !isLoading && <Loader2 className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />}
        </div>
        <select aria-label="Owner" value={ownerId} onChange={(e) => setOwnerId(e.target.value)} className={`${inputClass} sm:w-56 [&>option]:bg-background`}>
          <option value="">All owners</option>
          <option value="none">No owner</option>
          {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button
          type="button" aria-pressed={showArchived} onClick={() => setShowArchived(!showArchived)}
          className={`${secondaryButton} shrink-0 ${showArchived ? 'bg-amber-500/10 border-amber-500/40 text-amber-700 dark:text-amber-400' : ''}`}
        >
          {showArchived ? <><Target className="w-4 h-4" /> Back to board</> : <><Archive className="w-4 h-4" /> Archived</>}
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-10"><Loader2 className="w-5 h-5 animate-spin text-blue-500" /></div>
      ) : isError ? (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-600 flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> {apiError(error, 'Could not load leads.')}</div>
      ) : showArchived ? (
        <ArchivedLeads leads={leads} isAdmin={!!data?.isAdmin} filtered={!!(q || ownerId)} onChanged={refresh} />
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-3 -mx-1 px-1 snap-x">
          {LEAD_STAGES.map((stage) => {
            const list = columns.get(stage) ?? [];
            const total = list.reduce((sum, l) => sum + Number(l.proposalAmount ?? l.expectedValue ?? 0), 0);
            return (
              <section
                key={stage} aria-label={STAGE_LABELS[stage]}
                onDragOver={canManage ? (e) => { e.preventDefault(); setOver(stage); } : undefined}
                onDragLeave={() => setOver((s) => (s === stage ? null : s))}
                onDrop={canManage ? (e) => drop(stage, e) : undefined}
                className={`snap-start shrink-0 w-[17rem] rounded-2xl border p-2.5 flex flex-col gap-2 max-h-[calc(100vh-15rem)] ${over === stage ? 'border-blue-500/60 bg-blue-500/5' : 'border-border bg-muted/30'}`}
              >
                <div className="flex items-center justify-between gap-2 px-1">
                  <h2 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${STAGE_TONES[stage].dot}`} /> {STAGE_LABELS[stage]}
                    <span className="text-muted-foreground font-semibold">{list.length}</span>
                  </h2>
                  {total > 0 && <span className="text-[11px] font-semibold text-muted-foreground">{rupees(total)}</span>}
                </div>
                <div className="flex flex-col gap-2 overflow-y-auto min-h-[4rem]">
                  {list.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground text-center py-4">{stage === 'new' && canManage && !q && !ownerId ? 'Add a lead to start' : 'Nothing here'}</p>
                  ) : list.map((l) => <LeadCard key={l.id} lead={l} draggable={canManage} onOpen={() => navigate(`/leads/${l.id}`)} />)}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {adding && <LeadForm onClose={() => setAdding(false)} onSaved={(l) => { setAdding(false); refresh(); navigate(`/leads/${l.id}`); }} />}
      {mover.element}
    </div>
  );
};

// ─── Lead page ──────────────────────────────────────────────────────────────────

const ActivityIcon: React.FC<{ kind: LeadActivity['kind'] }> = ({ kind }) => {
  const Icon = kind === 'note' ? StickyNote : kind === 'stage' ? ArrowRight : kind === 'proposal' ? FileText : kind === 'whatsapp' ? MessageCircle : kind === 'email' ? Mail : kind === 'client' ? Building2 : kind === 'archived' ? Archive : kind === 'restored' ? ArchiveRestore : kind === 'created' ? Plus : Pencil;
  const tone = kind === 'note' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' : kind === 'stage' ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400' : kind === 'proposal' ? 'bg-violet-500/10 text-violet-600 dark:text-violet-400' : kind === 'email' ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400' : kind === 'whatsapp' || kind === 'client' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-muted text-muted-foreground';
  return <span className={`w-7 h-7 shrink-0 rounded-lg flex items-center justify-center ${tone}`}><Icon className="w-3.5 h-3.5" /></span>;
};

const ActivityPanel: React.FC<{ leadId: string; archived: boolean }> = ({ leadId, archived }) => {
  const { toast } = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  const [older, setOlder] = useState<LeadActivity[]>([]);
  const [hasMoreOlder, setHasMoreOlder] = useState<boolean | null>(null);
  const key = ['leads', 'activity', leadId];
  const { data, isLoading } = useQuery({ queryKey: key, queryFn: () => leadsApi.activity(leadId) });
  const items = [...(data?.items ?? []), ...older];
  const hasMore = hasMoreOlder ?? data?.hasMore ?? false;

  const add = useMutation({
    mutationFn: () => leadsApi.addNote(leadId, draft.trim()),
    onSuccess: () => { setDraft(''); queryClient.invalidateQueries({ queryKey: key }); },
    onError: (err) => toast.error(apiError(err, 'Could not add the note.'), 'Leads'),
  });
  const remove = useMutation({
    mutationFn: (noteId: string) => leadsApi.deleteNote(leadId, noteId),
    onSuccess: (_d, noteId) => { setOlder((o) => o.filter((a) => a.id !== noteId)); queryClient.invalidateQueries({ queryKey: key }); },
    onError: (err) => toast.error(apiError(err, 'Could not delete the note.'), 'Leads'),
  });
  const loadOlder = async () => {
    const last = items[items.length - 1];
    if (!last) return;
    try {
      const page = await leadsApi.activity(leadId, last.createdAt);
      setOlder((o) => [...o, ...page.items]);
      setHasMoreOlder(page.hasMore);
    } catch (err) {
      toast.error(apiError(err, 'Could not load older activity.'), 'Leads');
    }
  };

  return (
    <div className="space-y-4">
      {!archived && (
        <form onSubmit={(e) => { e.preventDefault(); if (draft.trim()) add.mutate(); }} className="space-y-2">
          <label htmlFor="ld-note" className="sr-only">Add a note</label>
          <textarea
            id="ld-note" rows={2} value={draft} maxLength={4000} onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && draft.trim()) add.mutate(); }}
            placeholder="Add a note: a call, a meeting, what the client said…"
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
                  <span className="font-semibold text-foreground">{a.actorName ?? (a.meta?.auto ? 'Work OS' : 'Someone')}</span>
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

const ProposalsPanel: React.FC<{ lead: LeadDetail; canManage: boolean; onChanged: () => void }> = ({ lead, canManage, onChanged }) => {
  const { toast } = useToast();
  const confirm = useConfirm();
  const showResult = useWhatsAppToast();
  const [adding, setAdding] = useState(false);
  const { data: proposals = [], isLoading } = useQuery({ queryKey: ['leads', 'proposals', lead.id], queryFn: () => leadsApi.proposals(lead.id) });
  const send = useMutation({
    mutationFn: (proposalId: string) => leadsApi.sendProposal(lead.id, proposalId),
    onSuccess: (r) => { showResult(lead.name, r); onChanged(); },
    onError: (err) => toast.error(apiError(err, 'Could not send the proposal.'), 'Leads'),
  });
  const open = async (proposalId: string) => {
    const tab = window.open('', '_blank');
    try {
      const url = await leadsApi.proposalUrl(lead.id, proposalId);
      if (tab) tab.location.href = url; else window.location.assign(url);
    } catch (err) {
      tab?.close();
      toast.error(apiError(err, 'Could not open the proposal.'), 'Leads');
    }
  };
  return (
    <section aria-label="Proposals" className="rounded-2xl border border-border bg-card p-5 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-foreground flex items-center gap-2"><FileText className="w-4 h-4 text-violet-500" /> Proposals <span className="text-xs font-semibold text-muted-foreground">{proposals.length}</span></h2>
        {canManage && <button type="button" onClick={() => setAdding(true)} className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> New version</button>}
      </div>
      {isLoading ? (
        <div className="flex justify-center p-4"><Loader2 className="w-4 h-4 animate-spin text-blue-500" /></div>
      ) : proposals.length === 0 ? (
        <p className="text-xs text-muted-foreground">No proposal yet. Moving the lead to Proposal sent asks for it.</p>
      ) : (
        <ul className="divide-y divide-border -mx-1">
          {proposals.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-1 py-2.5">
              <span className="w-8 h-8 shrink-0 rounded-lg bg-violet-500/10 text-violet-700 dark:text-violet-400 text-xs font-bold flex items-center justify-center">v{p.version}</span>
              <div className="min-w-0 flex-1">
                {p.file ? (
                  <button type="button" onClick={() => open(p.id)} className="text-sm font-semibold text-foreground truncate hover:underline cursor-pointer block max-w-full text-left">{p.file.name}</button>
                ) : <p className="text-sm font-semibold text-foreground">No file</p>}
                <p className="text-[11px] text-muted-foreground truncate">{[p.createdByName, ago(p.createdAt), p.note].filter(Boolean).join(' · ')}</p>
                {p.whatsappSentAt ? (
                  <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Sent on WhatsApp {ago(p.whatsappSentAt)}</p>
                ) : p.whatsappError ? (
                  <p className="text-[11px] font-semibold text-red-600 dark:text-red-400 truncate" title={p.whatsappError}>WhatsApp failed: {p.whatsappError}</p>
                ) : null}
                {canManage && p.file && (
                  <button type="button" disabled={send.isPending}
                    onClick={async () => { if (await confirm({ title: `Send proposal v${p.version} on WhatsApp?`, message: `${lead.name} gets the file with a short message saying it was emailed.`, confirmLabel: 'Send' })) send.mutate(p.id); }}
                    className="mt-0.5 text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer disabled:opacity-50 flex items-center gap-1">
                    <MessageCircle className="w-3 h-3" /> {p.whatsappSentAt ? 'Send again' : 'Send on WhatsApp'}
                  </button>
                )}
              </div>
              {p.amount && <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400 whitespace-nowrap">{rupees(p.amount)}</span>}
            </li>
          ))}
        </ul>
      )}
      {adding && <ProposalDialog lead={lead} moveAfter={false} onClose={() => setAdding(false)} onDone={() => { setAdding(false); onChanged(); }} />}
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

const NEXT_STAGE: Partial<Record<LeadStage, LeadStage>> = { new: 'contacted', contacted: 'requirement', requirement: 'proposal', proposal: 'follow_up', follow_up: 'accepted' };

const LeadProfile: React.FC<{ id: string }> = ({ id }) => {
  const { toast } = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [editingRequirement, setEditingRequirement] = useState(false);
  const { data, isLoading, isError, error } = useQuery({ queryKey: ['leads', 'detail', id], queryFn: () => leadsApi.get(id) });
  const { data: proposals = [] } = useQuery({ queryKey: ['leads', 'proposals', id], queryFn: () => leadsApi.proposals(id) });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['leads'] });
  const mover = useStageMover(refresh);
  const archive = useMutation({
    mutationFn: () => leadsApi.archive(id),
    onSuccess: () => { toast.success('Lead archived.', 'Leads'); refresh(); navigate('/leads'); },
    onError: (err) => toast.error(apiError(err, 'Could not archive the lead.'), 'Leads'),
  });
  const toggleAuto = useMutation({
    mutationFn: (on: boolean) => leadsApi.update(id, { autoFollowUp: on }),
    onSuccess: (l) => { toast.success(l.autoFollowUp ? 'Automatic follow-ups are on.' : 'Automatic follow-ups are off.', 'Leads'); refresh(); },
    onError: (err) => toast.error(apiError(err, 'Could not change automatic follow-ups.'), 'Leads'),
  });
  const remover = useDeleteLead(() => { refresh(); navigate('/leads?view=archived'); });
  const restore = useMutation({
    mutationFn: () => leadsApi.restore(id),
    onSuccess: () => { toast.success('Lead restored.', 'Leads'); refresh(); },
    onError: (err) => toast.error(apiError(err, 'Could not restore the lead.'), 'Leads'),
  });

  if (isLoading) return <div className="flex justify-center p-10"><Loader2 className="w-5 h-5 animate-spin text-blue-500" /></div>;
  if (isError || !data) {
    return (
      <div className="space-y-4 max-w-5xl">
        <Link to="/leads" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"><ArrowLeft className="w-4 h-4" /> All leads</Link>
        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-600 flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> {apiError(error, 'Could not load this lead.')}</div>
      </div>
    );
  }
  const l = data.data;
  const archived = !!l.archivedAt;
  const canManage = data.canManage && !archived;
  const next = NEXT_STAGE[l.stage];
  const move = (to: LeadStage) => mover.request({ lead: l, to }, proposals[0] ? { version: proposals[0].version, hasFile: !!proposals[0].file } : null);
  const overdue = isOverdue(l);

  return (
    <div className="space-y-5 max-w-5xl">
      <Link to={archived ? '/leads?view=archived' : '/leads'} className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"><ArrowLeft className="w-4 h-4" /> {archived ? 'Archived leads' : 'All leads'}</Link>

      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <div className="flex flex-wrap items-start gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground break-words">{l.name}</h1>
              <StageBadge stage={l.stage} />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {[l.company, l.service, SOURCE_LABELS[l.source]].filter(Boolean).join(' · ')}
              {l.createdByName && <> · Added by {l.createdByName} {ago(l.createdAt)}</>}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 w-full sm:w-auto">
            <a href={`https://wa.me/${l.phone}`} target="_blank" rel="noreferrer" className={secondaryButton}><MessageCircle className="w-4 h-4 text-emerald-600" /> WhatsApp</a>
            <a href={`tel:+${l.phone}`} className={secondaryButton}><Phone className="w-4 h-4" /> Call</a>
            {canManage && <button type="button" onClick={() => setEditing(true)} className={secondaryButton}><Pencil className="w-4 h-4" /> Edit</button>}
          </div>
        </div>

        {/* Where the lead is, and the next step */}
        <ol className="flex flex-wrap gap-1.5" aria-label="Stages">
          {LEAD_STAGES.map((s) => (
            <li key={s}>
              <button
                type="button" disabled={!canManage || s === l.stage || mover.pending} onClick={() => move(s)}
                title={canManage && s !== l.stage ? `Move to ${STAGE_LABELS[s]}` : undefined}
                className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold ${s === l.stage ? STAGE_TONES[s].badge : 'border-border text-muted-foreground'} ${canManage && s !== l.stage ? 'hover:bg-muted hover:text-foreground cursor-pointer' : ''}`}
              >
                {STAGE_LABELS[s]}
              </button>
            </li>
          ))}
        </ol>
        {canManage && (next || l.stage === 'follow_up') && (
          <div className="flex flex-wrap gap-2">
            {next && <button type="button" disabled={mover.pending} onClick={() => move(next)} className={primaryButton}><ArrowRight className="w-4 h-4" /> Move to {STAGE_LABELS[next]}</button>}
            {(l.stage === 'proposal' || l.stage === 'follow_up') && (
              <button type="button" disabled={mover.pending} onClick={() => move('rejected')} className={secondaryButton}>Rejected</button>
            )}
          </div>
        )}
      </div>

      {archived && (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-700 dark:text-red-400 flex flex-wrap items-center justify-between gap-3">
          <span className="flex items-center gap-2"><Archive className="w-4 h-4" /> Archived on {when(l.archivedAt)}. It is hidden from the board.</span>
          {data.isAdmin && (
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={restore.isPending} onClick={() => restore.mutate()} className={secondaryButton}><ArchiveRestore className="w-4 h-4" /> Restore</button>
              <button type="button" disabled={remover.pending} onClick={() => remover.ask(l)} className={dangerButton}>
                {remover.pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Delete permanently
              </button>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] gap-5 items-start">
        <div className="space-y-5">
          <section aria-label="Lead details" className="rounded-2xl border border-border bg-card p-5 space-y-4">
            <Detail icon={Phone} label="WhatsApp"><a href={`https://wa.me/${l.phone}`} target="_blank" rel="noreferrer" className="hover:underline">{formatPhone(l.phone)}</a></Detail>
            {l.email && <Detail icon={Mail} label="Email"><a href={`mailto:${l.email}`} className="hover:underline">{l.email}</a></Detail>}
            {l.company && <Detail icon={Building2} label="Company">{l.company}</Detail>}
            {l.city && <Detail icon={MapPin} label="City">{l.city}</Detail>}
            <Detail icon={User} label="Owner">{l.ownerName ?? <span className="text-muted-foreground">Nobody yet</span>}</Detail>
            {l.expectedValue && <Detail icon={IndianRupee} label="Expected value">{rupees(l.expectedValue)}</Detail>}
            {l.stage !== 'accepted' && l.stage !== 'rejected' && (
              <Detail icon={CalendarClock} label="Next follow-up">
                {l.nextFollowUpAt ? <span className={overdue ? 'text-red-600 dark:text-red-400 font-semibold' : ''}>{overdue ? 'Overdue · ' : ''}{when(l.nextFollowUpAt)}</span> : <span className="text-muted-foreground">Not set</span>}
              </Detail>
            )}
            {followsUpAutomatically(l.stage) && (
              <Detail icon={MessageCircle} label="Automatic WhatsApp follow-ups">
                <span>
                  {!l.autoFollowUp ? 'Off' : l.autoFollowUpsSent >= AUTO_FOLLOW_UPS ? `All ${AUTO_FOLLOW_UPS} sent` : `On · ${l.autoFollowUpsSent} of ${AUTO_FOLLOW_UPS} sent${l.nextFollowUpAt ? ', next at the follow-up time' : ', set a follow-up time'}`}
                </span>
                {canManage && (
                  <button type="button" disabled={toggleAuto.isPending} onClick={() => toggleAuto.mutate(!l.autoFollowUp)}
                    className="ml-2 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer disabled:opacity-50">
                    {l.autoFollowUp ? 'Turn off' : 'Turn on'}
                  </button>
                )}
              </Detail>
            )}
            {l.stage === 'accepted' && (l.clientId || l.acceptedAs === 'bot') && (
              <Detail icon={l.acceptedAs === 'bot' ? Bot : Building2} label="Client">
                {l.clientId ? <Link to={`/clients/${l.clientId}`} className="font-semibold text-blue-600 dark:text-blue-400 hover:underline">Open in Clients</Link>
                  : <span>Bot client: added through the Partner admin panel (Onboarded Clients)</span>}
              </Detail>
            )}
            {l.stage === 'rejected' && l.rejectReason && (
              <Detail icon={X} label="Rejected because">{REJECT_LABELS[l.rejectReason]}{l.rejectNote && <span className="block text-muted-foreground whitespace-pre-wrap">{l.rejectNote}</span>}</Detail>
            )}
            {l.notes && <Detail icon={StickyNote} label="About"><span className="whitespace-pre-wrap">{l.notes}</span></Detail>}
            <p className="text-[11px] text-muted-foreground pt-2 border-t border-border">Last changed {when(l.updatedAt)}{l.updatedByName ? ` by ${l.updatedByName}` : ''}</p>
            {data.isAdmin && !archived && (
              <button
                type="button" disabled={archive.isPending}
                onClick={async () => { if (await confirm({ title: `Archive ${l.name}?`, message: 'It will be hidden from the board. Notes and proposals are kept, and you can restore it later.', confirmLabel: 'Archive', cancelLabel: 'Keep it', variant: 'warning' })) archive.mutate(); }}
                className="text-sm font-semibold text-red-600 dark:text-red-400 hover:underline cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                <Archive className="w-4 h-4" /> Archive lead
              </button>
            )}
          </section>

          <section aria-label="Requirement" className="rounded-2xl border border-border bg-card p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-foreground flex items-center gap-2"><ClipboardList className="w-4 h-4 text-indigo-500" /> Requirement</h2>
              {canManage && l.requirement && (
                <button type="button" onClick={() => setEditingRequirement(true)}
                  className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer">Edit</button>
              )}
            </div>
            {l.requirement ? (
              <>
                <p className="text-sm text-foreground whitespace-pre-wrap break-words">{l.requirement}</p>
                {(l.budget || l.timeline) && <p className="text-xs text-muted-foreground">{[l.budget && `Budget ${l.budget}`, l.timeline && `Timeline ${l.timeline}`].filter(Boolean).join(' · ')}</p>}
              </>
            ) : <p className="text-xs text-muted-foreground">Not collected yet. Moving the lead to Requirement collected asks for it.</p>}
          </section>

          <ProposalsPanel lead={l} canManage={canManage} onChanged={refresh} />
        </div>

        <section aria-label="Notes and history" className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <h2 className="text-sm font-bold text-foreground flex items-center gap-2"><Send className="w-4 h-4 text-blue-500" /> Notes & history</h2>
          <ActivityPanel leadId={l.id} archived={archived} />
        </section>
      </div>

      {editingRequirement && (
        <StageDialog editOnly move={{ lead: l, to: 'requirement' }} onClose={() => setEditingRequirement(false)} onMoved={() => { setEditingRequirement(false); refresh(); }} />
      )}
      {editing && <LeadForm initial={l} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); refresh(); }} />}
      {mover.element}
    </div>
  );
};

const LeadsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  return id ? <LeadProfile key={id} id={id} /> : <LeadsBoard />;
};

export default LeadsPage;
