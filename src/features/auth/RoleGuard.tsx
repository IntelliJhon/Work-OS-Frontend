import React from 'react';
import { usePermissions } from './usePermissions';

export interface RoleGuardProps {
  roles: string[];
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export const RoleGuard: React.FC<RoleGuardProps> = ({ roles, fallback = null, children }) => {
  const { role } = usePermissions();

  if (roles.includes(role)) {
    return <>{children}</>;
  }

  return <>{fallback}</>;
};
