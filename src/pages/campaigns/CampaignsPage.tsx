import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Loader2, Megaphone, Pause, Play, Plus, Square, Trash2, UserPlus, Users, X } from 'lucide-react';
import { useToast } from '../../components/ui/Toast';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { formatPhone } from '../../services/api/workspaceClients';
import {
  CAMPAIGN_PARAMS, PARAM_LABELS, STOP_LABELS, campaignsApi,
  type CampaignEnrolment, type CampaignParam, type CampaignSequence, type CampaignStep, type StopReason, type TemplateSet,
} from '../../services/api/campaigns';
import { DEFAULT_CATEGORIES } from '../clients/clientCategory.utils';

// ─── Campaigns ──────────────────────────────────────────────────────────────────
// A WhatsApp template sequence per category (Day 1, 3, 7, 15, 30, then monthly). Leads and Enquiry List contacts of
// that category join automatically; a reply, a button tap, conversion or opt-out stops it.

const apiError = (err: unknown, fallback: string) => (err as { response?: { data?: { error?: string } } })?.response?.data?.error || fallback;
const inputClass = 'w-full px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/40';
const primaryButton = 'flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold disabled:opacity-50 cursor-pointer';
const secondaryButton = 'flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-border text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-50 cursor-pointer';
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true }) : '—');
const DEFAULT_DAYS = [1, 3, 7, 15, 30];
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

