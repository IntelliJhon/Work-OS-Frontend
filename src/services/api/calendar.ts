import { apiClient } from './client';

const apiBase = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/+$/, '');

/** The private calendar link (iCalendar) calendar apps subscribe to. */
export const calendarFeedUrl = (token: string) => `${apiBase}/calendar/${token}.ics`;

/** The same link as webcal://, which opens the calendar app's "subscribe" screen directly. */
export const calendarWebcalUrl = (token: string) => calendarFeedUrl(token).replace(/^https?:\/\//, 'webcal://');

export const calendarApi = {
  getFeedToken: async (): Promise<string> => {
    const { data } = await apiClient.get<{ success: boolean; token: string }>('/calendar/feed');
    return data.token;
  },

  /** A new link; the old one stops working. */
  resetFeedToken: async (): Promise<string> => {
    const { data } = await apiClient.post<{ success: boolean; token: string }>('/calendar/feed/reset');
    return data.token;
  },
};
