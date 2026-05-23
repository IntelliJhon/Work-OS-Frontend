import { apiClient } from './client';

export interface Role {
  id: string;
  name: string;
  description: string | null;
  permissions: Record<string, boolean>;
  userCount?: number;
  createdAt: string;
}

export const rolesApi = {
  list: async (): Promise<Role[]> => {
    const { data } = await apiClient.get<Role[]>('/roles');
    return data;
  },

  create: async (role: Omit<Role, 'id' | 'createdAt'>): Promise<Role> => {
    const { data } = await apiClient.post<Role>('/roles', role);
    return data;
  },

  update: async (id: string, updates: Partial<Omit<Role, 'id' | 'createdAt'>>): Promise<Role> => {
    const { data } = await apiClient.put<Role>(`/roles/${id}`, updates);
    return data;
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/roles/${id}`);
  }
};
