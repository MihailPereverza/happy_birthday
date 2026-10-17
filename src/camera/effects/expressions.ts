import type { FaceData, Pt } from './face';
import { fillHeart, glow, outlinedText, PARTY, pick, rand, RAINBOW, star } from './draw';
import { fadeInOut, Particles } from './particles';
import type { Effect, EffectEnv } from './types';

const rotate = (v: Pt, a: number): Pt => ({ x: v.x * Math.cos(a) - v.y * Math.sin(a), y: v.x * Math.sin(a) + v.y * Math.cos(a) });
const down = (f: FaceData): Pt => ({ x: -f.up.x, y: -f.up.y });

/** Snapchat-style rainbow pouring out of an open mouth. */
export function rainbow(): Effect {
  interface Drop { x: number; y: number; vx: number; vy: number; age: number; seg: number; width: number }
  let drops: Drop[] = [];
  const segs: number[] = [];
  const open: boolean[] = [];
  const sparkles = new Particles(200);
  return {
    update({ faces, H }, dt) {
      faces.forEach((f, i) => {
        const isOpen = f.jawOpen > 0.28;
        if (isOpen && !open[i]) segs[i] = Math.random();
        open[i] = isOpen;
        if (!isOpen) return;
        const d = down(f);
        const speed = f.eyeDist * 3.5;
        drops.push({ x: f.mouth.x, y: f.mouth.y, vx: d.x * speed, vy: d.y * speed, age: 0, seg: segs[i], width: f.eyeDist * (0.5 + f.jawOpen * 0.6) });
        if (Math.random() < 0.5) {
          sparkles.add({ x: f.mouth.x + rand(-1, 1) * f.eyeDist * 0.4, y: f.mouth.y, vx: rand(-1, 1) * f.eyeDist, vy: d.y * speed * 0.8, maxLife: 1.2, size: f.eyeDist * 0.12, color: '#ffffff', kind: 'star' });
        }
      });
      const g = (faces[0]?.eyeDist ?? H * 0.1) * 9;
      for (const p of drops) {
        p.age += dt;
        p.vy += g * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
      drops = drops.filter((p) => p.age < 3 && p.y < H * 1.3);
      sparkles.step(dt, g * 0.4);
    },
    draw(ctx) {
      const bySeg = new Map<number, Drop[]>();
      drops.forEach((d) => bySeg.set(d.seg, [...(bySeg.get(d.seg) ?? []), d]));
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const line of bySeg.values()) {
        if (line.length < 2) continue;
        RAINBOW.forEach((color, band) => {
          ctx.beginPath();
          line.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
          ctx.strokeStyle = color;
          ctx.lineWidth = line[line.length - 1].width * (1 - band / RAINBOW.length);
          ctx.stroke();
        });
      }
      for (const s of sparkles.items) {
        ctx.globalAlpha = fadeInOut(s);
        star(ctx, s.x, s.y, s.size, s.color);
      }
      ctx.restore();
    },
  };
}

/** Pucker → hearts fly out of the lips; permanent blush. */
export function kiss(): Effect {
  const hearts = new Particles(150);
  let cooldown = 0;
  return {
    update({ faces }, dt) {
      cooldown -= dt;
      for (const f of faces) {
        if (f.pucker < 0.35 || cooldown > 0) continue;
        const dir = rotate(f.up, rand(-1.1, 1.1));
        hearts.add({ x: f.mouth.x, y: f.mouth.y, vx: dir.x * f.eyeDist * 1.8, vy: dir.y * f.eyeDist * 1.8, maxLife: 1.8, size: f.eyeDist * 0.25, grow: f.eyeDist * 0.5, color: pick(['#ff1744', '#ff4081', '#f50057', '#ff80ab']), kind: 'heart' });
      }
      if (faces.some((f) => f.pucker >= 0.35) && cooldown <= 0) cooldown = 0.11;
      hearts.step(dt, 0, 0.01);
    },
    draw(ctx, { faces }) {
      ctx.save();
      for (const f of faces) {
        for (const c of [f.cheekL, f.cheekR]) glow(ctx, c.x, c.y + f.eyeDist * 0.1, f.eyeDist * 0.32, 'rgba(255,64,129,0.5)');
      }
      for (const h of hearts.items) {
        ctx.globalAlpha = fadeInOut(h);
        fillHeart(ctx, h.x, h.y, h.size, h.color);
      }
      ctx.restore();
    },
  };
}

