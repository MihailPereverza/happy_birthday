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

const cakeBox = ({ view, floorY }: EffectEnv): CakeBox => {
  const w = Math.min(view.w * 0.58, (floorY - view.y) * 0.4);
  return { x: view.x + view.w / 2, bottom: floorY - w * 0.04, w };
};

/** Where candles stand: the top tier of the party cake, or the flat top of the single red velvet cake. */
function cakeTop(box: CakeBox, flavor: CakeFlavor): { topY: number; topW: number } {
  if (flavor === 'red-velvet') {
    const g = velvetGeometry(box);
    return { topY: g.top + g.ry * 0.2, topW: g.width * 0.75 };
  }
  return { topY: box.bottom - box.w * 0.62, topW: box.w * 0.62 };
}

/** Number candles («2», «5») are tall and wide; plain ones are thin sticks. */
function candleTops(box: CakeBox, count: number, digits: boolean, flavor: CakeFlavor) {
  const { topY, topW } = cakeTop(box, flavor);
  const spread = digits ? 0.5 : 0.8;
  return Array.from({ length: count }, (_, i) => ({
    x: box.x - (topW * spread) / 2 + (count === 1 ? (topW * spread) / 2 : (topW * spread * i) / (count - 1)),
    base: topY + box.w * 0.02,
    height: box.w * (digits ? 0.3 : 0.17),
  }));
}

function plainCandle(ctx: CanvasRenderingContext2D, c: { x: number; base: number; height: number }, w: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(c.x - w / 2, c.base - c.height, w, c.height);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  for (let s = 0; s < 3; s += 1) ctx.fillRect(c.x - w / 2, c.base - c.height + (c.height * (s + 0.3)) / 3, w, c.height * 0.08);
}

