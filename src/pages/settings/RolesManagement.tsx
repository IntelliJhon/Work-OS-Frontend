import React, { useState, useEffect } from 'react';
import { useSocket } from '../../services/socket/socket-context';
import { rolesApi } from '../../services/api/roles';
import type { Role } from '../../services/api/roles';
import { usePermissions } from '../../features/auth/usePermissions';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { 
  Shield, Check, X, ShieldAlert, Plus, Save, AlertCircle, Info, Trash
} from 'lucide-react';

const PERMISSION_KEYS = [
  { key: 'admin', group: 'System', label: 'Bypass / Global Admin', desc: 'Full root access to all tenant resources. Overrides other rules.' },
  { key: 'project.create', group: 'Projects', label: 'Create Projects', desc: 'Permission to provision new projects & quality gates.' },
  { key: 'project.read', group: 'Projects', label: 'Read Projects', desc: 'Permission to view details, sprint backlogs and sprints.' },
  { key: 'project.manage', group: 'Projects', label: 'Manage Projects', desc: 'Allows updating project settings, phases, gates configuration.' },
  { key: 'task.create', group: 'Tasks', label: 'Create Tasks', desc: 'Enables creating sprint task cards.' },
  { key: 'task.read', group: 'Tasks', label: 'Read Tasks', desc: 'Enables reading tasks and work backlogs.' },
  { key: 'task.update', group: 'Tasks', label: 'Update Tasks', desc: 'Allows moving cards, commenting, updating descriptions.' },
  { key: 'workspace.members.read', group: 'Administration', label: 'Read Members', desc: 'Access to view workspace team list and invites.' },
  { key: 'workspace.members.invite', group: 'Administration', label: 'Invite Members', desc: 'Access to send new onboarding invitations.' },
  { key: 'workspace.members.update', group: 'Administration', label: 'Modify Roles', desc: 'Allows updating members role assignments.' },
  { key: 'workspace.members', group: 'Administration', label: 'Remove Members', desc: 'Allows removing team members from workspace.' },
  { key: 'workspace.roles.read', group: 'Administration', label: 'Read Roles', desc: 'Access to view RBAC configurations and roles.' },
  { key: 'workspace.roles.update', group: 'Administration', label: 'Modify Roles Settings', desc: 'Access to change permission matrices.' },
  { key: 'workspace.security.read', group: 'Administration', label: 'Read Security Logs', desc: 'Access to view system audit logs ledger.' },
];

