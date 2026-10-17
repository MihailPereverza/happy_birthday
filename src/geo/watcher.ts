import type { Fix } from './zone';

export type GeoStatus = 'waiting' | 'ok' | 'denied' | 'unavailable';

export interface GeoUpdate {
  status: GeoStatus;
  fix?: Fix;
}

type Listener = (update: GeoUpdate) => void;

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
  if ('geolocation' in navigator) {
    geoId = navigator.geolocation.watchPosition(
      (p) => {
        if (emulated) return;
        lastFix = { lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy, at: p.timestamp };
        listener({ status: 'ok', fix: lastFix });
      },
      (err) => emulated || listener({ status: err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable' }),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 30_000 },
    );
  }
  return () => {
    clearInterval(timer);
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
