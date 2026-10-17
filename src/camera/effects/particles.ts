export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  grow: number;
  color: string;
  rot: number;
  vr: number;
  kind: string;
  /** Free slot for per-effect data (trail points, depth…). */
  data?: unknown;
}

/** Simple particle bag in frame pixels; gravity and drag are per call so one bag can host several behaviours. */
export class Particles {
  items: Particle[] = [];

  constructor(private readonly max = 600) {}

  add(p: Omit<Particle, 'life' | 'rot' | 'vr' | 'grow'> & Partial<Pick<Particle, 'rot' | 'vr' | 'grow'>>): void {
    if (this.items.length >= this.max) this.items.shift();
    this.items.push({ rot: 0, vr: 0, grow: 0, ...p, life: 0 });
  }

  step(dt: number, gravity = 0, drag = 0): void {
    const k = Math.pow(1 - drag, dt * 60);
    for (const p of this.items) {
      p.life += dt;
      p.vy += gravity * dt;
      p.vx *= k;
      p.vy *= k;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      p.size = Math.max(0, p.size + p.grow * dt);
    }
    this.items = this.items.filter((p) => p.life < p.maxLife);
  }
}

/** 0 → 1 → 0 over a particle's life, for fading in and out. */
export const fadeInOut = (p: Particle, edge = 0.15): number => {
  const t = p.life / p.maxLife;
  return Math.min(1, t / edge, (1 - t) / edge);
};
