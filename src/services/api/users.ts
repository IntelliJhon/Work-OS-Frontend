import { apiClient } from './client';

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  roleId: string;
  roleName?: string;
  twoFaEnabled?: boolean;
  /** WhatsApp number (digits only); only returned to members who can manage members */
  phone?: string | null;
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
      if (params && params.page !== undefined) {
        return data;
      }
      return data.users;
    }
    return data;
  },

  update: async (id: string, updates: { roleId?: string; firstName?: string; lastName?: string; phone?: string | null }): Promise<User> => {
    const { data } = await apiClient.patch<User>(`/users/${id}`, updates);
    return data;
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/users/${id}`);
  }
};
