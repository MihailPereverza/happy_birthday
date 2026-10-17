import { createPortal } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Mask } from '../../core/types';
import {
  attachStream,
  formatZoom,
  lensesFor,
  openCamera,
  setZoom,
  stopStream,
  zoomRange,
  zoomStops,
  type Facing,
  type Lens,
  type ZoomRange,
} from '../../camera/camera';
import { loadTracker, type FaceResult, type FaceTracker } from '../../camera/trackerLoader';
import { isEffectMask, isFaceMask, isFrameMask } from '../../camera/maskRenderer';
import {
  captureJpeg,
  coverCrop,
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
import { DetectionCrop, FaceSmoother } from '../../camera/effects/face';
import type { EffectId } from '../../camera/effects/ids';
import { Warper } from '../../camera/effects/warp';
import { useObjectUrl, useWakeLock } from './common';
import { t } from '../strings.ru';

type CameraStatus = 'starting' | 'ready' | 'denied' | 'error';
/** `full` shows the whole sensor frame (nothing cropped), `fill` covers the screen and crops like stories. */
type ViewMode = 'full' | 'fill';

const VIEW_MODE_KEY = 'hq-camera-view';
const readViewMode = (): ViewMode => {
  try {
    return localStorage.getItem(VIEW_MODE_KEY) === 'fill' ? 'fill' : 'full';
  } catch {
    return 'full';
  }
};

/** Height of an element, kept up to date (the bottom panel grows when the two-people switch appears). */
function useHeight(ref: { current: HTMLElement | null }): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setHeight(el.getBoundingClientRect().height));
    observer.observe(el);
    return () => observer.disconnect();
  });
  return height;
}
type TrackerStatus = 'loading' | 'ready' | 'failed' | 'slow';

const MIN_TRACKING_FPS = 15;
const SLOW_SECONDS_BEFORE_FALLBACK = 4;

