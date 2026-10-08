import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import { CalendarCheck, Loader2, AlertTriangle, MapPin, MapPinOff, Pencil, Plus, Trash2, Download, Save, X } from 'lucide-react';
import { usePermissions } from '../../features/auth/usePermissions';
import { PERMISSIONS } from '../../features/auth/permission.constants';
import { useToast } from '../../components/ui/Toast';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import {
  attendanceApi,
  formatCheckInTime,
  stateLabel,
  type AttendanceRecord,
  type AttendanceSettings,
  type AttendanceStatus,
  type DayState,
  type MonthView,
} from '../../services/api/attendance';

const TIME_ZONE = 'Asia/Kolkata';
const todayKey = () => new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const WEEKDAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const apiError = (err: any, fallback: string) => err?.response?.data?.error || fallback;

const labelClass = 'text-[9px] font-bold text-muted-foreground uppercase tracking-widest block';
const inputClass = 'px-3 py-2 glass-input text-foreground text-xs rounded-xl focus:outline-none';
const panelClass = 'glass-panel rounded-2xl border border-border bg-card/40';

// ─── Status badge ───────────────────────────────────────────────────────────────

const STATE_TONES: Record<DayState, string> = {
  present: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  late: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  absent: 'bg-red-500/10 text-red-400 border-red-500/20',
  leave: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
  holiday: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
  day_off: 'bg-muted text-muted-foreground border-border',
  not_checked_in: 'bg-muted text-muted-foreground border-border',
  not_counted: 'bg-muted text-muted-foreground border-border',
};

const StatusBadge: React.FC<{ state: DayState; early?: boolean; checkInAt?: string | null; leaveHalf?: string | null }> = ({ state, early = false, checkInAt = null, leaveHalf = null }) => (
  <span className={`inline-flex items-center px-2 py-0.5 rounded-lg border text-[11px] font-bold whitespace-nowrap ${STATE_TONES[state]}`}>
    {stateLabel(state, early, checkInAt, leaveHalf)}
  </span>
);

/** Short code for one day in the month grid and the Excel sheet */
const dayCode = (state: DayState, early: boolean, leaveHalf: string | null = null) =>
  ({ present: early ? 'E' : 'P', late: 'L', absent: 'A', leave: leaveHalf ? 'HL' : 'LV', holiday: 'H', day_off: '·', not_checked_in: '…', not_counted: '' } as Record<DayState, string>)[state];