/** Meme laser eyes: glowing eyes, beams fire while eyebrows are raised. */
export function laserEyes(): Effect {
  let power = 0;
  const sparks = new Particles(300);
  return {
    update({ faces }, dt) {
      const firing = faces.some((f) => f.browUp > 0.3 || f.jawOpen > 0.55);
      power += ((firing ? 1 : 0) - power) * Math.min(1, dt * 10);
      if (power < 0.3) return sparks.step(dt);
      for (const f of faces) {
        for (const eye of [f.eyeL, f.eyeR]) {
          sparks.add({ x: eye.x, y: eye.y, vx: rand(-1, 1) * f.eyeDist * 3, vy: rand(-1, 1) * f.eyeDist * 3, maxLife: 0.4, size: f.eyeDist * 0.06, color: pick(['#ffffff', '#ff80ab', '#ffd54f']), kind: 'spark' });
        }
      }
      sparks.step(dt);
    },
    draw(ctx, { faces, t, W, H }) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const len = Math.hypot(W, H) * 1.2;
      for (const f of faces) {
        [f.eyeL, f.eyeR].forEach((eye, i) => {
          glow(ctx, eye.x, eye.y, f.eyeDist * (0.3 + 0.08 * Math.sin(t * 12)), 'rgba(255,40,120,0.9)');
          if (power < 0.05) return;
          const outward = { x: (eye.x - f.bridge.x) / f.eyeDist, y: (eye.y - f.bridge.y) / f.eyeDist };
          const dir = rotate(down(f), (i ? -1 : 1) * 0.6 + Math.sin(t * 3 + i) * 0.08);
          const d = { x: dir.x + outward.x * 0.6, y: dir.y + outward.y * 0.6 };
          const n = Math.hypot(d.x, d.y);
          const end = { x: eye.x + (d.x / n) * len * power, y: eye.y + (d.y / n) * len * power };
          for (const [width, color] of [[0.45, 'rgba(255,0,90,0.35)'], [0.22, 'rgba(255,60,140,0.8)'], [0.08, 'rgba(255,255,255,0.95)']] as const) {
            ctx.beginPath();
            ctx.moveTo(eye.x, eye.y);
            ctx.lineTo(end.x, end.y);
            ctx.lineWidth = f.eyeDist * width;
            ctx.lineCap = 'round';
            ctx.strokeStyle = color;
            ctx.stroke();
          }
        });
      }
      for (const s of sparks.items) {
        ctx.globalAlpha = fadeInOut(s);
        star(ctx, s.x, s.y, s.size * 2, s.color);
      }
      ctx.restore();
    },
  };
}

