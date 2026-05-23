import { apiClient } from './client';
import type { NotificationPayload } from '../socket/socket-events';

export const notificationsApi = {
  list: async (): Promise<NotificationPayload[]> => {
    const { data } = await apiClient.get<NotificationPayload[]>('/notifications');
    return data;
  },

  getUnreadCount: async (): Promise<{ count: number }> => {
    const { data } = await apiClient.get<{ count: number }>('/notifications/unread-count');
    return data;
  },

  markRead: async (id: string): Promise<NotificationPayload> => {
    const { data } = await apiClient.patch<NotificationPayload>(`/notifications/${id}/read`);
    return data;
  },

  markAllRead: async (): Promise<{ success: boolean }> => {
    const { data } = await apiClient.patch<{ success: boolean }>('/notifications/read-all');
    return data;
  },
};
