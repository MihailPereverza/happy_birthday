import type { FaceData } from './face';
import type { Bulge } from './warp';

export interface EffectEnv {
  /** Seconds since the effect was selected. */
  t: number;
  /** Frame size in drawing units (camera pixels); captures draw the same units scaled up. */
  W: number;
  H: number;
  faces: FaceData[];
  /** The camera frame (after warping) before any overlay, drawn at 0,0,W,H. */
  base: () => CanvasImageSource;
}

/** A live camera effect. State lives in the instance; `draw` must not mutate it so a capture can redraw a frame. */
export interface Effect {
  warp?(env: EffectEnv): Bulge[];
  update?(env: EffectEnv, dt: number): void;
  draw(ctx: CanvasRenderingContext2D, env: EffectEnv): void;
}

export interface EffectSpec {
  create: (params: Record<string, unknown>) => Effect;
  /** False for effects that still make sense without face tracking (frame fallback mode). */
  needsFaces: boolean;
  minFaces?: number;
}
