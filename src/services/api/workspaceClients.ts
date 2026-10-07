import { apiClient } from './client';

// The Clients section of every workspace (LeadsNDeals' own CRM-linked clients use /clients in services/api/clients).

export type ClientStatus = 'active' | 'on_hold' | 'former';
export type ClientActivityKind = 'note' | 'created' | 'updated' | 'file_added' | 'file_removed' | 'archived' | 'restored';

export const STATUS_LABELS: Record<ClientStatus, string> = { active: 'Active', on_hold: 'On hold', former: 'Former' };

export interface ClientSummary {
  id: string;
  name: string;
  contactPerson: string | null;
  phone: string;
  email: string | null;
  city: string | null;
  category: string | null;
  status: ClientStatus;
  tags: string[];
  accountManagerId: string | null;
  accountManagerName: string | null;
  clientSince: string | null;
  archivedAt: string | null;
  createdAt: string;
  documents: number;
  lastActivityAt: string;
}

export interface ClientDetail extends Omit<ClientSummary, 'documents' | 'lastActivityAt'> {
  address: string | null;
  gstNumber: string | null;
  notes: string | null;
  createdBy: string | null;
  createdByName: string | null;
  updatedByName: string | null;
  updatedAt: string;
}

export interface ClientInput {
  name: string;
  contactPerson: string | null;
  phone: string;
  email: string | null;
  city: string | null;
  address: string | null;
  gstNumber: string | null;
  category: string | null;
  status: ClientStatus;
  accountManagerId: string | null;
  clientSince: string | null;
  notes: string | null;
  tags: string[];
}

export interface ClientActivity {
  id: string;
  kind: ClientActivityKind;
  body: string | null;
  meta: Record<string, unknown>;
  actorId: string | null;
  actorName: string | null;
  createdAt: string;
  canDelete: boolean;
}

export interface ClientDocument {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
  uploadedBy: string | null;
}

export interface ClientProject {
  id: string;
  name: string;
  status: string;
  pmName: string | null;
  createdAt: string;
  openTasks: number;
  doneTasks: number;
}

export interface ClientFilter {
  q?: string;
  status?: ClientStatus | 'archived' | '';
  category?: string;
  managerId?: string;
}

const base = '/workspace-clients';

export const workspaceClientsApi = {
  list: async (filter: ClientFilter) => {
    const params = Object.fromEntries(Object.entries(filter).filter(([, v]) => v));
    const { data } = await apiClient.get<{ data: ClientSummary[]; canManage: boolean; isAdmin: boolean }>(base, { params });
    return data;
  },
  categories: async () => (await apiClient.get<{ data: string[] }>(`${base}/categories`)).data.data,
  people: async () => (await apiClient.get<{ data: { id: string; name: string }[] }>(`${base}/people`)).data.data,
  get: async (id: string) => {
    const { data } = await apiClient.get<{ data: ClientDetail; canManage: boolean; isAdmin: boolean }>(`${base}/${id}`);
    return data;
  },
  create: async (input: ClientInput) => (await apiClient.post<{ data: ClientDetail }>(base, input)).data.data,
  update: async (id: string, input: Partial<ClientInput>) => (await apiClient.patch<{ data: ClientDetail }>(`${base}/${id}`, input)).data.data,
  archive: async (id: string) => (await apiClient.delete(`${base}/${id}`)).data,
  restore: async (id: string) => (await apiClient.post<{ data: ClientDetail }>(`${base}/${id}/restore`)).data.data,

  projects: async (id: string) => (await apiClient.get<{ data: ClientProject[] }>(`${base}/${id}/projects`)).data.data,
  activity: async (id: string, before?: string) =>
    (await apiClient.get<{ data: { items: ClientActivity[]; hasMore: boolean } }>(`${base}/${id}/activity`, { params: before ? { before } : {} })).data.data,
  addNote: async (id: string, body: string) => (await apiClient.post<{ data: ClientActivity }>(`${base}/${id}/notes`, { body })).data.data,
  deleteNote: async (id: string, noteId: string) => (await apiClient.delete(`${base}/${id}/notes/${noteId}`)).data,

  documents: async (id: string) => (await apiClient.get<{ data: ClientDocument[] }>(`${base}/${id}/documents`)).data.data,
  addDocuments: async (id: string, files: File[]) => {
    const form = new FormData();
    files.forEach((f) => form.append('files', f));
    return (await apiClient.post<{ data: ClientDocument[] }>(`${base}/${id}/documents`, form, { headers: { 'Content-Type': 'multipart/form-data' } })).data.data;
  },
  documentUrl: async (id: string, docId: string) => (await apiClient.get<{ data: { url: string } }>(`${base}/${id}/documents/${docId}`)).data.data.url,
  deleteDocument: async (id: string, docId: string) => (await apiClient.delete(`${base}/${id}/documents/${docId}`)).data,
};

/** +91 98765 43210 for Indian numbers, +<digits> otherwise */
export function formatPhone(phone: string) {
  if (/^91\d{10}$/.test(phone)) return `+91 ${phone.slice(2, 7)} ${phone.slice(7)}`;
  return `+${phone}`;
}
