import React, { useState, useEffect, useMemo } from 'react';
import { useSocket } from '../../services/socket/socket-context';
import { rolesApi } from '../../services/api/roles';
import type { Role } from '../../services/api/roles';
import { usePermissions } from '../../features/auth/usePermissions';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { useToast } from '../../components/ui/Toast';
import { Shield, ShieldCheck, Plus, Save, Trash2, X, Loader2, Users } from 'lucide-react';

// What each permission lets a role do, grouped the way the app is organised
const PERMISSION_GROUPS: { group: string; items: { key: string; label: string; desc: string }[] }[] = [
  {
    group: 'Tasks',
    items: [
      { key: 'task.read', label: 'See tasks', desc: 'Open the Tasks page and the Calendar.' },
      { key: 'task.create', label: 'Create tasks', desc: 'Add new tasks.' },
      { key: 'task.update', label: 'Update tasks', desc: 'Change status, comment and edit details.' },
    ],
  },
  {
    group: 'Projects',
    items: [
      { key: 'project.read', label: 'See projects', desc: 'Open projects, their phases and sprints.' },
      { key: 'project.create', label: 'Create projects', desc: 'Start new projects.' },
      { key: 'project.manage', label: 'Manage projects', desc: 'Change project settings, phases and quality gates.' },
    ],
  },
  {
    group: 'Attendance',
    items: [
      { key: 'attendance.use', label: 'Uses attendance', desc: 'Checks in each day, is counted, and sees their own month.' },
      { key: 'attendance.read', label: "See everyone's attendance", desc: 'Daily list, monthly totals and holidays.' },
      { key: 'attendance.manage', label: 'Manage attendance', desc: 'Correct entries, set leave and holidays, change the rules.' },
    ],
  },
  {
    group: 'Leave',
    items: [
      { key: 'leave.use', label: 'Apply for leave', desc: 'Applies for leave and sees their own requests.' },
      { key: 'leave.approve', label: 'Approve leave (first step)', desc: "Approves employees' leave when nobody is set as their Reports to. Admins give the final approval." },
    ],
  },
  {
    group: 'Voice Notes',
    items: [
      { key: 'voice_notes.read', label: 'See voice notes', desc: 'Open the voice notes inbox and transcripts.' },
      { key: 'voice_notes.update', label: 'Handle voice notes', desc: 'Turn voice notes into tasks, dismiss and restore them.' },
    ],
  },
  {
    group: 'Workspace',
    items: [
      { key: 'workspace.members.read', label: 'See members', desc: 'Open the member list and invitations.' },
      { key: 'workspace.members.invite', label: 'Invite members', desc: 'Send invitations to join the workspace.' },
      { key: 'workspace.members.update', label: "Change members' roles", desc: 'Give members a different role.' },
      { key: 'workspace.members', label: 'Remove members', desc: 'Remove people from the workspace.' },
      { key: 'workspace.roles.read', label: 'See roles', desc: 'Open this page.' },
      { key: 'workspace.roles.update', label: 'Edit roles', desc: 'Create roles and change what they can do.' },
      { key: 'workspace.security.read', label: 'See the security log', desc: 'Who changed what, and when.' },
      { key: 'workspace.voice.manage', label: 'Manage WhatsApp numbers', desc: 'Add and verify the numbers that can send voice notes.' },
    ],
  },
];

// Roles every workspace starts with (they can be edited, not deleted)
const BUILT_IN = ['admin', 'tenant admin', 'project manager', 'scrum master', 'developer', 'viewer', 'member', 'guest'];

const isAdminRole = (r: Role) => r.name.toLowerCase() === 'admin' || r.permissions?.admin === true;
const kindOf = (r: Role): 'admin' | 'built-in' | 'custom' =>
  isAdminRole(r) ? 'admin' : BUILT_IN.includes(r.name.toLowerCase()) ? 'built-in' : 'custom';

const KIND_STYLES = {
  admin: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 border-indigo-500/20',
  'built-in': 'bg-slate-500/10 text-slate-600 dark:text-slate-300 border-slate-500/20',
  custom: 'bg-amber-500/10 text-amber-600 dark:text-amber-300 border-amber-500/20',
};
const KIND_LABELS = { admin: 'Full access', 'built-in': 'Built-in', custom: 'Custom' };

const apiError = (err: any, fallback: string) => err?.response?.data?.error || fallback;
const inputClass =
  'w-full px-3 py-2 rounded-xl border border-border bg-background text-foreground text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50 disabled:opacity-60';

const Switch: React.FC<{ on: boolean; disabled?: boolean; label: string; onChange: () => void }> = ({ on, disabled, label, onChange }) => (
  <button
    type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={onChange}
    className={`relative w-9 h-5 rounded-full transition-colors shrink-0 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${
      on ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-zinc-700'
    }`}
  >
    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
  </button>
);

