import React, { useState, useEffect } from 'react';
import { projectMembersApi } from '../../services/api/projectMembers';
import type { ProjectMember } from '../../services/api/projectMembers';
import { usersApi } from '../../services/api/users';
import type { User } from '../../services/api/users';
import { rolesApi } from '../../services/api/roles';
import type { Role } from '../../services/api/roles';
import { usePermissions } from '../../features/auth/usePermissions';
import { 
  X, Users, UserPlus, Trash2, Shield, AlertCircle, Check, HelpCircle
} from 'lucide-react';

interface ProjectMembersDrawerProps {
  projectId: string;
  projectName: string;
  isOpen: boolean;
  onClose: () => void;
}

export const ProjectMembersDrawer: React.FC<ProjectMembersDrawerProps> = ({
  projectId,
  projectName,
  isOpen,
  onClose,
}) => {
  const { can } = usePermissions();
  const canManage = can('project.manage' as any) || can('admin' as any);

  // Data State
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [workspaceUsers, setWorkspaceUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  
  // Loading & Message States
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Add Member form state
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedRoleId, setSelectedRoleId] = useState('');

  // Load project members, workspace users and roles
  const loadData = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const [membersList, usersList, rolesList] = await Promise.all([
        projectMembersApi.list(projectId),
        usersApi.list({ limit: 100 }), // Fetch list of workspace users
        rolesApi.list(),
      ]);

      setMembers(membersList || []);
      
      // Filter out users who are already project members from the addable list
      const memberUserIds = new Set((membersList || []).map((m) => m.userId));
      const usersData = Array.isArray(usersList) ? usersList : (usersList?.users || []);
      const addableUsers = usersData.filter((u: User) => !memberUserIds.has(u.id));
      setWorkspaceUsers(addableUsers);

      setRoles(rolesList || []);
    } catch (err: any) {
      console.error('Failed to load project members data', err);
      setErrorMsg('Failed to load project members configuration.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && projectId) {
      loadData();
      // Reset form
      setSelectedUserId('');
      setSelectedRoleId('');
      setErrorMsg('');
      setSuccessMsg('');
    }
  }, [isOpen, projectId]);

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId || !selectedRoleId) {
      setErrorMsg('Please select a user and a project role.');
      return;
    }

    setSubmitting(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      await projectMembersApi.add(projectId, {
        userId: selectedUserId,
        roleId: selectedRoleId,
      });

      setSuccessMsg('Member added to project successfully.');
      setSelectedUserId('');
      setSelectedRoleId('');
      loadData();
    } catch (err: any) {
      setErrorMsg(err.response?.data?.error || 'Failed to add member to project.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRoleChange = async (userId: string, newRoleId: string) => {
    setErrorMsg('');
    setSuccessMsg('');
    try {
      await projectMembersApi.update(projectId, userId, newRoleId);
      setSuccessMsg('Project role updated.');
      loadData();
    } catch (err: any) {
      setErrorMsg(err.response?.data?.error || 'Failed to update member project role.');
    }
  };

  const handleRemoveMember = async (userId: string, userEmail: string) => {
    if (!window.confirm(`Are you sure you want to remove ${userEmail} from this project?`)) return;
    setErrorMsg('');
    setSuccessMsg('');
    try {
      await projectMembersApi.remove(projectId, userId);
      setSuccessMsg('Removed member from project.');
      loadData();
    } catch (err: any) {
      setErrorMsg(err.response?.data?.error || 'Failed to remove project member.');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-background/80 backdrop-blur-sm animate-fade-in">
      {/* Drawer Overlay backdrop */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Drawer Content Body */}
      <div className="w-full max-w-md h-full bg-white dark:bg-zinc-950 border-l border-slate-200 dark:border-border/80 shadow-2xl relative flex flex-col glow-primary animate-slide-in-right z-10">
        
        {/* Drawer Header */}
        <div className="p-6 border-b border-border/60 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center">
              <Users className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Project Members</h3>
              <p className="text-[10px] text-slate-900 dark:text-white font-light leading-normal max-w-[220px] truncate">
  {projectName}
</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-500 dark:text-zinc-500 hover:text-white hover:bg-slate-100/60 dark:bg-white/5 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Message Indicators */}
        <div className="px-6 pt-4 space-y-2">
          {errorMsg && (
            <div className="flex items-center space-x-2 p-3 rounded-lg border border-red-500/25 bg-red-500/10 text-red-400 text-[10px]">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
          {successMsg && (
            <div className="flex items-center space-x-2 p-3 rounded-lg border border-emerald-500/25 bg-emerald-500/10 text-emerald-400 text-[10px]">
              <Check className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}
        </div>

        {/* Drawer Content Scroll View */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* Add Member Form Panel */}
          {canManage && workspaceUsers.length > 0 ? (
            <div className="glass-panel p-4 border border-border/60 bg-white/2 rounded-xl space-y-4">
              <h4 className="text-xs font-bold text-slate-900 dark:text-white flex items-center space-x-1.5">
                <UserPlus className="w-3.5 h-3.5 text-blue-400" />
                <span>Assign New Project Member</span>
              </h4>

              <form onSubmit={handleAddMember} className="space-y-3">
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-slate-500 dark:text-zinc-500 uppercase tracking-wider block">
                    Workspace User
                  </label>
                  <select
                    required
                    value={selectedUserId}
                    onChange={(e) => setSelectedUserId(e.target.value)}
                    className="w-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-border/80 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-500/50 appearance-none cursor-pointer"
                  >
                    <option value="" className="bg-white dark:bg-zinc-950 text-slate-900 dark:text-white">Select workspace team member</option>
                    {workspaceUsers.map((u) => (
                      <option key={u.id} value={u.id} className="bg-white dark:bg-zinc-950 text-slate-900 dark:text-white">
                        {u.firstName} {u.lastName} ({u.email})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-slate-500 dark:text-zinc-500 uppercase tracking-wider block">
                    Project-Specific Role
                  </label>
                  <select
                    required
                    value={selectedRoleId}
                    onChange={(e) => setSelectedRoleId(e.target.value)}
                    className="w-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-border/80 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-500/50 appearance-none cursor-pointer"
                  >
                    <option value="" className="bg-white dark:bg-zinc-950 text-slate-900 dark:text-white">Assign project level role permissions</option>
                    {roles.map((r) => (
                      <option key={r.id} value={r.id} className="bg-white dark:bg-zinc-950 text-slate-900 dark:text-white">
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 rounded-lg text-xs font-semibold text-white transition active:scale-[0.98]"
                >
                  {submitting ? 'Adding...' : 'Add Member to Project'}
                </button>
              </form>
            </div>
          ) : canManage && workspaceUsers.length === 0 ? (
            <p className="text-[10px] text-slate-500 dark:text-zinc-500 italic font-light bg-white/2 p-3 rounded-lg border border-slate-100 dark:border-white/5 text-center">
              All workspace members are already assigned to this project.
            </p>
          ) : null}

          {/* Members List Panel */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-900 dark:text-white flex items-center space-x-1.5">
              <Users className="w-3.5 h-3.5 text-blue-400" />
              <span>Assigned Members ({members.length})</span>
            </h4>

            {loading ? (
              <p className="text-[11px] text-muted-foreground italic font-light">Loading project members...</p>
            ) : members.length === 0 ? (
              <p className="text-[11px] text-slate-500 dark:text-zinc-500 italic font-light">No members assigned to this project yet.</p>
            ) : (
              <div className="space-y-2">
                {members.map((member) => {
                  const initials = ((member.firstName?.[0] || '') + (member.lastName?.[0] || '')).toUpperCase();
                  
                  return (
                    <div
                      key={member.id}
                      className="glass-panel border border-border/40 hover:border-blue-500/10 p-3 rounded-xl flex items-center justify-between gap-3 transition"
                    >
                      <div className="flex items-center space-x-3 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/25 flex items-center justify-center font-bold text-[11px] text-indigo-400 shrink-0">
                          {initials}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                            {member.firstName} {member.lastName}
                          </p>
                          <p className="text-[10px] text-muted-foreground font-light truncate">
                            {member.email}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2 shrink-0">
                        <div className="flex items-center space-x-1">
                          <Shield className="w-3 h-3 text-blue-400" />
                          {canManage ? (
                            <select
                              value={member.roleId}
                              onChange={(e) => handleRoleChange(member.userId, e.target.value)}
                              className="bg-transparent border-0 hover:bg-slate-100/60 dark:bg-white/5 p-1 rounded font-medium text-slate-900 dark:text-white focus:outline-none text-[10px] cursor-pointer"
                            >
                              {roles.map((r) => (
                                <option key={r.id} value={r.id} className="bg-white dark:bg-zinc-950 text-slate-900 dark:text-white">{r.name}</option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-[10px] font-medium text-slate-700 dark:text-zinc-300">{member.roleName}</span>
                          )}
                        </div>

                        {canManage && (
                          <button
                            onClick={() => handleRemoveMember(member.userId, member.email)}
                            className="p-1.5 text-slate-500 dark:text-zinc-500 hover:text-red-400 rounded-lg hover:bg-red-500/10 transition active:scale-90"
                            title="Remove Member from Project"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Drawer Footer info */}
        <div className="p-4 border-t border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-zinc-950 text-center text-[9px] text-slate-500 dark:text-zinc-500 font-light flex items-center justify-center space-x-1 select-none">
          <HelpCircle className="w-3 h-3" />
          <span>Project memberships override general workspace roles within this stage.</span>
        </div>
      </div>
    </div>
  );
};

export default ProjectMembersDrawer;
