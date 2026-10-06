import React, { useEffect } from 'react';
import { useAuthStore } from '../../store/authStore';
import { hasSessionHint } from '../../utils/cookies';
import { refreshSession } from '../../services/api/client';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { login, logout, setAuthInitialized, setAuthLoading, authLoading } = useAuthStore();

  useEffect(() => {
    const initializeAuth = async () => {
      if (!hasSessionHint()) {
        setAuthInitialized(true);
        setAuthLoading(false);
        return;
      }

      try {
        const { user, accessToken } = await refreshSession();
        login(user, accessToken);
      } catch (err) {
        console.error('[AuthProvider] Failed to restore session:', err);
        logout(); // sets authInitialized = true, authLoading = false
      }
    };

    initializeAuth();
  }, [login, logout, setAuthInitialized, setAuthLoading]);

  // While initializing, we show a premium sleek loading spinner
  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#0F0F12] text-slate-900 dark:text-white flex flex-col items-center justify-center space-y-4">
        {/* Sleek premium spinner */}
        <div className="relative w-12 h-12">
          <div className="absolute inset-0 rounded-full border-t-2 border-r-2 border-blue-500/20 dark:border-blue-500/10 animate-spin"></div>
          <div className="absolute inset-0 rounded-full border-b-2 border-l-2 border-blue-600 dark:border-blue-500 animate-spin duration-1000"></div>
        </div>
        <p className="text-xs tracking-widest uppercase font-semibold text-blue-600 dark:text-blue-400 dark:font-light animate-pulse">
          Initializing Workspace
        </p>
      </div>
    );
  }

  return <>{children}</>;
};

export default AuthProvider;
