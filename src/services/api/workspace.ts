import { useQuery } from '@tanstack/react-query';
import { apiClient } from './client';
import { useAuthStore } from '../../store/authStore';

export type Section = 'projects' | 'tasks' | 'calendar' | 'attendance' | 'leave' | 'voice_notes';
export type Sections = Record<Section, boolean>;

export const SECTION_LABELS: Record<Section, string> = {
  projects: 'Projects',
  tasks: 'Tasks',
  calendar: 'Calendar',
  attendance: 'Attendance',
  leave: 'Leave',
  voice_notes: 'Voice Notes',
};

/** Which pages belong to a section (path prefixes) */
export const SECTION_PATHS: [string, Section][] = [
  ['/projects', 'projects'],
  ['/dashboard/workflow', 'projects'],
  ['/dashboard/activities', 'projects'],
  ['/dashboard/gates', 'projects'],
  ['/dashboard/sprints', 'projects'],
  ['/dashboard/tasks', 'tasks'],
  ['/calendar', 'calendar'],
  ['/attendance', 'attendance'],
  ['/leave', 'leave'],
  ['/voice-notes', 'voice_notes'],
  ['/settings/voice-notes', 'voice_notes'],
];

export const sectionOfPath = (path: string): Section | null =>
  SECTION_PATHS.find(([prefix]) => path === prefix || path.startsWith(`${prefix}/`))?.[1] ?? null;

export interface PlatformWorkspaceSections {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  members: number;
  sections: Sections;
  /** Only the switches that differ from the default */
  switched: Partial<Sections>;
}

export const workspaceApi = {
  sections: async (): Promise<Sections> =>
    (await apiClient.get<{ data: { sections: Sections } }>('/workspace/sections')).data.data.sections,
  platformWorkspaces: async (): Promise<PlatformWorkspaceSections[]> =>
    (await apiClient.get<{ data: { workspaces: PlatformWorkspaceSections[] } }>('/platform/workspaces')).data.data.workspaces,
  setSections: async (tenantId: string, sections: Partial<Sections>): Promise<Sections> =>
    (await apiClient.put<{ data: { sections: Sections } }>(`/platform/workspaces/${tenantId}/sections`, { sections })).data.data.sections,
};

/** The signed-in workspace's sections; everything counts as on until they have loaded */
export function useSections() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const tenantId = useAuthStore((s) => s.user?.tenantId);
  const { data } = useQuery({
    queryKey: ['workspace', 'sections', tenantId],
    queryFn: workspaceApi.sections,
    enabled: isAuthenticated,
    staleTime: 60_000,
  });
  const isOn = (section: Section | null | undefined) => !section || !data || data[section] !== false;
  return { sections: data, isOn, loaded: !!data };
}
