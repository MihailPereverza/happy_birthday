import type { FaceData } from './face';
import { balloon, fillHeart, glow, outlinedText, PARTY, pick, rand, star } from './draw';
import { fadeInOut, Particles } from './particles';
import type { Effect } from './types';

/** In love: hearts orbit the head in 3D and the eyes turn into beating hearts. */
export function heartHalo(): Effect {
  return {
    draw(ctx, { faces, t }) {
      ctx.save();
      for (const f of faces) {
        const n = 8;
        const center = { x: f.forehead.x + f.up.x * f.eyeDist * 0.55, y: f.forehead.y + f.up.y * f.eyeDist * 0.55 };
        const orbit = Array.from({ length: n }, (_, i) => {
          const a = t * 1.8 + (i * Math.PI * 2) / n;
          const depth = Math.sin(a);
          const rx = Math.cos(a) * f.eyeDist * 1.5;
          const ry = depth * f.eyeDist * 0.32;
          return { x: center.x + f.right.x * rx - f.up.x * ry, y: center.y + f.right.y * rx - f.up.y * ry, depth, i };
        }).sort((a, b) => a.depth - b.depth);
        for (const h of orbit) {
          ctx.globalAlpha = 0.65 + 0.35 * (h.depth + 1) / 2;
          fillHeart(ctx, h.x, h.y, f.eyeDist * (0.3 + 0.12 * h.depth), h.i % 2 ? '#ff1744' : '#ff4081');
        }
        ctx.globalAlpha = 1;
        const beat = 1 + 0.15 * Math.max(0, Math.sin(t * 7));
        for (const eye of [f.eyeL, f.eyeR]) fillHeart(ctx, eye.x, eye.y + f.eyeDist * 0.04, f.eyeDist * 0.5 * beat, '#ff1744');
      }
      ctx.restore();
    },
  };
}

