import { useAuthStore } from '../../store/authStore';
import type { Permission } from './permission.constants';
import { hasPermission, hasAnyPermission, hasAllPermissions } from './permissions';

export const usePermissions = () => {
  const user = useAuthStore((state) => state.user);
  const permissions = user?.permissions || {};
  const role = user?.role || 'Guest';

  const isAdminRole = (r: string): boolean => {
    const lower = (r || '').toLowerCase();
    return lower.includes('admin') || lower.includes('owner');
  };

  const can = (permission: Permission): boolean => {
    if (isAdminRole(role)) return true;
    return hasPermission(permissions, permission);
  };

  const canAny = (perms: Permission[]): boolean => {
    if (isAdminRole(role)) return true;
    return hasAnyPermission(permissions, perms);
  };

  const canAll = (perms: Permission[]): boolean => {
    if (isAdminRole(role)) return true;
    return hasAllPermissions(permissions, perms);
  };

  return {
    can,
    canAny,
    canAll,
    permissions,
    role,
  };
};
