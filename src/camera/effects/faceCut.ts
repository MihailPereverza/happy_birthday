import type { FaceData, Pt } from './face';
import { balloon, outlinedText } from './draw';
import type { Effect, EffectEnv } from './types';

const ovalCenter = (f: FaceData): Pt => ({ x: (f.forehead.x + f.chin.x) / 2, y: (f.forehead.y + f.chin.y) / 2 });

function ovalPath(ctx: CanvasRenderingContext2D, f: FaceData, shrink: number): void {
  const c = ovalCenter(f);
  ctx.beginPath();
  f.oval.forEach((p, i) => {
    const q = { x: c.x + (p.x - c.x) * shrink, y: c.y + (p.y - c.y) * shrink };
    if (i) ctx.lineTo(q.x, q.y);
    else ctx.moveTo(q.x, q.y);
  });
  ctx.closePath();
}

function scratch(W: number, H: number, cache: { canvas?: HTMLCanvasElement }): CanvasRenderingContext2D {
  cache.canvas ??= document.createElement('canvas');
  const c = cache.canvas;
  if (c.width !== Math.round(W) || c.height !== Math.round(H)) {
    c.width = Math.round(W);
    c.height = Math.round(H);
  }
  const ctx = c.getContext('2d')!;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.filter = 'none';
  ctx.clearRect(0, 0, c.width, c.height);
  return ctx;
}

/** Face `from` warped onto `to` by aligning the eyes, feathered into `to`'s face oval. */
function pasteFace(ctx: CanvasRenderingContext2D, env: EffectEnv, from: FaceData, to: FaceData, cache: { canvas?: HTMLCanvasElement }): void {
  const off = scratch(env.W, env.H, cache);
  const scale = to.eyeDist / from.eyeDist;
  const midFrom = { x: (from.eyeL.x + from.eyeR.x) / 2, y: (from.eyeL.y + from.eyeR.y) / 2 };
  const midTo = { x: (to.eyeL.x + to.eyeR.x) / 2, y: (to.eyeL.y + to.eyeR.y) / 2 };
  off.save();
  off.translate(midTo.x, midTo.y);
  off.rotate(to.angle - from.angle);
  off.scale(scale, scale);
  off.translate(-midFrom.x, -midFrom.y);
  off.drawImage(env.base(), 0, 0, env.W, env.H);
  off.restore();
  off.globalCompositeOperation = 'destination-in';
  off.filter = `blur(${to.eyeDist * 0.12}px)`;
  ovalPath(off, to, 0.9);
  off.fillStyle = '#000';
  off.fill();
  ctx.drawImage(off.canvas, 0, 0, env.W, env.H);
}

/** Two people swap faces. */
export function faceSwap(): Effect {
  const caches = [{}, {}] as { canvas?: HTMLCanvasElement }[];
  return {
    draw(ctx, env) {
      const [a, b] = env.faces;
      if (!a || !b) {
        outlinedText(ctx, 'Нужны двое в кадре 👯', env.W / 2, env.H * 0.12, Math.min(env.W, env.H) * 0.07, '#8e24aa');
        return;
      }
      env.base();
      pasteFace(ctx, env, b, a, caches[0]);
      pasteFace(ctx, env, a, b, caches[1]);
    },
  };
}

/** Your face printed on balloons that float up the frame. */
export function faceBalloons(): Effect {
  const cache: { canvas?: HTMLCanvasElement } = {};
  const colors = ['#ff4081', '#ffd54f', '#40c4ff', '#69f0ae', '#b388ff', '#ff6e40'];
  return {
    draw(ctx, env) {
      const { W, H, t } = env;
      const f = env.faces[0];
      const r = Math.min(W, H) * 0.1;
      let face: HTMLCanvasElement | null = null;
      if (f) {
        const size = f.faceHeight * 1.3;
        const off = scratch(size, size, cache);
        off.save();
        off.translate(size / 2, size / 2);
        off.rotate(-f.angle);
        const c = ovalCenter(f);
        off.translate(-c.x, -c.y);
        ovalPath(off, f, 1);
        off.clip();
        off.drawImage(env.base(), 0, 0, W, H);
        off.restore();
        face = off.canvas;
      }
      colors.forEach((color, i) => {
        const phase = (t * 0.09 + i / colors.length) % 1;
        const x = W * (0.1 + (0.8 * ((i * 0.37) % 1))) + Math.sin(t * 1.2 + i) * W * 0.03;
        const y = H * 1.15 - phase * H * 1.45;
        balloon(ctx, x, y, r, color, r * 2.5, t + i);
        if (!face) return;
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(x, y, r * 0.8, r * 0.94, 0, 0, Math.PI * 2);
        ctx.clip();
        ctx.globalAlpha = 0.92;
        ctx.drawImage(face, x - r * 0.95, y - r * 0.95, r * 1.9, r * 1.9);
        ctx.restore();
      });
    },
  };
}
