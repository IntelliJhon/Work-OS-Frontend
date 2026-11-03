import { apiClient } from './client';

// Leads: enquiries moved through stages on a board (lead.read / lead.manage; Admins always).

export const LEAD_STAGES = ['new', 'contacted', 'requirement', 'proposal', 'follow_up', 'accepted', 'rejected'] as const;
export type LeadStage = typeof LEAD_STAGES[number];
export type LeadSource = 'manual' | 'whatsapp' | 'website' | 'referral' | 'call' | 'walk_in' | 'social' | 'other';
export type RejectReason = 'price' | 'timing' | 'competitor' | 'no_response' | 'not_needed' | 'other';
export type LeadActivityKind = 'note' | 'created' | 'updated' | 'stage' | 'proposal' | 'whatsapp' | 'email' | 'client' | 'archived' | 'restored';
export type AcceptedAs = 'bot' | 'client';

export const STAGE_LABELS: Record<LeadStage, string> = {
  new: 'Lead created',
  contacted: 'Contacted',
  requirement: 'Requirement collected',
  proposal: 'Proposal sent',
  follow_up: 'Follow up',
  accepted: 'Accepted',
  rejected: 'Rejected',
};
export const SOURCE_LABELS: Record<LeadSource, string> = {
  manual: 'Added manually',
  whatsapp: 'WhatsApp',
  website: 'Website',
  referral: 'Referral',
  call: 'Phone call',
  walk_in: 'Walk-in',
  social: 'Social media',
  other: 'Other',
};
export const REJECT_LABELS: Record<RejectReason, string> = {
  price: 'Price too high',
  timing: 'Not the right time',
  competitor: 'Went with someone else',
  no_response: 'Stopped responding',
  not_needed: 'No longer needed',
  other: 'Other',
};

export interface LeadSummary {
  id: string;
  name: string;
  company: string | null;
  phone: string;
  email: string | null;
  city: string | null;
  source: LeadSource;
  service: string | null;
  expectedValue: string | null;
  stage: LeadStage;
  stageChangedAt: string;
  ownerId: string | null;
  ownerName: string | null;
  nextFollowUpAt: string | null;
  autoFollowUp: boolean;
  autoFollowUpsSent: number;
  rejectReason: RejectReason | null;
  proposalVersion: number | null;
  proposalAmount: string | null;
  proposalHasFile: boolean;
  clientId: string | null;
  archivedAt: string | null;
  createdAt: string;
}

export interface LeadDetail extends Omit<LeadSummary, 'proposalVersion' | 'proposalAmount' | 'proposalHasFile'> {
  acceptedAs: AcceptedAs | null;
  notes: string | null;
  requirement: string | null;
  budget: string | null;
  timeline: string | null;
  rejectNote: string | null;
  createdBy: string | null;
  createdByName: string | null;
  updatedByName: string | null;
  updatedAt: string;
}

export interface LeadInput {
  name: string;
  company: string | null;
  phone: string;
  email: string | null;
  city: string | null;
  source: LeadSource;
  service: string | null;
  expectedValue: number | null;
  ownerId: string | null;
  nextFollowUpAt: string | null;
  autoFollowUp?: boolean;
  notes: string | null;
  requirement?: string | null;
  budget?: string | null;
  timeline?: string | null;
}

export interface StageInput {
  stage: LeadStage;
  requirement?: string | null;
  budget?: string | null;
  timeline?: string | null;
  rejectReason?: RejectReason;
  rejectNote?: string | null;
  nextFollowUpAt?: string | null;
  autoFollowUp?: boolean;
  sendWhatsApp?: boolean;
  acceptAs?: AcceptedAs;
}

export interface WhatsAppResult { sent: boolean; error?: string }

export interface LeadActivity {
  id: string;
  kind: LeadActivityKind;
  body: string | null;
  meta: Record<string, unknown>;
  actorId: string | null;
  actorName: string | null;
  createdAt: string;
  canDelete: boolean;
}

export interface LeadProposal {
  id: string;
  version: number;
  amount: string | null;
  note: string | null;
  file: { name: string; size: number; mimeType: string } | null;
  uploadId: string | null;
  whatsappSentAt: string | null;
  whatsappError: string | null;
  createdAt: string;
  createdByName: string | null;
}

export interface DuplicateLead { id: string; name: string; stage: LeadStage; stageLabel: string }

export interface LeadFilter { q?: string; ownerId?: string; source?: string; archived?: boolean }

/** Automatic WhatsApp follow-ups to the client per proposal (review check-in, call offer, final) */
export const AUTO_FOLLOW_UPS = 3;

const base = '/leads';

export const leadsApi = {
  list: async (filter: LeadFilter) => {
    const params = Object.fromEntries(Object.entries(filter).filter(([, v]) => v));
    const { data } = await apiClient.get<{ data: LeadSummary[]; canManage: boolean; isAdmin: boolean }>(base, { params });
    return data;
  },
  people: async () => (await apiClient.get<{ data: { id: string; name: string }[] }>(`${base}/people`)).data.data,
  get: async (id: string) => {
    const { data } = await apiClient.get<{ data: LeadDetail; canManage: boolean; isAdmin: boolean }>(`${base}/${id}`);
    return data;
  },
  create: async (input: LeadInput, allowDuplicate = false) => (await apiClient.post<{ data: LeadDetail }>(base, { ...input, allowDuplicate })).data.data,
  update: async (id: string, input: Partial<LeadInput>) => (await apiClient.patch<{ data: LeadDetail }>(`${base}/${id}`, input)).data.data,
  moveStage: async (id: string, input: StageInput) =>
    (await apiClient.post<{ data: LeadDetail & { whatsapp?: WhatsAppResult } }>(`${base}/${id}/stage`, input)).data.data,
  archive: async (id: string) => (await apiClient.delete(`${base}/${id}`)).data,
  restore: async (id: string) => (await apiClient.post<{ data: LeadDetail }>(`${base}/${id}/restore`)).data.data,

  activity: async (id: string, before?: string) =>
    (await apiClient.get<{ data: { items: LeadActivity[]; hasMore: boolean } }>(`${base}/${id}/activity`, { params: before ? { before } : {} })).data.data,
  addNote: async (id: string, body: string) => (await apiClient.post<{ data: LeadActivity }>(`${base}/${id}/notes`, { body })).data.data,
  deleteNote: async (id: string, noteId: string) => (await apiClient.delete(`${base}/${id}/notes/${noteId}`)).data,

  proposals: async (id: string) => (await apiClient.get<{ data: LeadProposal[] }>(`${base}/${id}/proposals`)).data.data,
  addProposal: async (id: string, input: { amount: number | null; note: string | null; file: File | null }) => {
    const form = new FormData();
    if (input.file) form.append('file', input.file);
    if (input.amount !== null) form.append('amount', String(input.amount));
    if (input.note) form.append('note', input.note);
    return (await apiClient.post<{ data: LeadProposal[] }>(`${base}/${id}/proposals`, form, { headers: { 'Content-Type': 'multipart/form-data' } })).data.data;
  },
  sendProposal: async (id: string, proposalId: string) =>
    (await apiClient.post<{ data: WhatsAppResult }>(`${base}/${id}/proposals/${proposalId}/whatsapp`)).data.data,
  proposalUrl: async (id: string, proposalId: string) => (await apiClient.get<{ data: { url: string } }>(`${base}/${id}/proposals/${proposalId}/file`)).data.data.url,
};

/** ₹1,25,000 */
export const rupees = (v: string | number | null | undefined) =>
  v === null || v === undefined || v === '' ? '' : `₹${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
