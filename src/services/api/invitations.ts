import { apiClient } from './client';

export interface Invitation {
  id: string;
  email: string;
  roleId: string;
  roleName?: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface VerifyInvitationResponse {
  id: string;
  email: string;
  roleId: string;
  roleName: string;
  tenantId: string;
  tenantName: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
}

export const invitationsApi = {
  create: async (invitation: { email: string; roleId: string }): Promise<Invitation> => {
    const { data } = await apiClient.post<Invitation>('/invitations', invitation);
    return data;
  },

  list: async (): Promise<Invitation[]> => {
    const { data } = await apiClient.get<Invitation[]>('/invitations');
    return data;
  },

  resend: async (id: string): Promise<Invitation> => {
    const { data } = await apiClient.post<Invitation>(`/invitations/${id}/resend`);
    return data;
  },

  revoke: async (id: string): Promise<Invitation> => {
    const { data } = await apiClient.post<Invitation>(`/invitations/${id}/revoke`);
    return data;
  },

  verify: async (token: string): Promise<VerifyInvitationResponse> => {
    const { data } = await apiClient.get<VerifyInvitationResponse>(`/invitations/verify/${token}`);
    return data;
  },

  accept: async (payload: any): Promise<any> => {
    const { data } = await apiClient.post<any>('/invitations/accept', payload);
    return data;
  }
};
