import { apiClient } from './client';

export interface Complaint {
  id: string;
  ticketId: string;
  channel: 'waau' | 'direct-sms';
  complainantName: string;
  complainantPhone: string;
  complainantEmail?: string;
  company?: string;
  subject: string;
  description: string;
  category: 'Billing' | 'Technical' | 'Service Quality' | 'Account' | 'Other';
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'in-progress' | 'resolved' | 'closed';
  imageUrl?: string;
  assignedTo?: string;
  createdAt: string;
  updatedAt: string;
  resolutionNotes?: string;
}

export const complaintsApi = {
  list: async (): Promise<Complaint[]> => {
    const { data } = await apiClient.get<{ success: boolean; complaints: Complaint[] }>('/complaints');
    return data.complaints || [];
  },

  sendAlert: async (payload: Partial<Complaint>): Promise<void> => {
    await apiClient.post('/complaints/send-whatsapp-alert', payload);
  },
};
