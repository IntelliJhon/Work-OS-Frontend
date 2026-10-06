import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, Clock, AlertTriangle, MapPin, MapPinOff } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { apiClient } from '../../services/api/client';
import { attendanceApi, formatCheckInTime, type AttendanceRecord, type CheckInLocation } from '../../services/api/attendance';

// ─── Daily check-in + midnight logout ─────────────────────────────────────────
// The server records the day's first check-in (its own clock decides Present / Early / Late). This component
// calls it whenever a signed-in user is in Work OS, until today's attendance is settled, and shows the result
// once. At midnight (India time) it signs the tab out, matching the server, where sessions end at midnight.

const TIME_ZONE = 'Asia/Kolkata';
const RETRY_MS = 5 * 60_000;
// The browser's own timeout doesn't run while its "Allow location?" prompt is unanswered, so check in
// without a location after this long and add the location if it comes later
const LOCATION_WAIT_MS = 10_000;

const todayKey = () => new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

/** Milliseconds until the next 00:00 in India */
function msUntilMidnight(): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const elapsed = (get('hour') * 3600 + get('minute') * 60 + get('second')) * 1000;
  return Math.max(1000, 24 * 3600 * 1000 - elapsed);
}

/** The device location, or why there is none. Never rejects. */
function getLocation(): Promise<CheckInLocation> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) return resolve({ locationStatus: 'unavailable' });
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy, locationStatus: 'ok' }),
      (err) => resolve({ locationStatus: err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable' }),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  });
}

// Settled for today (per user): stop asking the server until the day changes
const settledKey = (userId: string) => `workos:attendance:${userId}`;
const isSettled = (userId: string) => {
  try {
    return sessionStorage.getItem(settledKey(userId)) === todayKey();
  } catch {
    return false;
  }
};
const markSettled = (userId: string) => {
  try {
    sessionStorage.setItem(settledKey(userId), todayKey());
  } catch {
    // Storage unavailable: the server call is idempotent anyway
  }
};

const timeout = (ms: number) => new Promise<null>((resolve) => setTimeout(() => resolve(null), ms));

export const AttendanceCheckIn: React.FC = () => {
  const { isAuthenticated, user, logout } = useAuthStore();
  const [shown, setShown] = useState<AttendanceRecord | null>(null);
  const [locationPending, setLocationPending] = useState(false);
  const inFlight = useRef(false);

  const tryCheckIn = useCallback(async () => {
    if (!user || inFlight.current || isSettled(user.id)) return;
    inFlight.current = true;
    try {
      const locating = getLocation();
      const location = await Promise.race([locating, timeout(LOCATION_WAIT_MS)]);
      const result = await attendanceApi.checkIn(location ?? { locationStatus: 'unavailable' });
      if (result.code === 'too_early') return; // check-in opens later today; try again then
      markSettled(user.id);
      if (!result.created || !result.record) return;
      setShown(result.record);
      if (location) return;
      // Still waiting for the location prompt: add the location to this check-in once it's allowed
      setLocationPending(true);
      locating
        .then(async (late) => {
          if (late.locationStatus !== 'ok') return;
          const updated = await attendanceApi.checkIn(late);
          if (updated.record) setShown((s) => (s && s.id === updated.record!.id ? updated.record! : s));
        })
        .catch(() => undefined)
        .finally(() => setLocationPending(false));
    } catch {
      // Offline or server busy: the next attempt retries
    } finally {
      inFlight.current = false;
    }
  }, [user]);

  // Check in on arrival, when the tab comes back, and every few minutes until today is settled
  useEffect(() => {
    if (!isAuthenticated || !user) return;
    tryCheckIn();
    const timer = setInterval(tryCheckIn, RETRY_MS);
    const onVisible = () => document.visibilityState === 'visible' && tryCheckIn();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [isAuthenticated, user, tryCheckIn]);

  // Sign the tab out at midnight (the server stops renewing the session then)
  useEffect(() => {
    if (!isAuthenticated) return;
    const timer = setTimeout(async () => {
      try {
        await apiClient.post('/auth/logout', {});
      } catch {
        // The session ends on the server anyway
      } finally {
        logout();
        window.location.assign('/login');
      }
    }, msUntilMidnight());
    return () => clearTimeout(timer);
  }, [isAuthenticated, logout]);

  if (!shown) return null;

  const late = shown.status === 'late';
  const absent = shown.status === 'absent';
  const halfLeave = shown.status === 'leave' && shown.leaveHalf;
  const title = absent ? 'Marked as absent' : late ? 'Marked as late' : halfLeave ? 'Checked in' : 'Marked as present';
  const detail = [
    halfLeave ? `Half-day leave (${shown.leaveHalf} half)` : null,
    shown.early ? 'Early' : null,
    `Checked in at ${formatCheckInTime(shown.checkInAt)}`,
  ].filter(Boolean).join(' · ');
  const Icon = absent ? AlertTriangle : late ? Clock : CheckCircle2;
  const tone = absent ? 'text-red-400 bg-red-500/10 border-red-500/20' : late ? 'text-amber-400 bg-amber-500/10 border-amber-500/20' : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-background/60 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="attendance-title">
      <div className="w-full max-w-sm glass-panel-heavy border border-border rounded-2xl shadow-2xl p-6 text-center space-y-4">
        <div className={`mx-auto w-14 h-14 rounded-full border flex items-center justify-center ${tone}`}>
          <Icon className="w-7 h-7" />
        </div>
        <div className="space-y-1">
          <h2 id="attendance-title" className="text-lg font-bold text-foreground">{title}</h2>
          <p className="text-sm text-muted-foreground">{detail}</p>
          {absent && <p className="text-xs text-muted-foreground">You checked in after 12:00 noon.</p>}
        </div>
        {shown.locationStatus !== 'ok' && locationPending && (
          <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
            <MapPin className="w-3.5 h-3.5" />
            Allow location in your browser to share it with your admin.
          </p>
        )}
        {shown.locationStatus !== 'ok' && !locationPending && (
          <p className="flex items-center justify-center gap-1.5 text-[11px] text-amber-400">
            <MapPinOff className="w-3.5 h-3.5" />
            Location was not shared. Your admin sees "No location" for today.
          </p>
        )}
        <button
          type="button"
          onClick={() => setShown(null)}
          autoFocus
          className="w-full px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold cursor-pointer"
        >
          OK
        </button>
      </div>
    </div>,
    document.body,
  );
};