// ── Edit a sequence ──
const SequenceForm: React.FC<{ initial: CampaignSequence | null; onClose: () => void; onSaved: () => void }> = ({ initial, onClose, onSaved }) => {
  const { toast } = useToast();
  const [category, setCategory] = useState(initial?.category ?? '');
  const [active, setActive] = useState(initial?.active ?? false);
  const [monthly, setMonthly] = useState(initial ? initial.repeatEveryDays != null : true);
  const [steps, setSteps] = useState<CampaignStep[]>(initial?.steps.length
    ? initial.steps.map((s) => ({ day: s.day, templateName: s.templateName, language: s.language, params: s.params }))
    : DEFAULT_DAYS.map((d) => ({ day: d, templateName: '', language: 'en', params: ['name'] })));
  const setStep = (i: number, patch: Partial<CampaignStep>) => setSteps((list) => list.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  // Template sets from WAAU (<set>_day1 … <set>_monthly); picking one fills in the messages
  const { data: sets = [], isLoading: setsLoading, isError: setsError } = useQuery({ queryKey: ['campaigns', 'template-sets'], queryFn: campaignsApi.templateSets, staleTime: 5 * 60_000 });
  const statusOf = useMemo(() => new Map(sets.flatMap((s) => s.steps.map((st) => [st.templateName, st.status] as const))), [sets]);
  const currentSet = useMemo(() => sets.find((s) => steps.length > 0 && steps.every((st) => s.steps.some((x) => x.templateName === st.templateName)))?.name ?? '', [sets, steps]);
  const pickSet = (name: string) => {
    const set: TemplateSet | undefined = sets.find((s) => s.name === name);
    if (!set) return;
    setSteps(set.steps.map((st) => ({ day: st.day, templateName: st.templateName, language: st.language, params: st.params })));
    setMonthly(set.hasMonthly);
  };
  // Who this category reaches (Enquiry List + open leads)
  const [debounced, setDebounced] = useState(category.trim());
  useEffect(() => { const t = setTimeout(() => setDebounced(category.trim()), 400); return () => clearTimeout(t); }, [category]);
  const { data: preview, isFetching: previewLoading } = useQuery({ queryKey: ['campaigns', 'preview', debounced], queryFn: () => campaignsApi.preview(debounced), enabled: !!debounced });
  const suggestName = (day: number) => (category.trim() ? `${slug(category)}_day${day}` : `category_day${day}`);

  const save = useMutation({
    mutationFn: () => campaignsApi.save(initial?.id ?? null, {
      category: category.trim(), active, repeatEveryDays: monthly ? 30 : null,
      steps: steps.filter((s) => s.templateName.trim()).map((s) => ({ ...s, templateName: s.templateName.trim() })),
    }),
    onSuccess: () => { toast.success('Campaign saved.', 'Campaigns'); onSaved(); },
    onError: (err) => toast.error(apiError(err, 'Could not save the campaign.'), 'Campaigns'),
  });

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/70 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Campaign" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-2xl border border-border bg-card shadow-2xl flex flex-col max-h-[calc(100dvh-2rem)]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 p-5 border-b border-border">
          <h2 className="text-base font-bold text-foreground flex items-center gap-2"><Megaphone className="w-4 h-4 text-blue-600" /> {initial ? `${initial.category} campaign` : 'New campaign'}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted cursor-pointer"><X className="w-4 h-4" /></button>
        </div>
        <form noValidate onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="flex-1 overflow-y-auto p-5 pb-0 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="cp-cat" className="text-xs font-semibold text-foreground">Category</label>
              <input id="cp-cat" list="cp-cats" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Healthcare" className={inputClass} />
              <datalist id="cp-cats">{Object.keys(DEFAULT_CATEGORIES).map((c) => <option key={c} value={c} />)}</datalist>
            </div>
            <div className="space-y-2 text-sm">
              <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="w-4 h-4" /> <span><b>On</b> — new contacts of this category join it</span></label>
              <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={monthly} onChange={(e) => setMonthly(e.target.checked)} className="w-4 h-4" /> <span>After the last message, send it again <b>every month</b></span></label>
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="cp-set" className="text-xs font-semibold text-foreground">Template set (from WAAU)</label>
            <select id="cp-set" value={currentSet} onChange={(e) => pickSet(e.target.value)} className={inputClass} disabled={setsLoading || setsError}>
              <option value="">{setsLoading ? 'Loading WAAU templates…' : setsError ? 'Could not load WAAU templates' : sets.length ? 'Choose a template set…' : 'No template sets in WAAU (name them like society_ml_day1)'}</option>
              {sets.map((s) => <option key={s.name} value={s.name}>{s.name} · {s.language === 'ml' ? 'Malayalam' : s.language === 'en' ? 'English' : s.language} · {s.approved}/{s.total} approved</option>)}
            </select>
            <p className="text-[11px] text-muted-foreground">WAAU templates named <span className="font-mono">set_day1</span>, <span className="font-mono">set_day3</span>… and <span className="font-mono">set_monthly</span> form a set. Picking one fills in the messages below.</p>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold text-foreground">Messages (approved WAAU template names)</p>
            <p className="text-[11px] text-muted-foreground">Each template should have the buttons <b>Interested</b>, <b>Not interested</b> and <b>Book a demo</b>. "Variables" fill the template's {'{{1}}, {{2}}'}… in order.</p>
            {steps.map((s, i) => (
              <div key={i} className="grid grid-cols-[4.5rem_1fr_auto] sm:grid-cols-[5rem_1fr_12rem_auto] gap-2 items-start rounded-xl border border-border p-2.5">
                <label className="text-[11px] text-muted-foreground">Day
                  <input type="number" min={1} max={365} value={s.day} onChange={(e) => setStep(i, { day: Number(e.target.value) })} className={`${inputClass} mt-0.5`} aria-label={`Day of message ${i + 1}`} />
                </label>
                <label className="text-[11px] text-muted-foreground">Template name
                  <input value={s.templateName} onChange={(e) => setStep(i, { templateName: e.target.value.toLowerCase().replace(/\s+/g, '_') })} placeholder={suggestName(s.day)} className={`${inputClass} mt-0.5 font-mono`} aria-label={`Template of message ${i + 1}`} />
                  {s.templateName && (
                    <span className={`mt-1 inline-block text-[10px] font-semibold ${statusOf.get(s.templateName) === 'APPROVED' ? 'text-emerald-700 dark:text-emerald-400' : statusOf.get(s.templateName) ? 'text-amber-700 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`}>
                      {statusOf.get(s.templateName) === 'APPROVED' ? 'Approved' : statusOf.get(s.templateName) ? `${statusOf.get(s.templateName)!.charAt(0)}${statusOf.get(s.templateName)!.slice(1).toLowerCase()} — not sent until approved` : 'Not found in WAAU'}
                      {s.language && s.language !== 'en' ? ` · ${s.language === 'ml' ? 'Malayalam' : s.language}` : ''}
                    </span>
                  )}
                </label>
                <label className="text-[11px] text-muted-foreground col-span-2 sm:col-span-1 row-start-2 sm:row-start-auto">Variables
                  <select multiple value={s.params} onChange={(e) => setStep(i, { params: [...e.target.selectedOptions].map((o) => o.value as CampaignParam) })} className={`${inputClass} mt-0.5 h-[4.5rem] text-xs`} aria-label={`Variables of message ${i + 1}`}>
                    {CAMPAIGN_PARAMS.map((p) => <option key={p} value={p}>{PARAM_LABELS[p]}</option>)}
                  </select>
                </label>
                <button type="button" onClick={() => setSteps((list) => list.filter((_, j) => j !== i))} aria-label={`Remove message ${i + 1}`} className="mt-5 p-2 rounded-lg text-muted-foreground hover:text-red-600 hover:bg-red-500/10 cursor-pointer"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
            <button type="button" onClick={() => setSteps((list) => [...list, { day: (list[list.length - 1]?.day ?? 0) + 30, templateName: '', language: 'en', params: ['name'] }])} className={secondaryButton}><Plus className="w-4 h-4" /> Add message</button>
          </div>

          {debounced && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-foreground flex items-center gap-2">
                Contacts in {debounced} {previewLoading && <Loader2 className="w-3 h-3 animate-spin" />}
              </p>
              {preview && (
                <>
                  <p className="text-[11px] text-muted-foreground">
                    {preview.total === 0
                      ? `No Enquiry List contacts or open leads have the category "${debounced}" yet. Set it on them (Clients → Enquiry List, or Leads) and they show here.`
                      : <><b className="text-foreground">{preview.willJoin}</b> of {preview.total} will get the messages ({initial ? 'new ones join automatically; use “Add existing contacts” for these' : 'after you save, turn it on and use “Add existing contacts”'}).</>}
                  </p>
                  {preview.total > 0 && (
                    <ul className="rounded-xl border border-border divide-y divide-border max-h-56 overflow-y-auto text-xs">
                      {preview.contacts.map((c) => (
                        <li key={`${c.kind}-${c.id}`} className={`px-3 py-1.5 flex flex-wrap items-center gap-x-3 ${c.skip ? 'opacity-60' : ''}`}>
                          <span className="font-semibold text-foreground min-w-0 flex-1 truncate">{c.name}{c.company ? ` · ${c.company}` : ''}</span>
                          <span className="text-muted-foreground">{c.kind === 'lead' ? 'Lead' : 'Enquiry'} · {formatPhone(c.phone)}</span>
                          {c.subcategory && <span className="text-muted-foreground truncate max-w-[14rem]">{c.subcategory}</span>}
                          {c.skip && <span className="text-amber-700 dark:text-amber-400">{c.skip}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          )}

          <div className="sticky bottom-0 -mx-5 px-5 py-4 bg-card border-t border-border flex justify-end gap-2">
            <button type="button" onClick={onClose} className={secondaryButton}>Cancel</button>
            <button type="submit" disabled={save.isPending || !category.trim()} className={primaryButton}>{save.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Save</button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
};

// ── Contacts in a sequence ──
const statusTone = (e: CampaignEnrolment) => e.status === 'active' ? 'text-emerald-700 dark:text-emerald-400' : e.status === 'paused' ? 'text-amber-700 dark:text-amber-400'
  : e.stopReason === 'interested' || e.stopReason === 'demo' || e.stopReason === 'converted' ? 'text-blue-700 dark:text-blue-400' : 'text-muted-foreground';

const Contacts: React.FC<{ sequence: CampaignSequence; isAdmin: boolean }> = ({ sequence, isAdmin }) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('');
  const { data = [], isLoading } = useQuery({ queryKey: ['campaigns', 'enrolments', sequence.id, status], queryFn: () => campaignsApi.enrolments({ sequenceId: sequence.id, status }) });
  // Nobody joined yet: show who is in the category (and why some would be skipped)
  const { data: waiting } = useQuery({ queryKey: ['campaigns', 'preview', sequence.category], queryFn: () => campaignsApi.preview(sequence.category), enabled: !isLoading && data.length === 0 });
  const act = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'pause' | 'resume' | 'stop' }) => campaignsApi.setEnrolment(id, action),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['campaigns'] }),
    onError: (err) => toast.error(apiError(err, 'Could not change it.'), 'Campaigns'),
  });
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} className={`${inputClass} w-auto text-xs`}>
          <option value="">All contacts</option><option value="active">Active</option><option value="paused">Paused</option><option value="stopped">Stopped</option>
        </select>
        <span className="text-xs text-muted-foreground">{data.length} shown</span>
      </div>
      {isLoading ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /> : data.length === 0 ? (
        <div className="space-y-2 py-1">
          <p className="text-xs text-muted-foreground">
            Nobody has joined yet.{' '}
            {sequence.active
              ? <>New leads and enquiries in {sequence.category} join automatically; press <b>Add existing contacts</b> for the ones below.</>
              : <>Turn the campaign <b>on</b>, then press <b>Add existing contacts</b> to add the ones below.</>}
          </p>
          {!status && waiting && waiting.total > 0 && (
            <>
              <p className="text-xs font-semibold text-foreground">In {sequence.category}, not joined yet: {waiting.willJoin} of {waiting.total} can join</p>
              <ul className="divide-y divide-border rounded-xl border border-border max-h-60 overflow-y-auto">
                {waiting.contacts.map((c) => (
                  <li key={`${c.kind}-${c.id}`} className={`px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs ${c.skip ? 'opacity-60' : ''}`}>
                    <span className="font-semibold text-foreground min-w-0 flex-1 truncate">{c.name}{c.company ? ` · ${c.company}` : ''}</span>
                    <span className="text-muted-foreground">{c.kind === 'lead' ? 'Lead' : 'Enquiry'} · {formatPhone(c.phone)}</span>
                    {c.subcategory && <span className="text-muted-foreground truncate max-w-[14rem]">{c.subcategory}</span>}
                    <span className={c.skip ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground'}>{c.skip ?? 'Not joined yet'}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {!status && waiting && waiting.total === 0 && (
            <p className="text-xs text-muted-foreground">No Enquiry List contacts or open leads have the category "{sequence.category}" yet.</p>
          )}
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border max-h-80 overflow-y-auto">
          {data.map((e) => (
            <li key={e.id} className="px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-foreground truncate">
                  {e.kind === 'lead' ? <Link to={`/leads/${e.refId}`} className="hover:underline">{e.name || formatPhone(e.phone)}</Link> : (e.name || formatPhone(e.phone))}
                  <span className="ml-1.5 font-normal text-muted-foreground">{e.kind === 'lead' ? 'Lead' : 'Enquiry'} · {formatPhone(e.phone)}</span>
                </p>
                <p className="text-muted-foreground">{e.stepsSent} sent{e.lastSentAt ? ` · last ${when(e.lastSentAt)}` : ''}{e.status === 'active' && e.nextSendAt ? ` · next ${when(e.nextSendAt)}` : ''}</p>
                {e.lastError && e.status === 'active' && <p className="text-red-600 dark:text-red-400 truncate" title={e.lastError}>Last send failed: {e.lastError}</p>}
              </div>
              <span className={`font-semibold ${statusTone(e)}`}>{e.status === 'stopped' ? STOP_LABELS[e.stopReason as StopReason] ?? 'Stopped' : e.status === 'paused' ? 'Paused' : 'Active'}</span>
              {isAdmin && e.status !== 'stopped' && (
                <span className="flex gap-1">
                  {e.status === 'active'
                    ? <button type="button" title="Pause" aria-label="Pause" onClick={() => act.mutate({ id: e.id, action: 'pause' })} className="p-1 rounded-md hover:bg-muted cursor-pointer"><Pause className="w-3.5 h-3.5" /></button>
                    : <button type="button" title="Resume" aria-label="Resume" onClick={() => act.mutate({ id: e.id, action: 'resume' })} className="p-1 rounded-md hover:bg-muted cursor-pointer"><Play className="w-3.5 h-3.5" /></button>}
                  <button type="button" title="Stop for good" aria-label="Stop" onClick={() => act.mutate({ id: e.id, action: 'stop' })} className="p-1 rounded-md hover:bg-red-500/10 text-red-600 cursor-pointer"><Square className="w-3.5 h-3.5" /></button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

// ── Page ──
const CampaignsPage: React.FC = () => {
  const { toast } = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<CampaignSequence | null | 'new'>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const { data, isLoading, isError, error } = useQuery({ queryKey: ['campaigns', 'list'], queryFn: campaignsApi.list });
  const sequences = useMemo(() => data?.data ?? [], [data]);
  const isAdmin = !!data?.isAdmin;
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['campaigns'] });

  const toggle = useMutation({
    mutationFn: (s: CampaignSequence) => campaignsApi.save(s.id, { category: s.category, active: !s.active, repeatEveryDays: s.repeatEveryDays, steps: s.steps }),
    onSuccess: (s) => { toast.success(s.active ? `${s.category} campaign is on.` : `${s.category} campaign is off.`, 'Campaigns'); refresh(); },
    onError: (err) => toast.error(apiError(err, 'Could not change it.'), 'Campaigns'),
  });
  const enrol = useMutation({
    mutationFn: (s: CampaignSequence) => campaignsApi.enrolExisting(s.id),
    onSuccess: (r, s) => { toast.success(`${r.enrolled} of ${r.checked} ${s.category} contacts joined.`, 'Campaigns'); refresh(); },
    onError: (err) => toast.error(apiError(err, 'Could not add them.'), 'Campaigns'),
  });
  const remove = useMutation({
    mutationFn: (s: CampaignSequence) => campaignsApi.remove(s.id),
    onSuccess: () => { toast.success('Campaign deleted.', 'Campaigns'); refresh(); },
    onError: (err) => toast.error(apiError(err, 'Could not delete it.'), 'Campaigns'),
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="p-2 rounded-xl bg-blue-500/10 text-blue-500 border border-blue-500/20"><Megaphone className="w-5 h-5" /></span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Campaigns</h1>
            <p className="text-xs text-muted-foreground mt-1">WhatsApp messages per category to Leads and the Enquiry List, sent as WAAU campaigns from 919048338111 (9 AM–7 PM). A reply, a button tap, conversion or opt-out stops it.</p>
          </div>
        </div>
        {isAdmin && <button type="button" onClick={() => setEditing('new')} className={primaryButton}><Plus className="w-4 h-4" /> New campaign</button>}
      </div>

      {isLoading ? <div className="flex justify-center p-10"><Loader2 className="w-5 h-5 animate-spin text-blue-500" /></div>
        : isError ? <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-600 flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> {apiError(error, 'Could not load campaigns.')}</div>
          : sequences.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
              <Megaphone className="w-6 h-6 mx-auto mb-2 opacity-60" />
              No campaigns yet. {isAdmin ? 'Create one per category with the approved WAAU templates.' : 'Admins set them up.'}
            </div>
          ) : (
            <div className="space-y-3">
              {sequences.map((s) => {
                const stopped = Object.entries(s.stats.stopped) as [StopReason, number][];
                return (
                  <section key={s.id} className="rounded-2xl border border-border bg-card p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                          {s.category}
                          <span className={`px-2 py-0.5 rounded-lg text-[11px] font-semibold border ${s.active ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30' : 'bg-muted text-muted-foreground border-border'}`}>{s.active ? 'On' : 'Off'}</span>
                        </h2>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {s.steps.map((st) => `Day ${st.day}`).join(' · ')}{s.repeatEveryDays ? ' · then monthly' : ''}
                        </p>
                      </div>
                      {isAdmin && (
                        <div className="flex flex-wrap gap-2">
                          <button type="button" disabled={toggle.isPending} onClick={() => toggle.mutate(s)} className={secondaryButton}>{s.active ? <><Pause className="w-4 h-4" /> Turn off</> : <><Play className="w-4 h-4" /> Turn on</>}</button>
                          <button type="button" disabled={!s.active || enrol.isPending} title={s.active ? '' : 'Turn the campaign on first'}
                            onClick={async () => { if (await confirm({ title: `Add existing ${s.category} contacts?`, message: `Every open lead and Enquiry List contact in ${s.category} who is not in a campaign and has not opted out joins now. Their Day 1 message goes out in the next sending window.`, confirmLabel: 'Add them', cancelLabel: 'Cancel', variant: 'warning' })) enrol.mutate(s); }}
                            className={secondaryButton}><UserPlus className="w-4 h-4" /> Add existing contacts</button>
                          <button type="button" onClick={() => setEditing(s)} className={secondaryButton}>Edit</button>
                          <button type="button" aria-label={`Delete ${s.category} campaign`}
                            onClick={async () => { if (await confirm({ title: `Delete the ${s.category} campaign?`, message: 'Its messages stop and its contact history is removed. Opt-outs are kept.', confirmLabel: 'Delete', cancelLabel: 'Keep it', variant: 'danger' })) remove.mutate(s); }}
                            className={`${secondaryButton} text-red-600`}><Trash2 className="w-4 h-4" /></button>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className="px-2 py-1 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-semibold">Active {s.stats.active}</span>
                      {s.stats.paused > 0 && <span className="px-2 py-1 rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-400 font-semibold">Paused {s.stats.paused}</span>}
                      {stopped.map(([r, n]) => <span key={r} className="px-2 py-1 rounded-lg bg-muted text-foreground font-semibold">{STOP_LABELS[r] ?? r} {n}</span>)}
                    </div>
                    {s.stats.messages && s.stats.messages.sent > 0 && (
                      <p className="text-xs text-muted-foreground" title="From WAAU's campaign reports (refreshed for 3 days after each send)">
                        WhatsApp: <b className="text-foreground">{s.stats.messages.sent}</b> sent · {s.stats.messages.delivered} delivered · {s.stats.messages.read} read · {s.stats.messages.replied} replied{s.stats.messages.failed ? <> · <span className="text-red-600 dark:text-red-400">{s.stats.messages.failed} failed</span></> : null}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-1.5">
                      {s.steps.map((st) => <span key={st.day} className="px-2 py-0.5 rounded-md border border-border text-[11px] font-mono text-muted-foreground">D{st.day}: {st.templateName}</span>)}
                    </div>
                    <button type="button" onClick={() => setOpenId(openId === s.id ? null : s.id)} className="text-xs font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-1 cursor-pointer">
                      <Users className="w-3.5 h-3.5" /> {openId === s.id ? 'Hide contacts' : 'Show contacts'}
                    </button>
                    {openId === s.id && <Contacts sequence={s} isAdmin={isAdmin} />}
                  </section>
                );
              })}
            </div>
          )}

      {editing && <SequenceForm initial={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); }} />}
    </div>
  );
};

export default CampaignsPage;
