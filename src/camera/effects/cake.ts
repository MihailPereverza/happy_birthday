import { outlinedText, PARTY, pick, rand } from './draw';
import { fadeInOut, Particles } from './particles';
import type { Effect, EffectEnv } from './types';

const BLOW_THRESHOLD = 0.4;
const SECONDS_PER_CANDLE = 0.14;
const RELIGHT_AFTER = 5;

interface CakeBox {
  x: number;
  bottom: number;
  w: number;
}

const cakeBox = ({ W, H }: EffectEnv): CakeBox => {
  const w = Math.min(W * 0.62, H * 0.42);
  return { x: W / 2, bottom: H * 0.985, w };
};

function candleTops(box: CakeBox, count: number) {
  const topW = box.w * 0.62;
  const topY = box.bottom - box.w * 0.62;
  return Array.from({ length: count }, (_, i) => ({
    x: box.x - topW * 0.4 + (count === 1 ? topW * 0.4 : (topW * 0.8 * i) / (count - 1)),
    base: topY + box.w * 0.02,
    height: box.w * 0.17,
  }));
}

function drawCake(ctx: CanvasRenderingContext2D, box: CakeBox): void {
  const { x, bottom, w } = box;
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.beginPath();
  ctx.ellipse(x, bottom - w * 0.03, w * 0.6, w * 0.06, 0, 0, Math.PI * 2);
  ctx.fill();
  const tier = (cx: number, top: number, tw: number, th: number, body: string, cream: string) => {
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.roundRect(cx - tw / 2, top, tw, th, tw * 0.05);
    ctx.fill();
    ctx.fillStyle = cream;
    ctx.beginPath();
    ctx.moveTo(cx - tw / 2, top + th * 0.05);
    const drips = 7;
    for (let i = 0; i <= drips; i += 1) {
      const px = cx - tw / 2 + (tw * i) / drips;
      ctx.quadraticCurveTo(px - tw / drips / 2, top + th * (i % 2 ? 0.55 : 0.38), px, top + th * 0.3);
    }
    ctx.lineTo(cx + tw / 2, top);
    ctx.lineTo(cx - tw / 2, top);
    ctx.closePath();
    ctx.fill();
    for (let i = 0; i < 14; i += 1) {
      ctx.fillStyle = PARTY[i % PARTY.length];
      const sx = cx - tw * 0.42 + ((i * 37) % 100) / 100 * tw * 0.84;
      const sy = top + th * (0.55 + ((i * 53) % 40) / 100);
      ctx.fillRect(sx, sy, tw * 0.03, tw * 0.012);
    }
  };
  tier(x, bottom - w * 0.42, w, w * 0.36, '#f8bbd0', '#ffffff');
  tier(x, bottom - w * 0.62, w * 0.66, w * 0.22, '#e1bee7', '#fff3e0');
  ctx.restore();
}