/** A wax digit standing on the cake: candy-striped glyph with a thick outline and a wick on top. */
function digitCandle(ctx: CanvasRenderingContext2D, c: { x: number; base: number; height: number }, digit: string, color: string): void {
  ctx.save();
  ctx.font = `800 ${c.height * 1.25}px Nunito, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const stripes = ctx.createLinearGradient(c.x - c.height * 0.4, c.base - c.height, c.x + c.height * 0.4, c.base);
  for (let k = 0; k <= 8; k += 1) stripes.addColorStop(k / 8, k % 2 ? '#ffffff' : color);
  ctx.lineJoin = 'round';
  ctx.lineWidth = c.height * 0.08;
  ctx.strokeStyle = '#ad1457';
  ctx.strokeText(digit, c.x, c.base);
  ctx.fillStyle = stripes;
  ctx.fillText(digit, c.x, c.base);
  ctx.fillStyle = '#3e2723';
  ctx.fillRect(c.x - c.height * 0.012, c.base - c.height - c.height * 0.08, c.height * 0.024, c.height * 0.1);
  ctx.restore();
}

export type CakeFlavor = 'party' | 'red-velvet';

function drawCake(ctx: CanvasRenderingContext2D, box: CakeBox, flavor: CakeFlavor): void {
  if (flavor === 'red-velvet') drawRedVelvet(ctx, box);
  else drawPartyCake(ctx, box);
}

function drawPartyCake(ctx: CanvasRenderingContext2D, box: CakeBox): void {
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

interface VelvetGeometry {
  cx: number;
  width: number;
  /** Half-height of the elliptical top/bottom edges (the cake is seen slightly from above). */
  ry: number;
  top: number;
  bottom: number;
}

function velvetGeometry(box: CakeBox): VelvetGeometry {
  const width = box.w * 0.92;
  const bottom = box.bottom - box.w * 0.06;
  return { cx: box.x, width, ry: width * 0.14, top: bottom - box.w * 0.46, bottom };
}

/** Deterministic pseudo-random so the crumb texture doesn't flicker between frames. */
const hash01 = (n: number): number => {
  const v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
};

/**
 * Red velvet: one tall round cake — three thick deep-red sponge layers with cream-cheese layers between,
 * a smooth white top edged with red crumbs, on a white plate; side shading gives it volume.
 */
function drawRedVelvet(ctx: CanvasRenderingContext2D, box: CakeBox): void {
  const g = velvetGeometry(box);
  const left = g.cx - g.width / 2;
  const right = g.cx + g.width / 2;
  const rx = g.width / 2;
  ctx.save();

  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ctx.ellipse(g.cx, g.bottom + g.ry * 0.55, rx * 1.18, g.ry * 1.1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f7f7f7';
  ctx.beginPath();
  ctx.ellipse(g.cx, g.bottom + g.ry * 0.35, rx * 1.15, g.ry * 1.05, 0, 0, Math.PI * 2);
  ctx.fill();

  const shade = (light: string, dark: string) => {
    const grad = ctx.createLinearGradient(left, 0, right, 0);
    grad.addColorStop(0, dark);
    grad.addColorStop(0.35, light);
    grad.addColorStop(0.6, light);
    grad.addColorStop(1, dark);
    return grad;
  };
  /** A slice of the cylinder between y1 (upper) and y2 (lower), with curved front edges. */
  const band = (y1: number, y2: number, fill: CanvasGradient) => {
    ctx.beginPath();
    ctx.moveTo(left, y1);
    ctx.lineTo(left, y2);
    ctx.ellipse(g.cx, y2, rx, g.ry, 0, Math.PI, 0, true);
    ctx.lineTo(right, y1);
    ctx.ellipse(g.cx, y1, rx, g.ry, 0, 0, Math.PI, false);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  };

  const sponge = shade('#b3203a', '#6e0c1d');
  const cream = shade('#fffaf2', '#e3d6c6');
  const h = g.bottom - g.top;
  // Bottom → top: sponge, cream, sponge, cream, sponge, then the frosted top layer.
  const layers: [number, CanvasGradient, boolean][] = [
    [0.25, sponge, true],
    [0.11, cream, false],
    [0.24, sponge, true],
    [0.11, cream, false],
    [0.21, sponge, true],
    [0.08, cream, false],
  ];
  let y = g.bottom;
  layers.forEach(([part, fill, isSponge], li) => {
    const y1 = y - h * part;
    band(y1, y, fill);
    if (isSponge) {
      // Crumb texture: darker pores and lighter specks along the visible front of the sponge.
      for (let k = 0; k < 70; k += 1) {
        const u = hash01(li * 1000 + k);
        const v = hash01(li * 1000 + k + 500);
        const px = left + g.width * (0.04 + 0.92 * u);
        const curve = g.ry * Math.sqrt(Math.max(0, 1 - ((px - g.cx) / rx) ** 2));
        const py = y1 + curve + (y - y1) * (0.15 + 0.7 * v);
        ctx.fillStyle = k % 3 ? 'rgba(70,0,12,0.35)' : 'rgba(255,170,170,0.25)';
        ctx.beginPath();
        ctx.arc(px, py, g.width * (0.004 + 0.004 * hash01(k + li)), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    y = y1;
  });

  ctx.beginPath();
  ctx.ellipse(g.cx, y, rx, g.ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#fffaf3';
  ctx.fill();
  ctx.strokeStyle = 'rgba(200,185,170,0.6)';
  ctx.lineWidth = g.width * 0.004;
  ctx.stroke();
  // Classic decoration: a ring of red velvet crumbs around the top edge.
  for (let k = 0; k < 90; k += 1) {
    const a = (k / 90) * Math.PI * 2 + hash01(k) * 0.05;
    const r = 0.86 + 0.12 * hash01(k + 77);
    const px = g.cx + Math.cos(a) * rx * r;
    const py = y + Math.sin(a) * g.ry * r;
    ctx.fillStyle = k % 4 ? '#a3243a' : '#6e0c1d';
    ctx.beginPath();
    ctx.arc(px, py, g.width * (0.006 + 0.006 * hash01(k + 13)), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Birthday cake at the bottom of the frame: blow (pucker or open mouth) to put the candles out and make a wish. */
export function blowCandles(params: Record<string, unknown>): Effect {
  // `digits: "25"` puts number candles on the cake instead of `candles` plain sticks.
  const digits = typeof params.digits === 'string' && params.digits.trim() ? [...params.digits.trim()].slice(0, 3) : null;
  const flavor: CakeFlavor = params.cake === 'red-velvet' ? 'red-velvet' : 'party';
  const count = digits ? digits.length : Math.max(1, Math.min(12, Number(params.candles ?? 7)));
  // Blowing out one candle takes about as long overall as blowing out many, so a pair doesn't vanish instantly.
  const secondsPerCandle = Math.max(SECONDS_PER_CANDLE, 0.9 / count);
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
      const tops = candleTops(box, count, !!digits, flavor);
      const blowNow = env.faces.some((f) => f.pucker > BLOW_THRESHOLD || f.jawOpen > 0.55);
      blowing += ((blowNow ? 1 : 0) - blowing) * Math.min(1, dt * 8);
      if (blowNow && lit.some(Boolean)) {
        blowAcc += dt;
        while (blowAcc > secondsPerCandle) {
          blowAcc -= secondsPerCandle;
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
      drawCake(ctx, box, flavor);
      const tops = candleTops(box, count, !!digits, flavor);
      ctx.save();
      tops.forEach((c, i) => {
        if (digits) digitCandle(ctx, c, digits[i], PARTY[i % 5]);
        else plainCandle(ctx, c, box.w * 0.035, PARTY[i % 5]);
        if (!lit[i]) return;
        const flick = Math.sin(t * 20 + i * 1.7) * 0.15;
        const lean = blowing * 0.9 + flick * 0.3;
        const fx = c.x;
        const fy = c.base - c.height - (digits ? c.height * 0.08 : 0);
        const fh = box.w * (digits ? 0.11 : 0.08) * (1 - blowing * 0.4) * (1 + flick * 0.3);
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
      const textLift = digits ? 1.15 : 0.95;
      if (wishAt >= 0 && env.t - wishAt < 3.5) {
        const pop = Math.min(1, (env.t - wishAt) * 4);
        outlinedText(ctx, wishText, box.x, box.bottom - box.w * textLift, size * (0.6 + 0.4 * pop), '#e91e63');
      } else if (lit.every(Boolean)) {
        outlinedText(ctx, 'Задуй свечи! 🌬️', box.x, box.bottom - box.w * textLift, size * 0.8, '#8e24aa');
      }
    },
  };
}
