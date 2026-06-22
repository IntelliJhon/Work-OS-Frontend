import { apiClient } from './client';

export interface Task {
  id: string;
  tenantId: string;
  projectId: string | null;
  storyId: string | null;
  activityId?: string | null;
  sprintId: string | null;
  assigneeId: string | null;
  name: string;
  description: string | null;
  status: 'to_do' | 'in_progress' | 'in_review' | 'done' | 'blocked' | string;
  customFields?: {
    priority?: 'low' | 'medium' | 'high' | 'critical';
    startDate?: string;
    dueDate?: string;
    storyPoints?: number;
    subtasks?: {
      id: string;
      title: string;
      done: boolean;
      comments?: {
        id: string;
        userName: string;
        userEmail: string;
        text: string;
        createdAt: string;
        files?: {
          id: string;
          name: string;
          publicUrl: string;
        }[];
      }[];
    }[];
    phaseId?: string;
    createdFrom?: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface CreateTaskPayload {
  projectId?: string | null;
  storyId?: string | null;
  activityId?: string | null;
  sprintId?: string | null;
  assigneeId?: string | null;
  name: string;
  description?: string;
  status?: string;
  customFields?: Task['customFields'];
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

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/tasks/${id}`);
  },
};
