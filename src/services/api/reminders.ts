import { apiClient } from './client';

export type ReminderCategory = 'bill' | 'renewal' | 'subscription' | 'tax' | 'other';
export type ReminderRepeat = 'once' | 'monthly' | 'yearly' | 'custom';
export type ReminderStatus = 'active' | 'done' | 'cancelled';

export interface Reminder {
  id: string;
  seriesId: string;
  ownerId: string | null;
  ownerName: string;
  createdBy: string | null;
  createdByName: string | null;
  title: string;
  notes: string | null;
  category: ReminderCategory;
  amount: number | null;
  repeat: ReminderRepeat;
  everyN: number | null;
  everyUnit: 'day' | 'week' | 'month' | null;
  dueDate: string;
  status: ReminderStatus;
  nextNotifyAt: string | null;
  lastNotifiedAt: string | null;
  notifyCount: number;
  escalatedAt: string | null;
  completedAt: string | null;
  completedBy: string | null;
  completedByName: string | null;
  report: string | null;
  overdue: boolean;
  /** Days from today to the due date (negative = overdue) */
  dueInDays: number;
}

export interface ReminderProof {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

export interface ReminderDetail extends Reminder {
  proofs: ReminderProof[];
  history: (Reminder & { proofs: ReminderProof[] })[];
  members: { id: string; name: string }[];
}

export interface ReminderInput {
  title: string;
  notes: string | null;
  category: ReminderCategory;
  amount: number | null;
  repeat: ReminderRepeat;
  everyN: number | null;
  everyUnit: 'day' | 'week' | 'month' | null;
  dueDate: string;
  ownerId: string | null;
}

export const CATEGORY_LABELS: Record<ReminderCategory, string> = {
  bill: 'Bill',
  renewal: 'Renewal',
  subscription: 'Subscription',
  tax: 'Tax',
  other: 'Other',
};

export const remindersApi = {
  list: async (scope: 'mine' | 'all') =>
    (await apiClient.get<{ data: { reminders: Reminder[]; isAdmin: boolean; today: string } }>('/reminders', { params: { scope } })).data.data,
  get: async (id: string): Promise<ReminderDetail> => (await apiClient.get<{ data: ReminderDetail }>(`/reminders/${id}`)).data.data,
  create: async (input: ReminderInput): Promise<Reminder> => (await apiClient.post<{ data: Reminder }>('/reminders', input)).data.data,
  update: async (id: string, input: ReminderInput): Promise<Reminder> => (await apiClient.put<{ data: Reminder }>(`/reminders/${id}`, input)).data.data,
  cancel: async (id: string) => (await apiClient.post(`/reminders/${id}/cancel`)).data,
  complete: async (id: string, report: string, files: File[]) => {
    const form = new FormData();
    form.append('report', report);
    files.forEach((f) => form.append('files', f));
    return (await apiClient.post<{ data: { done: Reminder; next: Reminder | null } }>(`/reminders/${id}/complete`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })).data.data;
  },
  proofUrl: async (id: string, uploadId: string): Promise<string> =>
    (await apiClient.get<{ data: { url: string } }>(`/reminders/${id}/proofs/${uploadId}`)).data.data.url,
};

const dayLabel = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** "Due today", "Due in 3 days", "Overdue by 2 days" */
export function dueText(r: Pick<Reminder, 'status' | 'dueInDays'>): string {
  if (r.status === 'done') return 'Done';
  if (r.dueInDays === 0) return 'Due today';
  if (r.dueInDays === 1) return 'Due tomorrow';
  if (r.dueInDays > 1) return `Due in ${r.dueInDays} days`;
  return `Overdue by ${-r.dueInDays} day${r.dueInDays === -1 ? '' : 's'}`;
}

export const formatDue = (day: string) => dayLabel(day);

export const formatAmount = (amount: number | null) =>
  amount === null ? '' : amount.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });

export function repeatText(r: Pick<Reminder, 'repeat' | 'everyN' | 'everyUnit'>): string {
  if (r.repeat === 'monthly') return 'Every month';
  if (r.repeat === 'yearly') return 'Every year';
  if (r.repeat === 'custom' && r.everyN) return `Every ${r.everyN === 1 ? '' : `${r.everyN} `}${r.everyUnit}${r.everyN === 1 ? '' : 's'}`;
  return 'Once';
}