/** Fireworks bursting above the heads, plus a twinkling crown of stars. */
export function fireworks(): Effect {
  const rockets = new Particles(30);
  const sparks = new Particles(1500);
  let nextLaunch = 0;
  return {
    update({ W, H, t }, dt) {
      if (t >= nextLaunch) {
        nextLaunch = t + rand(0.45, 0.9);
        const x = rand(0.12, 0.88) * W;
        rockets.add({ x, y: H, vx: rand(-0.05, 0.05) * W, vy: -H * rand(1.05, 1.3), maxLife: rand(0.6, 0.8), size: Math.min(W, H) * 0.01, color: pick(PARTY), kind: 'rocket' });
      }
      for (const r of rockets.items) {
        sparks.add({ x: r.x, y: r.y, vx: rand(-1, 1) * 20, vy: rand(0, 40), maxLife: 0.35, size: r.size, color: '#ffe082', kind: 'trail' });
        if (r.life + dt >= r.maxLife) {
          const color = pick(PARTY);
          const n = 90;
          const speed = Math.min(W, H) * rand(0.45, 0.7);
          for (let k = 0; k < n; k += 1) {
            const a = (k / n) * Math.PI * 2;
            const s = speed * rand(0.7, 1);
            sparks.add({ x: r.x, y: r.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, maxLife: rand(1, 1.6), size: r.size * 1.2, color: Math.random() < 0.2 ? '#ffffff' : color, kind: 'burst' });
          }
        }
      }
      rockets.step(dt, H * 0.9);
      sparks.step(dt, H * 0.25, 0.035);
    },
    draw(ctx, { faces, t }) {
      ctx.save();
      ctx.lineCap = 'round';
      for (const s of sparks.items) {
        const fade = 1 - s.life / s.maxLife;
        ctx.globalAlpha = fade;
        ctx.globalCompositeOperation = 'lighter';
        glow(ctx, s.x, s.y, s.size * 4, s.color);
        ctx.globalCompositeOperation = 'source-over';
        ctx.beginPath();
        ctx.moveTo(s.x - s.vx * 0.05, s.y - s.vy * 0.05);
        ctx.lineTo(s.x, s.y);
        ctx.strokeStyle = s.color;
        ctx.lineWidth = s.size;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      for (const r of rockets.items) {
        glow(ctx, r.x, r.y, r.size * 5, 'rgba(255,240,200,0.9)');
        star(ctx, r.x, r.y, r.size * 2, '#ffffff', 4);
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      for (const f of faces) crownOfStars(ctx, f, t);
      ctx.restore();
    },
  };
}

function crownOfStars(ctx: CanvasRenderingContext2D, f: FaceData, t: number): void {
  for (let i = 0; i < 7; i += 1) {
    const k = (i - 3) / 3;
    const p = {
      x: f.forehead.x + f.right.x * k * f.eyeDist * 1.1 + f.up.x * f.eyeDist * (0.35 + 0.25 * (1 - k * k)),
      y: f.forehead.y + f.right.y * k * f.eyeDist * 1.1 + f.up.y * f.eyeDist * (0.35 + 0.25 * (1 - k * k)),
    };
    const r = f.eyeDist * 0.26 * (0.7 + 0.3 * Math.sin(t * 5 + i));
    star(ctx, p.x, p.y, r, i % 2 ? '#ffd54f' : '#ffffff', 5);
  }
}

/** Gold foil number balloons with the age, bobbing next to the birthday person. */
export function ageBalloons(params: Record<string, unknown>): Effect {
  const text = String(params.text ?? params.age ?? '18');
  const banner = params.banner === undefined ? 'С днём рождения!' : String(params.banner);
  return {
    draw(ctx, { faces, t, W, H }) {
      const f = faces[0];
      const size = Math.min(W, H) * 0.32;
      const digits = [...text];
      const totalW = size * 0.62 * digits.length;
      let baseX = W * 0.72;
      let baseY = H * 0.3;
      if (f) {
        const side = f.forehead.x < W / 2 ? 1 : -1;
        baseX = f.forehead.x + side * (f.eyeDist * 1.6 + totalW / 2);
        baseY = f.forehead.y + f.eyeDist * 0.4;
        baseX = Math.min(W - totalW / 2, Math.max(totalW / 2, baseX));
      }
      ctx.save();
      digits.forEach((d, i) => {
        const x = baseX - totalW / 2 + size * 0.62 * (i + 0.5);
        const y = baseY + Math.sin(t * 1.6 + i) * size * 0.05;
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.lineWidth = Math.max(1, size * 0.01);
        ctx.beginPath();
        ctx.moveTo(x, y + size * 0.45);
        ctx.quadraticCurveTo(x + Math.sin(t + i) * size * 0.2, y + size, x, H);
        ctx.stroke();
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.sin(t * 1.3 + i * 2) * 0.08);
        ctx.font = `800 ${size}px Nunito, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const g = ctx.createLinearGradient(-size * 0.3, -size * 0.5, size * 0.3, size * 0.5);
        g.addColorStop(0, '#fff8e1');
        g.addColorStop(0.35, '#ffd54f');
        g.addColorStop(0.6, '#ff8f00');
        g.addColorStop(1, '#ffe082');
        ctx.lineJoin = 'round';
        ctx.lineWidth = size * 0.07;
        ctx.strokeStyle = '#e65100';
        ctx.strokeText(d, 0, 0);
        ctx.fillStyle = g;
        ctx.fillText(d, 0, 0);
        ctx.restore();
      });
      const small = Math.min(W, H) * 0.06;
      const otherX = f ? Math.min(W - small * 2, Math.max(small * 2, 2 * (f.forehead.x) - baseX)) : W * 0.2;
      ['#ff4081', '#40c4ff', '#7c4dff'].forEach((c, i) => {
        balloon(ctx, otherX + (i - 1) * small * 1.6, baseY - small + Math.sin(t * 1.8 + i * 2) * small * 0.3 + (i % 2) * small, small, c, H * 0.5, t + i);
      });
      if (banner) outlinedText(ctx, banner, W / 2, H * 0.92, Math.min(W, H) * 0.09, '#e91e63');
      ctx.restore();
    },
  };
}

/** Disco: mirror ball, sweeping colour beams and a colour-cycling tint. */
export function disco(): Effect {
  const sparkles = new Particles(80);
  return {
    update({ W, H }, dt) {
      if (Math.random() < dt * 25) {
        sparkles.add({ x: rand(0, W), y: rand(0, H), vx: 0, vy: 0, maxLife: rand(0.3, 0.7), size: Math.min(W, H) * rand(0.01, 0.025), color: '#ffffff', kind: 'sparkle' });
      }
      sparkles.step(dt);
    },
    draw(ctx, { W, H, t }) {
      ctx.save();
      ctx.globalCompositeOperation = 'soft-light';
      ctx.fillStyle = `hsl(${(t * 90) % 360}, 100%, 55%)`;
      ctx.fillRect(0, 0, W, H);
      const ball = { x: W / 2, y: H * 0.11, r: Math.min(W, H) * 0.09 };
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 7; i += 1) {
        const a = Math.PI / 2 + Math.sin(t * 0.9 + i * 1.3) * 1.1;
        const spread = 0.09;
        const len = Math.hypot(W, H);
        const g = ctx.createLinearGradient(ball.x, ball.y, ball.x + Math.cos(a) * len, ball.y + Math.sin(a) * len);
        g.addColorStop(0, `hsla(${(i * 50 + t * 120) % 360}, 100%, 65%, 0.45)`);
        g.addColorStop(1, `hsla(${(i * 50 + t * 120) % 360}, 100%, 65%, 0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(ball.x, ball.y);
        ctx.lineTo(ball.x + Math.cos(a - spread) * len, ball.y + Math.sin(a - spread) * len);
        ctx.lineTo(ball.x + Math.cos(a + spread) * len, ball.y + Math.sin(a + spread) * len);
        ctx.closePath();
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = '#cfd8dc';
      ctx.lineWidth = ball.r * 0.05;
      ctx.beginPath();
      ctx.moveTo(ball.x, 0);
      ctx.lineTo(ball.x, ball.y - ball.r);
      ctx.stroke();
      ctx.save();
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
      ctx.clip();
      const tile = ball.r / 4;
      for (let y = -ball.r; y < ball.r; y += tile) {
        for (let x = -ball.r; x < ball.r; x += tile) {
          const v = 120 + 120 * Math.abs(Math.sin(t * 6 + x * 0.13 + y * 0.29));
          ctx.fillStyle = `rgb(${v},${v},${Math.min(255, v + 20)})`;
          ctx.fillRect(ball.x + x + 1, ball.y + y + 1, tile - 2, tile - 2);
        }
      }
      ctx.restore();
      for (const s of sparkles.items) {
        ctx.globalAlpha = fadeInOut(s, 0.5);
        star(ctx, s.x, s.y, s.size, s.color, 4);
      }
      ctx.restore();
    },
  };
}
