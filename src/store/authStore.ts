import { create } from 'zustand';
import { hasSessionHint, markSession, clearSession } from '../utils/cookies';

export interface UserProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  tenantId: string;
  role: string;
  roleName?: string;
  permissions?: Record<string, boolean>;
}

interface AuthState {
  user: UserProfile | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  authInitialized: boolean;
  authLoading: boolean;
  // The refresh token is set by the server as an HttpOnly cookie; only the access token is kept here (in memory)
  login: (user: UserProfile, accessToken: string) => void;
  logout: () => void;
  setUser: (user: UserProfile) => void;
  setAccessToken: (token: string | null) => void;
  setLoading: (loading: boolean) => void;
  setAuthInitialized: (initialized: boolean) => void;
  setAuthLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  isAuthenticated: false,
  isLoading: false,
  authInitialized: false,
  authLoading: hasSessionHint(),

  setUser: (user) => set({ user }),

  login: (user, accessToken) => {
    markSession();
    set({
      user,
      accessToken,
      isAuthenticated: true,
      isLoading: false,
      authInitialized: true,
      authLoading: false,
    });
  },

  logout: () => {
    clearSession();
    set({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      isLoading: false,
      authInitialized: true,
      authLoading: false,
    });
  },

  setAccessToken: (token) => {
    set({
      accessToken: token,
      isAuthenticated: !!token,
    });
  },

  setLoading: (loading) => {
    set({ isLoading: loading });
  },

  setAuthInitialized: (initialized) => {
    set({ authInitialized: initialized });
  },

  setAuthLoading: (loading) => {
    set({ authLoading: loading });
  },
}));
