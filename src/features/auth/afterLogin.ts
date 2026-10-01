// The page someone was opening when they had to sign in (e.g. a WhatsApp button to /leave?tab=approvals),
// kept for this tab so the login can take them there instead of the dashboard.

const KEY = 'workos:after-login';

/** Only paths inside Work OS (never another site or the sign-in pages themselves) */
const isSafe = (path: string | null): path is string =>
  !!path && path.startsWith('/') && !path.startsWith('//') && !path.includes('\\') && !/^\/(login|register)(\/|\?|$)/.test(path);

export function rememberAfterLogin(path: string) {
  try {
    if (isSafe(path) && path !== '/' && !path.startsWith('/dashboard')) sessionStorage.setItem(KEY, path);
  } catch {
    // Storage unavailable: the login goes to the dashboard
  }
}

/** Where to go once signed in (read without clearing) */
export function peekAfterLogin(): string {
  try {
    const path = sessionStorage.getItem(KEY);
    return isSafe(path) ? path : '/dashboard';
  } catch {
    return '/dashboard';
  }
}

/** Where to go once signed in, and forget it */
export function takeAfterLogin(): string {
  const path = peekAfterLogin();
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
  return path;
}
