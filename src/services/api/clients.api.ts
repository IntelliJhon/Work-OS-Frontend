import { apiClient } from './client';

export interface ClientProfileName {
  first?: string;
  last?: string;
}

export interface ClientProfileAddress {
  city?: string;
  state?: string;
  country?: string;
  code?: string;
}

export interface ClientProfile {
  name?: ClientProfileName;
  address?: ClientProfileAddress;
  language?: string;
}

export interface ClientUser {
  id: string;
  email: string;
  profile?: ClientProfile;
  language?: string;
  created_at?: string;
  last_login?: number;
  expiry?: string;
  verified?: boolean;
  active?: boolean;
  country?: string;
  currency?: string;
  balance?: number;
  crm_api_key?: string;
  comment?: string;
  commentAuthor?: string | null;
  commentUpdatedAt?: string | null;
}

export interface GetClientsResponse {
  success: boolean;
  company: string;
  slug: string;
  isOurCompany?: boolean;
  totalCount?: number;
  users: ClientUser[];
}

export interface SaveCommentResponse {
  success: boolean;
  note: {
    id: string;
    clientId: string;
    comment: string;
    authorName?: string;
    updatedAt: string;
  };
}

export const clientsApi = {
  list: async (): Promise<GetClientsResponse> => {
    const { data } = await apiClient.get<GetClientsResponse>('/clients');
    return data;
  },

  saveComment: async (clientId: string, comment: string): Promise<SaveCommentResponse> => {
    const { data } = await apiClient.post<SaveCommentResponse>(`/clients/${clientId}/comments`, { comment });
    return data;
  },
};
