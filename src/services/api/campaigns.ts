import { apiClient } from './client';

// Category campaigns: WhatsApp template sequences per category for Leads and Enquiry List contacts

export const CAMPAIGN_PARAMS = ['name', 'company', 'category', 'subcategory'] as const;
export type CampaignParam = typeof CAMPAIGN_PARAMS[number];
export const PARAM_LABELS: Record<CampaignParam, string> = { name: 'Contact name', company: 'Company', category: 'Category', subcategory: 'Subcategory' };

export type StopReason = 'replied' | 'interested' | 'demo' | 'not_interested' | 'opted_out' | 'converted' | 'lost' | 'removed' | 'manual' | 'finished';
export const STOP_LABELS: Record<StopReason, string> = {
  replied: 'Replied', interested: 'Interested', demo: 'Booked a demo', not_interested: 'Not interested', opted_out: 'Opted out',
  converted: 'Converted', lost: 'Lost', removed: 'Removed', manual: 'Stopped by staff', finished: 'Sequence finished',
};

export interface CampaignStep { id?: string; day: number; templateName: string; language: string; params: CampaignParam[] }
export interface CampaignSequence {
  id: string;
  category: string;
  active: boolean;
  repeatEveryDays: number | null;
  steps: CampaignStep[];
  stats: {
    active: number; paused: number; stopped: Partial<Record<StopReason, number>>;
    // WAAU report totals for every message sent so far
    messages?: { sent: number; delivered: number; read: number; replied: number; failed: number };
  };
  updatedAt: string;
}
export interface CampaignEnrolment {
  id: string;
  sequenceId: string;
  kind: 'lead' | 'enquiry';
  refId: string;
  phone: string;
  name: string | null;
  company: string | null;
  category: string | null;
  status: 'active' | 'paused' | 'stopped';
  stopReason: StopReason | null;
  enrolledAt: string;
  stepsSent: number;
  nextSendAt: string | null;
  lastSentAt: string | null;
  lastError: string | null;
}
export interface SequenceInput { category: string; active: boolean; repeatEveryDays: number | null; steps: CampaignStep[] }

const base = '/campaigns';
export const campaignsApi = {
  list: async () => (await apiClient.get<{ data: CampaignSequence[]; isAdmin: boolean }>(base)).data,
  save: async (id: string | null, input: SequenceInput) =>
    (id ? await apiClient.put<{ data: CampaignSequence }>(`${base}/${id}`, input) : await apiClient.post<{ data: CampaignSequence }>(base, input)).data.data,
  remove: async (id: string) => (await apiClient.delete(`${base}/${id}`)).data,
  enrolExisting: async (id: string) => (await apiClient.post<{ data: { enrolled: number; checked: number } }>(`${base}/${id}/enrol-existing`)).data.data,
  enrolments: async (filter: { sequenceId?: string; status?: string; refId?: string }) => {
    const params = Object.fromEntries(Object.entries(filter).filter(([, v]) => v));
    return (await apiClient.get<{ data: CampaignEnrolment[] }>(`${base}/enrolments`, { params })).data.data;
  },
  setEnrolment: async (id: string, action: 'pause' | 'resume' | 'stop') => (await apiClient.post<{ data: CampaignEnrolment }>(`${base}/enrolments/${id}/${action}`)).data.data,
};
