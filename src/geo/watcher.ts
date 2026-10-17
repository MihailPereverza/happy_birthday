import type { Fix } from './zone';

export type GeoStatus = 'waiting' | 'ok' | 'denied' | 'unavailable';

export interface GeoUpdate {
  status: GeoStatus;
  fix?: Fix;
}

type Listener = (update: GeoUpdate) => void;

const SILENCE_POLL_MS = 4000;

let emulated: Fix | null = null;
const emulationListeners = new Set<Listener>();
let lastFix: Fix | undefined;

/** Test mode: the host picks a point and every watcher receives it as a precise fix. */
export function setEmulatedPosition(pos: { lat: number; lon: number } | null): void {
  emulated = pos && { ...pos, accuracy: 5, at: Date.now() };
  if (emulated) {
    lastFix = emulated;
    emulationListeners.forEach((l) => l({ status: 'ok', fix: emulated! }));
  }
}

export const getEmulatedPosition = (): Fix | null => emulated;
export const getLastFix = (): Fix | undefined => lastFix;

/** Starts high-accuracy tracking; returns a stop function. While emulation is on, real fixes are ignored
 * and the emulated one is re-sent every second, like real GPS would. */
export function watchPosition(listener: Listener): () => void {
  const sendEmulated = () => emulated && listener({ status: 'ok', fix: { ...emulated, at: Date.now() } });
  const timer = setInterval(sendEmulated, 1000);
  emulationListeners.add(listener);
  let geoId: number | undefined;
  if (emulated) {
    sendEmulated();
  } else if (!('geolocation' in navigator)) {
    listener({ status: 'unavailable' });
  } else {
    listener({ status: 'waiting' });
  }
  let lastRealFixAt = 0;
  const onPosition = (p: GeolocationPosition) => {
    if (emulated) return;
    lastRealFixAt = Date.now();
    lastFix = { lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy, at: p.timestamp };
    listener({ status: 'ok', fix: lastFix });
  };
  const onError = (err: GeolocationPositionError) =>
    emulated || listener({ status: err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable' });
  let pollTimer: number | undefined;
  if ('geolocation' in navigator) {
    geoId = navigator.geolocation.watchPosition(onPosition, onError, {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 30_000,
    });
    // A phone standing still may stay silent in watchPosition; ask explicitly so zone entry still gets its fixes.
    pollTimer = window.setInterval(() => {
      if (emulated || Date.now() - lastRealFixAt < SILENCE_POLL_MS) return;
      navigator.geolocation.getCurrentPosition(onPosition, () => undefined, {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 10_000,
      });
    }, SILENCE_POLL_MS);
  }
  return () => {
    clearInterval(timer);
    window.clearInterval(pollTimer);
    emulationListeners.delete(listener);
    if (geoId !== undefined) navigator.geolocation.clearWatch(geoId);
  };
}

/** One-off position for photo metadata; never waits longer than `timeoutMs`. */
export function currentPosition(timeoutMs = 3000): Promise<Fix | undefined> {
  if (emulated) return Promise.resolve(emulated);
  if (!('geolocation' in navigator)) return Promise.resolve(lastFix);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy, at: p.timestamp }),
      () => resolve(lastFix),
      { enableHighAccuracy: true, maximumAge: 60_000, timeout: timeoutMs },
    );
  });
}

export type FreshPosition = { ok: true; fix: Fix } | { ok: false; reason: 'denied' | 'unavailable' };

/** A new high-accuracy fix (no cached positions), used to anchor a route around the player. */
export function freshPosition(timeoutMs = 20_000): Promise<FreshPosition> {
  if (emulated) return Promise.resolve({ ok: true, fix: emulated });
  if (!('geolocation' in navigator)) return Promise.resolve({ ok: false, reason: 'unavailable' });
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) => {
        lastFix = { lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy, at: p.timestamp };
        resolve({ ok: true, fix: lastFix });
      },
      (err) => resolve({ ok: false, reason: err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable' }),
      { enableHighAccuracy: true, maximumAge: 0, timeout: timeoutMs },
    );
  });
}
