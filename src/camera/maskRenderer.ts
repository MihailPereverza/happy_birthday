import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import type { Anchor, EffectMask, FaceMask, FrameMask, Mask } from '../core/types';

type Landmarks = NormalizedLandmark[];

// MediaPipe Face Mesh topology: 33/263 outer eye corners, 10 forehead top, 1 nose tip, 152 chin, 13/14 inner lips.
export const LM = { eyeA: 33, eyeB: 263, forehead: 10, noseTip: 1, chin: 152, lipTop: 13, lipBottom: 14 } as const;

export interface Pt {
  x: number;
  y: number;
}

export interface FacePose {
  /** Anchor-independent face frame in canvas pixels. */
  eyeL: Pt;
  eyeR: Pt;
  eyeDist: number;
  angle: number;
  landmarks: Pt[];
}

export const isFrameMask = (mask: Mask): mask is FrameMask => mask.type === 'frame';
export const isEffectMask = (mask: Mask): mask is EffectMask => mask.type === 'effect';
export const isFaceMask = (mask: Mask): mask is FaceMask => !isFrameMask(mask) && !isEffectMask(mask);

/** Converts normalized landmarks to canvas pixels; when mirrored, the eye that appears on the left is taken as L. */
export function poseFromLandmarks(lm: Landmarks, width: number, height: number, mirrored: boolean): FacePose {
  const landmarks = lm.map((p) => ({ x: (mirrored ? 1 - p.x : p.x) * width, y: p.y * height }));
  const a = landmarks[LM.eyeA];
  const b = landmarks[LM.eyeB];
  const [eyeL, eyeR] = a.x <= b.x ? [a, b] : [b, a];
  const eyeDist = Math.hypot(eyeR.x - eyeL.x, eyeR.y - eyeL.y);
  return { eyeL, eyeR, eyeDist, angle: Math.atan2(eyeR.y - eyeL.y, eyeR.x - eyeL.x), landmarks };
}

const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

export function anchorPoint(pose: FacePose, anchor: Anchor): Pt {
  const l = pose.landmarks;
  switch (anchor) {
    case 'eyesMid':
      return mid(pose.eyeL, pose.eyeR);
    case 'forehead':
      return l[LM.forehead];
    case 'noseTip':
      return l[LM.noseTip];
    case 'chin':
      return l[LM.chin];
    case 'mouth':
      return mid(l[LM.lipTop], l[LM.lipBottom]);
    default:
      return l[anchor] ?? mid(pose.eyeL, pose.eyeR);
  }
}

export interface Placement {
  cx: number;
  cy: number;
  width: number;
  height: number;
  angle: number;
}

/** Offsets are in eye-distance units along the face axes, so a hat stays above the head when it tilts. */
export function placeMask(pose: FacePose, mask: FaceMask, aspect: number): Placement {
  const angle = mask.rotate === false ? 0 : pose.angle;
  const anchor = anchorPoint(pose, mask.anchor);
  const dx = (mask.offsetX ?? 0) * pose.eyeDist;
  const dy = (mask.offsetY ?? 0) * pose.eyeDist;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const width = mask.widthEyes * pose.eyeDist;
  return { cx: anchor.x + dx * cos - dy * sin, cy: anchor.y + dx * sin + dy * cos, width, height: width * aspect, angle };
}

export function drawPlacement(ctx: CanvasRenderingContext2D, img: CanvasImageSource, p: Placement): void {
  ctx.save();
  ctx.translate(p.cx, p.cy);
  ctx.rotate(p.angle);
  ctx.drawImage(img, -p.width / 2, -p.height / 2, p.width, p.height);
  ctx.restore();
}

/** Draws `source` scaled to cover a width×height area (in current drawing units), like object-fit: cover. */
export function drawCover(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sw: number,
  sh: number,
  area: { width: number; height: number },
  mirror = false,
): void {
  const { width, height } = area;
  const scale = Math.max(width / sw, height / sh);
  const dw = sw * scale;
  const dh = sh * scale;
  ctx.save();
  if (mirror) {
    ctx.translate(width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(source, (width - dw) / 2, (height - dh) / 2, dw, dh);
  ctx.restore();
}

/** Light exponential smoothing per face slot; snaps when the face jumped (another face took the slot). */
export class PoseSmoother {
  private prev: Placement[] = [];

  smooth(placements: Placement[], alpha = 0.55): Placement[] {
    const out = placements.map((p, i) => {
      const q = this.prev[i];
      if (!q || Math.hypot(p.cx - q.cx, p.cy - q.cy) > p.width * 0.75) return p;
      const lerp = (a: number, b: number) => b + (a - b) * alpha;
      let da = p.angle - q.angle;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      return { cx: lerp(p.cx, q.cx), cy: lerp(p.cy, q.cy), width: lerp(p.width, q.width), height: lerp(p.height, q.height), angle: q.angle + da * alpha };
    });
    this.prev = out;
    return out;
  }
}
