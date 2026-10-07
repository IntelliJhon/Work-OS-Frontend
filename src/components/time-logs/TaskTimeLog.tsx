import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, Loader2, Pencil, Trash2, X } from 'lucide-react';
import { useToast } from '../ui/Toast';
import { useConfirm } from '../ui/ConfirmDialog';
import { addDays, formatMinutes, timeLogsApi, todayKey, type TimeLog } from '../../services/api/timeLogs';

// "Log time" on a project task: the person it is assigned to records, per day, how long they worked on it and
// what they did. Each entry is also a work report in Employees. Others who can see the task see the totals.

const BACK_DAYS = 7;
const apiError = (err: unknown, fallback: string) => (err as { response?: { data?: { error?: string } } })?.response?.data?.error || fallback;
const dayLabel = (day: string) =>
  day === todayKey() ? 'Today' : day === addDays(todayKey(), -1) ? 'Yesterday'
    : new Date(`${day}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

const inputClass =
  'w-full px-3 py-2 rounded-xl border border-border bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50';
const labelClass = 'text-xs font-semibold text-foreground';

const EntryForm: React.FC<{ taskId: string; entry?: TimeLog; onDone: () => void }> = ({ taskId, entry, onDone }) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const today = todayKey();
  const [workDate, setWorkDate] = useState(entry?.workDate ?? today);
  const [hours, setHours] = useState(entry ? String(Math.floor(entry.minutes / 60)) : '');
  const [mins, setMins] = useState(entry ? String(entry.minutes % 60) : '0');
  const [note, setNote] = useState(entry?.note ?? '');
  const [tried, setTried] = useState(false);
  const total = (Number(hours) || 0) * 60 + (Number(mins) || 0);
  const problems = {
    time: !(total >= 1) ? 'Enter how long you worked' : total > 24 * 60 ? 'At most 24 hours' : '',
    date: !workDate || workDate > today ? 'Choose today or an earlier day' : workDate < addDays(today, -BACK_DAYS) ? `Only the last ${BACK_DAYS} days` : '',
    note: !note.trim() ? 'Write what you did' : '',
  };
  const invalid = Object.values(problems).some(Boolean);
  const save = useMutation({
    mutationFn: () => (entry
      ? timeLogsApi.update(entry.id, { workDate, minutes: total, note: note.trim() })
      : timeLogsApi.create({ taskId, workDate, minutes: total, note: note.trim() })),
    onSuccess: () => {
      toast.success(entry ? 'Time entry updated.' : `${formatMinutes(total)} logged. It's in your work report too.`, 'Time');
      queryClient.invalidateQueries({ queryKey: ['time-logs'] });
      onDone();
    },
    onError: (err) => toast.error(apiError(err, 'Could not save the time.'), 'Time'),
  });
  const err = (k: keyof typeof problems) => tried && problems[k] ? <p className="mt-1 text-[11px] text-red-500">{problems[k]}</p> : null;

  return (
    <form noValidate onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); setTried(true); if (!invalid) save.mutate(); }} className="space-y-3 rounded-xl border border-border bg-muted/30 p-3">
      <div className="grid grid-cols-1 sm:grid-cols-[1.3fr_1fr] gap-3">
        <div className="space-y-1.5">
          <label htmlFor={`tl-date-${entry?.id ?? 'new'}`} className={labelClass}>Day</label>
          <input id={`tl-date-${entry?.id ?? 'new'}`} type="date" value={workDate} min={addDays(today, -BACK_DAYS)} max={today} onChange={(e) => setWorkDate(e.target.value)} className={inputClass} />
          {err('date')}
        </div>
        <div className="space-y-1.5">
          <span className={labelClass}>Time worked</span>
          <div className="flex items-center gap-2">
            <label className="sr-only" htmlFor={`tl-h-${entry?.id ?? 'new'}`}>Hours</label>
            <input id={`tl-h-${entry?.id ?? 'new'}`} type="number" inputMode="numeric" min={0} max={24} value={hours} placeholder="0" onChange={(e) => setHours(e.target.value)} className={`${inputClass} w-16`} />
            <span className="text-xs text-muted-foreground">h</span>
            <label className="sr-only" htmlFor={`tl-m-${entry?.id ?? 'new'}`}>Minutes</label>
            <select id={`tl-m-${entry?.id ?? 'new'}`} value={mins} onChange={(e) => setMins(e.target.value)} className={`${inputClass} w-20 [&>option]:bg-background`}>
              {['0', '15', '30', '45'].concat(entry && ![0, 15, 30, 45].includes(entry.minutes % 60) ? [String(entry.minutes % 60)] : []).map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <span className="text-xs text-muted-foreground">m</span>
          </div>
          {err('time')}
        </div>
      </div>
      <div className="space-y-1.5">
        <label htmlFor={`tl-note-${entry?.id ?? 'new'}`} className={labelClass}>What did you do?</label>
        <textarea id={`tl-note-${entry?.id ?? 'new'}`} rows={2} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Built the login page and fixed the menu on mobile" className={`${inputClass} resize-y`} />
        {err('note')}
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onDone} className="px-3 py-1.5 rounded-xl border border-border text-xs font-semibold text-foreground hover:bg-muted cursor-pointer">Cancel</button>
        <button type="submit" disabled={save.isPending} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold disabled:opacity-50 cursor-pointer">
          {save.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />} {entry ? 'Save' : 'Log time'}
        </button>
      </div>
    </form>
  );
};

