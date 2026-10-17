import type { Mask } from '../core/types';
import type { Landmarks } from './trackerLoader';
import { drawCover, drawPlacement, isFrameMask, placeMask, poseFromLandmarks, type Placement } from './maskRenderer';

export const CAPTURE_LONG_SIDE = 2048;
export const JPEG_QUALITY = 0.9;

export interface MaskLayer {
  mask: Mask;
  image: HTMLImageElement;
}

export interface Scene {
  video: HTMLVideoElement;
  mirrored: boolean;
  faces: Landmarks[];
  layer: MaskLayer | null;
}

const aspectOf = (img: HTMLImageElement): number => (img.naturalHeight || 1) / (img.naturalWidth || 1);

export function facePlacements(scene: Scene, width: number, height: number): Placement[] {
  const { layer } = scene;
  if (!layer || isFrameMask(layer.mask)) return [];
  const faceMask = layer.mask;
  return scene.faces.map((lm) =>
    placeMask(poseFromLandmarks(lm, width, height, scene.mirrored), faceMask, aspectOf(layer.image)),
  );
}

/** Draws video + mask into ctx at the canvas size; `placements` lets the live preview pass smoothed ones. */
export function drawScene(ctx: CanvasRenderingContext2D, scene: Scene, placements?: Placement[]): void {
  const { width, height } = ctx.canvas;
  const { video, layer } = scene;
  drawCover(ctx, video, video.videoWidth, video.videoHeight, scene.mirrored);
  if (!layer) return;
  if (isFrameMask(layer.mask)) {
    drawCover(ctx, layer.image, layer.image.naturalWidth, layer.image.naturalHeight);
    return;
  }
  for (const p of placements ?? facePlacements(scene, width, height)) drawPlacement(ctx, layer.image, p);
}

/** Final shot: JPEG with the long side scaled to 2048 px, mask baked in. */
export function captureJpeg(scene: Scene): Promise<Blob> {
  const { videoWidth: vw, videoHeight: vh } = scene.video;
  const scale = CAPTURE_LONG_SIDE / Math.max(vw, vh);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(vw * scale);
  canvas.height = Math.round(vh * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  drawScene(ctx, scene);
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
