import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { usePermissions } from '../../features/auth/usePermissions';
import { PERMISSIONS } from '../../features/auth/permission.constants';
import { workspaceClientsApi } from '../../services/api/workspaceClients';
import { ClientForm } from '../../pages/workspace-clients/WorkspaceClientsPage';

/** The workspace's own work; stored as a project without a client */
export const COMPANY_PROJECTS = 'Company Projects';

/**
 * Picks the client a project is for: "Company Projects" (value '') or a client from the Clients section.
 * Admins and Project Managers can add a new client right here. An old typed name that isn't a client yet is shown
 * until another client is picked.
 */
export const ClientPicker: React.FC<{
  id?: string;
  value: string;
  onChange: (clientId: string) => void;
  legacyName?: string | null;
  className?: string;
}> = ({ id, value, onChange, legacyName, className }) => {
  const queryClient = useQueryClient();
  const tenantId = useAuthStore((s) => s.user?.tenantId);
  const { can } = usePermissions();
  const [adding, setAdding] = useState(false);
  const { data } = useQuery({
    queryKey: ['workspace-clients', 'list', { picker: tenantId }],
    queryFn: () => workspaceClientsApi.list({}),
    staleTime: 30_000,
    retry: false,
  });
  const clients = (data?.data ?? []).filter((c) => c.status !== 'former' || c.id === value);
  const canAdd = !!data?.canManage || can(PERMISSIONS.CLIENT_MANAGE);
  const legacy = !value && legacyName && legacyName !== COMPANY_PROJECTS ? legacyName : null;

  return (
    <div className="space-y-1.5">
      <select id={id} value={legacy ? '__legacy' : value} onChange={(e) => onChange(e.target.value === '__legacy' ? '' : e.target.value)} className={`${className ?? ''} [&>option]:bg-background`}>
        {legacy && <option value="__legacy">{legacy} (typed earlier — pick a client)</option>}
        <option value="">{COMPANY_PROJECTS}</option>
        {clients.map((c) => <option key={c.id} value={c.id}>{c.name}{c.city ? ` · ${c.city}` : ''}</option>)}
      </select>
      {canAdd && (
        <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer">
          <Plus className="w-3 h-3" /> Add new client
        </button>
      )}
      {/* Outside this form (forms can't be nested); React events still bubble through portals, so stop them here */}
      {adding && createPortal(
        <div onSubmit={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
        <ClientForm
          onClose={() => setAdding(false)}
          onSaved={(c) => {
            setAdding(false);
            queryClient.invalidateQueries({ queryKey: ['workspace-clients'] });
            onChange(c.id);
          }}
        />
        </div>,
        document.body,
      )}
    </div>
  );
};
