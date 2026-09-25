import { apiClient } from './client';

/** 'awaiting_assignee': has work, but the owner still has to name (or pick) the employee on WhatsApp. */
export type VoiceNoteStatus = 'new' | 'converted' | 'dismissed' | 'unclear' | 'awaiting_assignee';

export interface VoiceNote {
  id: string;
  tenantId: string;
  senderUserId: string | null;
  senderName: string | null;
  senderPhone: string;
  externalMessageId: string;
  audioUrl: string | null;
  originalTranscript: string | null;
  englishText: string;
  detectedLanguage: string | null;
  /** Extracted from the voice: employee name as heard, short work title, due date (YYYY-MM-DD) and time (HH:mm) */
  assigneeName: string | null;
  taskTitle: string | null;
  dueDate: string | null;
  dueTime: string | null;
  /** Choices last offered to the owner on WhatsApp */
  assigneeCandidates: { id: string; name: string }[] | null;
  status: VoiceNoteStatus;
  taskId: string | null;
  /** Linked task's work number, e.g. "W-12", and its assignee */
  workId: string | null;
  taskAssigneeName: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type VoiceNoteCounts = Record<VoiceNoteStatus, number>;

export interface VoiceNotesListResponse {
  data: VoiceNote[];
  counts: VoiceNoteCounts;
  pagination: { limit: number; offset: number };
}

/** Socket signal for voice_note_new / voice_note_updated; details are refetched via the API. */
export interface VoiceNoteEvent {
  id: string;
  status: VoiceNoteStatus;
}

export interface VoiceSettings {
  phone: string | null;
  verifiedAt: string | null;
  pending: {
    phone: string;
    expiresAt: string;
    resendAvailableAt: string | null;
    attemptsRemaining: number;
  } | null;
}

export const voiceNotesApi = {
  getSettings: async (): Promise<VoiceSettings> => {
    const { data } = await apiClient.get<{ data: VoiceSettings }>('/voice-notes/settings');
    return data.data;
  },

  sendCode: async (phone: string): Promise<VoiceSettings> => {
    const { data } = await apiClient.post<{ data: VoiceSettings }>('/voice-notes/settings/send-code', { phone });
    return data.data;
  },

  verify: async (code: string): Promise<VoiceSettings> => {
    const { data } = await apiClient.post<{ data: VoiceSettings }>('/voice-notes/settings/verify', { code });
    return data.data;
  },

  removeNumber: async (): Promise<VoiceSettings> => {
    const { data } = await apiClient.delete<{ data: VoiceSettings }>('/voice-notes/settings');
    return data.data;
  },

  list: async (params?: { status?: VoiceNoteStatus; limit?: number; offset?: number }): Promise<VoiceNotesListResponse> => {
    const { data } = await apiClient.get<VoiceNotesListResponse>('/voice-notes', { params });
    return data;
  },

  update: async (id: string, payload: { status?: VoiceNoteStatus; taskId?: string | null }): Promise<VoiceNote> => {
    const { data } = await apiClient.patch<{ data: VoiceNote }>(`/voice-notes/${id}`, payload);
    return data.data;
  },

  /** Permanent; the backend only allows it for dismissed notes. */
  remove: async (id: string): Promise<void> => {
    await apiClient.delete(`/voice-notes/${id}`);
  },
};

/** Backend returns { error, code } for voice errors and { error: 'Validation Error', details } for zod failures. */
export const getVoiceApiError = (err: any, fallback: string): string => {
  const body = err?.response?.data;
  if (body?.details?.[0]?.message) return body.details[0].message;
  return body?.error || fallback;
};
