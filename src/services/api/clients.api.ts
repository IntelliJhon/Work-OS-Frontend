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

export interface ClientDocument {
  id: string;
  tenantId: string;
  clientId: string;
  name: string;
  fileName: string;
  fileUrl: string;
  fileType: string;
  fileSize: number;
  uploaderName?: string | null;
  createdAt: string;
  updatedAt: string;
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
  documents?: ClientDocument[];
  documentsCount?: number;
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

export interface OnboardingClient {
  id: string;
  tenantId: string;
  clientName: string;
  contactPerson?: string | null;
  email: string;
  phone?: string | null;
  country?: string | null;
  stage: 'initiation' | 'requirements' | 'configuration' | 'testing' | 'ready_to_launch' | 'completed' | string;
  status: 'in_progress' | 'pending_info' | 'on_hold' | 'completed' | string;
  assignedTo?: string | null;
  targetDate?: string | null;
  notes?: string | null;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
  documents?: ClientDocument[];
  documentsCount?: number;
}

export interface GetOnboardingClientsResponse {
  success: boolean;
  data: OnboardingClient[];
}

export interface CreateOnboardingClientPayload {
  clientName: string;
  contactPerson?: string;
  email: string;
  phone?: string;
  country?: string;
  stage?: string;
  status?: string;
  assignedTo?: string;
  targetDate?: string;
  notes?: string;
}

export interface UpdateOnboardingClientPayload {
  clientName?: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  country?: string;
  stage?: string;
  status?: string;
  assignedTo?: string;
  targetDate?: string;
  notes?: string;
}

export interface AddDocumentPayload {
  name: string;
  fileName: string;
  fileUrl: string;
  fileType?: string;
  fileSize?: number;
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

  getClientDocuments: async (clientId: string): Promise<{ success: boolean; data: ClientDocument[] }> => {
    const { data } = await apiClient.get<{ success: boolean; data: ClientDocument[] }>(`/clients/${clientId}/documents`);
    return data;
  },

  uploadClientFiles: async (clientId: string, files: File[], name?: string): Promise<{ success: boolean; data: ClientDocument[] }> => {
    const formData = new FormData();
    files.forEach((file) => {
      formData.append('files', file);
    });
    if (name) {
      formData.append('name', name);
    }
    const { data } = await apiClient.post<{ success: boolean; data: ClientDocument[] }>(`/clients/${clientId}/documents`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return data;
  },

  addClientDocumentUrl: async (clientId: string, payload: AddDocumentPayload): Promise<{ success: boolean; data: ClientDocument[] }> => {
    const { data } = await apiClient.post<{ success: boolean; data: ClientDocument[] }>(`/clients/${clientId}/documents`, payload);
    return data;
  },

  deleteClientDocument: async (clientId: string, documentId: string): Promise<{ success: boolean; message: string }> => {
    const { data } = await apiClient.delete<{ success: boolean; message: string }>(`/clients/${clientId}/documents/${documentId}`);
    return data;
  },

  getOnboardingList: async (): Promise<GetOnboardingClientsResponse> => {
    const { data } = await apiClient.get<GetOnboardingClientsResponse>('/clients/onboarding');
    return data;
  },

  createOnboardingClient: async (payload: CreateOnboardingClientPayload): Promise<{ success: boolean; data: OnboardingClient }> => {
    const { data } = await apiClient.post<{ success: boolean; data: OnboardingClient }>('/clients/onboarding', payload);
    return data;
  },

  updateOnboardingClient: async (id: string, payload: UpdateOnboardingClientPayload): Promise<{ success: boolean; data: OnboardingClient }> => {
    const { data } = await apiClient.patch<{ success: boolean; data: OnboardingClient }>(`/clients/onboarding/${id}`, payload);
    return data;
  },

  deleteOnboardingClient: async (id: string): Promise<{ success: boolean; message: string }> => {
    const { data } = await apiClient.delete<{ success: boolean; message: string }>(`/clients/onboarding/${id}`);
    return data;
  },
};
