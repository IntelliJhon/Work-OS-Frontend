import axios from 'axios';
import type { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '../../store/authStore';
import type { UserProfile } from '../../store/authStore';
import { hasSessionHint, clearSession, takeLegacyRefreshToken } from '../../utils/cookies';
import { rememberAfterLogin } from '../../features/auth/afterLogin';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
// Calls that set or use the session cookie go through this site's own address (Vercel rewrite / Vite proxy),
// so the HttpOnly cookie is first-party and never readable by page scripts.
export const AUTH_API_URL = import.meta.env.VITE_AUTH_API_URL || '/api';
const SESSION_PATHS = /^\/?(auth\/|invitations\/accept$|tenants\/create$)/;

export interface SessionResult {
  accessToken: string;
  user: UserProfile;
}

let activeRefresh: Promise<SessionResult> | null = null;

/** Gets a new access token using the session cookie. Concurrent callers share one request. */
export const refreshSession = (): Promise<SessionResult> => {
  if (!activeRefresh) {
    const legacy = takeLegacyRefreshToken();
    activeRefresh = axios
      .post(`${AUTH_API_URL}/auth/refresh`, legacy ? { refreshToken: legacy } : {}, { withCredentials: true })
      .then((res) => res.data as SessionResult)
      .finally(() => {
        activeRefresh = null;
      });
  }
  return activeRefresh;
};

export const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

interface FailedRequest {
  resolve: (token: string | null) => void;
  reject: (error: unknown) => void;
}

let isRefreshing = false;
let failedQueue: FailedRequest[] = [];

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

// Request Interceptor: Inject Access Token
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    if (config.url && SESSION_PATHS.test(config.url)) {
      config.baseURL = AUTH_API_URL;
      config.withCredentials = true;
    }
    const token = useAuthStore.getState().accessToken;
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response Interceptor: Handle Token Refresh
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // Prevent loop if refresh request itself fails
    if (originalRequest.url?.includes('/auth/refresh')) {
      isRefreshing = false;
      processQueue(error, null);
      useAuthStore.getState().logout();
      return Promise.reject(error);
    }

    // A wrong password on the login form is a 401 too; that must not trigger a session refresh
    if (error.response?.status === 401 && !originalRequest._retry && !SESSION_PATHS.test(originalRequest.url ?? '')) {
      originalRequest._retry = true;
      if (!hasSessionHint()) {
        useAuthStore.getState().logout();
        return Promise.reject(error);
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            if (originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${token}`;
            }
            return apiClient(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      isRefreshing = true;

      try {
        const { accessToken, user } = await refreshSession();

        if (user) {
          useAuthStore.getState().setUser(user);
        }
        useAuthStore.getState().setAccessToken(accessToken);

        isRefreshing = false;
        processQueue(null, accessToken);

        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        }
        return apiClient(originalRequest);
      } catch (refreshError) {
        isRefreshing = false;
        processQueue(refreshError, null);
        useAuthStore.getState().logout();
        clearSession();

        // Force redirect to login page, coming back here afterwards
        rememberAfterLogin(window.location.pathname + window.location.search);
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);
