import { registerSW } from 'virtual:pwa-register';

type Listener = (ready: boolean) => void;
let updateReady = false;
const listeners = new Set<Listener>();
let registration: ServiceWorkerRegistration | undefined;

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    updateReady = true;
    listeners.forEach((l) => l(true));
  },
  onRegisteredSW(_url, reg) {
    registration = reg;
  },
});

export function onUpdateReady(listener: Listener): () => void {
  listeners.add(listener);
  listener(updateReady);
  return () => listeners.delete(listener);
}

/** Activates the waiting worker and reloads; progress and photos live in IndexedDB and survive it. */
export const applyUpdate = (): Promise<void> => updateSW(true);

/** Host "update app": asks the server for a new worker; resolves true if one is installed and waiting. */
export async function checkForUpdate(): Promise<boolean> {
  if (!registration) return false;
  await registration.update();
  if (registration.installing) {
    await new Promise<void>((resolve) => {
      const sw = registration!.installing!;
      sw.addEventListener('statechange', () => sw.state !== 'installing' && resolve());
    });
  }
  return !!registration.waiting || updateReady;
}
