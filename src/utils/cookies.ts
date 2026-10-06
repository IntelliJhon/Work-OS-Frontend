import Cookies from 'js-cookie';

// The refresh token is kept by the server in an HttpOnly cookie that scripts cannot read.
// The app only remembers *that* a session exists, so it knows whether to try restoring it on load.
const SESSION_HINT_KEY = 'workos_session';
const LEGACY_KEY = 'refreshToken';

const storage = (): Storage | null => {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
};

export const hasSessionHint = (): boolean => storage()?.getItem(SESSION_HINT_KEY) === '1' || !!Cookies.get(LEGACY_KEY) || !!storage()?.getItem(LEGACY_KEY);

export const markSession = (): void => {
  storage()?.setItem(SESSION_HINT_KEY, '1');
};

export const clearSession = (): void => {
  storage()?.removeItem(SESSION_HINT_KEY);
  takeLegacyRefreshToken();
};

/** A refresh token saved by an older version of the app (readable storage); returned once and then deleted. */
export const takeLegacyRefreshToken = (): string | undefined => {
  const token = Cookies.get(LEGACY_KEY) || storage()?.getItem(LEGACY_KEY) || undefined;
  Cookies.remove(LEGACY_KEY);
  storage()?.removeItem(LEGACY_KEY);
  return token;
};
