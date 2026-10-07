import { lazy, type ComponentType } from 'react';

// After a deploy, an open tab still asks for the old page files, which no longer exist, so the page stayed blank
// until a manual refresh. Reload once to pick up the new version (at most once per minute, so it can't loop).
const RELOADED_AT = 'workos_reloaded_for_new_version';

export function reloadForNewVersion(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOADED_AT) || 0);
    if (Date.now() - last < 60_000) return false;
    sessionStorage.setItem(RELOADED_AT, String(Date.now()));
  } catch {
    // Storage blocked: reload anyway, once per page view
  }
  window.location.reload();
  return true;
}

// Vite reports a module it could not preload this way
window.addEventListener('vite:preloadError', (event) => {
  if (reloadForNewVersion()) event.preventDefault();
});

/** React.lazy that reloads the app when the page's file is gone after a deploy */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- same constraint as React.lazy
export function lazyPage<T extends ComponentType<any>>(load: () => Promise<{ default: T }>) {
  return lazy(() =>
    load().catch((err) => {
      // Keep showing the loader while the page reloads
      if (reloadForNewVersion()) return new Promise<{ default: T }>(() => {});
      throw err;
    }),
  );
}
