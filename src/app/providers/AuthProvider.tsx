import React, { useEffect } from 'react';
import axios from 'axios';
import { useAuthStore } from '../../store/authStore';
import { getRefreshToken } from '../../utils/cookies';

// Single-flight promise to prevent concurrent refreshes from double-submitting the refresh token
let activeRefreshPromise: Promise<{ user: any; accessToken: string; refreshToken: string }> | null = null;

const performSilentRefresh = async (refreshToken: string): Promise<{ user: any; accessToken: string; refreshToken: string }> => {
  if (activeRefreshPromise) {
    return activeRefreshPromise;
  }

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

  activeRefreshPromise = (async () => {
    try {
      // Call refresh endpoint to get new access token
      const response = await axios.post(`${API_URL}/auth/refresh`, {
        refreshToken,
      });

      const { accessToken: newAccessToken, refreshToken: newRefreshToken, user } = response.data;

      return {
        user,
        accessToken: newAccessToken,
        refreshToken: newRefreshToken || refreshToken
      };
    } catch (err) {
      activeRefreshPromise = null; // Clear so subsequent attempts can retry if needed
      throw err;
    }
  })();

  return activeRefreshPromise;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { login, logout, setAuthInitialized, setAuthLoading, authLoading } = useAuthStore();

  useEffect(() => {
    const initializeAuth = async () => {
      const refreshToken = getRefreshToken();
      if (!refreshToken) {
        setAuthInitialized(true);
        setAuthLoading(false);
        return;
      }

      try {
        const { user, accessToken, refreshToken: finalRefreshToken } = await performSilentRefresh(refreshToken);
        login(user, accessToken, finalRefreshToken);
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
      <div className="min-h-screen bg-[#0F0F12] text-slate-900 dark:text-white flex flex-col items-center justify-center space-y-4">
        {/* Sleek premium spinner */}
        <div className="relative w-12 h-12">
          <div className="absolute inset-0 rounded-full border-t-2 border-r-2 border-blue-500/20 animate-spin"></div>
          <div className="absolute inset-0 rounded-full border-b-2 border-l-2 border-blue-500 animate-spin duration-1000"></div>
        </div>
        <p className="text-muted-foreground text-xs tracking-widest uppercase font-light animate-pulse text-blue-400">
          Initializing Workspace
        </p>
      </div>
    );
  }

  return <>{children}</>;
};

export default AuthProvider;
