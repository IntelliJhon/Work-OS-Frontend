import { apiClient } from './client';
import type { Sprint } from './projects';

export interface CreateSprintPayload {
  projectId: string;
  phaseId: string;
  name: string;
  startDate?: string;
  endDate?: string;
  cadenceType?: 'WEEK' | 'MONTH' | 'CUSTOM';
  cadenceInterval?: number;
}

export const sprintsApi = {
  listByProject: async (projectId: string): Promise<Sprint[]> => {
    const { data } = await apiClient.get<Sprint[]>(`/sprints/project/${projectId}`);
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
