import { create } from 'zustand';
import Cookies from 'js-cookie';

import { getRefreshToken } from '../utils/cookies';

export interface UserProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  tenantId: string;
  role: string;
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
    // Set refreshToken cookie: secure, same-site strict, expires in 7 days
    Cookies.set('refreshToken', refreshToken, {
      secure: true,
      sameSite: 'strict',
      expires: 7,
    });
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
    Cookies.remove('refreshToken');
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
