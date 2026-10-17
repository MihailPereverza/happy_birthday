import type { Mask } from '../core/types';
import { buildFace, type FaceData, type FaceResult } from './effects/face';
import type { Effect, EffectEnv } from './effects/types';
import type { Bulge, Warper } from './effects/warp';
import { drawCover, drawPlacement, isEffectMask, isFaceMask, isFrameMask, placeMask, poseFromLandmarks } from './maskRenderer';

export const CAPTURE_LONG_SIDE = 2048;
export const JPEG_QUALITY = 0.9;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Who a layer is for when two people are in frame; faces are ordered left → right as seen on screen. */
export type Target = 'all' | 'left' | 'right';

export interface Layer {
  key: string;
  mask: Mask;
  target: Target;
  /** PNG for face masks and frames. */
  image?: HTMLImageElement;
  effect?: Effect;
  startedAt?: number;
}

export interface Scene {
  video: HTMLVideoElement;
  mirrored: boolean;
  /** Ordered left → right on screen. */
  faces: FaceResult[];
  layers: Layer[];
  /** performance.now() of this frame; effects get their own clock from it. */
  now: number;
  warper: Warper | null;
  /** Visible crop of the frame and the top of the on-screen controls, in camera pixels. */
  view?: Rect;
  floorY?: number;
}

const aspectOf = (img: HTMLImageElement): number => (img.naturalHeight || 1) / (img.naturalWidth || 1);

/** Sorts tracker faces by on-screen x so "left"/"right" stay with the same person while nobody swaps places. */
export function orderFaces(faces: FaceResult[], mirrored: boolean): FaceResult[] {
  const x = (f: FaceResult) => (mirrored ? 1 - f.landmarks[1].x : f.landmarks[1].x);
  return [...faces].sort((a, b) => x(a) - x(b));
}

export function facesFor<T>(faces: T[], target: Target): T[] {
  if (target === 'all') return faces;
  const face = target === 'left' ? faces[0] : faces.length > 1 ? faces[1] : undefined;
  return face ? [face] : [];
}

function baseSnapshot(ctx: CanvasRenderingContext2D): () => HTMLCanvasElement {
  let snapshot: HTMLCanvasElement | null = null;
  return () => {
    if (!snapshot) {
      snapshot = document.createElement('canvas');
      snapshot.width = ctx.canvas.width;
      snapshot.height = ctx.canvas.height;
      snapshot.getContext('2d')!.drawImage(ctx.canvas, 0, 0);
    }
    return snapshot;
  };
}

export interface FrameEnv {
  W: number;
  H: number;
  faces: FaceData[];
  base: () => CanvasImageSource;
  view: Rect;
  floorY: number;
}

export function frameEnv(scene: Scene, ctx: CanvasRenderingContext2D): FrameEnv {
  const W = scene.video.videoWidth;
  const H = scene.video.videoHeight;
  const view = scene.view ?? { x: 0, y: 0, w: W, h: H };
  return {
    W,
    H,
    faces: scene.faces.map((f) => buildFace(f, W, H, scene.mirrored)),
    base: baseSnapshot(ctx),
    view,
    floorY: scene.floorY ?? view.y + view.h * 0.98,
  };
}

export function layerEnv(layer: Layer, frame: FrameEnv, now: number): EffectEnv {
  return { ...frame, faces: facesFor(frame.faces, layer.target), t: (now - (layer.startedAt ?? now)) / 1000 };
}

/** Advances every effect by dt (preview only; captures redraw the current state). */
export function updateEffects(scene: Scene, frame: FrameEnv, dt: number): void {
  for (const layer of scene.layers) layer.effect?.update?.(layerEnv(layer, frame, scene.now), dt);
}

/**
 * Draws the picture in camera-pixel units: (warped) frame → effects → PNG face masks → frame overlay,
 * each layer only on the faces it targets. The canvas may be larger (capture); a scale transform maps units.
 */
export function drawScene(ctx: CanvasRenderingContext2D, scene: Scene, frame: FrameEnv): void {
  const { video, layers } = scene;
  const { W, H } = frame;
  ctx.setTransform(ctx.canvas.width / W, 0, 0, ctx.canvas.width / W, 0, 0);
  const bulges: Bulge[] = layers.flatMap((l) => l.effect?.warp?.(layerEnv(l, frame, scene.now)) ?? []);
  if (bulges.length && scene.warper) {
    ctx.drawImage(scene.warper.render(video, W, H, scene.mirrored, bulges), 0, 0, W, H);
  } else {
    drawCover(ctx, video, W, H, { width: W, height: H }, scene.mirrored);
  }
  for (const layer of layers.filter((l) => l.effect)) {
    ctx.save();
    layer.effect!.draw(ctx, layerEnv(layer, frame, scene.now));
    ctx.restore();
  }
  for (const layer of layers.filter((l) => l.image && isFaceMask(l.mask))) {
    const faceMask = layer.mask;
    if (!isFaceMask(faceMask)) continue;
    for (const face of facesFor(scene.faces, layer.target)) {
      const pose = poseFromLandmarks(face.landmarks, W, H, scene.mirrored);
      drawPlacement(ctx, layer.image!, placeMask(pose, faceMask, aspectOf(layer.image!)));
    }
  }
  for (const layer of layers.filter((l) => l.image && isFrameMask(l.mask))) {
    drawCover(ctx, layer.image!, layer.image!.naturalWidth, layer.image!.naturalHeight, { width: W, height: H });
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

/** The part of a W×H frame that an object-fit: cover box of the given aspect shows. */
export function coverCrop(W: number, H: number, boxAspect: number): Rect {
  if (!Number.isFinite(boxAspect) || boxAspect <= 0) return { x: 0, y: 0, w: W, h: H };
  if (W / H > boxAspect) {
    const w = H * boxAspect;
    return { x: (W - w) / 2, y: 0, w, h: H };
  }
  const h = W / boxAspect;
  return { x: 0, y: (H - h) / 2, w: W, h };
}

// Never upscale the camera frame more than this when the visible crop is small.
const MAX_UPSCALE = 2;

/** Final shot of exactly what the screen shows (`crop`), long side up to 2048 px, all layers baked in. */
export function captureJpeg(scene: Scene, crop?: Rect): Promise<Blob> {
  const { videoWidth: W, videoHeight: H } = scene.video;
  const area = crop ?? { x: 0, y: 0, w: W, h: H };
  const k = Math.min(CAPTURE_LONG_SIDE / Math.max(area.w, area.h), MAX_UPSCALE);
  const full = document.createElement('canvas');
  full.width = Math.round(W * k);
  full.height = Math.round(H * k);
  const fullCtx = full.getContext('2d')!;
  fullCtx.imageSmoothingQuality = 'high';
  drawScene(fullCtx, scene, frameEnv(scene, fullCtx));
  const out = document.createElement('canvas');
  out.width = Math.round(area.w * k);
  out.height = Math.round(area.h * k);
  out.getContext('2d')!.drawImage(full, area.x * k, area.y * k, out.width, out.height, 0, 0, out.width, out.height);
  return new Promise((resolve, reject) =>
    out.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/jpeg', JPEG_QUALITY),
  );
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`image failed: ${src}`));
    img.src = src;
  });
}

export const layersNeedTracking = (layers: Layer[]): boolean =>
  layers.some((l) => isFaceMask(l.mask) || isEffectMask(l.mask));
