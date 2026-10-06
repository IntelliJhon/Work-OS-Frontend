import { apiClient } from './client';

export interface ChatAttachment {
  uploadId: string;
  name: string;
  mimeType: string;
  size: number;
}

export interface ChatMessage {
  id: string;
  groupId: string;
  senderId: string | null;
  senderName: string;
  body: string | null;
  mentions: string[];
  attachments: ChatAttachment[];
  deleted: boolean;
  createdAt: string;
}

export interface GroupSummary {
  id: string;
  name: string;
  description: string | null;
  lastMessageAt: string | null;
  createdAt: string;
  role: 'admin' | 'member';
  unread: number;
  members: number;
  lastMessage: ChatMessage | null;
}

export interface GroupDetail {
  id: string;
  name: string;
  description: string | null;
  createdBy: string | null;
  createdAt: string;
  myRole: 'admin' | 'member';
  canManage: boolean;
  members: { id: string; name: string; role: 'admin' | 'member'; joinedAt: string }[];
}

export const groupsApi = {
  list: async () => (await apiClient.get<{ data: { groups: GroupSummary[]; canCreate: boolean } }>('/groups')).data.data,
  unread: async (): Promise<number> => (await apiClient.get<{ data: { unread: number } }>('/groups/unread')).data.data.unread,
  people: async (): Promise<{ id: string; name: string }[]> => (await apiClient.get<{ data: { id: string; name: string }[] }>('/groups/people')).data.data,
  get: async (id: string): Promise<GroupDetail> => (await apiClient.get<{ data: GroupDetail }>(`/groups/${id}`)).data.data,
  create: async (input: { name: string; description: string | null; memberIds: string[] }): Promise<GroupDetail> =>
    (await apiClient.post<{ data: GroupDetail }>('/groups', input)).data.data,
  update: async (id: string, input: { name?: string; description?: string | null }): Promise<GroupDetail> =>
    (await apiClient.patch<{ data: GroupDetail }>(`/groups/${id}`, input)).data.data,
  archive: async (id: string) => (await apiClient.delete(`/groups/${id}`)).data,
  addMembers: async (id: string, userIds: string[]): Promise<GroupDetail> =>
    (await apiClient.post<{ data: GroupDetail }>(`/groups/${id}/members`, { userIds })).data.data,
  removeMember: async (id: string, userId: string) => (await apiClient.delete(`/groups/${id}/members/${userId}`)).data,
  setRole: async (id: string, userId: string, role: 'admin' | 'member'): Promise<GroupDetail> =>
    (await apiClient.put<{ data: GroupDetail }>(`/groups/${id}/members/${userId}/role`, { role })).data.data,
  messages: async (id: string, before?: string) =>
    (await apiClient.get<{ data: { messages: ChatMessage[]; more: boolean } }>(`/groups/${id}/messages`, { params: before ? { before } : {} })).data.data,
  send: async (id: string, body: string, mentions: string[], files: File[]): Promise<ChatMessage> => {
    if (!files.length) return (await apiClient.post<{ data: ChatMessage }>(`/groups/${id}/messages`, { body, mentions })).data.data;
    const form = new FormData();
    form.append('body', body);
    form.append('mentions', JSON.stringify(mentions));
    files.forEach((f) => form.append('files', f));
    return (await apiClient.post<{ data: ChatMessage }>(`/groups/${id}/messages`, form, { headers: { 'Content-Type': 'multipart/form-data' } })).data.data;
  },
  deleteMessage: async (id: string, messageId: string) => (await apiClient.delete(`/groups/${id}/messages/${messageId}`)).data,
  markRead: async (id: string) => (await apiClient.post(`/groups/${id}/read`)).data,
  fileUrl: async (id: string, uploadId: string): Promise<string> =>
    (await apiClient.get<{ data: { url: string } }>(`/groups/${id}/files/${uploadId}`)).data.data.url,
};

export const fileSize = (bytes: number) =>
  bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
