import { registerSW } from 'virtual:pwa-register';

export const APP_VERSION = __APP_VERSION__;

const UPDATE_CHECK_MS = 10 * 60_000;
const SAFE_RETRY_MS = 3000;

let registration: ServiceWorkerRegistration | undefined;
const hadController = typeof navigator !== 'undefined' && !!navigator.serviceWorker?.controller;
let reloadScheduled = false;

/** Reloading mid-shot or mid-typing would lose what the player is doing; everything else is in IndexedDB. */
function isSafeToReload(): boolean {
  const active = document.activeElement;
  const typing = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement;
  return !typing && !document.body.classList.contains('camera-open') && !document.querySelector('.modal-backdrop');
}

function reloadWhenSafe(): void {
  if (reloadScheduled) return;
  reloadScheduled = true;
  const attempt = () => (isSafeToReload() ? location.reload() : setTimeout(attempt, SAFE_RETRY_MS));
  attempt();
}

const checkNow = () => registration?.update().catch(() => undefined);

registerSW({
  immediate: true,
  onRegisteredSW(_url, reg) {
    registration = reg;
    if (!reg) return;
    setInterval(checkNow, UPDATE_CHECK_MS);
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && checkNow());
  },
});

// The new worker calls skipWaiting + clientsClaim; when it takes over an already controlled page, that page
// still runs the old bundle, so it reloads into the new one.
navigator.serviceWorker?.addEventListener('controllerchange', () => {
  if (hadController) reloadWhenSafe();
});

/** Host "update app": asks the server for a new version; the page reloads by itself if there is one. */
export async function checkForUpdate(): Promise<boolean> {
  if (!registration) return false;
  await registration.update();
  const incoming = registration.installing ?? registration.waiting;
  if (!incoming) return false;
  await new Promise<void>((resolve) => {
    if (incoming.state === 'activated') return resolve();
    incoming.addEventListener('statechange', () => incoming.state === 'activated' && resolve());
  });
  return true;
}