const LocationCell: React.FC<{ record: AttendanceRecord | null }> = ({ record }) => {
  if (!record || !record.checkInAt) return <span className="text-muted-foreground">—</span>;
  if (record.locationStatus === 'ok' && record.latitude != null && record.longitude != null) {
    return (
      <a
        href={`https://www.google.com/maps?q=${record.latitude},${record.longitude}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-blue-400 hover:underline max-w-[16rem]"
        title={[record.locationName, record.accuracyM ? `accurate to about ${Math.round(record.accuracyM)} m` : '', 'open in Maps'].filter(Boolean).join(' · ')}
      >
        <MapPin className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">{record.locationName || 'Map'}</span>
      </a>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-orange-400 font-bold">
      <MapPinOff className="w-3.5 h-3.5" /> No location
    </span>
  );
};

// ─── Modals ─────────────────────────────────────────────────────────────────────

const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/60 backdrop-blur-sm" role="dialog" aria-modal="true">
    <div className="w-full max-w-md glass-panel-heavy border border-border rounded-2xl shadow-2xl">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <h3 className="text-sm font-bold text-foreground">{title}</h3>
        <button type="button" onClick={onClose} className="p-1.5 rounded-lg bg-muted hover:bg-accent text-muted-foreground cursor-pointer" aria-label="Close">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="p-5 space-y-4">{children}</div>
    </div>
  </div>
);

const CorrectModal: React.FC<{
  person: { userId: string; name: string; state: DayState; record: AttendanceRecord | null };
  day: string;
  onClose: () => void;
  onSaved: () => void;
}> = ({ person, day, onClose, onSaved }) => {
  const { toast } = useToast();
  const initial: AttendanceStatus = ['present', 'late', 'absent', 'leave'].includes(person.state) ? (person.state as AttendanceStatus) : 'present';
  const [status, setStatus] = useState<AttendanceStatus>(initial);
  const [early, setEarly] = useState(person.record?.early ?? false);
  const [reason, setReason] = useState('');
  const save = useMutation({
    mutationFn: () => attendanceApi.correct({ userId: person.userId, day, status, early, reason: reason.trim() }),
    onSuccess: () => {
      toast.success(`${person.name}'s attendance for ${day} was updated.`, 'Attendance');
      onSaved();
      onClose();
    },
    onError: (err) => toast.error(apiError(err, 'Could not update attendance.'), 'Attendance'),
  });
  return (
    <Modal title={`Edit attendance · ${person.name} · ${day}`} onClose={onClose}>
      <div className="space-y-1.5">
        <label className={labelClass}>Status</label>
        <select value={status} onChange={(e) => setStatus(e.target.value as AttendanceStatus)} className={`w-full ${inputClass} [&>option]:bg-background`}>
          <option value="present">Present</option>
          <option value="late">Late</option>
          <option value="absent">Absent</option>
          <option value="leave">On leave</option>
        </select>
      </div>
      {status === 'present' && (
        <label className="flex items-center gap-2 text-xs text-foreground">
          <input type="checkbox" checked={early} onChange={(e) => setEarly(e.target.checked)} /> Early
        </label>
      )}
      <div className="space-y-1.5">
        <label className={labelClass}>Reason (required)</label>
        <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Was at a client meeting from 9 am" className={`w-full ${inputClass} resize-none`} />
      </div>
      <p className="text-[10px] text-muted-foreground">The change and the reason are saved in the security log.</p>
      <button
        type="button"
        disabled={reason.trim().length < 2 || save.isPending}
        onClick={() => save.mutate()}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold disabled:opacity-50 cursor-pointer"
      >
        {save.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save
      </button>
    </Modal>
  );
};

const LeaveModal: React.FC<{ people: { userId: string; name: string }[]; onClose: () => void; onSaved: () => void }> = ({ people, onClose, onSaved }) => {
  const { toast } = useToast();
  const [userId, setUserId] = useState(people[0]?.userId ?? '');
  const [from, setFrom] = useState(todayKey());
  const [to, setTo] = useState(todayKey());
  const [reason, setReason] = useState('');
  const save = useMutation({
    mutationFn: () => attendanceApi.setLeave({ userId, from, to, reason: reason.trim() }),
    onSuccess: (res) => {
      toast.success(`Leave set for ${res.days} working day${res.days === 1 ? '' : 's'}.`, 'Attendance');
      onSaved();
      onClose();
    },
    onError: (err) => toast.error(apiError(err, 'Could not set leave.'), 'Attendance'),
  });
  return (
    <Modal title="Set leave" onClose={onClose}>
      <div className="space-y-1.5">
        <label className={labelClass}>Member</label>
        <select value={userId} onChange={(e) => setUserId(e.target.value)} className={`w-full ${inputClass} [&>option]:bg-background`}>
          {people.map((p) => <option key={p.userId} value={p.userId}>{p.name}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className={labelClass}>From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`w-full ${inputClass}`} />
        </div>
        <div className="space-y-1.5">
          <label className={labelClass}>To</label>
          <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className={`w-full ${inputClass}`} />
        </div>
      </div>
      <div className="space-y-1.5">
        <label className={labelClass}>Reason (required)</label>
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Sick leave" className={`w-full ${inputClass}`} />
      </div>
      <p className="text-[10px] text-muted-foreground">Only working days are marked. Days with a check-in stay as they are.</p>
      <button
        type="button"
        disabled={!userId || !from || !to || reason.trim().length < 2 || save.isPending}
        onClick={() => save.mutate()}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold disabled:opacity-50 cursor-pointer"
      >
        {save.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Set leave
      </button>
    </Modal>
  );
};

// ─── Tabs ───────────────────────────────────────────────────────────────────────

const Loading = () => (
  <div className={`${panelClass} p-10 flex justify-center`}><Loader2 className="w-5 h-5 animate-spin text-blue-400" /></div>
);
const ErrorBox: React.FC<{ error: unknown; fallback: string }> = ({ error, fallback }) => (
  <div className="glass-panel rounded-2xl p-6 border border-rose-500/20 bg-rose-500/5 flex items-center gap-3 text-xs text-rose-400">
    <AlertTriangle className="w-4 h-4 shrink-0" /> <span>{apiError(error, fallback)}</span>
  </div>
);

const TodayTab: React.FC<{ canManage: boolean }> = ({ canManage }) => {
  const queryClient = useQueryClient();
  const [day, setDay] = useState(todayKey());
  const [editing, setEditing] = useState<null | { userId: string; name: string; state: DayState; record: AttendanceRecord | null }>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const { data, isLoading, isError, error } = useQuery({ queryKey: ['attendance', 'day', day], queryFn: () => attendanceApi.day(day) });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['attendance'] });

  const counts = useMemo(() => {
    const c: Partial<Record<DayState | 'early', number>> = {};
    for (const p of data?.people ?? []) {
      c[p.state] = (c[p.state] ?? 0) + 1;
      if (p.state === 'present' && p.record?.early) c.early = (c.early ?? 0) + 1;
    }
    return c;
  }, [data]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1.5">
          <label className={labelClass}>Date</label>
          <input type="date" value={day} max={todayKey()} onChange={(e) => e.target.value && setDay(e.target.value)} className={inputClass} />
        </div>
        {canManage && (
          <button type="button" onClick={() => setLeaveOpen(true)} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-muted hover:bg-accent text-foreground text-xs font-bold cursor-pointer">
            <Plus className="w-3.5 h-3.5" /> Set leave
          </button>
        )}
      </div>

      {isLoading ? <Loading /> : isError || !data ? <ErrorBox error={error} fallback="Could not load attendance." /> : (
        <>
          {data.holiday && <p className="text-xs text-violet-400 font-bold">Holiday: {data.holiday}</p>}
          <div className="flex flex-wrap gap-2 text-[11px] font-bold">
            <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-500">Present {counts.present ?? 0}{counts.early ? ` (${counts.early} early)` : ''}</span>
            <span className="px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-500">Late {counts.late ?? 0}</span>
            <span className="px-2.5 py-1 rounded-lg bg-red-500/10 text-red-400">Absent {counts.absent ?? 0}</span>
            <span className="px-2.5 py-1 rounded-lg bg-sky-500/10 text-sky-400">On leave {counts.leave ?? 0}</span>
            {!!counts.not_checked_in && <span className="px-2.5 py-1 rounded-lg bg-muted text-muted-foreground">Not checked in yet {counts.not_checked_in}</span>}
          </div>
          <div className={`${panelClass} overflow-x-auto`}>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-widest text-muted-foreground border-b border-border">
                  <th className="px-4 py-3">Member</th>
                  <th className="px-4 py-3">Attendance</th>
                  <th className="px-4 py-3">Location</th>
                  <th className="px-4 py-3">Note</th>
                  {canManage && <th className="px-4 py-3" />}
                </tr>
              </thead>
              <tbody>
                {data.people.map((p) => (
                  <tr key={p.userId} className="border-b border-border/50 last:border-0">
                    <td className="px-4 py-3">
                      <p className="font-bold text-foreground">{p.name}</p>
                      <p className="text-[10px] text-muted-foreground">{p.email}</p>
                    </td>
                    <td className="px-4 py-3"><StatusBadge state={p.state} early={p.record?.early} checkInAt={p.record?.checkInAt} leaveHalf={p.record?.leaveHalf} /></td>
                    <td className="px-4 py-3"><LocationCell record={p.record} /></td>
                    <td className="px-4 py-3 text-muted-foreground max-w-[220px]">
                      {p.record?.note ? <span title={p.record.note}>{p.record.correctedAt ? 'Edited: ' : ''}{p.record.note}</span> : '—'}
                    </td>
                    {canManage && (
                      <td className="px-4 py-3 text-right">
                        {p.state !== 'not_counted' && p.state !== 'day_off' && p.state !== 'holiday' && (
                          <button type="button" onClick={() => setEditing(p)} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-muted hover:bg-accent text-foreground text-[11px] font-bold cursor-pointer">
                            <Pencil className="w-3 h-3" /> Edit
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {editing && <CorrectModal person={editing} day={day} onClose={() => setEditing(null)} onSaved={refresh} />}
      {leaveOpen && data && <LeaveModal people={data.people} onClose={() => setLeaveOpen(false)} onSaved={refresh} />}
    </div>
  );
};

function exportMonth(view: MonthView) {
  const summary = view.people.map((p) => ({
    Member: p.name,
    Present: p.totals.present,
    'Of which early': p.totals.early,
    Late: p.totals.late,
    Absent: p.totals.absent,
    'On leave': p.totals.leave,
  }));
  const daily = view.people.map((p) => {
    const row: Record<string, string> = { Member: p.name };
    for (const d of p.days) {
      const time = d.checkInAt ? ` ${formatCheckInTime(d.checkInAt)}` : '';
      row[d.day.slice(8)] = `${dayCode(d.state, d.early, d.leaveHalf)}${time}`.trim();
    }
    return row;
  });
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(summary), 'Summary');
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(daily), 'Daily');
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
    ['Code', 'Meaning'], ['E', 'Present, early'], ['P', 'Present'], ['L', 'Late'], ['A', 'Absent'], ['LV', 'On leave'], ['HL', 'Half-day leave'], ['H', 'Holiday'], ['·', 'Day off'],
  ]), 'Legend');
  XLSX.writeFile(book, `attendance-${view.month}.xlsx`);
}

const MonthGrid: React.FC<{ view: MonthView }> = ({ view }) => (
  <div className={`${panelClass} overflow-x-auto`}>
    <table className="text-xs">
      <thead>
        <tr className="text-[10px] text-muted-foreground border-b border-border">
          <th className="px-4 py-3 text-left uppercase tracking-widest sticky left-0 bg-card">Member</th>
          <th className="px-2 py-3" title="Present">P</th>
          <th className="px-2 py-3" title="Of which early">E</th>
          <th className="px-2 py-3" title="Late">L</th>
          <th className="px-2 py-3" title="Absent">A</th>
          <th className="px-2 py-3" title="On leave">LV</th>
          {view.days.map((d) => <th key={d} className="px-1 py-3 font-mono">{d.slice(8)}</th>)}
        </tr>
      </thead>
      <tbody>
        {view.people.map((p) => (
          <tr key={p.userId} className="border-b border-border/50 last:border-0">
            <td className="px-4 py-2 font-bold text-foreground whitespace-nowrap sticky left-0 bg-card">{p.name}</td>
            <td className="px-2 py-2 text-center text-emerald-500 font-bold">{p.totals.present}</td>
            <td className="px-2 py-2 text-center text-emerald-500">{p.totals.early}</td>
            <td className="px-2 py-2 text-center text-amber-500 font-bold">{p.totals.late}</td>
            <td className="px-2 py-2 text-center text-red-400 font-bold">{p.totals.absent}</td>
            <td className="px-2 py-2 text-center text-sky-400 font-bold">{p.totals.leave}</td>
            {p.days.map((d) => (
              <td key={d.day} className="px-0.5 py-2">
                <span
                  title={`${d.day}: ${stateLabel(d.state, d.early, d.checkInAt, d.leaveHalf)}`}
                  className={`block w-6 h-6 leading-6 text-center rounded-md border text-[9px] font-bold ${STATE_TONES[d.state]}`}
                >
                  {dayCode(d.state, d.early, d.leaveHalf)}
                </span>
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const MonthTab: React.FC = () => {
  const [month, setMonth] = useState(todayKey().slice(0, 7));
  const { data, isLoading, isError, error } = useQuery({ queryKey: ['attendance', 'month', month], queryFn: () => attendanceApi.month(month) });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1.5">
          <label className={labelClass}>Month</label>
          <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className={inputClass} />
        </div>
        <button
          type="button"
          disabled={!data}
          onClick={() => data && exportMonth(data)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold disabled:opacity-50 cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" /> Download Excel
        </button>
      </div>
      {isLoading ? <Loading /> : isError || !data ? <ErrorBox error={error} fallback="Could not load the month." /> : <MonthGrid view={data} />}
      <p className="text-[10px] text-muted-foreground">E = present early · P = present · L = late · A = absent · LV = on leave · HL = half-day leave · H = holiday · · = day off. Hover a day for the check-in time.</p>
    </div>
  );
};

const HolidaysTab: React.FC<{ canManage: boolean }> = ({ canManage }) => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const confirm = useConfirm();
  const [year, setYear] = useState(todayKey().slice(0, 4));
  const [day, setDay] = useState('');
  const [name, setName] = useState('');
  const { data = [], isLoading, isError, error } = useQuery({ queryKey: ['attendance', 'holidays', year], queryFn: () => attendanceApi.holidays(year) });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['attendance'] });
  const add = useMutation({
    mutationFn: () => attendanceApi.addHoliday({ day, name: name.trim() }),
    onSuccess: () => { setDay(''); setName(''); refresh(); toast.success('Holiday added.', 'Attendance'); },
    onError: (err) => toast.error(apiError(err, 'Could not add the holiday.'), 'Attendance'),
  });
  const remove = useMutation({
    mutationFn: attendanceApi.removeHoliday,
    onSuccess: () => { refresh(); toast.success('Holiday removed.', 'Attendance'); },
    onError: (err) => toast.error(apiError(err, 'Could not remove the holiday.'), 'Attendance'),
  });
  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <label className={labelClass}>Year</label>
          <input type="number" min={2020} max={2100} value={year} onChange={(e) => setYear(e.target.value)} className={`${inputClass} w-24`} />
        </div>
        {canManage && (
          <>
            <div className="space-y-1.5">
              <label className={labelClass}>Date</label>
              <input type="date" value={day} onChange={(e) => setDay(e.target.value)} className={inputClass} />
            </div>
            <div className="space-y-1.5 flex-1 min-w-[160px]">
              <label className={labelClass}>Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Onam" className={`w-full ${inputClass}`} />
            </div>
            <button
              type="button"
              disabled={!day || name.trim().length < 2 || add.isPending}
              onClick={() => add.mutate()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold disabled:opacity-50 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Add holiday
            </button>
          </>
        )}
      </div>
      {isLoading ? <Loading /> : isError ? <ErrorBox error={error} fallback="Could not load holidays." /> : (
        <div className={panelClass}>
          {data.length === 0 ? <p className="p-6 text-xs text-muted-foreground">No holidays in {year}.</p> : data.map((h) => (
            <div key={h.day} className="flex items-center justify-between px-4 py-3 border-b border-border/50 last:border-0 text-xs">
              <span className="font-mono text-muted-foreground">{h.day}</span>
              <span className="flex-1 px-4 font-bold text-foreground">{h.name}</span>
              {canManage && (
                <button
                  type="button"
                  onClick={async () => { if (await confirm({ title: 'Remove holiday?', message: `${h.name} (${h.day}) becomes a normal working day.`, confirmLabel: 'Remove', variant: 'danger' })) remove.mutate(h.day); }}
                  className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/10 cursor-pointer"
                  aria-label={`Remove ${h.name}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const SettingsTab: React.FC<{ canManage: boolean }> = ({ canManage }) => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading, isError, error } = useQuery({ queryKey: ['attendance', 'settings'], queryFn: attendanceApi.settings });
  const [draft, setDraft] = useState<AttendanceSettings | null>(null);
  const s = draft ?? data;
  const save = useMutation({
    mutationFn: () => attendanceApi.updateSettings({
      enabled: s!.enabled, earlyBefore: s!.earlyBefore, lateAfter: s!.lateAfter, checkInFrom: s!.checkInFrom, absentAfter: s!.absentAfter, workingDays: s!.workingDays,
    }),
    onSuccess: (next) => { queryClient.setQueryData(['attendance', 'settings'], next); setDraft(null); queryClient.invalidateQueries({ queryKey: ['attendance'] }); toast.success('Attendance rules saved.', 'Attendance'); },
    onError: (err) => toast.error(apiError(err, 'Could not save the rules.'), 'Attendance'),
  });
  if (isLoading) return <Loading />;
  if (isError || !s) return <ErrorBox error={error} fallback="Could not load the rules." />;
  const set = (patch: Partial<AttendanceSettings>) => setDraft({ ...s, ...patch });
  const timeField = (key: 'checkInFrom' | 'earlyBefore' | 'lateAfter' | 'absentAfter', label: string, hint: string) => (
    <div className="space-y-1.5">
      <label className={labelClass}>{label}</label>
      <input type="time" value={s[key]} disabled={!canManage} onChange={(e) => set({ [key]: e.target.value } as Partial<AttendanceSettings>)} className={`w-full ${inputClass}`} />
      <p className="text-[10px] text-muted-foreground">{hint}</p>
    </div>
  );
  return (
    <div className={`${panelClass} p-6 space-y-5 max-w-2xl`}>
      <label className="flex items-center gap-2 text-xs font-bold text-foreground">
        <input type="checkbox" checked={s.enabled} disabled={!canManage} onChange={(e) => set({ enabled: e.target.checked })} /> Attendance is on for this workspace
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {timeField('checkInFrom', 'Check-in opens', 'Logins before this time do not count.')}
        {timeField('earlyBefore', 'Early before', 'A first check-in before this is Present · Early.')}
        {timeField('lateAfter', 'Late after', 'A first check-in after this is Late.')}
        {timeField('absentAfter', 'Absent from', 'No check-in by this time is Absent.')}
      </div>
      <div className="space-y-1.5">
        <label className={labelClass}>Working days</label>
        <div className="flex flex-wrap gap-2">
          {WEEKDAY_NAMES.map((name, i) => {
            const d = i + 1;
            const on = s.workingDays.includes(d);
            return (
              <button
                key={d}
                type="button"
                disabled={!canManage}
                onClick={() => set({ workingDays: on ? s.workingDays.filter((x) => x !== d) : [...s.workingDays, d].sort() })}
                className={`px-3 py-1.5 rounded-lg border text-xs font-bold cursor-pointer disabled:cursor-default ${on ? 'bg-blue-600/10 border-blue-500/30 text-blue-400' : 'border-border text-muted-foreground'}`}
              >
                {name}
              </button>
            );
          })}
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground">Everyone is signed out at 12:00 midnight (India time), so each day starts with a new login. Attendance is counted from {s.startedOn}.</p>
      {canManage && (
        <button
          type="button"
          disabled={!draft || save.isPending || s.workingDays.length === 0}
          onClick={() => save.mutate()}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold disabled:opacity-50 cursor-pointer"
        >
          {save.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save rules
        </button>
      )}
    </div>
  );
};

/** An employee's own month */
const MyAttendance: React.FC = () => {
  const [month, setMonth] = useState(todayKey().slice(0, 7));
  const { data, isLoading, isError, error } = useQuery({ queryKey: ['attendance', 'me', month], queryFn: () => attendanceApi.me(month) });
  const me = data?.people[0];
  const counted = (me?.days ?? []).filter((d) => d.state !== 'not_counted').reverse();
  return (
    <div className="space-y-4 max-w-2xl">
      <div className="space-y-1.5">
        <label className={labelClass}>Month</label>
        <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className={inputClass} />
      </div>
      {isLoading ? <Loading /> : isError || !me ? <ErrorBox error={error} fallback="Could not load your attendance." /> : (
        <>
          <div className="flex flex-wrap gap-2 text-[11px] font-bold">
            <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-500">Present {me.totals.present}{me.totals.early ? ` (${me.totals.early} early)` : ''}</span>
            <span className="px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-500">Late {me.totals.late}</span>
            <span className="px-2.5 py-1 rounded-lg bg-red-500/10 text-red-400">Absent {me.totals.absent}</span>
            <span className="px-2.5 py-1 rounded-lg bg-sky-500/10 text-sky-400">On leave {me.totals.leave}</span>
          </div>
          <div className={panelClass}>
            {counted.length === 0 ? <p className="p-6 text-xs text-muted-foreground">Nothing recorded this month yet.</p> : counted.map((d) => (
              <div key={d.day} className="flex items-center justify-between px-4 py-3 border-b border-border/50 last:border-0 text-xs">
                <span className="text-foreground font-bold">
                  {new Date(`${d.day}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })}
                </span>
                <StatusBadge state={d.state} early={d.early} checkInAt={d.checkInAt} leaveHalf={d.leaveHalf} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

// ─── Page ───────────────────────────────────────────────────────────────────────

/** '09:35' → '9:35 am', '12:00' → '12:00 noon' */
const clockLabel = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  if (h === 12 && m === 0) return '12:00 noon';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
};

/** The workspace's rules in one line (employees get them with their own month) */
const RulesSummary: React.FC<{ canRead: boolean }> = ({ canRead }) => {
  const month = todayKey().slice(0, 7);
  const settingsQuery = useQuery({ queryKey: ['attendance', 'settings'], queryFn: attendanceApi.settings, enabled: canRead });
  const meQuery = useQuery({ queryKey: ['attendance', 'me', month], queryFn: () => attendanceApi.me(month), enabled: !canRead });
  const s = canRead ? settingsQuery.data : meQuery.data?.settings;
  if (!s) return null;
  return (
    <p className="text-xs text-muted-foreground mt-1 font-light">
      The first check-in of the day counts: before {clockLabel(s.earlyBefore)} Present · Early, until {clockLabel(s.lateAfter)} Present, later
      Late. No check-in by {clockLabel(s.absentAfter)} is Absent.
    </p>
  );
};

type Tab = 'today' | 'month' | 'holidays' | 'settings';
const TABS: { key: Tab; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'month', label: 'Month' },
  { key: 'holidays', label: 'Holidays' },
  { key: 'settings', label: 'Settings' },
];

export const AttendancePage: React.FC = () => {
  const { can } = usePermissions();
  const canRead = can(PERMISSIONS.ATTENDANCE_READ);
  const canManage = can(PERMISSIONS.ATTENDANCE_MANAGE);
  const [tab, setTab] = useState<Tab>('today');

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <span className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
          <CalendarCheck className="w-5 h-5" />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Attendance</h1>
          <RulesSummary canRead={canRead} />
        </div>
      </div>

      {!canRead ? <MyAttendance /> : (
        <>
          <div role="tablist" className="flex flex-wrap gap-2">
            {TABS.map((t) => (
              <button
                key={t.key}
                role="tab"
                aria-selected={tab === t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                  tab === t.key ? 'bg-blue-600/10 border-blue-500/30 text-blue-400' : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          {tab === 'today' && <TodayTab canManage={canManage} />}
          {tab === 'month' && <MonthTab />}
          {tab === 'holidays' && <HolidaysTab canManage={canManage} />}
          {tab === 'settings' && <SettingsTab canManage={canManage} />}
        </>
      )}
    </div>
  );
};

export default AttendancePage;
