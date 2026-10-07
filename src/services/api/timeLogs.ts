import { useQuery } from '@tanstack/react-query';
import { apiClient } from './client';

// Time worked on project tasks; each entry is also a work report in the Employees section.

export interface TimeLog {
  id: string;
  taskId: string;
  projectId: string | null;
  userId: string;
  userName: string | null;
  workDate: string;
  minutes: number;
  note: string;
  createdAt: string;
  canEdit: boolean;
}

export interface TaskTime {
  entries: TimeLog[];
  totalMinutes: number;
  estimateMinutes: number | null;
  canLog: boolean;
  reason: 'not_assignee' | 'not_project' | 'done' | null;
}

export interface DayHours {
  date: string;
  minutes: number;
  expectedMinutes: number;
  workingDay: boolean;
  leave: 'full' | 'half' | null;
  future: boolean;
  /** A past or current working day with less than a full day logged */
  short: boolean;
}

export interface PersonHours {
  userId: string;
  name: string;
  totalMinutes: number;
  shortDays: number;
  days: DayHours[];
}

export interface DailyHours {
  from: string;
  to: string;
  dayMinutes: number;
  people: PersonHours[];
}

export const timeLogsApi = {
  forTask: async (taskId: string) => (await apiClient.get<{ data: TaskTime }>(`/time-logs/task/${taskId}`)).data.data,
  daily: async (params: { from: string; to: string; userId?: string }) =>
    (await apiClient.get<{ data: DailyHours }>('/time-logs/daily', { params })).data.data,
  create: async (input: { taskId: string; workDate: string; minutes: number; note: string }) =>
    (await apiClient.post<{ data: TimeLog }>('/time-logs', input)).data.data,
  update: async (id: string, input: Partial<{ workDate: string; minutes: number; note: string }>) =>
    (await apiClient.patch<{ data: TimeLog }>(`/time-logs/${id}`, input)).data.data,
  remove: async (id: string) => (await apiClient.delete(`/time-logs/${id}`)).data,
};

/** 150 → "2h 30m" */
export function formatMinutes(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h && m ? `${h}h ${m}m` : h ? `${h}h` : `${m}m`;
}

/** Today in India time, 'YYYY-MM-DD' */
export const todayKey = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

export const addDays = (day: string, n: number) => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

export const HOURS_DAYS = 14;

/** Everyone's hours for the last two weeks (only the viewer for people who aren't Admins or Project Managers) */
export function useTeamHours() {
  const to = todayKey();
  const from = addDays(to, -(HOURS_DAYS - 1));
  return useQuery({
    queryKey: ['time-logs', 'daily', 'team', from, to],
    queryFn: () => timeLogsApi.daily({ from, to }),
    staleTime: 60_000,
    retry: false,
  });
}
