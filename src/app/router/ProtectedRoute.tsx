import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { usePermissions } from '../../features/auth/usePermissions';
import type { Permission } from '../../features/auth/permission.constants';

export interface ProtectedRouteProps {
  requiredPermissions?: Permission[];
  requiredRoles?: string[];
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  requiredPermissions,
  requiredRoles,
}) => {
  const { isAuthenticated, authInitialized } = useAuthStore();
  const { can, role } = usePermissions();

  if (!authInitialized) {
    return (
      <div className="min-h-screen bg-[#0F0F12] text-white flex flex-col items-center justify-center space-y-4">
        <div className="relative w-12 h-12">
          <div className="absolute inset-0 rounded-full border-t-2 border-r-2 border-blue-500/20 animate-spin"></div>
          <div className="absolute inset-0 rounded-full border-b-2 border-l-2 border-blue-500 animate-spin duration-1000"></div>
        </div>
        <p className="text-muted-foreground text-xs tracking-widest uppercase font-light animate-pulse text-blue-400">
          Authenticating Session
        </p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Check roles if defined
  if (requiredRoles && !requiredRoles.includes(role)) {
    return <Navigate to="/403" replace />;
  }

  // Check permissions if defined
  if (requiredPermissions) {
    const hasAccess = requiredPermissions.every((perm) => can(perm));
    if (!hasAccess) {
      return <Navigate to="/403" replace />;
    }
  }

  return <Outlet />;
};
