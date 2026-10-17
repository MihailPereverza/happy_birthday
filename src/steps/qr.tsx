import { useEffect, useRef, useState } from 'preact/hooks';
import type { QrStep } from '../core/types';
import { attachStream, openCamera, stopStream } from '../camera/camera';
import { AnswerForm, Button, Hints, StepShell, useWakeLock } from '../ui/components/common';
import { t } from '../ui/strings.ru';
import type { StepContext, StepDefinition } from './types';

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

function Scanner({ onValue }: { onValue: (value: string) => Promise<void> }) {
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

function Qr({ step, ctx }: { step: QrStep; ctx: StepContext }) {
  const supported = typeof window.BarcodeDetector === 'function';
  const [manual, setManual] = useState(!supported);
  const [wrong, setWrong] = useState(false);
  const onScanned = async (value: string) => {
    const result = await ctx.submitAnswer(value, step.answersHash);
    setWrong(result === 'wrong');
  };
  return (
    <StepShell step={step} asset={ctx.asset}>
      {!manual && (
        <>
          <p class="muted center">{t.qr.scan}</p>
          <Scanner onValue={onScanned} />
          {wrong && <p class="error center">{t.qr.wrong}</p>}
          <Button kind="ghost" onClick={() => setManual(true)}>
            {t.qr.manual}
          </Button>
        </>
      )}
      {manual && (
        <>
          {!supported && <p class="muted">{t.qr.unsupported}</p>}
          <AnswerForm placeholder={t.codePlaceholder} onSubmit={(v) => ctx.submitAnswer(v, step.answersHash)} />
        </>
      )}
      <Hints step={step} attempts={ctx.attempts} />
    </StepShell>
  );
}

export const qrStep: StepDefinition<QrStep> = { type: 'qr', render: (step, ctx) => <Qr step={step} ctx={ctx} /> };
