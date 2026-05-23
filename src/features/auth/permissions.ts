import type { Permission } from './permission.constants';

export const hasPermission = (
  userPermissions: Record<string, boolean> | undefined,
  permission: Permission
): boolean => {
  if (!userPermissions) return false;
  // If user has admin permission, they can bypass all checks
  if (userPermissions['admin'] === true) return true;
  return userPermissions[permission] === true;
};

export const hasAnyPermission = (
  userPermissions: Record<string, boolean> | undefined,
  permissions: Permission[]
): boolean => {
  if (!userPermissions) return false;
  if (userPermissions['admin'] === true) return true;
  return permissions.some((perm) => userPermissions[perm] === true);
};

export const hasAllPermissions = (
  userPermissions: Record<string, boolean> | undefined,
  permissions: Permission[]
): boolean => {
  if (!userPermissions) return false;
  if (userPermissions['admin'] === true) return true;
  return permissions.every((perm) => userPermissions[perm] === true);
};
