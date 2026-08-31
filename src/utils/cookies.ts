import Cookies from 'js-cookie';

const REFRESH_TOKEN_KEY = 'refreshToken';

export const getRefreshToken = (): string | undefined => {
  const cookieVal = Cookies.get(REFRESH_TOKEN_KEY);
  if (cookieVal) return cookieVal;

  if (typeof window !== 'undefined' && window.localStorage) {
    const localVal = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (localVal) return localVal;
  }
  return undefined;
};

export const setRefreshToken = (token: string): void => {
  const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';

  // Cookie storage with dynamic secure flag
  Cookies.set(REFRESH_TOKEN_KEY, token, {
    secure: isHttps,
    sameSite: isHttps ? 'strict' : 'lax',
    expires: 7, // 7 days
  });

  // LocalStorage fallback for local development / localhost HTTP
  if (typeof window !== 'undefined' && window.localStorage) {
    localStorage.setItem(REFRESH_TOKEN_KEY, token);
  }
};

export const removeRefreshToken = (): void => {
  Cookies.remove(REFRESH_TOKEN_KEY);
  if (typeof window !== 'undefined' && window.localStorage) {
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  }
};
