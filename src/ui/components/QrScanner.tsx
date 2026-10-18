import { useEffect, useRef, useState } from 'preact/hooks';
import { attachStream, openCamera, stopStream } from '../../camera/camera';
import { t } from '../strings.ru';
import { useWakeLock } from './common';

interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}
declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats: string[] }) => BarcodeDetectorLike;
  }
}

const SCAN_INTERVAL_MS = 250;
const SAME_VALUE_COOLDOWN_MS = 3000;

export const qrScanSupported = (): boolean => typeof window.BarcodeDetector === 'function';

/** Rear camera + BarcodeDetector; the same value is reported again only after a cooldown. */
export function QrScanner({ onValue }: { onValue: (value: string) => Promise<void> }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  useWakeLock(true);
  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: number | undefined;
    let cancelled = false;
    let last = { value: '', at: 0 };
    const detector = new window.BarcodeDetector!({ formats: ['qr_code'] });
    const scan = async () => {
      const el = video.current;
      if (cancelled || !el) return;
      const codes = await detector.detect(el).catch(() => []);
      const value = codes[0]?.rawValue;
      if (value && (value !== last.value || Date.now() - last.at > SAME_VALUE_COOLDOWN_MS)) {
        last = { value, at: Date.now() };
        await onValue(value);
      }
      if (!cancelled) timer = window.setTimeout(scan, SCAN_INTERVAL_MS);
    };
    openCamera('environment')
      .then(async (s) => {
        stream = s;
        if (cancelled) return stopStream(s);
        await attachStream(video.current!, s);
        scan();
      })
      .catch(() => setError(t.camera.denied));
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      stopStream(stream);
    };
  }, []);
  return (
    <div class="qr-scanner">
      {error ? <p class="error">{error}</p> : <video ref={video} class="qr-video" muted playsInline />}
      <div class="qr-frame" aria-hidden />
    </div>
  );
}
