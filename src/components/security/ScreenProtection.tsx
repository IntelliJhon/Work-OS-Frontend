import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { EyeOff, ShieldAlert } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';

// ─── Screenshot deterrent ─────────────────────────────────────────────────────
// A web page cannot block the operating system's screenshots. What it can do is black out its
// content whenever the window isn't in use, so screenshot tools and screen recordings capture a
// black page. Win+Shift+S freezes the screen before the browser loses focus, so the page also goes
// black as soon as that shortcut starts (the Windows key; Cmd+Shift on a Mac).
// PrintScreen is captured by Windows before the page hears the key: the page then goes black with a
// warning and overwrites the clipboard, so the image usually can't be pasted.

// Off unless the build sets VITE_SCREEN_PROTECTION=on (switched off on request during development, 2026-10-01)
const ENABLED = import.meta.env.VITE_SCREEN_PROTECTION === 'on';

const platform = typeof navigator !== 'undefined' ? navigator.userAgent : '';
const isWindows = /Windows/i.test(platform);
const isMac = /Macintosh|Mac OS X/i.test(platform);

/** The start of an OS screenshot shortcut: Win+Shift+S / Win+PrtSc on Windows, Cmd+Shift+3/4/5 on a Mac. */
const startsScreenshotShortcut = (e: KeyboardEvent) =>
  (isWindows && e.key === 'Meta') || (isMac && e.metaKey && e.shiftKey);

const isPrintScreen = (e: KeyboardEvent) => e.key === 'PrintScreen' || e.code === 'PrintScreen';

/** Focus moved into an embedded frame (a document preview): the user is still in Work OS. */
const focusInsideFrame = () => document.activeElement instanceof HTMLIFrameElement;

/** Replaces a screenshot Windows just put on the clipboard. Needs the page to have focus. */
const clearClipboard = () => {
  navigator.clipboard?.writeText('').catch(() => {
    // No clipboard access (page not focused, or permission denied)
  });
};

// 'away': the window isn't in use (clears itself when the user comes back)
// 'screenshot': PrintScreen was pressed (stays until the user clicks)
type Mode = 'away' | 'screenshot' | null;

export const ScreenProtection: React.FC = () => (ENABLED ? <ActiveScreenProtection /> : null);

const ActiveScreenProtection: React.FC = () => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const [mode, setMode] = useState<Mode>(() => (typeof document !== 'undefined' && !document.hasFocus() ? 'away' : null));

  useEffect(() => {
    if (!isAuthenticated) return;

    const hide = () => setMode((m) => m ?? 'away');
    const showIfFocused = () => {
      if (document.visibilityState === 'visible' && document.hasFocus()) setMode((m) => (m === 'away' ? null : m));
    };

    const onBlur = () => {
      // Checked a tick later, once activeElement has moved to the frame
      setTimeout(() => {
        if (!focusInsideFrame()) hide();
      }, 0);
    };
    const onFocus = () => setMode((m) => (m === 'away' ? null : m));
    const onVisibility = () => (document.visibilityState === 'hidden' ? hide() : showIfFocused());
    const onKeyDown = (e: KeyboardEvent) => {
      if (isPrintScreen(e)) {
        setMode('screenshot');
        clearClipboard();
      } else if (startsScreenshotShortcut(e)) {
        hide();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (isPrintScreen(e)) {
        // Windows only reports PrintScreen on key up, after it has taken the screenshot
        setMode('screenshot');
        clearClipboard();
        setTimeout(clearClipboard, 300);
        setTimeout(clearClipboard, 1000);
      } else if (e.key === 'Meta' || e.key === 'Shift') {
        showIfFocused();
      }
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

  if (!isAuthenticated || !mode) return null;

  const screenshot = mode === 'screenshot';

  return createPortal(
    <div
      role="presentation"
      onMouseDown={() => {
        window.focus();
        if (screenshot && document.hasFocus()) setMode(null);
      }}
      className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-black cursor-pointer select-none"
    >
      <div className="flex flex-col items-center gap-3 px-8 py-6 text-center">
        <div
          className={`w-11 h-11 rounded-full flex items-center justify-center border ${
            screenshot ? 'bg-red-500/10 border-red-500/20' : 'bg-blue-500/10 border-blue-500/20'
          }`}
        >
          {screenshot ? <ShieldAlert className="w-5 h-5 text-red-400" /> : <EyeOff className="w-5 h-5 text-blue-400" />}
        </div>
        <p className="text-sm font-bold text-white">{screenshot ? 'Screenshots are not allowed' : 'Work OS is hidden'}</p>
        <p className="text-xs text-zinc-400 max-w-xs">
          {screenshot
            ? 'Work OS content must not be captured or shared. Click anywhere to continue.'
            : "Content is hidden while this window isn't in use. Click anywhere to continue."}
        </p>
      </div>
    </div>,
    document.body,
  );
};
