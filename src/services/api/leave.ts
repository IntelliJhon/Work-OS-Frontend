import { apiClient } from './client';

export type LeaveStatus = 'pending_manager' | 'pending_admin' | 'approved' | 'rejected' | 'cancelled';
export type HalfDay = 'first' | 'second';

export interface LeaveRequest {
  id: string;
  userId: string;
  userName: string;
  fromDay: string;
  toDay: string;
  halfDay: HalfDay | null;
  reason: string;
  status: LeaveStatus;
  /** Working days asked for (0.5 for a half day) */
  days: number;
  managerId: string | null;
  managerName: string | null;
  managerBy: string | null;
  managerByName: string | null;
  managerAt: string | null;
  managerComment: string | null;
  adminBy: string | null;
  adminByName: string | null;
  adminAt: string | null;
  adminComment: string | null;
  escalatedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  /** Who decides next, e.g. "Akash K S" or "an Admin"; null when closed */
  waitingFor: string | null;
}

export interface LeaveClashes {
  othersAway: { name: string; fromDay: string; toDay: string; halfDay: HalfDay | null; status: LeaveStatus }[];
  dueWork: { workId: string | null; name: string; due: string | null }[];
}

export type InboxRequest = LeaveRequest & { clashes: LeaveClashes };

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  tier: 'admin' | 'manager' | 'employee';
  reportsTo: string | null;
}

export const leaveApi = {
  mine: async (): Promise<LeaveRequest[]> => (await apiClient.get<{ data: LeaveRequest[] }>('/leave/mine')).data.data,
  inbox: async (): Promise<InboxRequest[]> => (await apiClient.get<{ data: InboxRequest[] }>('/leave/inbox')).data.data,
  all: async (month: string): Promise<LeaveRequest[]> => (await apiClient.get<{ data: LeaveRequest[] }>('/leave/all', { params: { month } })).data.data,
  apply: async (payload: { from: string; to: string; halfDay: HalfDay | null; reason: string }): Promise<LeaveRequest> =>
    (await apiClient.post<{ data: LeaveRequest }>('/leave', payload)).data.data,
  approve: async (id: string, comment: string): Promise<LeaveRequest> =>
    (await apiClient.post<{ data: LeaveRequest }>(`/leave/${id}/approve`, { comment: comment || null })).data.data,
  reject: async (id: string, comment: string): Promise<LeaveRequest> =>
    (await apiClient.post<{ data: LeaveRequest }>(`/leave/${id}/reject`, { comment })).data.data,
  cancel: async (id: string): Promise<LeaveRequest> => (await apiClient.post<{ data: LeaveRequest }>(`/leave/${id}/cancel`)).data.data,
  team: async (): Promise<TeamMember[]> => (await apiClient.get<{ data: TeamMember[] }>('/leave/team')).data.data,
  setReportsTo: async (userId: string, reportsTo: string | null) =>
    (await apiClient.put<{ data: { userId: string; reportsTo: string | null } }>(`/leave/team/${userId}`, { reportsTo })).data.data,
};

const dayLabel = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

/** "Mon, 5 Oct – Wed, 7 Oct" or "Mon, 5 Oct · first half" */
export function leaveDates(r: { fromDay: string; toDay: string; halfDay: HalfDay | null }): string {
  if (r.halfDay) return `${dayLabel(r.fromDay)} · ${r.halfDay} half`;
  return r.fromDay === r.toDay ? dayLabel(r.fromDay) : `${dayLabel(r.fromDay)} – ${dayLabel(r.toDay)}`;
}

export const daysLabel = (days: number) => (days === 0.5 ? 'Half day' : `${days} ${days === 1 ? 'day' : 'days'}`);

export function statusLabel(r: Pick<LeaveRequest, 'status' | 'waitingFor'>): string {
  switch (r.status) {
    case 'pending_manager':
    case 'pending_admin': return `Waiting for ${r.waitingFor ?? 'approval'}`;
    case 'approved': return 'Approved';
    case 'rejected': return 'Rejected';
    case 'cancelled': return 'Cancelled';
  }
}