/** Party horn in the mouth: curled up when closed, unrolls as the mouth opens. */
export function partyHorn(): Effect {
  const ext: number[] = [];
  const confetti = new Particles(300);
  const tooted: boolean[] = [];
  return {
    update({ faces }, dt) {
      faces.forEach((f, i) => {
        const target = Math.min(1, Math.max(0, (f.jawOpen - 0.08) * 2.2));
        ext[i] = (ext[i] ?? 0) + (target - (ext[i] ?? 0)) * Math.min(1, dt * 12);
        if (ext[i] > 0.85 && !tooted[i]) {
          tooted[i] = true;
          const tip = hornPath(f, ext[i]).at(-1)!;
          for (let k = 0; k < 40; k += 1) {
            confetti.add({ x: tip.x, y: tip.y, vx: rand(-1, 1) * f.eyeDist * 4, vy: rand(-1, 0.6) * f.eyeDist * 4, maxLife: 1.4, size: f.eyeDist * 0.1, color: pick(PARTY), kind: 'rect', vr: rand(-8, 8) });
          }
        }
        if (ext[i] < 0.5) tooted[i] = false;
      });
      confetti.step(dt, (faces[0]?.eyeDist ?? 100) * 6, 0.02);
    },
    draw(ctx, { faces }) {
      ctx.save();
      faces.forEach((f, i) => {
        const e = ext[i] ?? 0;
        const path = hornPath(f, e);
        const w = f.eyeDist * 0.2;
        ctx.lineCap = 'round';
        for (let k = 1; k < path.length; k += 1) {
          ctx.beginPath();
          ctx.moveTo(path[k - 1].x, path[k - 1].y);
          ctx.lineTo(path[k].x, path[k].y);
          ctx.lineWidth = w * (1 + (k / path.length) * 0.6);
          ctx.strokeStyle = Math.floor(k / 3) % 2 ? '#ffd54f' : '#e91e63';
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(f.mouth.x, f.mouth.y, w * 0.8, 0, Math.PI * 2);
        ctx.fillStyle = '#ffb300';
        ctx.fill();
        if (e > 0.85) {
          const tip = path[path.length - 1];
          outlinedText(ctx, 'ТУУУ!', tip.x, tip.y - f.eyeDist * 0.6, f.eyeDist * 0.6, '#e91e63');
        }
      });
      for (const c of confetti.items) {
        ctx.save();
        ctx.globalAlpha = fadeInOut(c);
        ctx.translate(c.x, c.y);
        ctx.rotate(c.rot);
        ctx.fillStyle = c.color;
        ctx.fillRect(-c.size, -c.size / 2, c.size * 2, c.size);
        ctx.restore();
      }
      ctx.restore();
    },
  };
}

function hornPath(f: FaceData, ext: number): Pt[] {
  const n = 36;
  const length = f.eyeDist * (0.7 + ext * 2.8);
  let heading = Math.atan2(f.right.y, f.right.x) + 0.45;
  const curl = (1 - ext) * Math.PI * 3.2;
  const pts: Pt[] = [{ ...f.mouth }];
  for (let i = 1; i <= n; i += 1) {
    heading += (curl / n) * Math.pow(i / n, 1.6) * 2.5;
    const last = pts[pts.length - 1];
    pts.push({ x: last.x + Math.cos(heading) * (length / n), y: last.y + Math.sin(heading) * (length / n) });
  }
  return pts;
}

/** Dragon: fire (with confetti) bursts out of an open mouth. */
export function dragon(): Effect {
  const flames = new Particles(700);
  return {
    update({ faces }, dt) {
      for (const f of faces) {
        if (f.jawOpen < 0.28) continue;
        for (let k = 0; k < 7; k += 1) {
          const dir = rotate(down(f), rand(-0.45, 0.45));
          const speed = f.eyeDist * rand(3.5, 6.5);
          const confetti = Math.random() < 0.12;
          flames.add({ x: f.mouth.x, y: f.mouth.y, vx: dir.x * speed, vy: dir.y * speed, maxLife: confetti ? 1.4 : rand(0.5, 0.8), size: f.eyeDist * (confetti ? 0.09 : 0.22), grow: confetti ? 0 : f.eyeDist * 1.4, color: confetti ? pick(PARTY) : '', kind: confetti ? 'confetti' : 'flame', vr: rand(-8, 8) });
        }
      }
      flames.step(dt, -(faces[0]?.eyeDist ?? 100) * 2.5, 0.03);
    },
    draw(ctx) {
      ctx.save();
      for (const p of flames.items) {
        const k = p.life / p.maxLife;
        if (p.kind === 'confetti') {
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = 1 - k;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.size, -p.size / 2, p.size * 2, p.size);
          ctx.restore();
          continue;
        }
        ctx.globalCompositeOperation = k > 0.7 ? 'source-over' : 'lighter';
        ctx.globalAlpha = (1 - k) * 0.9;
        const color = k < 0.2 ? 'rgba(255,250,200,1)' : k < 0.45 ? 'rgba(255,190,40,1)' : k < 0.7 ? 'rgba(255,80,20,1)' : 'rgba(90,80,80,0.6)';
        glow(ctx, p.x, p.y, p.size, color);
      }
      ctx.restore();
    },
  };
}

/** Tears of joy: two fountains from the eyes, stronger when smiling. */
export function happyTears(): Effect {
  const drops = new Particles(500);
  let acc = 0;
  return {
    update({ faces }, dt) {
      for (const f of faces) {
        acc += dt * (14 + f.smile * 40);
        while (acc > 1) {
          acc -= 1;
          [f.lidL, f.lidR].forEach((lid, side) => {
            const out = side ? 1 : -1;
            const speed = f.eyeDist * rand(1.8, 3.2);
            drops.add({ x: lid.x, y: lid.y, vx: f.right.x * out * speed + f.up.x * speed * 0.9, vy: f.right.y * out * speed + f.up.y * speed * 0.9, maxLife: 1.6, size: f.eyeDist * rand(0.07, 0.12), color: '#4fc3f7', kind: 'drop' });
          });
        }
      }
      drops.step(dt, (faces[0]?.eyeDist ?? 100) * 11);
    },
    draw(ctx) {
      ctx.save();
      for (const d of drops.items) {
        const a = Math.atan2(d.vy, d.vx) - Math.PI / 2;
        ctx.globalAlpha = Math.min(1, (d.maxLife - d.life) * 3);
        ctx.save();
        ctx.translate(d.x, d.y);
        ctx.rotate(a);
        ctx.beginPath();
        ctx.arc(0, 0, d.size, 0, Math.PI);
        ctx.lineTo(0, -d.size * 2.4);
        ctx.closePath();
        ctx.fillStyle = 'rgba(79,195,247,0.9)';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(-d.size * 0.3, d.size * 0.1, d.size * 0.3, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();
    },
  };
}

export type { EffectEnv };