export interface CameraViewProps {
  masks: Mask[];
  defaultMaskId?: string;
  facing?: Facing;
  asset: (path: string | undefined) => string | undefined;
  onSave: (photo: Blob, maskId: string | undefined) => Promise<void>;
  onClose: () => void;
  /** Small caption in the top bar, e.g. the point name. */
  title?: string;
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
  const [deviceId, setDeviceId] = useState<string | undefined>(undefined);
  const [lenses, setLenses] = useState<Lens[]>([]);
  const [zoomCaps, setZoomCaps] = useState<ZoomRange | null>(null);
  const [zoom, setZoomValue] = useState(1);
  const [viewMode, setViewMode] = useState<ViewMode>(readViewMode);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const topRef = useRef<HTMLDivElement>(null);
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
  const bottomRef = useRef<HTMLDivElement>(null);
  const topHeight = useHeight(topRef);
  const bottomHeight = useHeight(bottomRef);
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
    openCamera(facing, deviceId)
      .then(async (s) => {
        stream = s;
        if (cancelled) return stopStream(s);
        await attachStream(videoRef.current!, s);
        if (cancelled) return;
        const track = s.getVideoTracks()[0];
        trackRef.current = track;
        const caps = zoomRange(track);
        setZoomCaps(caps);
        setZoomValue((track.getSettings() as MediaTrackSettings & { zoom?: number }).zoom ?? 1);
        // Labels are only readable once camera permission is granted, i.e. now.
        lensesFor(facing).then((found) => !cancelled && setLenses(found)).catch(() => setLenses([]));
        setStatus('ready');
      })
      .catch((e: DOMException) => !cancelled && setStatus(e?.name === 'NotAllowedError' ? 'denied' : 'error'));
    return () => {
      cancelled = true;
      stopStream(stream);
    };
  }, [facing, deviceId]);

  useEffect(() => {
    if (status !== 'ready' || shot) return;
    const video = videoRef.current!;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const faceSmoother = new FaceSmoother();
    const detectionCrop = new DetectionCrop();
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
          const detected = detectionCrop.toFrame(tracker!.detect(detectionCrop.source(video)), video.videoHeight);
          facesRef.current = faceSmoother.smooth(orderFaces(detected, mirrored));
          if (import.meta.env.DEV) facesRef.current = withDevExpression(facesRef.current);
          if (facesRef.current.length !== lastCount) {
            lastCount = facesRef.current.length;
            setFaceCount(lastCount);
          }
        }
        const now = performance.now();
        const dt = Math.min(0.1, (now - lastFrame) / 1000);
        lastFrame = now;
        const box = canvas.getBoundingClientRect();
        const W = video.videoWidth;
        const H = video.videoHeight;
        let view = { x: 0, y: 0, w: W, h: H };
        let floorY = H * 0.98;
        if (viewMode === 'fill') {
          view = coverCrop(W, H, box.width / box.height);
          const panelTop = bottomRef.current?.getBoundingClientRect().top ?? box.bottom;
          floorY = view.y + view.h * Math.min(0.98, Math.max(0.4, (panelTop - box.top) / box.height));
        }
        const scene: Scene = { video, mirrored, faces: tracking ? facesRef.current : [], layers, now, warper: warperRef.current ?? null, view, floorY };
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
  }, [status, shot, layers, tracker, facing, viewMode]);

  const chooseZoom = async (z: number) => {
    if (!trackRef.current) return;
    setZoomValue(z);
    await setZoom(trackRef.current, z).catch(() => undefined);
  };
  const toggleViewMode = () => {
    const next: ViewMode = viewMode === 'full' ? 'fill' : 'full';
    setViewMode(next);
    try {
      localStorage.setItem(VIEW_MODE_KEY, next);
    } catch {
      // Private mode: the choice just isn't remembered.
    }
  };
  const flip = () => {
    setDeviceId(undefined);
    setLenses([]);
    setFacing((f) => (f === 'user' ? 'environment' : 'user'));
  };
  // A canvas has its own aspect ratio, so top/bottom alone don't size it; the height is spelled out.
  const stageStyle =
    viewMode === 'full' ? { top: `${topHeight}px`, height: `calc(100% - ${topHeight + bottomHeight}px)` } : undefined;
  const stops = zoomCaps ? zoomStops(zoomCaps) : [];
  const showLenses = !zoomCaps && lenses.length > 1;

  const takeShot = async () => {
    const scene = sceneRef.current;
    if (!scene) return;
    navigator.vibrate?.(30);
    // The preview is object-fit: cover; the saved photo is exactly the visible part.
    setShot(await captureJpeg(scene, scene.view));
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

  return createPortal(
    <div class="cam" role="dialog" aria-label={t.camera.shoot}>
      <video ref={videoRef} class="cam-video" muted playsInline />
      <canvas ref={canvasRef} class={`cam-canvas ${viewMode}`} style={stageStyle} hidden={!!shot} />
      {shot && shotUrl && <img class={`cam-canvas ${viewMode}`} style={stageStyle} src={shotUrl} alt="" />}
      {status === 'starting' && <p class="cam-msg">{t.camera.starting}</p>}
      {status === 'denied' && <p class="cam-msg">{t.camera.denied}</p>}
      {status === 'error' && <p class="cam-msg">{t.camera.error}</p>}

      <div class={`cam-top ${viewMode}`} ref={topRef}>
        <button type="button" class="cam-round" aria-label={t.close} onClick={props.onClose} disabled={saving}>
          ✕
        </button>
        <div class="cam-top-center">
          {props.title && <p class="cam-title">{props.title}</p>}
          {hint && !shot && <p class="cam-hint">{hint}</p>}
          {trackerNote && !shot && <p class="cam-note">{trackerNote}</p>}
        </div>
      </div>

      {!shot && (
        <div class={`cam-bottom ${viewMode}`} ref={bottomRef}>
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
              <small>{picks.length > 1 ? t.camera.layers(picks.length) : picks.length ? t.camera.clearAll : t.camera.noMask}</small>
            </button>
            {props.masks.map((m) => {
              const on = picks.filter((p) => p.maskId === m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  disabled={frameMode && needsFaces(m)}
                  aria-pressed={on.length > 0}
                  class={`mask-item ${on.length ? 'active' : ''}`}
                  onClick={() => setPicks((current) => togglePick(current, m, target, props.masks))}
                >
                  {on.length > 0 && <span class="mask-badge">{on.map((p) => TARGET_BADGE[p.target]).join('')}</span>}
                  <MaskThumb mask={m} asset={props.asset} />
                  <small>{m.title ?? m.id}</small>
                </button>
              );
            })}
          </div>
          {(stops.length > 1 || showLenses) && (
            <div class="lens-row" role="radiogroup" aria-label={t.camera.lens}>
              {stops.map((z) => (
                <button
                  key={z}
                  type="button"
                  role="radio"
                  aria-checked={Math.abs(zoom - z) < 0.05}
                  class={`lens-btn ${Math.abs(zoom - z) < 0.05 ? 'active' : ''}`}
                  onClick={() => chooseZoom(z)}
                >
                  {formatZoom(z)}
                </button>
              ))}
              {showLenses &&
                lenses.map((lens, i) => {
                  const active = deviceId ? deviceId === lens.deviceId : i === 0;
                  return (
                    <button
                      key={lens.deviceId}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      class={`lens-btn ${active ? 'active' : ''}`}
                      onClick={() => setDeviceId(lens.deviceId)}
                    >
                      📷{lens.label}
                    </button>
                  );
                })}
            </div>
          )}
          <div class="cam-controls">
            <button type="button" class="cam-round cam-mode" aria-label={viewMode === 'full' ? t.camera.fillScreen : t.camera.wholeFrame} onClick={toggleViewMode}>
              {viewMode === 'full' ? '⛶' : '▣'}
              <small>{viewMode === 'full' ? t.camera.fillScreenShort : t.camera.wholeFrameShort}</small>
            </button>
            <button type="button" class="shutter" aria-label={t.camera.shoot} disabled={status !== 'ready'} onClick={takeShot} />
            <button type="button" class="cam-round" aria-label={t.camera.switch} onClick={flip}>
              🔄
            </button>
          </div>
        </div>
      )}
      {shot && (
        <div class={`cam-bottom cam-review ${viewMode}`} ref={bottomRef}>
          <button type="button" class="btn secondary" onClick={() => setShot(null)} disabled={saving}>
            {t.camera.retake}
          </button>
          <button type="button" class="btn primary" onClick={save} disabled={saving}>
            {t.camera.save}
          </button>
        </div>
      )}
    </div>,
    document.body,
  );
}
