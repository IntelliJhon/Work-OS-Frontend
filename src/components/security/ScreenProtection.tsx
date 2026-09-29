import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { EyeOff } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';

// ─── Screenshot deterrent ─────────────────────────────────────────────────────
// A web page cannot block the operating system's screenshots. What it can do is hide its content
// whenever the window isn't in use, so screenshot tools and screen recordings capture a blurred
// page. Win+Shift+S freezes the screen before the browser loses focus, so the page also hides as
// soon as that shortcut starts (the Windows key; Cmd+Shift on a Mac). PrintScreen can't be caught.

const platform = typeof navigator !== 'undefined' ? navigator.userAgent : '';
const isWindows = /Windows/i.test(platform);
const isMac = /Macintosh|Mac OS X/i.test(platform);

/** The start of an OS screenshot shortcut: Win+Shift+S / Win+PrtSc on Windows, Cmd+Shift+3/4/5 on a Mac. */
const startsScreenshotShortcut = (e: KeyboardEvent) =>
  (isWindows && e.key === 'Meta') || (isMac && e.metaKey && e.shiftKey);

/** Focus moved into an embedded frame (a document preview): the user is still in Work OS. */
const focusInsideFrame = () => document.activeElement instanceof HTMLIFrameElement;

export const ScreenProtection: React.FC = () => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const [hidden, setHidden] = useState(() => typeof document !== 'undefined' && !document.hasFocus());

  useEffect(() => {
    if (!isAuthenticated) return;

    const hide = () => setHidden(true);
    const showIfFocused = () => {
      if (document.visibilityState === 'visible' && document.hasFocus()) setHidden(false);
    };

    const onBlur = () => {
      // Checked a tick later, once activeElement has moved to the frame
      setTimeout(() => {
        if (!focusInsideFrame()) hide();
      }, 0);
    };
    const onFocus = () => setHidden(false);
    const onVisibility = () => (document.visibilityState === 'hidden' ? hide() : showIfFocused());
    const onKeyDown = (e: KeyboardEvent) => {
      if (startsScreenshotShortcut(e)) hide();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Meta' || e.key === 'Shift') showIfFocused();
    };

    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    return () => {
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
    };
  }, [isAuthenticated]);

  if (!isAuthenticated || !hidden) return null;

  return createPortal(
    <div
      role="presentation"
      onMouseDown={() => window.focus()}
      className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-slate-950/70 cursor-pointer select-none"
      style={{ backdropFilter: 'blur(32px)', WebkitBackdropFilter: 'blur(32px)' }}
    >
      <div className="flex flex-col items-center gap-3 px-8 py-6 rounded-2xl bg-zinc-900/80 border border-white/10 text-center shadow-2xl">
        <div className="w-11 h-11 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
          <EyeOff className="w-5 h-5 text-blue-400" />
        </div>
        <p className="text-sm font-bold text-white">Work OS is hidden</p>
        <p className="text-xs text-zinc-400 max-w-xs">
          Content is hidden while this window isn't in use. Click anywhere to continue.
        </p>
      </div>
    </div>,
    document.body,
  );
};
