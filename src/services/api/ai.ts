import { apiClient } from './client';

// The in-app AI assistant (Claude). What it can do follows the person's own role permissions.

export interface AiChatItem {
  id: string;
  role: 'user' | 'assistant' | 'event';
  text: string;
  files: string[];
  steps: string[];
  createdAt: string;
}

export interface AiAction {
  id: string;
  kind: 'send_proposal' | 'send_email' | 'wallet_topup';
  payload: {
    leadId: string | null;
    leadName: string | null;
    // send_proposal
    phone?: string;
    proposalId?: string;
    version?: number;
    fileName?: string;
    // send_email
    from?: string;
    to?: string[];
    cc?: string[];
    subject?: string;
    body?: string;
    attachments?: { name: string }[];
    // wallet_topup
    clientName?: string;
    wallet?: 'main' | 'conversation';
    channelNumber?: string | null;
    amount?: number;
    currentBalance?: number;
    currency?: string;
    note?: string | null;
  };
  status: 'pending' | 'done' | 'failed' | 'cancelled';
  result: string | null;
  createdAt: string;
}

export interface AiConversation { id: string; title: string; items: AiChatItem[]; actions: AiAction[] }
export interface AiConversationSummary { id: string; title: string; updatedAt: string }

const base = '/ai';

export const aiApi = {
  status: async () => (await apiClient.get<{ data: { available: boolean } }>(`${base}/status`)).data.data,
  conversations: async () => (await apiClient.get<{ data: AiConversationSummary[] }>(`${base}/conversations`)).data.data,
  conversation: async (id: string) => (await apiClient.get<{ data: AiConversation }>(`${base}/conversations/${id}`)).data.data,
  remove: async (id: string) => (await apiClient.delete(`${base}/conversations/${id}`)).data,
  send: async (input: { conversationId?: string; text: string; files: File[] }) => {
    const form = new FormData();
    if (input.conversationId) form.append('conversationId', input.conversationId);
    form.append('text', input.text);
    input.files.forEach((f) => form.append('files', f));
    // Claude may look things up several times before answering
    return (await apiClient.post<{ data: AiConversation }>(`${base}/messages`, form, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 300_000 })).data.data;
  },
  confirm: async (id: string) => (await apiClient.post<{ data: AiConversation }>(`${base}/actions/${id}/confirm`)).data.data,
  cancel: async (id: string) => (await apiClient.post<{ data: AiConversation }>(`${base}/actions/${id}/cancel`)).data.data,
};
