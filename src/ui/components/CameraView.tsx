import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Mask } from '../../core/types';
import { attachStream, openCamera, stopStream, type Facing } from '../../camera/camera';
import { loadTracker, type FaceTracker, type Landmarks } from '../../camera/trackerLoader';
import { isFrameMask, PoseSmoother } from '../../camera/maskRenderer';
import { captureJpeg, drawScene, facePlacements, loadImage, type Scene } from '../../camera/capture';
import { Button, useObjectUrl, useWakeLock } from './common';
import { t } from '../strings.ru';

type CameraStatus = 'starting' | 'ready' | 'denied' | 'error';
type TrackerStatus = 'loading' | 'ready' | 'failed' | 'slow';

const MIN_TRACKING_FPS = 15;
const SLOW_SECONDS_BEFORE_FALLBACK = 3;

export interface CameraViewProps {
  masks: Mask[];
  defaultMaskId?: string;
  facing?: Facing;
  asset: (path: string | undefined) => string | undefined;
  onSave: (photo: Blob, maskId: string | undefined) => Promise<void>;
  footer?: preact.ComponentChildren;
}

function useMaskImages(masks: Mask[], asset: CameraViewProps['asset']) {
  const [images, setImages] = useState<Map<string, HTMLImageElement>>(new Map());
  useEffect(() => {
    let cancelled = false;
    Promise.all(
      masks.map((m) =>
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
  fps = 0;

  tick(tracking: boolean): boolean {
    this.frames += 1;
    const now = performance.now();
    if (now - this.windowStart < 1000) return false;
    this.fps = (this.frames * 1000) / (now - this.windowStart);
    this.frames = 0;
    this.windowStart = now;
    this.slowSeconds = tracking && this.fps < MIN_TRACKING_FPS ? this.slowSeconds + 1 : 0;
    return this.slowSeconds >= SLOW_SECONDS_BEFORE_FALLBACK;
  }
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
  const facesRef = useRef<Landmarks[]>([]);
  useWakeLock(true);
  useEffect(() => {
    document.body.classList.add('camera-open');
    return () => document.body.classList.remove('camera-open');
  }, []);

  const frameMode = trackerStatus === 'failed' || trackerStatus === 'slow';
  const selected = props.masks.find((m) => m.id === maskId);
  const selectedUsable = selected && (isFrameMask(selected) || !frameMode) ? selected : undefined;
  const layer = useMemo(() => {
    const image = selectedUsable && images.get(selectedUsable.id);
    return selectedUsable && image ? { mask: selectedUsable, image } : null;
  }, [selectedUsable, images]);
  const sceneRef = useRef<Scene | null>(null);

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
    // Falling back to frames: switch a selected face mask to the first frame so the shot still has decoration.
    if (frameMode && selected && !isFrameMask(selected)) setMaskId(props.masks.find(isFrameMask)?.id);
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
    const smoother = new PoseSmoother();
    const fps = new FpsGuard();
    const needsTracking = !!layer && !isFrameMask(layer.mask) && !!tracker;
    let lastVideoTime = -1;
    let raf = 0;
    const render = () => {
      if (video.readyState >= 2 && video.videoWidth) {
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }
        if (needsTracking && video.currentTime !== lastVideoTime) {
          lastVideoTime = video.currentTime;
          facesRef.current = tracker!.detect(video);
        }
        const scene: Scene = { video, mirrored: facing === 'user', faces: needsTracking ? facesRef.current : [], layer };
        sceneRef.current = scene;
        drawScene(ctx, scene, smoother.smooth(facePlacements(scene, canvas.width, canvas.height)));
        if (fps.tick(needsTracking)) setTrackerStatus('slow');
      }
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, [status, shot, layer, tracker, facing]);

  const takeShot = async () => {
    if (!sceneRef.current) return;
    navigator.vibrate?.(30);
    setShot(await captureJpeg(sceneRef.current));
  };

  const save = async () => {
    if (!shot) return;
    setSaving(true);
    await props.onSave(shot, selectedUsable?.id);
    setSaving(false);
    setShot(null);
  };

  const trackerNote =
    trackerStatus === 'loading' ? t.camera.trackingLoading
    : trackerStatus === 'failed' ? t.camera.frameMode
    : trackerStatus === 'slow' ? t.camera.slowFrameMode
    : null;

  return (
    <div class="camera">
      <div class="camera-stage">
        <video ref={videoRef} class="camera-video" muted playsInline />
        <canvas ref={canvasRef} class="camera-canvas" hidden={!!shot} />
        {shot && shotUrl && <img class="camera-shot" src={shotUrl} alt="" />}
        {status === 'starting' && <p class="camera-msg">{t.camera.starting}</p>}
        {status === 'denied' && <p class="camera-msg error">{t.camera.denied}</p>}
        {status === 'error' && <p class="camera-msg error">{t.camera.error}</p>}
        {trackerNote && !shot && <p class="camera-note">{trackerNote}</p>}
      </div>
      {!shot && (
        <>
          <div class="mask-strip">
            <button type="button" class={`mask-item ${!maskId ? 'active' : ''}`} onClick={() => setMaskId(undefined)}>
              <span class="mask-none">∅</span>
              <small>{t.camera.noMask}</small>
            </button>
            {props.masks.map((m) => {
              const disabled = !isFrameMask(m) && frameMode;
              return (
                <button
                  key={m.id}
                  type="button"
                  disabled={disabled}
                  class={`mask-item ${m.id === maskId ? 'active' : ''}`}
                  onClick={() => setMaskId(m.id)}
                >
                  <img src={props.asset(m.src)} alt="" />
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
