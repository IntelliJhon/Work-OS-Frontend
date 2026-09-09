import { apiClient } from './client';

export interface WorkReport {
  id: string;
  tenantId: string;
  employeeId: string;
  authorId: string;
  authorName?: string;
  authorEmail?: string;
  title?: string;
  reportText: string;
  documentUrl?: string;
  documentName?: string;
  fileType?: string;
  fileSize?: string;
  createdAt: string;
  updatedAt: string;
}

export const workReportsApi = {
  listByEmployee: async (employeeId: string): Promise<WorkReport[]> => {
    const res = await apiClient.get(`/work-reports/employee/${employeeId}`);
    return res.data?.data || [];
  },

  create: async (data: FormData | { employeeId: string; title?: string; reportText: string; documentUrl?: string; documentName?: string }): Promise<WorkReport> => {
    const isFormData = data instanceof FormData;
    const res = await apiClient.post('/work-reports', data, {
      headers: isFormData ? { 'Content-Type': 'multipart/form-data' } : {},
    });
    return res.data?.data;
  },

  update: async (reportId: string, data: FormData | { title?: string; reportText?: string; documentUrl?: string; documentName?: string }): Promise<WorkReport> => {
    const isFormData = data instanceof FormData;
    const res = await apiClient.put(`/work-reports/${reportId}`, data, {
      headers: isFormData ? { 'Content-Type': 'multipart/form-data' } : {},
    });
    return res.data?.data;
  },

  delete: async (reportId: string): Promise<void> => {
    await apiClient.delete(`/work-reports/${reportId}`);
  },
};
