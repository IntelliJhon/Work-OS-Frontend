import { apiClient } from './client';

export interface WorkspaceBot {
  phoneNumberId: string;
  businessPhone: string | null;
  accessTokenMasked: string;
  otpTemplate: string | null;
  ownerTemplate: string | null;
  employeeTemplate: string | null;
  templateLang: string | null;
  updatedAt: string;
}

export interface PlatformWorkspace {
  tenantId: string;
  name: string;
  slug: string;
  isActive: boolean;
  bot: WorkspaceBot | null;
}

export interface WhatsAppBotsResponse {
  encryptionConfigured: boolean;
  defaultBotId: string;
  workspaces: PlatformWorkspace[];
}

export interface SaveBotPayload {
  phoneNumberId: string;
  /** Omit or leave empty to keep the stored token */
  accessToken?: string;
  businessPhone?: string;
  otpTemplate?: string;
  ownerTemplate?: string;
  employeeTemplate?: string;
  templateLang?: string;
}

export const platformApi = {
  me: async (): Promise<{ isPlatformAdmin: boolean }> => {
    const { data } = await apiClient.get<{ isPlatformAdmin: boolean }>('/platform/me');
    return data;
  },

  listWhatsAppBots: async (): Promise<WhatsAppBotsResponse> => {
    const { data } = await apiClient.get<WhatsAppBotsResponse>('/platform/whatsapp-bots');
    return data;
  },

  saveWhatsAppBot: async (tenantId: string, payload: SaveBotPayload): Promise<void> => {
    await apiClient.put(`/platform/whatsapp-bots/${tenantId}`, payload);
  },

  removeWhatsAppBot: async (tenantId: string): Promise<void> => {
    await apiClient.delete(`/platform/whatsapp-bots/${tenantId}`);
  },
};
