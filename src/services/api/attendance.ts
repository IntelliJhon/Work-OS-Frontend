import { apiClient } from './client';

export type AttendanceStatus = 'present' | 'late' | 'absent' | 'leave';
/** A person's day: a stored status, or one implied by the calendar */
export type DayState = AttendanceStatus | 'holiday' | 'day_off' | 'not_checked_in' | 'not_counted';

export interface AttendanceRecord {
  id: string;
  userId: string;
  day: string;
  status: AttendanceStatus;
  early: boolean;
  checkInAt: string | null;
  latitude: number | null;
  longitude: number | null;
  accuracyM: number | null;
  /** ok | denied | unavailable; null for an admin's entry */
  locationStatus: string | null;
  note: string | null;
  correctedBy: string | null;
  correctedAt: string | null;
}

export interface AttendanceSettings {
  enabled: boolean;
  earlyBefore: string;
  lateAfter: string;
  checkInFrom: string;
  absentAfter: string;
  /** ISO weekdays, 1 = Monday … 7 = Sunday */
  workingDays: number[];
  startedOn: string;
}

export interface CheckInResult {
  code: 'recorded' | 'disabled' | 'not_started' | 'day_off' | 'holiday' | 'too_early';
  created: boolean;
  day: string;
  record?: AttendanceRecord;
  holiday?: string;
  opensAt?: string;
}

export interface DayView {
  day: string;
  holiday: string | null;
  settings: AttendanceSettings;
  people: { userId: string; name: string; email: string; state: DayState; record: AttendanceRecord | null }[];
}

export interface MonthPerson {
  userId: string;
  name: string;
  totals: { present: number; early: number; late: number; absent: number; leave: number };
  days: { day: string; state: DayState; early: boolean; checkInAt: string | null; locationStatus: string | null }[];
}

export interface MonthView {
  month: string;
  days: string[];
  holidays: { day: string; name: string }[];
  settings: AttendanceSettings;
  people: MonthPerson[];
}

export interface Holiday {
  day: string;
  name: string;
}

export interface CheckInLocation {
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  locationStatus: 'ok' | 'denied' | 'unavailable';
}

export const attendanceApi = {
  checkIn: async (location: CheckInLocation): Promise<CheckInResult> => {
    const { data } = await apiClient.post<{ success: boolean } & CheckInResult>('/attendance/check-in', location);
    return data;
  },
  me: async (month: string): Promise<MonthView> => {
    const { data } = await apiClient.get<{ data: MonthView }>('/attendance/me', { params: { month } });
    return data.data;
  },
  day: async (date: string): Promise<DayView> => {
    const { data } = await apiClient.get<{ data: DayView }>('/attendance/day', { params: { date } });
    return data.data;
  },
  month: async (month: string): Promise<MonthView> => {
    const { data } = await apiClient.get<{ data: MonthView }>('/attendance/month', { params: { month } });
    return data.data;
  },
  correct: async (payload: { userId: string; day: string; status: AttendanceStatus; early?: boolean; reason: string }) => {
    const { data } = await apiClient.put<{ data: AttendanceRecord }>('/attendance/records', payload);
    return data.data;
  },
  setLeave: async (payload: { userId: string; from: string; to: string; reason: string }) => {
    const { data } = await apiClient.post<{ data: { days: number } }>('/attendance/leave', payload);
    return data.data;
  },
  holidays: async (year: string): Promise<Holiday[]> => {
    const { data } = await apiClient.get<{ data: Holiday[] }>('/attendance/holidays', { params: { year } });
    return data.data;
  },
  addHoliday: async (payload: Holiday) => {
    const { data } = await apiClient.post<{ data: Holiday }>('/attendance/holidays', payload);
    return data.data;
  },
  removeHoliday: async (day: string) => {
    await apiClient.delete(`/attendance/holidays/${day}`);
  },
  settings: async (): Promise<AttendanceSettings> => {
    const { data } = await apiClient.get<{ data: AttendanceSettings }>('/attendance/settings');
    return data.data;
  },
  updateSettings: async (payload: Partial<Omit<AttendanceSettings, 'startedOn'>>): Promise<AttendanceSettings> => {
    const { data } = await apiClient.put<{ data: AttendanceSettings }>('/attendance/settings', payload);
    return data.data;
  },
};

/** "9:10 am" in India time */
export const formatCheckInTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : '';

/** The day's label, e.g. "Present · Early · 9:10 am" */
export function stateLabel(state: DayState, early: boolean, checkInAt: string | null): string {
  const time = formatCheckInTime(checkInAt);
  switch (state) {
    case 'present': return ['Present', early ? 'Early' : null, time || null].filter(Boolean).join(' · ');
    case 'late': return ['Late', time || null].filter(Boolean).join(' · ');
    case 'absent': return 'Absent';
    case 'leave': return 'On leave';
    case 'holiday': return 'Holiday';
    case 'day_off': return 'Day off';
    case 'not_checked_in': return 'Not checked in yet';
    default: return '—';
  }
}