export const RolesManagement: React.FC = () => {
  const { socket } = useSocket();
  const { can } = usePermissions();
  const confirm = useConfirm();
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Selected Role to Edit details
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  
  // Custom Role Creator State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleDesc, setNewRoleDesc] = useState('');

  // Load roles
  const loadRoles = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await rolesApi.list();
      setRoles(data || []);
      if (data && data.length > 0) {
        // Set selected to first role by default or keep previous selection matched by id
        setSelectedRole(prev => data.find(r => r.id === prev?.id) || data[0]);
      }
    } catch (err: any) {
      setErrorMsg(err.response?.data?.error || 'Failed to fetch roles');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRoles();
  }, [loadRoles]);

  useEffect(() => {
    if (!socket) return;
    const handleRoleUpdate = () => {
      loadRoles();
    };

    socket.on('role_updated', handleRoleUpdate);
    socket.on('role_deleted', handleRoleUpdate);
    socket.on('role_created', handleRoleUpdate);
    return () => {
      socket.off('role_updated', handleRoleUpdate);
      socket.off('role_deleted', handleRoleUpdate);
      socket.off('role_created', handleRoleUpdate);
    };
  }, [loadRoles, socket]);

  // Update a permission state in memory for selected role
  const handlePermissionToggle = (permissionKey: string) => {
    if (!selectedRole) return;
    
    // Safety check: Cannot modify Admin role permissions
    if (selectedRole.name.toLowerCase() === 'admin' || selectedRole.permissions['admin'] === true) {
      setErrorMsg('The Admin role has absolute permissions. You cannot customize its permission matrix.');
      return;
    }

    if (!can('workspace.roles.update' as any)) {
      setErrorMsg('You do not have permission to modify role configurations.');
      return;
    }

    setErrorMsg('');
    setSuccessMsg('');

    const updatedPermissions = {
      ...selectedRole.permissions,
      [permissionKey]: !selectedRole.permissions[permissionKey]
    };

    setSelectedRole({
      ...selectedRole,
      permissions: updatedPermissions
    });
  };

  // Save changes
  const handleSaveChanges = async () => {
    if (!selectedRole) return;
    setErrorMsg('');
    setSuccessMsg('');

    try {
      await rolesApi.update(selectedRole.id, {
        description: selectedRole.description,
        permissions: selectedRole.permissions
      });
      setSuccessMsg(`Role matrix updated successfully for ${selectedRole.name}.`);
      loadRoles();
    } catch (err: any) {
      setErrorMsg(err.response?.data?.error || 'Failed to save changes');
    }
  };

  // Create role
  const handleCreateRoleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!newRoleName) {
      setErrorMsg('Role name is required.');
      return;
    }

    try {
      const created = await rolesApi.create({
        name: newRoleName,
        description: newRoleDesc,
        permissions: { 'project.read': true } // default safe starting permission
      });
      setSuccessMsg(`Role ${created.name} created successfully.`);
      setNewRoleName('');
      setNewRoleDesc('');
      setShowCreateModal(false);
      loadRoles();
    } catch (err: any) {
      setErrorMsg(err.response?.data?.error || 'Failed to create role');
    }
  };

  // Delete role
  const handleDeleteRole = async (id: string, name: string) => {
    const isSpecial = ['admin', 'project manager', 'member', 'guest'].includes(name.toLowerCase());
    if (isSpecial) {
      setErrorMsg('System default roles cannot be deleted.');
      return;
    }

    const ok = await confirm({
      title: 'Delete Custom Role',
      message: `Are you sure you want to delete the custom role: ${name}? Users mapped to this role will lose their custom configurations.`,
      confirmLabel: 'Delete Role',
      cancelLabel: 'Cancel',
      variant: 'danger',
    });
    if (!ok) return;
    setErrorMsg('');
    setSuccessMsg('');

    try {
      await rolesApi.delete(id);
      setSuccessMsg(`Successfully deleted role ${name}.`);
      loadRoles();
    } catch (err: any) {
      setErrorMsg(err.response?.data?.error || 'Failed to delete role');
    }
  };

  return (
    <div className="space-y-6">
      {/* Messages */}
      {errorMsg && (
        <div className="flex items-center space-x-2.5 p-4 rounded-xl border border-red-500/20 bg-red-500/10 text-red-400 text-xs animate-scale-in">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}
      {successMsg && (
        <div className="flex items-center space-x-2.5 p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 text-xs animate-scale-in">
          <Check className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Main Grid: Left List, Right Matrix */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        
        {/* Left Side: Role Profiles Selector */}
        <div className="glass-panel rounded-2xl p-6 border border-border bg-card/40 glow-primary h-fit">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center space-x-2">
              <Shield className="w-5 h-5 text-blue-400" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Roles Profiles</h3>
            </div>
            {can('workspace.roles.update' as any) && (
              <button
                onClick={() => { setErrorMsg(''); setSuccessMsg(''); setShowCreateModal(true); }}
                className="p-2 rounded-lg bg-slate-100/60 dark:bg-white/5 border border-slate-200/60 dark:border-white/10 text-white hover:bg-slate-200/60 dark:bg-white/10 hover:text-blue-400 transition"
                title="Create Custom Role"
              >
                <Plus className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="space-y-2">
            {loading ? (
              <p className="text-xs text-muted-foreground italic py-4">Loading roles...</p>
            ) : (
              roles.map((r) => {
                const isActive = selectedRole?.id === r.id;
                const isSystem = ['admin', 'project manager', 'member', 'guest'].includes(r.name.toLowerCase());
                
                return (
                  <div
                    key={r.id}
                    onClick={() => { setErrorMsg(''); setSuccessMsg(''); setSelectedRole(r); }}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                      isActive
                        ? 'bg-blue-600/10 border-blue-500/30 text-blue-400 glow-primary'
                        : 'border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-zinc-900/20 hover:bg-zinc-900/40 text-slate-600 dark:text-zinc-400'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className={`text-xs font-bold ${isActive ? 'text-white' : 'text-zinc-200'}`}>{r.name}</p>
                        <p className="text-[10px] text-muted-foreground font-light leading-relaxed mt-0.5 max-w-[200px]">
                          {r.description || 'No description provided.'}
                        </p>
                      </div>
                      
                      <span className="text-[9px] bg-slate-100/60 dark:bg-white/5 px-2 py-0.5 rounded text-slate-600 dark:text-zinc-400 border border-slate-100 dark:border-white/5 font-mono">
                        {r.userCount || 0} Users
                      </span>
                    </div>

                    <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-slate-100 dark:border-white/5">
                      <span className={`text-[8px] font-black uppercase tracking-widest font-mono ${isSystem ? 'text-indigo-400' : 'text-amber-400'}`}>
                        {isSystem ? 'system role' : 'custom role'}
                      </span>

                      {!isSystem && can('workspace.roles.update' as any) && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteRole(r.id, r.name); }}
                          className="p-1 text-slate-500 dark:text-zinc-500 hover:text-red-400 rounded hover:bg-red-500/10 transition"
                          title="Delete Role"
                        >
                          <Trash className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Side: Matrix Editor */}
        <div className="xl:col-span-2 glass-panel rounded-2xl p-6 border border-border bg-card/40 glow-primary">
          {selectedRole ? (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-white/5 pb-4">
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center space-x-2">
                    <span>Permission Matrix: {selectedRole.name}</span>
                  </h3>
                  <p className="text-xs text-muted-foreground font-light mt-0.5">
                    Customize permissions policies for this profile tag.
                  </p>
                </div>
                
                {can('workspace.roles.update' as any) && (
                  <button
                    onClick={handleSaveChanges}
                    className="flex items-center space-x-1.5 px-4.5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-lg hover:shadow-blue-500/10 transition active:scale-95 shrink-0"
                  >
                    <Save className="w-4 h-4" />
                    <span>Save Matrix Config</span>
                  </button>
                )}
              </div>

              {/* Role Info input */}
              <div className="bg-zinc-900/40 p-4 rounded-xl border border-slate-100 dark:border-white/5 space-y-3">
                <div className="flex items-center space-x-2 text-[11px] font-bold text-slate-600 dark:text-zinc-400 uppercase tracking-wider">
                  <Info className="w-4 h-4 text-blue-400" />
                  <span>Role Description</span>
                </div>
                <textarea
                  value={selectedRole.description || ''}
                  onChange={(e) => setSelectedRole({ ...selectedRole, description: e.target.value })}
                  placeholder="Enter details about when to assign this role..."
                  rows={2}
                  disabled={['admin', 'project manager', 'member', 'guest'].includes(selectedRole.name.toLowerCase()) || !can('workspace.roles.update' as any)}
                  className="w-full bg-zinc-950/60 border border-border/80 rounded-xl px-4 py-2.5 text-xs font-light text-white focus:outline-none focus:border-blue-500/50 transition resize-none disabled:opacity-50"
                />
              </div>

              {/* Matrix Table */}
              <div className="border border-border/40 rounded-xl overflow-hidden bg-slate-50/50 dark:bg-zinc-900/20">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-border/60 bg-white/2 text-slate-600 dark:text-zinc-400 font-bold uppercase tracking-wider text-[10px]">
                      <th className="px-6 py-4 w-1/3">Permission Key</th>
                      <th className="px-6 py-4 w-12 text-center font-bold">Policy Status</th>
                      <th className="px-6 py-4">Action Rules Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    {PERMISSION_KEYS.map((perm) => {
                      const hasAccess = selectedRole.permissions[perm.key] === true || selectedRole.permissions['admin'] === true;
                      const isSystemAdmin = selectedRole.name.toLowerCase() === 'admin';

                      return (
                        <tr key={perm.key} className="hover:bg-white/2 transition-colors">
                          <td className="px-6 py-4">
                            <span className="font-semibold text-slate-900 dark:text-white">{perm.label}</span>
                            <span className="block font-mono text-[9px] text-slate-500 dark:text-zinc-500 mt-0.5">{perm.key}</span>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <button
                              type="button"
                              onClick={() => handlePermissionToggle(perm.key)}
                              disabled={isSystemAdmin || !can('workspace.roles.update' as any)}
                              className={`w-9 h-6.5 rounded-lg border flex items-center justify-center transition-all ${
                                hasAccess
                                  ? 'bg-emerald-500/10 border-emerald-500/35 text-emerald-400 glow-primary'
                                  : 'bg-white dark:bg-zinc-900/60 border-slate-100 dark:border-white/5 text-zinc-600'
                              } disabled:opacity-50 disabled:cursor-not-allowed`}
                            >
                              {hasAccess ? (
                                <Check className="w-4 h-4 animate-scale-in" />
                              ) : (
                                <X className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-[11px] text-slate-600 dark:text-zinc-400 font-light leading-relaxed">{perm.desc}</p>
                            {isSystemAdmin && (
                              <span className="inline-flex items-center space-x-1 text-[8px] bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-bold uppercase tracking-widest px-1.5 py-0.5 rounded mt-1.5">
                                <ShieldAlert className="w-2.5 h-2.5 shrink-0" />
                                <span>Locked admin policy</span>
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">No role profiles selected.</p>
          )}
        </div>
      </div>

      {/* Role Creator Modal Popover */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-md glass-panel-heavy rounded-2xl p-6 shadow-2xl border border-border/80 bg-zinc-950 glow-primary relative animate-scale-in">
            <button
              onClick={() => setShowCreateModal(false)}
              className="absolute top-4 right-4 p-1 rounded-lg text-slate-500 dark:text-zinc-500 hover:text-white hover:bg-slate-100/60 dark:bg-white/5 transition"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center space-x-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center">
                <Plus className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Create Custom Role</h3>
                <p className="text-xs text-muted-foreground font-light mt-0.5">
                  Define a new workspace access profile tag.
                </p>
              </div>
            </div>

            <form onSubmit={handleCreateRoleSubmit} className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-zinc-400 uppercase tracking-wider mb-2">
                  Role Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Lead Quality Assurance"
                  value={newRoleName}
                  onChange={(e) => setNewRoleName(e.target.value)}
                  className="w-full bg-white dark:bg-zinc-900/60 border border-border/80 rounded-xl px-4 py-2.5 text-xs font-light text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500/50 transition"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-zinc-400 uppercase tracking-wider mb-2">
                  Description / Context
                </label>
                <textarea
                  placeholder="Briefly state when this role should be assigned..."
                  value={newRoleDesc}
                  onChange={(e) => setNewRoleDesc(e.target.value)}
                  rows={3}
                  className="w-full bg-white dark:bg-zinc-900/60 border border-border/80 rounded-xl px-4 py-2.5 text-xs font-light text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500/50 transition resize-none"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-100/60 dark:bg-white/5 border border-slate-200/60 dark:border-white/10 hover:bg-slate-200/60 dark:bg-white/10 text-white text-xs font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-lg hover:shadow-blue-500/10 transition"
                >
                  Create Profile
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
