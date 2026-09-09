import { create } from 'zustand';
import { getRefreshToken, setRefreshToken, removeRefreshToken } from '../utils/cookies';

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
  login: (user: UserProfile, accessToken: string, refreshToken: string) => void;
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
  authLoading: !!getRefreshToken(),

  setUser: (user) => set({ user }),

  login: (user, accessToken, refreshToken) => {
    setRefreshToken(refreshToken);
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
    removeRefreshToken();
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
