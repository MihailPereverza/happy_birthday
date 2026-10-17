import type { Mask } from '../core/types';
import { buildFace, type FaceResult } from './effects/face';
import type { Effect, EffectEnv } from './effects/types';
import type { Warper } from './effects/warp';
import { drawCover, drawPlacement, isFaceMask, isFrameMask, placeMask, poseFromLandmarks, type Placement } from './maskRenderer';

export const CAPTURE_LONG_SIDE = 2048;
export const JPEG_QUALITY = 0.9;

export interface MaskLayer {
  mask: Mask;
  image: HTMLImageElement;
}

export interface Scene {
  video: HTMLVideoElement;
  mirrored: boolean;
  faces: FaceResult[];
  /** PNG face mask or frame. */
  layer: MaskLayer | null;
  effect: Effect | null;
  /** Seconds since the effect was selected. */
  t: number;
  warper: Warper | null;
}

const aspectOf = (img: HTMLImageElement): number => (img.naturalHeight || 1) / (img.naturalWidth || 1);

/** PNG face-mask placements in camera pixels. */
export function facePlacements(scene: Scene): Placement[] {
  const { layer, video } = scene;
  if (!layer || !isFaceMask(layer.mask)) return [];
  const faceMask = layer.mask;
  return scene.faces.map((f) =>
    placeMask(poseFromLandmarks(f.landmarks, video.videoWidth, video.videoHeight, scene.mirrored), faceMask, aspectOf(layer.image)),
  );
}

export function effectEnv(scene: Scene, ctx: CanvasRenderingContext2D): EffectEnv {
  const W = scene.video.videoWidth;
  const H = scene.video.videoHeight;
  let snapshot: HTMLCanvasElement | null = null;
  return {
    t: scene.t,
    W,
    H,
    faces: scene.faces.map((f) => buildFace(f, W, H, scene.mirrored)),
    // Copy of the frame before overlays, for effects that cut faces out of the picture.
    base: () => {
      if (!snapshot) {
        snapshot = document.createElement('canvas');
        snapshot.width = ctx.canvas.width;
        snapshot.height = ctx.canvas.height;
        snapshot.getContext('2d')!.drawImage(ctx.canvas, 0, 0);
      }
      return snapshot;
    },
  };
}

/**
 * Draws the whole picture in camera-pixel units: (warped) frame → effect → PNG mask/frame.
 * The canvas may be larger than the camera frame (capture); a scale transform maps the units.
 */
export function drawScene(ctx: CanvasRenderingContext2D, scene: Scene, env: EffectEnv, placements?: Placement[]): void {
  const { video, layer, effect } = scene;
  const W = video.videoWidth;
  const H = video.videoHeight;
  const k = ctx.canvas.width / W;
  ctx.setTransform(k, 0, 0, k, 0, 0);
  const bulges = effect?.warp?.(env) ?? [];
  if (bulges.length && scene.warper) {
    ctx.drawImage(scene.warper.render(video, W, H, scene.mirrored, bulges), 0, 0, W, H);
  } else {
    drawCover(ctx, video, W, H, { width: W, height: H }, scene.mirrored);
  }
  if (effect) {
    ctx.save();
    effect.draw(ctx, env);
    ctx.restore();
  }
  if (layer && isFrameMask(layer.mask)) {
    drawCover(ctx, layer.image, layer.image.naturalWidth, layer.image.naturalHeight, { width: W, height: H });
  } else if (layer) {
    for (const p of placements ?? facePlacements(scene)) drawPlacement(ctx, layer.image, p);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

/** Final shot: JPEG with the long side scaled to 2048 px, mask and effect baked in. */
export function captureJpeg(scene: Scene): Promise<Blob> {
  const { videoWidth: vw, videoHeight: vh } = scene.video;
  const scale = CAPTURE_LONG_SIDE / Math.max(vw, vh);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(vw * scale);
  canvas.height = Math.round(vh * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  drawScene(ctx, scene, effectEnv(scene, ctx));
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
