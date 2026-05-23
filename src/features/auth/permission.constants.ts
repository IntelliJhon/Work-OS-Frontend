export const PERMISSIONS = {
  PROJECT_CREATE: 'project.create',
  PROJECT_READ: 'project.read',
  PROJECT_MANAGE: 'project.manage',
  TASK_CREATE: 'task.create',
  TASK_READ: 'task.read',
  TASK_UPDATE: 'task.update',
  ADMIN: 'admin',
  WORKSPACE_MEMBERS_READ: 'workspace.members.read',
  WORKSPACE_MEMBERS_INVITE: 'workspace.members.invite',
  WORKSPACE_MEMBERS_UPDATE: 'workspace.members.update',
  WORKSPACE_MEMBERS: 'workspace.members',
  WORKSPACE_ROLES_READ: 'workspace.roles.read',
  WORKSPACE_ROLES_UPDATE: 'workspace.roles.update',
  WORKSPACE_SECURITY_READ: 'workspace.security.read',
} as const;

export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS];

