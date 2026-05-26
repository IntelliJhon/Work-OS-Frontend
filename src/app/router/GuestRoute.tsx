import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';

export const GuestRoute: React.FC = () => {
  const { isAuthenticated, authInitialized } = useAuthStore();

  if (!authInitialized) {
    return (
      <div className="min-h-screen bg-[#0F0F12] text-slate-900 dark:text-white flex flex-col items-center justify-center space-y-4">
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

  return isAuthenticated ? <Navigate to="/dashboard" replace /> : <Outlet />;
};
