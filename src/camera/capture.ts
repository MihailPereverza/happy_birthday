import type { Mask } from '../core/types';
import { buildFace, type FaceData, type FaceResult } from './effects/face';
import type { Effect, EffectEnv } from './effects/types';
import type { Bulge, Warper } from './effects/warp';
import { drawCover, drawPlacement, isEffectMask, isFaceMask, isFrameMask, placeMask, poseFromLandmarks } from './maskRenderer';

export const CAPTURE_LONG_SIDE = 2048;
export const JPEG_QUALITY = 0.9;

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
}

export function frameEnv(scene: Scene, ctx: CanvasRenderingContext2D): FrameEnv {
  const W = scene.video.videoWidth;
  const H = scene.video.videoHeight;
  return { W, H, faces: scene.faces.map((f) => buildFace(f, W, H, scene.mirrored)), base: baseSnapshot(ctx) };
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

/** Final shot: JPEG with the long side scaled to 2048 px, all layers baked in. */
export function captureJpeg(scene: Scene): Promise<Blob> {
  const { videoWidth: vw, videoHeight: vh } = scene.video;
  const scale = CAPTURE_LONG_SIDE / Math.max(vw, vh);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(vw * scale);
  canvas.height = Math.round(vh * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  drawScene(ctx, scene, frameEnv(scene, ctx));
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/jpeg', JPEG_QUALITY),
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
