import { apiClient } from './client';

export interface AuditLog {
  id: string;
  userId: string | null;
  userEmail: string | null;
  userFirstName: string | null;
  userLastName: string | null;
  action: string;
  tableName: string;
  recordId: string;
  oldValue: any;
  newValue: any;
  ipAddress: string | null;
  createdAt: string;
}

export interface PaginatedAuditLogsResponse {
  logs: AuditLog[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export const securityApi = {
  getAuditLogs: async (params?: { page?: number; limit?: number; search?: string; action?: string }): Promise<PaginatedAuditLogsResponse> => {
    const { data } = await apiClient.get<PaginatedAuditLogsResponse>('/security', { params });
    return data;
  }
};
