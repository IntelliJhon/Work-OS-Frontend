import { apiClient } from './client';

export interface ProjectMember {
  id: string;
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  roleId: string;
  roleName: string;
  createdAt: string;
}

export const projectMembersApi = {
  list: async (projectId: string): Promise<ProjectMember[]> => {
    const { data } = await apiClient.get<ProjectMember[]>(`/projects/${projectId}/members`);
    return data;
  },

  add: async (projectId: string, member: { userId: string; roleId: string }): Promise<ProjectMember> => {
    const { data } = await apiClient.post<ProjectMember>(`/projects/${projectId}/members`, member);
    return data;
  },

  update: async (projectId: string, userId: string, roleId: string): Promise<ProjectMember> => {
    const { data } = await apiClient.put<ProjectMember>(`/projects/${projectId}/members/${userId}`, { roleId });
    return data;
  },

  remove: async (projectId: string, userId: string): Promise<void> => {
    await apiClient.delete(`/projects/${projectId}/members/${userId}`);
  }
};