const TimeLogModal: React.FC<{ taskId: string; taskName: string; onClose: () => void }> = ({ taskId, taskName, onClose }) => {
  const { toast } = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['time-logs', 'task', taskId], queryFn: () => timeLogsApi.forTask(taskId) });
  const [adding, setAdding] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const remove = useMutation({
    mutationFn: (id: string) => timeLogsApi.remove(id),
    onSuccess: () => { toast.success('Time entry deleted.', 'Time'); queryClient.invalidateQueries({ queryKey: ['time-logs'] }); },
    onError: (err) => toast.error(apiError(err, 'Could not delete the entry.'), 'Time'),
  });
  const canLog = !!data?.canLog;
  const pct = data?.estimateMinutes ? Math.min(100, Math.round((data.totalMinutes / data.estimateMinutes) * 100)) : null;

  return createPortal(
    // Events from this portal must not reach the planner underneath
    <div onClick={(e) => e.stopPropagation()} onSubmit={(e) => e.stopPropagation()} className="fixed inset-0 z-[60] flex items-start sm:items-center justify-center p-4 bg-background/70 backdrop-blur-sm overflow-y-auto" role="dialog" aria-modal="true" aria-label={`Time on ${taskName}`}>
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card shadow-2xl my-8">
        <div className="flex items-start justify-between gap-3 p-5 border-b border-border">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-foreground flex items-center gap-2"><Clock className="w-4 h-4 text-blue-500" /> Time worked</h2>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{taskName}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted cursor-pointer"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          {isLoading || !data ? (
            <div className="flex justify-center p-6"><Loader2 className="w-5 h-5 animate-spin text-blue-500" /></div>
          ) : (
            <>
              <div className="rounded-xl border border-border p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-sm font-bold text-foreground">{formatMinutes(data.totalMinutes)} logged</p>
                  <p className="text-xs text-muted-foreground">{data.estimateMinutes ? `of ${formatMinutes(data.estimateMinutes)} estimated` : 'No estimate set'}</p>
                </div>
                {pct !== null && (
                  <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                    <div className={`h-full rounded-full ${data.totalMinutes > (data.estimateMinutes ?? 0) ? 'bg-red-500' : 'bg-blue-500'}`} style={{ width: `${pct}%` }} />
                  </div>
                )}
              </div>

              {canLog && (adding
                ? <EntryForm taskId={taskId} onDone={() => setAdding(false)} />
                : <button type="button" onClick={() => setAdding(true)} className="w-full px-3 py-2 rounded-xl border-2 border-dashed border-border text-sm font-semibold text-muted-foreground hover:text-foreground hover:border-blue-500/40 cursor-pointer">+ Log more time</button>)}
              {!canLog && data.reason === 'done' && <p className="text-xs text-muted-foreground">This work is done, so its time is final.</p>}
              {!canLog && data.reason === 'not_assignee' && <p className="text-xs text-muted-foreground">Only the person this work is assigned to logs time on it.</p>}

              {data.entries.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-3">No time logged yet.</p>
              ) : (
                <ul className="space-y-2">
                  {data.entries.map((e) => (
                    <li key={e.id} className="rounded-xl border border-border p-3">
                      {editingId === e.id ? (
                        <EntryForm taskId={taskId} entry={e} onDone={() => setEditingId(null)} />
                      ) : (
                        <div className="flex items-start gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs text-muted-foreground">
                              <span className="font-semibold text-foreground">{formatMinutes(e.minutes)}</span> · {dayLabel(e.workDate)}{e.userName ? ` · ${e.userName}` : ''}
                            </p>
                            <p className="text-sm text-foreground mt-0.5 whitespace-pre-wrap break-words">{e.note}</p>
                          </div>
                          {e.canEdit && canLog && (
                            <div className="flex gap-1 shrink-0">
                              <button type="button" aria-label="Edit entry" onClick={() => setEditingId(e.id)} className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted cursor-pointer"><Pencil className="w-3.5 h-3.5" /></button>
                              <button type="button" aria-label="Delete entry" disabled={remove.isPending}
                                onClick={async () => { if (await confirm({ title: 'Delete this time entry?', message: 'Its work report is deleted too.', confirmLabel: 'Delete', variant: 'danger' })) remove.mutate(e.id); }}
                                className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-500/10 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
                            </div>
                          )}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};

/** The chip on a task row: time logged so far; opens the time log (and lets the assignee log time) */
export const TaskTimeChip: React.FC<{ taskId: string; taskName: string; isAssignee: boolean; done: boolean }> = ({ taskId, taskName, isAssignee, done }) => {
  const [open, setOpen] = useState(false);
  const { data } = useQuery({ queryKey: ['time-logs', 'task', taskId], queryFn: () => timeLogsApi.forTask(taskId), staleTime: 30_000 });
  const total = data?.totalMinutes ?? 0;
  const label = isAssignee && !done ? (total ? `${formatMinutes(total)} · Log time` : 'Log time') : total ? formatMinutes(total) : '0h';
  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        title={data?.estimateMinutes ? `${formatMinutes(total)} of ${formatMinutes(data.estimateMinutes)} estimated` : `${formatMinutes(total)} logged`}
        className={`flex items-center gap-1.5 rounded-lg px-2 py-1 text-[10px] font-bold border cursor-pointer ${
          isAssignee && !done ? 'bg-blue-600 border-blue-600 text-white hover:bg-blue-500' : 'bg-slate-100/50 dark:bg-white/5 border-slate-200/50 dark:border-white/5 text-slate-600 dark:text-zinc-400 hover:text-foreground'}`}
      >
        <Clock className="w-3.5 h-3.5" /> {label}
      </button>
      {open && <TimeLogModal taskId={taskId} taskName={taskName} onClose={() => setOpen(false)} />}
    </>
  );
};