/** Birthday cake at the bottom of the frame: blow (pucker or open mouth) to put the candles out and make a wish. */
export function blowCandles(params: Record<string, unknown>): Effect {
  const count = Math.max(1, Math.min(12, Number(params.candles ?? 7)));
  const wishText = String(params.text ?? 'Желание загадано! ✨');
  const lit = Array.from({ length: count }, () => true);
  let blowing = 0;
  let blowAcc = 0;
  let wishAt = -1;
  let t = 0;
  const smoke = new Particles(300);
  const confetti = new Particles(400);
  return {
    update(env, dt) {
      t = env.t;
      const box = cakeBox(env);
      const tops = candleTops(box, count);
      const blowNow = env.faces.some((f) => f.pucker > BLOW_THRESHOLD || f.jawOpen > 0.55);
      blowing += ((blowNow ? 1 : 0) - blowing) * Math.min(1, dt * 8);
      if (blowNow && lit.some(Boolean)) {
        blowAcc += dt;
        while (blowAcc > SECONDS_PER_CANDLE) {
          blowAcc -= SECONDS_PER_CANDLE;
          const candidates = lit.map((on, i) => (on ? i : -1)).filter((i) => i >= 0);
          const i = pick(candidates);
          lit[i] = false;
          for (let k = 0; k < 8; k += 1) {
            smoke.add({ x: tops[i].x, y: tops[i].base - tops[i].height, vx: rand(-0.2, 0.2) * box.w, vy: -rand(0.15, 0.35) * box.w, maxLife: 1.6, size: box.w * 0.02, grow: box.w * 0.05, color: 'rgba(220,220,220,0.5)', kind: 'smoke' });
          }
          if (!lit.some(Boolean)) {
            wishAt = env.t;
            for (let k = 0; k < 160; k += 1) {
              const a = rand(-Math.PI, 0);
              const s = rand(0.4, 1.4) * box.w;
              confetti.add({ x: box.x, y: box.bottom - box.w * 0.7, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 1.4, maxLife: 2.6, size: box.w * 0.018, color: pick(PARTY), kind: 'confetti', vr: rand(-10, 10) });
            }
          }
        }
      }
      if (wishAt >= 0 && env.t - wishAt > RELIGHT_AFTER) {
        lit.fill(true);
        wishAt = -1;
      }
      smoke.step(dt, 0, 0.02);
      confetti.step(dt, box.w * 1.1, 0.02);
    },
    draw(ctx, env) {
      const box = cakeBox(env);
      drawCake(ctx, box);
      const tops = candleTops(box, count);
      ctx.save();
      tops.forEach((c, i) => {
        const cw = box.w * 0.035;
        ctx.fillStyle = PARTY[i % 5];
        ctx.fillRect(c.x - cw / 2, c.base - c.height, cw, c.height);
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        for (let s = 0; s < 3; s += 1) ctx.fillRect(c.x - cw / 2, c.base - c.height + (c.height * (s + 0.3)) / 3, cw, c.height * 0.08);
        if (!lit[i]) return;
        const flick = Math.sin(t * 20 + i * 1.7) * 0.15;
        const lean = blowing * 0.9 + flick * 0.3;
        const fx = c.x;
        const fy = c.base - c.height;
        const fh = box.w * 0.08 * (1 - blowing * 0.4) * (1 + flick * 0.3);
        ctx.save();
        ctx.translate(fx, fy);
        ctx.rotate(lean);
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(0, -fh * 0.4, 0, 0, -fh * 0.4, fh * 1.4);
        g.addColorStop(0, 'rgba(255,220,120,0.7)');
        g.addColorStop(1, 'rgba(255,120,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(-fh * 1.4, -fh * 1.8, fh * 2.8, fh * 2.8);
        ctx.globalCompositeOperation = 'source-over';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.bezierCurveTo(-fh * 0.45, -fh * 0.2, -fh * 0.2, -fh * 0.7, 0, -fh);
        ctx.bezierCurveTo(fh * 0.2, -fh * 0.7, fh * 0.45, -fh * 0.2, 0, 0);
        ctx.fillStyle = '#ffca28';
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(0, -fh * 0.25, fh * 0.12, fh * 0.25, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#fff8e1';
        ctx.fill();
        ctx.restore();
      });
      for (const s of smoke.items) {
        ctx.globalAlpha = fadeInOut(s) * 0.6;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
        ctx.fillStyle = s.color;
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      for (const c of confetti.items) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, (c.maxLife - c.life) * 2);
        ctx.translate(c.x, c.y);
        ctx.rotate(c.rot);
        ctx.fillStyle = c.color;
        ctx.fillRect(-c.size, -c.size / 2, c.size * 2, c.size);
        ctx.restore();
      }
      ctx.restore();
      const size = box.w * 0.13;
      if (wishAt >= 0 && env.t - wishAt < 3.5) {
        const pop = Math.min(1, (env.t - wishAt) * 4);
        outlinedText(ctx, wishText, env.W / 2, box.bottom - box.w * 0.95, size * (0.6 + 0.4 * pop), '#e91e63');
      } else if (lit.every(Boolean)) {
        outlinedText(ctx, 'Задуй свечи! 🌬️', env.W / 2, box.bottom - box.w * 0.95, size * 0.8, '#8e24aa');
      }
    },
  };
}
