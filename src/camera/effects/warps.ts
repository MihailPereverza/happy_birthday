import { lerpPt, type FaceData } from './face';
import { glow, star } from './draw';
import type { Effect, EffectEnv } from './types';
import type { Bulge } from './warp';

const bulge = (p: { x: number; y: number }, radius: number, strength: number): Bulge => ({ ...p, radius, strength });

function eyeSparkles(ctx: CanvasRenderingContext2D, f: FaceData, t: number): void {
  for (const [i, eye] of [f.eyeL, f.eyeR].entries()) {
    const r = f.eyeDist * 0.09 * (0.8 + 0.4 * Math.abs(Math.sin(t * 4 + i)));
    star(ctx, eye.x - f.eyeDist * 0.07, eye.y - f.eyeDist * 0.07, r, 'rgba(255,255,255,0.95)');
    star(ctx, eye.x + f.eyeDist * 0.06, eye.y + f.eyeDist * 0.05, r * 0.5, 'rgba(255,255,255,0.8)');
  }
}

/** Anime eyes: two strong bulges on the irises plus twinkles. */
export const bigEyes = (): Effect => ({
  warp: ({ faces }) => faces.flatMap((f) => [bulge(f.eyeL, f.eyeDist * 0.62, 0.72), bulge(f.eyeR, f.eyeDist * 0.62, 0.72)]),
  draw: (ctx, { faces, t }) => faces.forEach((f) => eyeSparkles(ctx, f, t)),
});

/** Hamster: puffed cheeks, tiny mouth and a blush. */
export const hamster = (): Effect => ({
  warp: ({ faces }) =>
    faces.flatMap((f) => [
      bulge(lerpPt(f.cheekL, f.mouthL, 0.45), f.eyeDist * 0.8, 0.7),
      bulge(lerpPt(f.cheekR, f.mouthR, 0.45), f.eyeDist * 0.8, 0.7),
      bulge(f.mouth, f.eyeDist * 0.45, -0.7),
    ]),
  draw: (ctx, { faces }) => {
    for (const f of faces) {
      for (const c of [lerpPt(f.cheekL, f.mouthL, 0.4), lerpPt(f.cheekR, f.mouthR, 0.4)]) {
        glow(ctx, c.x, c.y, f.eyeDist * 0.35, 'rgba(255,90,140,0.45)');
      }
    }
  },
});

/** Bobblehead: one huge bulge centred between the eyes. */
export const bigHead = (): Effect => ({
  warp: ({ faces }) => faces.flatMap((f) => [bulge(lerpPt(f.bridge, f.nose, 0.3), f.faceHeight * 1.25, 0.62), bulge(f.chin, f.faceHeight * 0.55, -0.5)]),
  draw: () => undefined,
});

/** Alien: saucer eyes, pointy chin, swollen brain, green skin. */
export const alien = (): Effect => ({
  warp: ({ faces }) =>
    faces.flatMap((f) => [
      bulge(f.forehead, f.faceHeight * 0.75, 0.55),
      bulge(f.chin, f.faceHeight * 0.65, -0.8),
      bulge(f.mouth, f.eyeDist * 0.5, -0.6),
    ]),
  draw: (ctx, env: EffectEnv) => {
    for (const f of env.faces) {
      const cx = (f.forehead.x + f.chin.x) / 2;
      const cy = (f.forehead.y + f.chin.y) / 2;
      ctx.save();
      ctx.beginPath();
      f.oval.forEach((p, i) => {
        const q = { x: cx + (p.x - cx) * 1.12, y: cy + (p.y - cy) * 1.12 };
        if (i) ctx.lineTo(q.x, q.y);
        else ctx.moveTo(q.x, q.y);
      });
      ctx.closePath();
      ctx.filter = `blur(${f.eyeDist * 0.08}px)`;
      ctx.globalCompositeOperation = 'color';
      ctx.fillStyle = 'rgba(70, 255, 120, 0.85)';
      ctx.fill();
      ctx.restore();
      // Big black almond eyes slanting up and out, with a glossy highlight.
      [f.eyeL, f.eyeR].forEach((eye, side) => {
        const tilt = f.angle + (side ? -0.45 : 0.45);
        ctx.save();
        ctx.translate(eye.x, eye.y);
        ctx.rotate(tilt);
        ctx.beginPath();
        ctx.ellipse(0, 0, f.eyeDist * 0.36, f.eyeDist * 0.2, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#0b0f14';
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(-f.eyeDist * 0.1, -f.eyeDist * 0.06, f.eyeDist * 0.09, f.eyeDist * 0.045, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fill();
        ctx.restore();
      });
    }
  },
});
