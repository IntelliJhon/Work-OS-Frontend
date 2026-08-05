import { apiClient } from './client';

export interface ProjectActivity {
  id: string;
  tenantId: string;
  projectId: string;
  title: string;
  workHrs: string | number;
  createdAt: string;
  updatedAt?: string;
}

export interface CreateProjectActivityPayload {
  projectId: string;
  title: string;
  workHrs: number;
}

export const projectActivitiesApi = {
  listByProject: async (projectId: string): Promise<ProjectActivity[]> => {
    const { data } = await apiClient.get<ProjectActivity[]>(`/project-activities/project/${projectId}`);
    return data;
  },

  create: async (payload: CreateProjectActivityPayload): Promise<ProjectActivity> => {
    const { data } = await apiClient.post<ProjectActivity>('/project-activities', payload);
    return data;
  },

  delete: async (id: string): Promise<ProjectActivity> => {
    const { data } = await apiClient.delete<ProjectActivity>(`/project-activities/${id}`);
    return data;
  },
};
