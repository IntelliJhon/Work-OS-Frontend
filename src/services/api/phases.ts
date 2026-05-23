import { apiClient } from './client';
import type { Phase } from './projects';

export const phasesApi = {
  activate: async (id: string): Promise<Phase> => {
    const { data } = await apiClient.post<Phase>(`/phases/${id}/activate`);
    return data;
  },

  complete: async (id: string): Promise<Phase> => {
    const { data } = await apiClient.post<Phase>(`/phases/${id}/complete`);
    return data;
  },

  block: async (id: string): Promise<Phase> => {
    const { data } = await apiClient.post<Phase>(`/phases/${id}/block`);
    return data;
  },

  reopen: async (id: string): Promise<Phase> => {
    const { data } = await apiClient.post<Phase>(`/phases/${id}/reopen`);
    return data;
  },
};
