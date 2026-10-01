import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, Loader2, Plane, Send, Undo2, Users, X } from 'lucide-react';
import { usePermissions } from '../../features/auth/usePermissions';
import { PERMISSIONS } from '../../features/auth/permission.constants';
import { useAuthStore } from '../../store/authStore';
import { useToast } from '../../components/ui/Toast';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import {
  daysLabel,
  leaveApi,
  leaveDates,
  statusLabel,
  type HalfDay,
  type InboxRequest,
  type LeaveRequest,
  type LeaveStatus,
  type TeamMember,
} from '../../services/api/leave';

// ─── Leave ──────────────────────────────────────────────────────────────────────
// Employees apply; the person they report to (or any Project Manager) approves, then an Admin. A Project
// Manager's leave goes straight to the Admins, an Admin's to another Admin. Approved leave shows in Attendance.

const TIME_ZONE = 'Asia/Kolkata';
const todayKey = () => new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const apiError = (err: any, fallback: string) => err?.response?.data?.error || fallback;
const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: TIME_ZONE }) : '';

const labelClass = 'text-[9px] font-bold text-muted-foreground uppercase tracking-widest block';
const inputClass = 'px-3 py-2 glass-input text-foreground text-xs rounded-xl focus:outline-none';
const panelClass = 'glass-panel rounded-2xl border border-border bg-card/40';
const primaryButton = 'flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold disabled:opacity-50 cursor-pointer';

const STATUS_TONES: Record<LeaveStatus, string> = {
  pending_manager: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  pending_admin: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  approved: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  rejected: 'bg-red-500/10 text-red-400 border-red-500/20',
  cancelled: 'bg-muted text-muted-foreground border-border',
};

const StatusBadge: React.FC<{ request: LeaveRequest }> = ({ request }) => (
  <span className={`inline-flex items-center px-2 py-0.5 rounded-lg border text-[11px] font-bold whitespace-nowrap ${STATUS_TONES[request.status]}`}>
    {statusLabel(request)}
  </span>
);

const Loading = () => (
  <div className={`${panelClass} p-10 flex justify-center`}><Loader2 className="w-5 h-5 animate-spin text-blue-400" /></div>
);
const ErrorBox: React.FC<{ error: unknown; fallback: string }> = ({ error, fallback }) => (
  <div className="glass-panel rounded-2xl p-6 border border-rose-500/20 bg-rose-500/5 flex items-center gap-3 text-xs text-rose-400">
    <AlertTriangle className="w-4 h-4 shrink-0" /> <span>{apiError(error, fallback)}</span>
  </div>
);

/** Who did what on a request, oldest first */
const History: React.FC<{ request: LeaveRequest }> = ({ request: r }) => {
  const steps: string[] = [`Applied ${when(r.createdAt)}`];
  if (r.managerBy) steps.push(`${r.status === 'rejected' && !r.adminAt ? 'Rejected' : 'Approved'} by ${r.managerByName ?? 'manager'} · ${when(r.managerAt)}${r.managerComment ? ` · “${r.managerComment}”` : ''}`);
  if (r.escalatedAt) steps.push(`Sent to the Admins ${when(r.escalatedAt)} (no decision in time)`);
  if (r.adminAt) {
    const verb = r.status === 'rejected' ? 'Rejected' : 'Approved';
    steps.push(`${r.adminBy ? `${verb} by ${r.adminByName ?? 'Admin'}` : verb} · ${when(r.adminAt)}${r.adminComment ? ` · “${r.adminComment}”` : ''}`);
  }
  if (r.cancelledAt) steps.push(`Cancelled ${when(r.cancelledAt)}`);
  return (
    <ul className="space-y-0.5 text-[11px] text-muted-foreground">
      {steps.map((s) => <li key={s}>· {s}</li>)}
    </ul>
  );
};

// ─── Apply + my requests ─────────────────────────────────────────────────────────

