import { apiClient } from './client';

export interface Epic {
  id: string;
  tenantId: string;
  projectId: string;
  name: string;
  description: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateEpicPayload {
  projectId: string;
  name: string;
  description?: string;
  status?: string;
}

export const epicsApi = {
  list: async (projectId?: string): Promise<Epic[]> => {
    const { data } = await apiClient.get<Epic[]>('/epics', {
      params: projectId ? { projectId } : undefined
    });
    return data;
  },

  create: async (payload: CreateEpicPayload): Promise<Epic> => {
    const { data } = await apiClient.post<Epic>('/epics', payload);
    return data;
  },

  update: async (id: string, payload: Partial<Epic>): Promise<Epic> => {
    const { data } = await apiClient.patch<Epic>(`/epics/${id}`, payload);
    return data;
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/epics/${id}`);
  }
};