export const RolesManagement: React.FC = () => {
  const { socket } = useSocket();
  const { can } = usePermissions();
  const confirm = useConfirm();
  const { toast } = useToast();
  // toast is a new object on every render; keep loadRoles stable
  const toastRef = React.useRef(toast);
  toastRef.current = toast;
  const canEdit = can('workspace.roles.update' as any);

  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleDesc, setNewRoleDesc] = useState('');

  const loadRoles = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await rolesApi.list();
      setRoles(data || []);
      if (data && data.length > 0) {
        setSelectedRole((prev) => data.find((r) => r.id === prev?.id) || data[0]);
      }
    } catch (err: any) {
      toastRef.current.error(apiError(err, 'Could not load roles.'), 'Roles');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRoles();
  }, [loadRoles]);

  useEffect(() => {
    if (!socket) return;
    const handleRoleUpdate = () => loadRoles();
    socket.on('role_updated', handleRoleUpdate);
    socket.on('role_deleted', handleRoleUpdate);
    socket.on('role_created', handleRoleUpdate);
    return () => {
      socket.off('role_updated', handleRoleUpdate);
      socket.off('role_deleted', handleRoleUpdate);
      socket.off('role_created', handleRoleUpdate);
    };
  }, [loadRoles, socket]);

  // Unsaved edits: the selected role compared with the saved one
  const saved = roles.find((r) => r.id === selectedRole?.id);
  const dirty = useMemo(() => {
    if (!selectedRole || !saved) return false;
    if ((selectedRole.description || '') !== (saved.description || '')) return true;
    const keys = new Set([...Object.keys(selectedRole.permissions), ...Object.keys(saved.permissions)]);
    return [...keys].some((k) => !!selectedRole.permissions[k] !== !!saved.permissions[k]);
  }, [selectedRole, saved]);

  const selectRole = async (r: Role) => {
    if (r.id === selectedRole?.id) return;
    if (dirty) {
      const ok = await confirm({
        title: 'Discard changes?',
        message: `Your changes to ${selectedRole?.name} haven't been saved.`,
        confirmLabel: 'Discard',
        cancelLabel: 'Keep editing',
        variant: 'warning',
      });
      if (!ok) return;
    }
    setSelectedRole(r);
  };

  const togglePermission = (key: string) => {
    if (!selectedRole || isAdminRole(selectedRole) || !canEdit) return;
    setSelectedRole({ ...selectedRole, permissions: { ...selectedRole.permissions, [key]: !selectedRole.permissions[key] } });
  };

  const handleSaveChanges = async () => {
    if (!selectedRole) return;
    setSaving(true);
    try {
      await rolesApi.update(selectedRole.id, { description: selectedRole.description, permissions: selectedRole.permissions });
      toast.success(`${selectedRole.name} saved. Members get the change the next time they open Work OS.`, 'Roles');
      await loadRoles();
    } catch (err: any) {
      toast.error(apiError(err, 'Could not save the role.'), 'Roles');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateRoleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoleName.trim()) return;
    try {
      const created = await rolesApi.create({
        name: newRoleName.trim(),
        description: newRoleDesc.trim(),
        permissions: { 'project.read': true, 'attendance.use': true, 'leave.use': true }, // a safe start
      });
      toast.success(`${created.name} created. Choose what it can do, then save.`, 'Roles');
      setNewRoleName('');
      setNewRoleDesc('');
      setShowCreateModal(false);
      await loadRoles();
      setSelectedRole(created);
    } catch (err: any) {
      toast.error(apiError(err, 'Could not create the role.'), 'Roles');
    }
  };

  const handleDeleteRole = async (r: Role) => {
    const ok = await confirm({
      title: `Delete ${r.name}?`,
      message: 'This role will be removed from the workspace.',
      confirmLabel: 'Delete role',
      cancelLabel: 'Cancel',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await rolesApi.delete(r.id);
      toast.success(`${r.name} deleted.`, 'Roles');
      loadRoles();
    } catch (err: any) {
      toast.error(apiError(err, 'Could not delete the role.'), 'Roles');
    }
  };

  const selectedIsAdmin = selectedRole ? isAdminRole(selectedRole) : false;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] gap-6 items-start">
      {/* Roles */}
      <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 px-1">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-blue-500" />
            <h2 className="text-sm font-bold text-foreground">Roles</h2>
          </div>
          {canEdit && (
            <button
              type="button" onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border text-xs font-semibold text-foreground hover:bg-muted cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> New role
            </button>
          )}
        </div>

        {loading && !roles.length ? (
          <div className="flex justify-center p-6"><Loader2 className="w-4 h-4 animate-spin text-blue-500" /></div>
        ) : (
          <div className="space-y-1.5">
            {roles.map((r) => {
              const active = selectedRole?.id === r.id;
              const kind = kindOf(r);
              const deletable = canEdit && kind === 'custom' && !(r.userCount ?? 0);
              return (
                <div
                  key={r.id}
                  role="button" tabIndex={0} aria-pressed={active}
                  onClick={() => selectRole(r)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectRole(r); } }}
                  className={`group rounded-xl border px-3 py-2.5 cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 ${
                    active ? 'border-blue-500/40 bg-blue-500/10' : 'border-transparent hover:bg-muted'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className={`text-sm font-semibold truncate ${active ? 'text-blue-600 dark:text-blue-300' : 'text-foreground'}`}>{r.name}</p>
                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground shrink-0">
                      <Users className="w-3 h-3" /> {r.userCount ?? 0}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-1">
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md border ${KIND_STYLES[kind]}`}>{KIND_LABELS[kind]}</span>
                    {deletable && (
                      <button
                        type="button" aria-label={`Delete ${r.name}`}
                        onClick={(e) => { e.stopPropagation(); handleDeleteRole(r); }}
                        className="p-1 rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-500/10 opacity-60 group-hover:opacity-100 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  {r.description && <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{r.description}</p>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* What the selected role can do */}
      <div className="rounded-2xl border border-border bg-card">
        {!selectedRole ? (
          <p className="p-6 text-xs text-muted-foreground">Choose a role.</p>
        ) : (
          <>
            <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 p-5 border-b border-border bg-card rounded-t-2xl">
              <div className="min-w-0">
                <h2 className="text-base font-bold text-foreground truncate">{selectedRole.name}</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {selectedRole.userCount ?? 0} member{(selectedRole.userCount ?? 0) === 1 ? '' : 's'} · what people with this role can do
                </p>
              </div>
              {canEdit && !selectedIsAdmin && (
                <div className="flex items-center gap-3">
                  {dirty && <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">Unsaved changes</span>}
                  <button
                    type="button" onClick={handleSaveChanges} disabled={!dirty || saving}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save changes
                  </button>
                </div>
              )}
            </div>

            <div className="p-5 space-y-6">
              {selectedIsAdmin && (
                <div className="flex items-start gap-3 rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-4">
                  <ShieldCheck className="w-5 h-5 text-indigo-500 shrink-0" />
                  <p className="text-xs text-foreground">
                    <span className="font-semibold">This role has full access.</span>{' '}
                    <span className="text-muted-foreground">Admins can do everything in the workspace, so these switches can't be changed.</span>
                  </p>
                </div>
              )}

              <div className="space-y-1.5">
                <label htmlFor="role-description" className="text-xs font-semibold text-foreground">Description</label>
                <textarea
                  id="role-description" rows={2}
                  value={selectedRole.description || ''}
                  onChange={(e) => setSelectedRole({ ...selectedRole, description: e.target.value })}
                  placeholder="When should someone get this role? e.g. Sales staff who make calls"
                  disabled={selectedIsAdmin || !canEdit}
                  className={`${inputClass} resize-none`}
                />
              </div>

              {PERMISSION_GROUPS.map(({ group, items }) => (
                <section key={group} aria-labelledby={`perm-${group}`}>
                  <h3 id={`perm-${group}`} className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">{group}</h3>
                  <div className="rounded-xl border border-border divide-y divide-border">
                    {items.map((perm) => {
                      const on = selectedIsAdmin || selectedRole.permissions[perm.key] === true;
                      return (
                        <div key={perm.key} className="flex items-center justify-between gap-4 px-4 py-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground">{perm.label}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{perm.desc}</p>
                          </div>
                          <Switch
                            on={on} label={perm.label} disabled={selectedIsAdmin || !canEdit}
                            onChange={() => togglePermission(perm.key)}
                          />
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </>
        )}
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/70 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="new-role-title">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h3 id="new-role-title" className="text-sm font-bold text-foreground">New role</h3>
              <button type="button" onClick={() => setShowCreateModal(false)} aria-label="Close" className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateRoleSubmit} className="p-5 space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="new-role-name" className="text-xs font-semibold text-foreground">Name</label>
                <input
                  id="new-role-name" required autoFocus value={newRoleName} maxLength={100}
                  onChange={(e) => setNewRoleName(e.target.value)} placeholder="e.g. Telecaller" className={inputClass}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="new-role-desc" className="text-xs font-semibold text-foreground">Description (optional)</label>
                <textarea
                  id="new-role-desc" rows={3} value={newRoleDesc} onChange={(e) => setNewRoleDesc(e.target.value)}
                  placeholder="When should someone get this role?" className={`${inputClass} resize-none`}
                />
              </div>
              <p className="text-[11px] text-muted-foreground">It starts with: see projects, uses attendance, apply for leave. You can change this next.</p>
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setShowCreateModal(false)} className="px-4 py-2 rounded-xl border border-border text-xs font-semibold text-foreground hover:bg-muted cursor-pointer">
                  Cancel
                </button>
                <button type="submit" disabled={!newRoleName.trim()} className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold disabled:opacity-50 cursor-pointer">
                  Create role
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default RolesManagement;
