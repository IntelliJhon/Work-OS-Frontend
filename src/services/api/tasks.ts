import { apiClient } from './client';

export interface Task {
  id: string;
  tenantId: string;
  projectId: string;
  phaseId: string;
  sprintId: string | null;
  epicId: string | null;
  storyId: string | null;
  name: string;
  description: string | null;
  status: 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done' | 'completed' | string;
  weight: number;
  assigneeId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTaskPayload {
  projectId: string;
  phaseId: string;
  sprintId?: string | null;
  name: string;
  description?: string;
  status?: string;
  weight?: number;
  assigneeId?: string | null;
}

export const tasksApi = {
  list: async (): Promise<Task[]> => {
    const { data } = await apiClient.get<Task[]>('/tasks');
    return data;
  },

  create: async (payload: CreateTaskPayload): Promise<Task> => {
    const { data } = await apiClient.post<Task>('/tasks', payload);
    return data;
  },

  update: async (id: string, payload: Partial<Task>): Promise<Task> => {
    const { data } = await apiClient.patch<Task>(`/tasks/${id}`, payload);
    return data;
  },
};
