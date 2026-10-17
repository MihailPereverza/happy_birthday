import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Mask } from '../../core/types';
import { attachStream, openCamera, stopStream, type Facing } from '../../camera/camera';
import { loadTracker, type FaceResult, type FaceTracker } from '../../camera/trackerLoader';
import { isEffectMask, isFaceMask, isFrameMask, PoseSmoother } from '../../camera/maskRenderer';
import { captureJpeg, drawScene, effectEnv, facePlacements, loadImage, type Scene } from '../../camera/capture';
import { EFFECTS } from '../../camera/effects/catalog';
import { FaceSmoother } from '../../camera/effects/face';
import type { EffectId } from '../../camera/effects/ids';
import type { Effect } from '../../camera/effects/types';
import { Warper } from '../../camera/effects/warp';
import { Button, useObjectUrl, useWakeLock } from './common';
import { t } from '../strings.ru';

type CameraStatus = 'starting' | 'ready' | 'denied' | 'error';
type TrackerStatus = 'loading' | 'ready' | 'failed' | 'slow';

const MIN_TRACKING_FPS = 15;
const SLOW_SECONDS_BEFORE_FALLBACK = 4;

export interface CameraViewProps {
  masks: Mask[];
  defaultMaskId?: string;
  facing?: Facing;
  asset: (path: string | undefined) => string | undefined;
  onSave: (photo: Blob, maskId: string | undefined) => Promise<void>;
  footer?: ComponentChildren;
}

function useMaskImages(masks: Mask[], asset: CameraViewProps['asset']) {
  const [images, setImages] = useState<Map<string, HTMLImageElement>>(new Map());
  useEffect(() => {
    let cancelled = false;
    Promise.all(
      masks
        .filter((m) => !isEffectMask(m) && m.src)
        .map((m) =>
          loadImage(asset(m.src)!)
            .then((img) => [m.id, img] as const)
            .catch(() => null),
        ),
    ).then((pairs) => !cancelled && setImages(new Map(pairs.filter((p) => p !== null))));
    return () => {
      cancelled = true;
    };
  }, [masks]);
  return images;
}

/** Counts rendered frames and reports when tracking stays below the fps floor for several seconds. */
class FpsGuard {
  private frames = 0;
  private windowStart = performance.now();
  private slowSeconds = 0;

  tick(tracking: boolean): boolean {
    this.frames += 1;
    const now = performance.now();
    if (now - this.windowStart < 1000) return false;
    const fps = (this.frames * 1000) / (now - this.windowStart);
    this.frames = 0;
    this.windowStart = now;
    this.slowSeconds = tracking && fps < MIN_TRACKING_FPS ? this.slowSeconds + 1 : 0;
    return this.slowSeconds >= SLOW_SECONDS_BEFORE_FALLBACK;
  }
}

/** Dev-only: `window.__hqBlend = { jawOpen: 1 }` fakes an expression so effects can be checked on a still photo. */
function withDevExpression(faces: FaceResult[]): FaceResult[] {
  const forced = (window as unknown as { __hqBlend?: Record<string, number> }).__hqBlend;
  return forced ? faces.map((f) => ({ ...f, blend: { ...f.blend, ...forced } })) : faces;
}

const needsFaces = (mask: Mask): boolean =>
  isFaceMask(mask) || (isEffectMask(mask) && (EFFECTS[mask.effect as EffectId]?.needsFaces ?? true));

function MaskThumb({ mask, asset }: { mask: Mask; asset: CameraViewProps['asset'] }) {
  if (mask.src) return <img src={asset(mask.src)} alt="" />;
  return <span class="mask-icon">{isEffectMask(mask) ? mask.icon ?? '✨' : '🎭'}</span>;
}

