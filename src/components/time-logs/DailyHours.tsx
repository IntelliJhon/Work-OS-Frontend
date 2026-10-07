import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Clock, Loader2 } from 'lucide-react';
import { HOURS_DAYS, addDays, formatMinutes, timeLogsApi, todayKey, type DayHours, type PersonHours } from '../../services/api/timeLogs';

// Hours worked per day (from task time logs). A working day with less than a full day (8 h; 4 h on a half day
// of leave) is highlighted. Days off, holidays and leave days show grey.

const dayName = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'UTC' });
const dayNum = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });

function tone(d: DayHours) {
  if (d.future) return 'border-dashed border-border text-muted-foreground';
  if (!d.workingDay || d.leave === 'full') return 'bg-muted/60 border-border text-muted-foreground';
  if (d.short) return 'bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-400';
  return 'bg-emerald-500/10 border-emerald-500/25 text-emerald-700 dark:text-emerald-400';
}

function note(d: DayHours) {
  if (!d.workingDay) return 'Day off';
  if (d.leave === 'full') return 'On leave';
  if (d.leave === 'half') return 'Half day';
  return '';
}

/** The day-by-day strip for one person */
export const DailyHoursStrip: React.FC<{ person: PersonHours; dayMinutes: number }> = ({ person, dayMinutes }) => (
  <ol className="grid grid-cols-7 gap-1.5" aria-label={`Hours per day for ${person.name}`}>
    {person.days.map((d) => (
      <li key={d.date} className={`rounded-xl border px-1.5 py-2 text-center ${tone(d)}`} title={`${dayName(d.date)} ${dayNum(d.date)}: ${formatMinutes(d.minutes)}${d.expectedMinutes ? ` of ${formatMinutes(d.expectedMinutes)}` : ''}${note(d) ? ` · ${note(d)}` : ''}`}>
        <p className="text-[10px] font-semibold opacity-80">{dayName(d.date)}</p>
        <p className="text-[10px] opacity-70">{dayNum(d.date)}</p>
        <p className="text-xs font-bold mt-1">{d.future ? '–' : d.minutes ? formatMinutes(d.minutes) : '0h'}</p>
        {note(d) && <p className="text-[9px] mt-0.5 opacity-80">{note(d)}</p>}
      </li>
    ))}
    <li className="sr-only">A full day is {formatMinutes(dayMinutes)}.</li>
  </ol>
);

/** Panel inside an employee's work reports: last two weeks, with the shortfall highlighted */
export const DailyHoursPanel: React.FC<{ userId: string }> = ({ userId }) => {
  const to = todayKey();
  const from = addDays(to, -(HOURS_DAYS - 1));
  const { data, isLoading, isError } = useQuery({
    queryKey: ['time-logs', 'daily', userId, from, to],
    queryFn: () => timeLogsApi.daily({ from, to, userId }),
    retry: false,
  });
  if (isError) return null;
  const person = data?.people[0];
  const today = person?.days.find((d) => d.date === to);
  return (
    <section aria-label="Hours worked" className="rounded-2xl border border-border p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-blue-500" /> Hours worked · last {HOURS_DAYS} days</h4>
        {person && (
          <p className="text-xs text-muted-foreground">
            Total <span className="font-semibold text-foreground">{formatMinutes(person.totalMinutes)}</span>
            {today && today.expectedMinutes > 0 && <> · Today <span className={`font-semibold ${today.short ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>{formatMinutes(today.minutes)}</span></>}
          </p>
        )}
      </div>
      {isLoading || !data ? (
        <div className="flex justify-center p-4"><Loader2 className="w-4 h-4 animate-spin text-blue-500" /></div>
      ) : !person ? null : (
        <>
          <DailyHoursStrip person={person} dayMinutes={data.dayMinutes} />
          {person.shortDays > 0 && (
            <p className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" /> {person.shortDays} working day{person.shortDays === 1 ? '' : 's'} with less than {formatMinutes(data.dayMinutes)} logged.
            </p>
          )}
        </>
      )}
    </section>
  );
};

/** Small chip for an employee card: today's hours, red when short */
export const TodayHoursChip: React.FC<{ person?: PersonHours }> = ({ person }) => {
  if (!person) return null;
  const today = person.days.find((d) => d.date === todayKey());
  if (!today) return null;
  const off = today.expectedMinutes === 0;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[10px] font-bold ${off ? 'bg-muted text-muted-foreground border-border' : today.short ? 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/25' : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/25'}`}
      title={person.shortDays ? `${person.shortDays} short day(s) in the last ${HOURS_DAYS} days` : `Full days logged in the last ${HOURS_DAYS} days`}
    >
      <Clock className="w-3 h-3" /> Today {formatMinutes(today.minutes)}{off ? ` · ${today.leave === 'full' ? 'leave' : 'day off'}` : ''}
      {person.shortDays > 0 && <span className="opacity-80">· {person.shortDays} short</span>}
    </span>
  );
};
