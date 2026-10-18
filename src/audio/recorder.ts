export type MicError = 'denied' | 'noMic' | 'unsupported';

export interface Recording {
  startedAt: number;
  stop(): Promise<{ blob: Blob; durationSec: number }>;
  cancel(): void;
}

const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];

export const canRecord = (): boolean => typeof MediaRecorder === 'function' && Boolean(navigator.mediaDevices?.getUserMedia);

function micError(e: unknown): MicError {
  const name = (e as { name?: string })?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'noMic';
  return 'unsupported';
}

/** Starts recording from the microphone; rejects with a MicError. */
export async function startRecording(): Promise<Recording> {
  if (!canRecord()) throw 'unsupported' satisfies MicError;
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false } });
  } catch (e) {
    throw micError(e);
  }
  const mimeType = MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported?.(type));
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const release = () => stream.getTracks().forEach((t) => t.stop());
  const startedAt = Date.now();
  recorder.start(250);
  return {
    startedAt,
    // Chrome's webm recordings carry no duration header, so the wall-clock length is what we measure against.
    stop: () =>
      new Promise((resolve) => {
        recorder.onstop = () => {
          release();
          resolve({ blob: new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' }), durationSec: (Date.now() - startedAt) / 1000 });
        };
        recorder.stop();
      }),
    cancel: () => {
      if (recorder.state !== 'inactive') recorder.stop();
      release();
    },
  };
}

function metadataDuration(blob: Blob): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio();
    const done = (value: number | null) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => done(Number.isFinite(audio.duration) ? audio.duration : null);
    audio.onerror = () => done(null);
    audio.src = url;
  });
}

/** Length of an uploaded file: decoding is exact for any format Chrome plays, metadata is the fallback. */
export async function measureDuration(blob: Blob): Promise<number | null> {
  try {
    const ctx = new AudioContext();
    try {
      return (await ctx.decodeAudioData(await blob.arrayBuffer())).duration;
    } finally {
      ctx.close().catch(() => undefined);
    }
  } catch {
    return metadataDuration(blob);
  }
}
