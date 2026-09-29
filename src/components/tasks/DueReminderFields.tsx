import React from 'react';

/** How long before the due time the assignee is reminded (WhatsApp + Work OS notification). */
export const REMINDER_OPTIONS = [
  { value: 0, label: 'No reminder' },
  { value: 30, label: '30 min before' },
  { value: 60, label: '1 hour before' },
  { value: 120, label: '2 hours before' },
  { value: 180, label: '3 hours before' },
  { value: 1440, label: '1 day before' },
] as const;

/** Reminder suggested when a due time is first set */
export const DEFAULT_REMINDER_MINUTES = 120;

/** Due time and reminder for customFields; both are dropped when there is no due date or time. */
export const dueReminderFields = (dueDate: string, dueTime: string, reminderMinutes: number) => ({
  dueTime: dueDate && dueTime ? dueTime : undefined,
  reminderMinutes: dueDate && dueTime && reminderMinutes > 0 ? reminderMinutes : undefined,
});

interface DueReminderFieldsProps {
  dueDate: string;
  dueTime: string;
  reminderMinutes: number;
  onDueTimeChange: (value: string) => void;
  onReminderChange: (minutes: number) => void;
  disabled?: boolean;
}

const labelClass = 'text-[9px] font-bold text-muted-foreground uppercase tracking-widest block';

export const DueReminderFields: React.FC<DueReminderFieldsProps> = ({
  dueDate,
  dueTime,
  reminderMinutes,
  onDueTimeChange,
  onReminderChange,
  disabled,
}) => {
  const reminderDisabled = disabled || !dueDate || !dueTime;
  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="space-y-1.5">
        <label className={labelClass}>Due Time</label>
        <input
          type="time"
          value={dueTime}
          disabled={disabled || !dueDate}
          onChange={(e) => onDueTimeChange(e.target.value)}
          title={dueDate ? undefined : 'Set a due date first'}
          className="w-full px-3 py-2 glass-input text-foreground text-xs rounded-xl focus:outline-none disabled:opacity-50"
        />
      </div>
      <div className="space-y-1.5">
        <label className={labelClass}>Remind</label>
        <select
          value={reminderDisabled ? 0 : reminderMinutes}
          disabled={reminderDisabled}
          onChange={(e) => onReminderChange(Number(e.target.value))}
          title={reminderDisabled && !disabled ? 'Set a due date and time to get a reminder' : undefined}
          className="w-full px-3 py-2 glass-input text-foreground text-xs rounded-xl focus:outline-none disabled:opacity-50 [&>option]:bg-background [&>option]:text-foreground"
        >
          {REMINDER_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
    </div>
  );
};
