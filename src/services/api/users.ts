import { apiClient } from './client';

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  roleId: string;
  roleName?: string;
  twoFaEnabled?: boolean;
  createdAt: string;
}

export interface PaginatedUsersResponse {
  users: User[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export const usersApi = {
  list: async (params?: { page?: number; limit?: number; search?: string; roleId?: string }): Promise<any> => {
    const { data } = await apiClient.get<any>('/users', { params });
    if (data && data.users) {
      if (!params || (!params.page && !params.limit)) {
        return data.users;
      }
      return data;
    }
    return data;
  },

  update: async (id: string, updates: { roleId?: string; firstName?: string; lastName?: string }): Promise<User> => {
    const { data } = await apiClient.put<User>(`/users/${id}`, updates);
    return data;
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/users/${id}`);
  }
};
