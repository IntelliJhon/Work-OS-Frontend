import { apiClient } from './client';

export interface Story {
  id: string;
  tenantId: string;
  projectId: string;
  epicId: string;
  name: string;
  description: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateStoryPayload {
  projectId: string;
  epicId: string;
  name: string;
  description?: string;
  status?: string;
}

export const storiesApi = {
  list: async (projectId?: string, epicId?: string): Promise<Story[]> => {
    const { data } = await apiClient.get<Story[]>('/stories', {
      params: { projectId, epicId }
    });
    return data;
  },

  create: async (payload: CreateStoryPayload): Promise<Story> => {
    const { data } = await apiClient.post<Story>('/stories', payload);
    return data;
  },

  update: async (id: string, payload: Partial<Story>): Promise<Story> => {
    const { data } = await apiClient.patch<Story>(`/stories/${id}`, payload);
    return data;
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/stories/${id}`);
  }
};
