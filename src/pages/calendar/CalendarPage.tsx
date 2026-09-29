import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertTriangle,
  Link2,
  Copy,
  RefreshCw,
  BellRing,
  ExternalLink,
} from 'lucide-react';
import { tasksApi, type Task } from '../../services/api/tasks.api';
import { calendarApi, calendarFeedUrl, calendarWebcalUrl } from '../../services/api/calendar';
import { useAuthStore } from '../../store/authStore';
import { useToast } from '../../components/ui/Toast';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { REMINDER_OPTIONS } from '../../components/tasks/DueReminderFields';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const FINISHED = ['done', 'completed', 'cancelled'];
const MAX_PER_DAY = 3;

/** 'YYYY-MM-DD' of a local date */
const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** '5:00 pm' from 'HH:mm' */
const formatTime = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
};

/** "30 min before", "2 hours before", or "45 min before" for other gaps */
const minutesLabel = (minutes: number) =>
  REMINDER_OPTIONS.find((o) => o.value === minutes)?.label.toLowerCase() ??
  (minutes % 60 === 0 ? `${minutes / 60} hours before` : `${minutes} min before`);

/**
 * The reminder the server actually scheduled (which can differ from the choice: if the chosen time had
 * already passed, it goes 30 min before the due time, or not at all), or null when none was chosen.
 */
const reminderText = (t: Task): string | null => {
  if (!t.customFields?.dueTime || !t.customFields?.reminderMinutes) return null;
  if (t.reminderSentAt) return 'Reminder sent';
  if (!t.remindAt || !t.dueAt) return 'No reminder (due too soon)';
  const minutes = Math.round((new Date(t.dueAt).getTime() - new Date(t.remindAt).getTime()) / 60_000);
  return `Reminder ${minutesLabel(minutes)}`;
};

/** The 6 weeks (Monday first) shown for a month */
const monthGrid = (month: Date): Date[] => {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7; // days since Monday
  return Array.from({ length: 42 }, (_, i) => new Date(first.getFullYear(), first.getMonth(), 1 - offset + i));
};

const byTime = (a: Task, b: Task) => (a.customFields?.dueTime || '99:99').localeCompare(b.customFields?.dueTime || '99:99');