const ApplyForm: React.FC<{ onApplied: () => void }> = ({ onApplied }) => {
  const { toast } = useToast();
  const [from, setFrom] = useState(todayKey());
  const [to, setTo] = useState(todayKey());
  const [half, setHalf] = useState<HalfDay | null>(null);
  const [reason, setReason] = useState('');
  const singleDay = from === to;

  const apply = useMutation({
    mutationFn: () => leaveApi.apply({ from, to, halfDay: singleDay ? half : null, reason: reason.trim() }),
    onSuccess: (r) => {
      toast.success(r.status === 'approved' ? 'Leave recorded.' : `Leave applied. ${statusLabel(r)}.`, 'Leave');
      setReason('');
      setHalf(null);
      onApplied();
    },
    onError: (err) => toast.error(apiError(err, 'Could not apply for leave.'), 'Leave'),
  });

  return (
    <div className={`${panelClass} p-5 space-y-4`}>
      <h2 className="text-sm font-bold text-foreground">Apply for leave</h2>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className={labelClass} htmlFor="leave-from">From</label>
          <input
            id="leave-from" type="date" value={from}
            onChange={(e) => { setFrom(e.target.value); if (e.target.value > to) setTo(e.target.value); }}
            className={`w-full ${inputClass}`}
          />
        </div>
        <div className="space-y-1.5">
          <label className={labelClass} htmlFor="leave-to">To</label>
          <input id="leave-to" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className={`w-full ${inputClass}`} />
        </div>
      </div>
      {singleDay && (
        <div className="space-y-1.5">
          <span className={labelClass}>Length</span>
          <div role="radiogroup" className="flex flex-wrap gap-2">
            {([[null, 'Full day'], ['first', 'First half'], ['second', 'Second half']] as [HalfDay | null, string][]).map(([value, label]) => (
              <button
                key={label} type="button" role="radio" aria-checked={half === value} onClick={() => setHalf(value)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border cursor-pointer ${
                  half === value ? 'bg-blue-600/10 border-blue-500/30 text-blue-400' : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="space-y-1.5">
        <label className={labelClass} htmlFor="leave-reason">Reason</label>
        <textarea
          id="leave-reason" rows={2} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Family function in Thrissur" className={`w-full ${inputClass} resize-none`}
        />
      </div>
      <p className="text-[10px] text-muted-foreground">Only working days are counted; days off and holidays are skipped.</p>
      <button
        type="button" className={`w-full ${primaryButton}`}
        disabled={!from || !to || to < from || reason.trim().length < 2 || apply.isPending}
        onClick={() => apply.mutate()}
      >
        {apply.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Apply
      </button>
    </div>
  );
};

const MyLeave: React.FC = () => {
  const { can } = usePermissions();
  const canApply = can(PERMISSIONS.LEAVE_USE);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const confirm = useConfirm();
  const { data = [], isLoading, isError, error } = useQuery({ queryKey: ['leave', 'mine'], queryFn: leaveApi.mine });
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['leave'] });
    queryClient.invalidateQueries({ queryKey: ['attendance'] });
  };
  const cancel = useMutation({
    mutationFn: (id: string) => leaveApi.cancel(id),
    onSuccess: () => { toast.success('Leave request cancelled.', 'Leave'); refresh(); },
    onError: (err) => toast.error(apiError(err, 'Could not cancel the request.'), 'Leave'),
  });
  const today = todayKey();

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] items-start">
      {canApply ? <ApplyForm onApplied={refresh} /> : (
        <p className={`${panelClass} p-5 text-xs text-muted-foreground`}>Your role doesn't apply for leave in Work OS.</p>
      )}
      <div className="space-y-3">
        <h2 className="text-sm font-bold text-foreground">My requests</h2>
        {isLoading ? <Loading /> : isError ? <ErrorBox error={error} fallback="Could not load your leave." /> : data.length === 0 ? (
          <p className={`${panelClass} p-6 text-xs text-muted-foreground`}>You haven't applied for leave yet.</p>
        ) : data.map((r) => {
          const canCancel = r.status === 'pending_manager' || r.status === 'pending_admin' || (r.status === 'approved' && r.fromDay > today);
          return (
            <div key={r.id} className={`${panelClass} p-4 space-y-2`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-bold text-foreground">{leaveDates(r)} <span className="text-muted-foreground font-normal">· {daysLabel(r.days)}</span></div>
                <StatusBadge request={r} />
              </div>
              <p className="text-xs text-foreground/90 break-words">{r.reason}</p>
              <History request={r} />
              {canCancel && (
                <button
                  type="button" disabled={cancel.isPending}
                  onClick={async () => {
                    const ok = await confirm({
                      title: 'Cancel this leave?',
                      message: r.status === 'approved' ? 'The approved leave will be removed from your attendance.' : 'The request will be withdrawn.',
                      confirmLabel: 'Cancel leave',
                      variant: 'danger',
                    });
                    if (ok) cancel.mutate(r.id);
                  }}
                  className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground hover:text-red-400 cursor-pointer disabled:opacity-50"
                >
                  <Undo2 className="w-3.5 h-3.5" /> {r.status === 'approved' ? 'Cancel leave' : 'Withdraw request'}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ─── Approvals ───────────────────────────────────────────────────────────────────

const ApprovalCard: React.FC<{ request: InboxRequest; onDone: () => void }> = ({ request: r, onDone }) => {
  const { toast } = useToast();
  const [comment, setComment] = useState('');
  const decide = useMutation({
    mutationFn: (decision: 'approve' | 'reject') => (decision === 'approve' ? leaveApi.approve(r.id, comment.trim()) : leaveApi.reject(r.id, comment.trim())),
    onSuccess: (updated) => {
      toast.success(`${r.userName}'s leave: ${statusLabel(updated).toLowerCase()}.`, 'Leave');
      onDone();
    },
    onError: (err) => toast.error(apiError(err, 'Could not save the decision.'), 'Leave'),
  });
  const { othersAway, dueWork } = r.clashes;

  return (
    <div className={`${panelClass} p-4 space-y-3`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-bold text-foreground">{r.userName}</div>
          <div className="text-xs text-foreground/90">{leaveDates(r)} <span className="text-muted-foreground">· {daysLabel(r.days)}</span></div>
        </div>
        <StatusBadge request={r} />
      </div>
      <p className="text-xs text-foreground/90 break-words">{r.reason}</p>
      <History request={r} />

      {(othersAway.length > 0 || dueWork.length > 0) && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 space-y-2 text-[11px] text-amber-500">
          {othersAway.length > 0 && (
            <div>
              <div className="font-bold flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> Also away then</div>
              <ul className="mt-1 space-y-0.5">
                {othersAway.map((o) => (
                  <li key={`${o.name}-${o.fromDay}`}>{o.name} · {leaveDates(o)}{o.status === 'approved' ? '' : ' (not yet approved)'}</li>
                ))}
              </ul>
            </div>
          )}
          {dueWork.length > 0 && (
            <div>
              <div className="font-bold flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> {r.userName}'s work due then</div>
              <ul className="mt-1 space-y-0.5">
                {dueWork.map((w) => <li key={`${w.workId}-${w.name}`}>{w.workId ? `${w.workId} · ` : ''}{w.name}{w.due ? ` · ${w.due}` : ''}</li>)}
              </ul>
              <p className="mt-1 text-amber-500/80">Consider giving this work to someone else.</p>
            </div>
          )}
        </div>
      )}

      <div className="space-y-1.5">
        <label className={labelClass} htmlFor={`comment-${r.id}`}>Comment (needed to reject)</label>
        <input id={`comment-${r.id}`} value={comment} maxLength={500} onChange={(e) => setComment(e.target.value)} className={`w-full ${inputClass}`} />
      </div>
      <div className="flex gap-2">
        <button type="button" disabled={decide.isPending} onClick={() => decide.mutate('approve')} className={`flex-1 ${primaryButton} !bg-emerald-600 hover:!bg-emerald-500`}>
          {decide.isPending && decide.variables === 'approve' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Approve
        </button>
        <button
          type="button" disabled={decide.isPending || comment.trim().length < 2} onClick={() => decide.mutate('reject')}
          title={comment.trim().length < 2 ? 'Add a comment to reject' : undefined}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-red-500/30 text-red-400 hover:bg-red-500/10 text-xs font-bold disabled:opacity-50 cursor-pointer"
        >
          {decide.isPending && decide.variables === 'reject' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />} Reject
        </button>
      </div>
    </div>
  );
};

const Approvals: React.FC<{ query: ReturnType<typeof useInbox> }> = ({ query }) => {
  const queryClient = useQueryClient();
  const { data = [], isLoading, isError, error } = query;
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['leave'] });
    queryClient.invalidateQueries({ queryKey: ['attendance'] });
  };
  if (isLoading) return <Loading />;
  if (isError) return <ErrorBox error={error} fallback="Could not load leave requests." />;
  if (!data.length) return <p className={`${panelClass} p-6 text-xs text-muted-foreground`}>No leave requests are waiting for you.</p>;
  return <div className="grid gap-4 xl:grid-cols-2 items-start">{data.map((r) => <ApprovalCard key={r.id} request={r} onDone={refresh} />)}</div>;
};

// ─── Everyone's requests ─────────────────────────────────────────────────────────

const AllRequests: React.FC = () => {
  const [month, setMonth] = useState(todayKey().slice(0, 7));
  const { data = [], isLoading, isError, error } = useQuery({ queryKey: ['leave', 'all', month], queryFn: () => leaveApi.all(month) });
  return (
    <div className="space-y-4">
      <div className="space-y-1.5 max-w-xs">
        <label className={labelClass} htmlFor="leave-month">Month</label>
        <input id="leave-month" type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className={`w-full ${inputClass}`} />
      </div>
      <p className="text-[10px] text-muted-foreground">Leave in this month, and every request still waiting for a decision.</p>
      {isLoading ? <Loading /> : isError ? <ErrorBox error={error} fallback="Could not load leave requests." /> : data.length === 0 ? (
        <p className={`${panelClass} p-6 text-xs text-muted-foreground`}>No leave this month.</p>
      ) : (
        <div className={`${panelClass} overflow-x-auto`}>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[9px] uppercase tracking-widest text-muted-foreground border-b border-border">
                <th className="px-4 py-3">Member</th><th className="px-4 py-3">Dates</th><th className="px-4 py-3">Days</th>
                <th className="px-4 py-3">Reason</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Decided by</th>
              </tr>
            </thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.id} className="border-b border-border/50 last:border-0 align-top">
                  <td className="px-4 py-3 font-bold text-foreground whitespace-nowrap">{r.userName}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{leaveDates(r)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{daysLabel(r.days)}</td>
                  <td className="px-4 py-3 min-w-[12rem] break-words">{r.reason}</td>
                  <td className="px-4 py-3"><StatusBadge request={r} /></td>
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                    {[r.managerByName, r.adminByName].filter(Boolean).join(' → ') || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// ─── Reports to ──────────────────────────────────────────────────────────────────

const ReportsTo: React.FC = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data = [], isLoading, isError, error } = useQuery({ queryKey: ['leave', 'team'], queryFn: leaveApi.team });
  const save = useMutation({
    mutationFn: ({ userId, reportsTo }: { userId: string; reportsTo: string | null }) => leaveApi.setReportsTo(userId, reportsTo),
    onSuccess: (res) => {
      queryClient.setQueryData<TeamMember[]>(['leave', 'team'], (old) => old?.map((m) => (m.id === res.userId ? { ...m, reportsTo: res.reportsTo } : m)));
      toast.success('Saved.', 'Leave');
    },
    onError: (err) => toast.error(apiError(err, 'Could not save.'), 'Leave'),
  });
  if (isLoading) return <Loading />;
  if (isError) return <ErrorBox error={error} fallback="Could not load members." />;
  return (
    <div className="space-y-3 max-w-3xl">
      <p className="text-xs text-muted-foreground">
        An employee's leave goes first to the person they report to, then to an Admin. With nobody set, any Project Manager can approve it.
        Project Managers' and Admins' leave always goes to the Admins.
      </p>
      <div className={`${panelClass} overflow-x-auto`}>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[9px] uppercase tracking-widest text-muted-foreground border-b border-border">
              <th className="px-4 py-3">Member</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Reports to</th>
            </tr>
          </thead>
          <tbody>
            {data.map((m) => (
              <tr key={m.id} className="border-b border-border/50 last:border-0">
                <td className="px-4 py-3 font-bold text-foreground whitespace-nowrap">{m.name}</td>
                <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{m.role}</td>
                <td className="px-4 py-3">
                  {m.tier === 'employee' ? (
                    <select
                      aria-label={`${m.name} reports to`}
                      value={m.reportsTo ?? ''}
                      disabled={save.isPending}
                      onChange={(e) => save.mutate({ userId: m.id, reportsTo: e.target.value || null })}
                      className={`w-full min-w-[12rem] ${inputClass} [&>option]:bg-background`}
                    >
                      <option value="">Any Project Manager</option>
                      {data.filter((o) => o.id !== m.id).map((o) => <option key={o.id} value={o.id}>{o.name} ({o.role})</option>)}
                    </select>
                  ) : (
                    <span className="text-muted-foreground">Admins approve</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ─── Page ────────────────────────────────────────────────────────────────────────

type Tab = 'mine' | 'approvals' | 'all' | 'team';
const useInbox = () => useQuery({ queryKey: ['leave', 'inbox'], queryFn: leaveApi.inbox, refetchInterval: 60_000 });

export const LeavePage: React.FC = () => {
  const { can } = usePermissions();
  const user = useAuthStore((s) => s.user);
  const [params, setParams] = useSearchParams();
  const inbox = useInbox();
  const isAdmin = can(PERMISSIONS.ADMIN);
  const isApprover = isAdmin || can(PERMISSIONS.LEAVE_APPROVE);
  const canSeeAll = isApprover || can(PERMISSIONS.ATTENDANCE_READ);
  const waiting = inbox.data?.length ?? 0;

  const tabs = useMemo(() => {
    const list: { key: Tab; label: string }[] = [{ key: 'mine', label: 'My leave' }];
    if (isApprover || waiting > 0) list.push({ key: 'approvals', label: 'Approvals' });
    if (canSeeAll) list.push({ key: 'all', label: 'All requests' });
    if (isAdmin) list.push({ key: 'team', label: 'Reports to' });
    return list;
  }, [isApprover, waiting, canSeeAll, isAdmin]);
  const requested = params.get('tab') as Tab | null;
  const tab: Tab = tabs.some((t) => t.key === requested) ? requested! : 'mine';

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <span className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
          <Plane className="w-5 h-5" />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Leave</h1>
          <p className="text-xs text-muted-foreground mt-1 font-light">
            {user?.firstName ? `${user.firstName}, apply` : 'Apply'} for leave here. Approved leave shows in Attendance as “On leave”.
          </p>
        </div>
      </div>

      {tabs.length > 1 && (
        <div role="tablist" className="flex flex-wrap gap-2">
          {tabs.map((t) => (
            <button
              key={t.key} role="tab" aria-selected={tab === t.key} type="button"
              onClick={() => setParams(t.key === 'mine' ? {} : { tab: t.key }, { replace: true })}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                tab === t.key ? 'bg-blue-600/10 border-blue-500/30 text-blue-400' : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              {t.label}
              {t.key === 'approvals' && waiting > 0 && (
                <span className="px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-500 text-[10px]">{waiting}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {tab === 'mine' && <MyLeave />}
      {tab === 'approvals' && <Approvals query={inbox} />}
      {tab === 'all' && <AllRequests />}
      {tab === 'team' && <ReportsTo />}
    </div>
  );
};

export default LeavePage;
