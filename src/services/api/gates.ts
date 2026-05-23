import { apiClient } from './client';
import type { QualityGate } from './projects';

export const gatesApi = {
  listByProject: async (projectId: string): Promise<QualityGate[]> => {
    const { data } = await apiClient.get<QualityGate[]>(`/gates/project/${projectId}`);
    return data;
  },

  approve: async (id: string): Promise<QualityGate> => {
    const { data } = await apiClient.post<QualityGate>(`/gates/${id}/approve`);
    return data;
  },

  reject: async (id: string): Promise<QualityGate> => {
    const { data } = await apiClient.post<QualityGate>(`/gates/${id}/reject`);
    return data;
  },

  resubmit: async (id: string): Promise<QualityGate> => {
    const { data } = await apiClient.post<QualityGate>(`/gates/${id}/resubmit`);
    return data;
  },
};
