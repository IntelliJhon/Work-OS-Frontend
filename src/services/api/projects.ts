import { apiClient } from './client';

export interface Project {
  id: string;
  tenantId: string;
  tenantSlug?: string;
  pmId: string | null;
  name: string;
  description: string | null;
  status: 'active' | 'archived' | string;
  createdAt: string;
  updatedAt: string;
  phases?: Phase[];
  gates?: QualityGate[];
  sprints?: Sprint[];
  activities?: Activity[];
}

export interface Phase {
  id: string;
  tenantId: string;
  projectId: string;
  name: string;
  orderIndex: number;
  status: 'pending' | 'active' | 'completed' | 'blocked';
  isLocked: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface QualityGate {
  id: string;
  tenantId: string;
  projectId: string;
  phaseId: string;
  criteria: Record<string, boolean>;
  approvedBy: string | null;
  approvedAt: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'remediation_required' | 'resubmitted';
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Activity {
  id: string;
  tenantId: string;
  projectId: string;
  phaseId: string;
  title: string;
  isSprintRelevant: boolean;
  frequency: 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | null;
  startDate: string | null;
  endDate: string | null;
  assigneeId?: string | null;
  priority?: 'low' | 'medium' | 'high' | 'critical' | null;
  createdAt: string;
  updatedAt: string;
}

export interface Sprint {
  id: string;
  activityId: string;
  projectId: string;
  tenantId: string;
  name: string;
  status: 'planning' | 'active' | 'closed' | 'cancelled';
  startDate: string | null;
  endDate: string | null;
  cadenceType: 'WEEK' | 'MONTH' | 'CUSTOM' | null;
  cadenceInterval: number | null;
  goal?: string | null;
  phaseId?: string;
  createdAt: string;
  updatedAt: string;
}

export const projectsApi = {
  list: async (): Promise<Project[]> => {
    const { data } = await apiClient.get<Project[]>('/projects');
    return data;
  },
  
  getById: async (id: string): Promise<Project> => {
    const { data } = await apiClient.get<Project>(`/projects/${id}`);
    return data;
  },

  create: async (payload: { name: string; description?: string }): Promise<{ project: Project; phases: Phase[] }> => {
    const { data } = await apiClient.post<{ project: Project; phases: Phase[] }>('/projects', payload);
    return data;
  },

  update: async (id: string, payload: Partial<Project>): Promise<Project> => {
    const { data } = await apiClient.patch<Project>(`/projects/${id}`, payload);
    return data;
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/projects/${id}`);
  },
};
