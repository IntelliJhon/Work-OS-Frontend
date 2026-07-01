import type { AxiosProgressEvent } from 'axios';
import { apiClient } from './client';

export interface UploadRow {
  id: string;
  tenantId: string;
  uploaderUserId: string | null;
  entityType: 'TASK' | 'GATE' | 'PROJECT' | 'PHASE' | 'SPRINT' | string;
  entityId: string;
  originalName: string;
  mimeType: string;
  size: number;
  storageKey: string;
  publicUrl: string;
  createdAt: string;
}

export const uploadsApi = {
  upload: async (
    entityType: 'TASK' | 'GATE' | 'PROJECT' | 'PHASE' | 'SPRINT',
    entityId: string,
    files: File[],
    onUploadProgress?: (progressEvent: AxiosProgressEvent) => void
  ): Promise<{ message: string; uploads: UploadRow[] }> => {
    const formData = new FormData();
    formData.append('entityType', entityType);
    formData.append('entityId', entityId);
    
    files.forEach((file) => {
      formData.append('files', file);
    });

    const { data } = await apiClient.post<{ message: string; uploads: UploadRow[] }>(
      '/uploads',
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress,
      }
    );
    return data;
  },

  listByEntity: async (
    entityType: 'TASK' | 'GATE' | 'PROJECT' | 'PHASE' | 'SPRINT',
    entityId: string
  ): Promise<UploadRow[]> => {
    const { data } = await apiClient.get<UploadRow[]>(`/uploads/${entityType}/${entityId}`);
    return data;
  },

  listAllProjectUploads: async (projectId: string): Promise<UploadRow[]> => {
    const { data } = await apiClient.get<UploadRow[]>(`/uploads/project/${projectId}/all`);
    return data;
  },

  getDownloadUrl: async (id: string): Promise<{ downloadUrl: string }> => {
    const { data } = await apiClient.get<{ downloadUrl: string }>(`/uploads/${id}/download-url`);
    return data;
  },
};
