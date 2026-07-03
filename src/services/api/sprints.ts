import { apiClient } from './client';
import type { Sprint, Activity } from './projects';

export interface CreateActivityPayload {
  projectId: string;
  phaseId: string;
  title: string;
  isSprintRelevant: boolean;
  frequency?: 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | null;
  startDate?: string | null;
  endDate?: string | null;
  assigneeId?: string | null;
  priority?: 'low' | 'medium' | 'high' | 'critical' | null;
  timeEstimate?: number | null;
}

export interface CreateSprintPayload {
  activityId: string;
  projectId: string;
  name: string;
  startDate?: string;
  endDate?: string;
  cadenceType?: 'WEEK' | 'MONTH' | 'CUSTOM';
  cadenceInterval?: number;
  goal?: string;
}

export const activitiesApi = {
  listByProject: async (projectId: string): Promise<Activity[]> => {
    const { data } = await apiClient.get<Activity[]>(`/activities/project/${projectId}`);
    return data;
  },

  create: async (payload: CreateActivityPayload): Promise<Activity> => {
    const { data } = await apiClient.post<Activity>('/activities', payload);
    return data;
  },

  delete: async (id: string): Promise<Activity> => {
    const { data } = await apiClient.delete<Activity>(`/activities/${id}`);
    return data;
  },
};

export const sprintsApi = {
  listByActivity: async (activityId: string): Promise<Sprint[]> => {
    const { data } = await apiClient.get<Sprint[]>(`/sprints/activity/${activityId}`);
    return data;
  },

  create: async (payload: CreateSprintPayload): Promise<Sprint> => {
    const { data } = await apiClient.post<Sprint>('/sprints', payload);
    return data;
  },

  start: async (id: string): Promise<Sprint> => {
    const { data } = await apiClient.post<Sprint>(`/sprints/${id}/start`);
    return data;
  },

  close: async (id: string): Promise<Sprint> => {
    const { data } = await apiClient.post<Sprint>(`/sprints/${id}/close`);
    return data;
  },

  cancel: async (id: string): Promise<Sprint> => {
    const { data } = await apiClient.post<Sprint>(`/sprints/${id}/cancel`);
    return data;
  },

  reopen: async (id: string): Promise<Sprint> => {
    const { data } = await apiClient.post<Sprint>(`/sprints/${id}/reopen`);
    return data;
  },
};