export const CalendarPage: React.FC = () => {
  const user = useAuthStore((state) => state.user);
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selectedDay, setSelectedDay] = useState(() => dayKey(new Date()));
  const [scope, setScope] = useState<'mine' | 'all'>('mine');

  const { data: tasks = [], isLoading, isError } = useQuery({ queryKey: ['tasks'], queryFn: tasksApi.list });

  // Work with a due date, grouped by day
  const byDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of tasks) {
      const due = t.customFields?.dueDate;
      if (!due || !/^\d{4}-\d{2}-\d{2}/.test(due)) continue;
      if (scope === 'mine' && t.assigneeId !== user?.id) continue;
      const key = due.slice(0, 10);
      map.set(key, [...(map.get(key) ?? []), t]);
    }
    for (const list of map.values()) list.sort(byTime);
    return map;
  }, [tasks, scope, user?.id]);

  const today = dayKey(new Date());
  const days = monthGrid(month);
  const selectedTasks = byDay.get(selectedDay) ?? [];
  const isOverdue = (t: Task, key: string) => !FINISHED.includes(t.status) && key < today;

  const shiftMonth = (delta: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + delta, 1));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Calendar</h1>
          <p className="text-xs text-muted-foreground mt-1 font-light">
            Work by due date. Reminders go out on WhatsApp and in Work OS before the due time.
          </p>
        </div>
        <div role="tablist" className="flex gap-2">
          {(['mine', 'all'] as const).map((s) => (
            <button
              key={s}
              role="tab"
              aria-selected={scope === s}
              type="button"
              onClick={() => setScope(s)}
              className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                scope === s
                  ? 'bg-blue-600/10 border-blue-500/30 text-blue-400'
                  : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              {s === 'mine' ? 'My work' : 'All work'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6">
        {/* Month */}
        <div className="glass-panel rounded-2xl border border-border bg-card/40 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
              aria-label="Previous month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-bold text-foreground">
                {month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
              </h2>
              <button
                type="button"
                onClick={() => {
                  const now = new Date();
                  setMonth(new Date(now.getFullYear(), now.getMonth(), 1));
                  setSelectedDay(dayKey(now));
                }}
                className="px-2.5 py-1 rounded-lg border border-border text-[10px] font-bold text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
              >
                Today
              </button>
            </div>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
              aria-label="Next month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {isLoading ? (
            <div className="p-10 flex justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
            </div>
          ) : isError ? (
            <div className="p-6 flex items-center gap-3 text-xs text-rose-400">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Could not load work.</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <div className="grid grid-cols-7 gap-px bg-border rounded-xl overflow-hidden min-w-[640px]">
                {WEEKDAYS.map((d) => (
                  <div key={d} className="bg-card px-2 py-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    {d}
                  </div>
                ))}
                {days.map((d) => {
                  const key = dayKey(d);
                  const list = byDay.get(key) ?? [];
                  const inMonth = d.getMonth() === month.getMonth();
                  const isSelected = key === selectedDay;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSelectedDay(key)}
                      className={`bg-card min-h-[92px] p-1.5 text-left align-top flex flex-col gap-1 cursor-pointer transition-colors hover:bg-muted/60 ${
                        isSelected ? 'ring-2 ring-inset ring-blue-500/60' : ''
                      } ${inMonth ? '' : 'opacity-40'}`}
                    >
                      <span
                        className={`text-[11px] font-bold w-6 h-6 flex items-center justify-center rounded-full ${
                          key === today ? 'bg-blue-600 text-white' : 'text-foreground'
                        }`}
                      >
                        {d.getDate()}
                      </span>
                      {list.slice(0, MAX_PER_DAY).map((t) => (
                        <span
                          key={t.id}
                          title={t.name}
                          className={`block truncate text-[10px] px-1.5 py-0.5 rounded-md border ${
                            FINISHED.includes(t.status)
                              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500 line-through'
                              : isOverdue(t, key)
                                ? 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                                : 'bg-blue-500/10 border-blue-500/20 text-blue-500 dark:text-blue-300'
                          }`}
                        >
                          {t.customFields?.dueTime ? `${formatTime(t.customFields.dueTime)} · ` : ''}
                          {t.name}
                        </span>
                      ))}
                      {list.length > MAX_PER_DAY && (
                        <span className="text-[10px] text-muted-foreground px-1">+{list.length - MAX_PER_DAY} more</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-6">
          {/* Selected day */}
          <div className="glass-panel rounded-2xl border border-border bg-card/40 p-4 space-y-3">
            <h3 className="text-xs font-bold text-foreground">
              {new Date(`${selectedDay}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
            </h3>
            {selectedTasks.length === 0 ? (
              <p className="text-xs text-muted-foreground">No work due this day.</p>
            ) : (
              <ul className="space-y-2">
                {selectedTasks.map((t) => (
                  <li key={t.id} className="rounded-xl border border-border p-3 space-y-1">
                    <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground">
                      {t.taskNumber ? <span className="text-blue-400">W-{t.taskNumber}</span> : null}
                      <span>{t.customFields?.dueTime ? formatTime(t.customFields.dueTime) : 'All day'}</span>
                      {FINISHED.includes(t.status) && <span className="text-emerald-500">Done</span>}
                      {isOverdue(t, selectedDay) && <span className="text-rose-400">Overdue</span>}
                    </div>
                    <p className="text-xs text-foreground font-medium">{t.name}</p>
                    {reminderText(t) && (
                      <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <BellRing className="w-3 h-3" />
                        {reminderText(t)}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <CalendarLinkCard />
        </div>
      </div>
    </div>
  );
};

/** The user's private calendar link, to add their work to Google Calendar, Outlook or iPhone. */
const CalendarLinkCard: React.FC = () => {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<string>, failure: string) => {
    setBusy(true);
    try {
      setToken(await action());
    } catch {
      toast.error(failure, 'Calendar');
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(calendarFeedUrl(token));
      toast.success('Calendar link copied.', 'Calendar');
    } catch {
      toast.error('Could not copy the link. Select it and copy it by hand.', 'Calendar');
    }
  };

  const reset = async () => {
    const ok = await confirm({
      title: 'Create a new calendar link?',
      message: 'The old link stops working. You will have to add the new link to your calendar app again.',
      confirmLabel: 'New link',
      variant: 'warning',
    });
    if (ok) run(calendarApi.resetFeedToken, 'Could not create a new link.');
  };

  return (
    <div className="glass-panel rounded-2xl border border-border bg-card/40 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <CalendarDays className="w-4 h-4 text-blue-400" />
        <h3 className="text-xs font-bold text-foreground">Add to my calendar</h3>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Your work, with its due times and reminders, in Google Calendar, Outlook or your iPhone. Keep this link private:
        anyone with it can see your work.
      </p>

      {!token ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => run(calendarApi.getFeedToken, 'Could not load your calendar link.')}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold disabled:opacity-50 cursor-pointer"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
          <span>Show my calendar link</span>
        </button>
      ) : (
        <div className="space-y-3">
          <input
            readOnly
            value={calendarFeedUrl(token)}
            onFocus={(e) => e.target.select()}
            className="w-full px-3 py-2 glass-input rounded-xl text-[10px] text-foreground font-mono focus:outline-none"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={copy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted hover:bg-accent text-foreground text-[11px] font-bold cursor-pointer"
            >
              <Copy className="w-3 h-3" />
              Copy
            </button>
            <a
              href={calendarWebcalUrl(token)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted hover:bg-accent text-foreground text-[11px] font-bold"
            >
              <ExternalLink className="w-3 h-3" />
              Open in calendar app
            </a>
            <button
              type="button"
              disabled={busy}
              onClick={reset}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted text-[11px] font-bold disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" />
              New link
            </button>
          </div>
          <ul className="text-[11px] text-muted-foreground space-y-1.5 list-disc pl-4">
            <li>
              <b className="text-foreground">Google Calendar</b> (on a computer): Other calendars → + → From URL → paste the link.
            </li>
            <li>
              <b className="text-foreground">iPhone</b>: Settings → Calendar → Accounts → Add Account → Other → Add Subscribed Calendar.
            </li>
            <li>
              <b className="text-foreground">Outlook</b>: Add calendar → Subscribe from web.
            </li>
          </ul>
          <p className="text-[10px] text-muted-foreground">
            Google Calendar can take a few hours to show new work; the WhatsApp reminder always comes on time.
          </p>
        </div>
      )}
    </div>
  );
};

export default CalendarPage;
