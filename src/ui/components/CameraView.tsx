import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Mask } from '../../core/types';
import { attachStream, openCamera, stopStream, type Facing } from '../../camera/camera';
import { loadTracker, type FaceResult, type FaceTracker } from '../../camera/trackerLoader';
import { isEffectMask, isFaceMask, isFrameMask } from '../../camera/maskRenderer';
import {
  captureJpeg,
  drawScene,
  frameEnv,
  layersNeedTracking,
  loadImage,
  orderFaces,
  updateEffects,
  type Layer,
  type Scene,
  type Target,
} from '../../camera/capture';
import { picksFromId, picksToId, togglePick, type Pick } from '../../camera/selection';
import { EFFECTS } from '../../camera/effects/catalog';
import { FaceSmoother } from '../../camera/effects/face';
import type { EffectId } from '../../camera/effects/ids';
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

const TARGETS: { id: Target; icon: string; label: string }[] = [
  { id: 'all', icon: '👯', label: t.camera.forAll },
  { id: 'left', icon: '👈', label: t.camera.forLeft },
  { id: 'right', icon: '👉', label: t.camera.forRight },
];
const TARGET_BADGE: Record<Target, string> = { all: '✓', left: '👈', right: '👉' };

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
  const [picks, setPicks] = useState<Pick[]>(() => picksFromId(props.defaultMaskId, props.masks));
  const [target, setTarget] = useState<Target>('all');
  const [faceCount, setFaceCount] = useState(0);
  const [shot, setShot] = useState<Blob | null>(null);
  const [saving, setSaving] = useState(false);
  const images = useMaskImages(props.masks, props.asset);
  const shotUrl = useObjectUrl(shot ?? undefined);
  const facesRef = useRef<FaceResult[]>([]);
  const warperRef = useRef<Warper | null | undefined>(undefined);
  const sceneRef = useRef<Scene | null>(null);
  // Effect instances keep their particles while other masks are toggled around them.
  const effectsRef = useRef(new Map<string, { effect: Layer['effect']; startedAt: number }>());
  useWakeLock(true);
  useEffect(() => {
    document.body.classList.add('camera-open');
    return () => document.body.classList.remove('camera-open');
  }, []);

  const frameMode = trackerStatus === 'failed' || trackerStatus === 'slow';
  const activePicks = picks.filter((p) => {
    const mask = props.masks.find((m) => m.id === p.maskId);
    return mask && (!frameMode || !needsFaces(mask));
  });

  const layers = useMemo<Layer[]>(() => {
    const live = new Set<string>();
    const result = activePicks.flatMap((pick): Layer[] => {
      const mask = props.masks.find((m) => m.id === pick.maskId)!;
      const key = `${pick.maskId}@${pick.target}`;
      if (!isEffectMask(mask)) {
        const image = images.get(mask.id);
        return image ? [{ key, mask, target: pick.target, image }] : [];
      }
      const spec = EFFECTS[mask.effect as EffectId];
      if (!spec) return [];
      live.add(key);
      let entry = effectsRef.current.get(key);
      if (!entry) {
        entry = { effect: spec.create(mask.params ?? {}), startedAt: performance.now() };
        effectsRef.current.set(key, entry);
      }
      return [{ key, mask, target: pick.target, effect: entry.effect, startedAt: entry.startedAt }];
    });
    for (const key of [...effectsRef.current.keys()]) if (!live.has(key)) effectsRef.current.delete(key);
    return result;
  }, [picksToId(activePicks), images]);

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
    // Falling back to frames: if nothing usable is left, put on the first frame so the shot still has decoration.
    const firstFrame = props.masks.find(isFrameMask);
    if (frameMode && picks.length && !activePicks.length && firstFrame) setPicks([{ maskId: firstFrame.id, target: 'all' }]);
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
    const faceSmoother = new FaceSmoother();
    const fps = new FpsGuard();
    const mirrored = facing === 'user';
    // Tracking also runs with no mask on, so the "left / right" switch knows when two people are in frame.
    const tracking = !!tracker;
    if (layers.some((l) => l.effect?.warp) && warperRef.current === undefined) warperRef.current = Warper.create();
    let lastVideoTime = -1;
    let lastFrame = performance.now();
    let lastCount = -1;
    let raf = 0;
    const render = () => {
      if (video.readyState >= 2 && video.videoWidth) {
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }
        if (tracking && video.currentTime !== lastVideoTime) {
          lastVideoTime = video.currentTime;
          facesRef.current = faceSmoother.smooth(orderFaces(tracker!.detect(video), mirrored));
          if (import.meta.env.DEV) facesRef.current = withDevExpression(facesRef.current);
          if (facesRef.current.length !== lastCount) {
            lastCount = facesRef.current.length;
            setFaceCount(lastCount);
          }
        }
        const now = performance.now();
        const dt = Math.min(0.1, (now - lastFrame) / 1000);
        lastFrame = now;
        const scene: Scene = { video, mirrored, faces: tracking ? facesRef.current : [], layers, now, warper: warperRef.current ?? null };
        sceneRef.current = scene;
        const frame = frameEnv(scene, ctx);
        updateEffects(scene, frame, dt);
        drawScene(ctx, scene, frame);
        if (fps.tick(tracking && layersNeedTracking(layers))) setTrackerStatus('slow');
      }
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, [status, shot, layers, tracker, facing]);

  const takeShot = async () => {
    if (!sceneRef.current) return;
    navigator.vibrate?.(30);
    setShot(await captureJpeg(sceneRef.current));
  };

  const save = async () => {
    if (!shot) return;
    setSaving(true);
    await props.onSave(shot, picksToId(activePicks));
    setSaving(false);
    setShot(null);
  };

  const trackerNote =
    trackerStatus === 'loading' ? t.camera.trackingLoading
    : trackerStatus === 'failed' ? t.camera.frameMode
    : trackerStatus === 'slow' ? t.camera.slowFrameMode
    : null;
  const lastEffect = [...activePicks]
    .reverse()
    .map((p) => props.masks.find((m) => m.id === p.maskId))
    .find((m) => m && isEffectMask(m) && m.hint);
  const hint = lastEffect && isEffectMask(lastEffect) ? lastEffect.hint : undefined;
  const twoPeople = faceCount >= 2 || target !== 'all';

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
          {twoPeople && (
            <div class="target-switch" role="radiogroup" aria-label={t.camera.whoFor}>
              {TARGETS.map((tg) => (
                <button
                  key={tg.id}
                  type="button"
                  role="radio"
                  aria-checked={target === tg.id}
                  class={`target-btn ${target === tg.id ? 'active' : ''}`}
                  onClick={() => setTarget(tg.id)}
                >
                  {tg.icon} {tg.label}
                </button>
              ))}
            </div>
          )}
          <div class="mask-strip">
            <button type="button" class={`mask-item ${!picks.length ? 'active' : ''}`} onClick={() => setPicks([])}>
              <span class="mask-icon">∅</span>
              <small>{picks.length ? t.camera.clearAll : t.camera.noMask}</small>
            </button>
            {props.masks.map((m) => {
              const on = picks.filter((p) => p.maskId === m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  disabled={frameMode && needsFaces(m)}
                  aria-pressed={on.length > 0}
                  class={`mask-item ${on.length ? 'active' : ''} ${isEffectMask(m) ? 'effect' : ''}`}
                  onClick={() => setPicks((current) => togglePick(current, m, target, props.masks))}
                >
                  {on.length > 0 && <span class="mask-badge">{on.map((p) => TARGET_BADGE[p.target]).join('')}</span>}
                  <MaskThumb mask={m} asset={props.asset} />
                  <small>{m.title ?? m.id}</small>
                </button>
              );
            })}
          </div>
          <div class="camera-controls">
            <Button kind="secondary" onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))}>
              🔄
            </Button>
            <button type="button" class="shutter" aria-label={t.camera.shoot} disabled={status !== 'ready'} onClick={takeShot} />
            <span class="camera-spacer muted">{picks.length > 1 ? t.camera.layers(picks.length) : ''}</span>
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
