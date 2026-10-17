import { loadLog, saveLog } from './store';

export type LogEventType =
  | 'step_completed'
  | 'step_skipped'
  | 'point_skipped'
  | 'point_finished'
  | 'goto'
  | 'attempt_failed'
  | 'photo_saved'
  | 'photo_deleted'
  | 'pack_loaded'
  | 'progress_reset'
  | 'admin_opened'
  | 'error';

export interface LogEvent {
  t: number;
  type: LogEventType;
  pointId?: string;
  stepId?: string;
  detail?: unknown;
}

const MAX_EVENTS = 2000;
let events: LogEvent[] = [];
let ready: Promise<void> | null = null;
let writeChain: Promise<void> = Promise.resolve();

export function initLog(): Promise<void> {
  ready ??= loadLog().then((stored) => {
    events = stored;
  });
  return ready;
}

export function logEvent(event: Omit<LogEvent, 't'>): void {
  events.push({ t: Date.now(), ...event });
  if (events.length > MAX_EVENTS) events = events.slice(-MAX_EVENTS);
  const snapshot = events;
  // Writes are serialized so a slow write can never overwrite a newer snapshot.
  writeChain = writeChain.then(() => saveLog(snapshot)).catch(() => undefined);
}

export const getLog = (): readonly LogEvent[] => events;

export function clearLog(): void {
  events = [];
  writeChain = writeChain.then(() => saveLog([])).catch(() => undefined);
}

if (typeof window !== 'undefined') {
  window.addEventListener('error', (e) => logEvent({ type: 'error', detail: String(e.message) }));
  window.addEventListener('unhandledrejection', (e) => logEvent({ type: 'error', detail: String(e.reason) }));
}