export function CameraView(props: CameraViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [facing, setFacing] = useState<Facing>(props.facing ?? 'user');
  const [status, setStatus] = useState<CameraStatus>('starting');
  const [trackerStatus, setTrackerStatus] = useState<TrackerStatus>('loading');
  const [tracker, setTracker] = useState<FaceTracker | null>(null);
  const [maskId, setMaskId] = useState<string | undefined>(props.defaultMaskId);
  const [shot, setShot] = useState<Blob | null>(null);
  const [saving, setSaving] = useState(false);
  const images = useMaskImages(props.masks, props.asset);
  const shotUrl = useObjectUrl(shot ?? undefined);
  const facesRef = useRef<FaceResult[]>([]);
  const warperRef = useRef<Warper | null | undefined>(undefined);
  const sceneRef = useRef<Scene | null>(null);
  useWakeLock(true);
  useEffect(() => {
    document.body.classList.add('camera-open');
    return () => document.body.classList.remove('camera-open');
  }, []);

  const frameMode = trackerStatus === 'failed' || trackerStatus === 'slow';
  const selected = props.masks.find((m) => m.id === maskId);
  const usable = selected && (!frameMode || !needsFaces(selected)) ? selected : undefined;
  const layer = useMemo(() => {
    const image = usable && !isEffectMask(usable) ? images.get(usable.id) : undefined;
    return usable && image ? { mask: usable, image } : null;
  }, [usable, images]);
  const effect = useMemo<{ instance: Effect; startedAt: number } | null>(() => {
    if (!usable || !isEffectMask(usable)) return null;
    const spec = EFFECTS[usable.effect as EffectId];
    return spec ? { instance: spec.create(usable.params ?? {}), startedAt: performance.now() } : null;
  }, [usable]);

  useEffect(() => {
    let cancelled = false;
    loadTracker()
      .then((tr) => {
        if (cancelled) return;
        setTracker(tr);
        setTrackerStatus((s) => (s === 'loading' ? 'ready' : s));
      })
      .catch(() => !cancelled && setTrackerStatus('failed'));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // Falling back to frames: switch a face mask/effect to the first frame so the shot still has decoration.
    if (frameMode && selected && needsFaces(selected)) setMaskId(props.masks.find(isFrameMask)?.id);
  }, [frameMode]);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    setStatus('starting');
    openCamera(facing)
      .then(async (s) => {
        stream = s;
        if (cancelled) return stopStream(s);
        await attachStream(videoRef.current!, s);
        if (!cancelled) setStatus('ready');
      })
      .catch((e: DOMException) => !cancelled && setStatus(e?.name === 'NotAllowedError' ? 'denied' : 'error'));
    return () => {
      cancelled = true;
      stopStream(stream);
    };
  }, [facing]);

  useEffect(() => {
    if (status !== 'ready' || shot) return;
    const video = videoRef.current!;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const poseSmoother = new PoseSmoother();
    const faceSmoother = new FaceSmoother();
    const fps = new FpsGuard();
    const tracking = !!tracker && !!usable && (isFaceMask(usable) || isEffectMask(usable));
    if (effect?.instance.warp && warperRef.current === undefined) warperRef.current = Warper.create();
    let lastVideoTime = -1;
    let lastFrame = performance.now();
    let raf = 0;
    const render = () => {
      if (video.readyState >= 2 && video.videoWidth) {
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }
        if (tracking && video.currentTime !== lastVideoTime) {
          lastVideoTime = video.currentTime;
          facesRef.current = faceSmoother.smooth(tracker!.detect(video));
          if (import.meta.env.DEV) facesRef.current = withDevExpression(facesRef.current);
        }
        const now = performance.now();
        const dt = Math.min(0.1, (now - lastFrame) / 1000);
        lastFrame = now;
        const scene: Scene = {
          video,
          mirrored: facing === 'user',
          faces: tracking ? facesRef.current : [],
          layer,
          effect: effect?.instance ?? null,
          t: effect ? (now - effect.startedAt) / 1000 : 0,
          warper: warperRef.current ?? null,
        };
        sceneRef.current = scene;
        const env = effectEnv(scene, ctx);
        effect?.instance.update?.(env, dt);
        drawScene(ctx, scene, env, poseSmoother.smooth(facePlacements(scene)));
        if (fps.tick(tracking)) setTrackerStatus('slow');
      }
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, [status, shot, layer, effect, tracker, facing]);

  const takeShot = async () => {
    if (!sceneRef.current) return;
    navigator.vibrate?.(30);
    setShot(await captureJpeg(sceneRef.current));
  };

  const save = async () => {
    if (!shot) return;
    setSaving(true);
    await props.onSave(shot, usable?.id);
    setSaving(false);
    setShot(null);
  };

  const trackerNote =
    trackerStatus === 'loading' ? t.camera.trackingLoading
    : trackerStatus === 'failed' ? t.camera.frameMode
    : trackerStatus === 'slow' ? t.camera.slowFrameMode
    : null;
  const hint = usable && isEffectMask(usable) ? usable.hint : undefined;

  return (
    <div class="camera">
      <div class="camera-stage">
        <video ref={videoRef} class="camera-video" muted playsInline />
        <canvas ref={canvasRef} class="camera-canvas" hidden={!!shot} />
        {shot && shotUrl && <img class="camera-shot" src={shotUrl} alt="" />}
        {status === 'starting' && <p class="camera-msg">{t.camera.starting}</p>}
        {status === 'denied' && <p class="camera-msg error">{t.camera.denied}</p>}
        {status === 'error' && <p class="camera-msg error">{t.camera.error}</p>}
        {hint && !shot && <p class="camera-hint">{hint}</p>}
        {trackerNote && !shot && <p class="camera-note">{trackerNote}</p>}
      </div>
      {!shot && (
        <>
          <div class="mask-strip">
            <button type="button" class={`mask-item ${!maskId ? 'active' : ''}`} onClick={() => setMaskId(undefined)}>
              <span class="mask-icon">∅</span>
              <small>{t.camera.noMask}</small>
            </button>
            {props.masks.map((m) => (
              <button
                key={m.id}
                type="button"
                disabled={frameMode && needsFaces(m)}
                class={`mask-item ${m.id === maskId ? 'active' : ''} ${isEffectMask(m) ? 'effect' : ''}`}
                onClick={() => setMaskId(m.id)}
              >
                <MaskThumb mask={m} asset={props.asset} />
                <small>{m.title ?? m.id}</small>
              </button>
            ))}
          </div>
          <div class="camera-controls">
            <Button kind="secondary" onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))}>
              🔄
            </Button>
            <button type="button" class="shutter" aria-label={t.camera.shoot} disabled={status !== 'ready'} onClick={takeShot} />
            <span class="camera-spacer" />
          </div>
        </>
      )}
      {shot && (
        <div class="row">
          <Button kind="secondary" onClick={() => setShot(null)} disabled={saving}>
            {t.camera.retake}
          </Button>
          <Button onClick={save} disabled={saving}>
            {t.camera.save}
          </Button>
        </div>
      )}
      {props.footer}
    </div>
  );
}
