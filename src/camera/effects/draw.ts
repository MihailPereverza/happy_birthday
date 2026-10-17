import type { Pt } from './face';

export const PARTY = ['#ff4081', '#ffd54f', '#7c4dff', '#40c4ff', '#69f0ae', '#ff6e40', '#ffffff'];
export const RAINBOW = ['#ff1744', '#ff9100', '#ffea00', '#00e676', '#2979ff', '#d500f9'];

export const pick = <T>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)];
export const rand = (a: number, b: number): number => a + Math.random() * (b - a);

export function heartPath(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  const s = size / 2;
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.9);
  ctx.bezierCurveTo(x - s * 1.6, y - s * 0.1, x - s * 0.8, y - s * 1.3, x, y - s * 0.45);
  ctx.bezierCurveTo(x + s * 0.8, y - s * 1.3, x + s * 1.6, y - s * 0.1, x, y + s * 0.9);
  ctx.closePath();
}

export function fillHeart(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string): void {
  heartPath(ctx, x, y, size);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x - size * 0.22, y - size * 0.18, size * 0.1, size * 0.06, -0.6, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fill();
}

export function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, points = 4): void {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i += 1) {
    const rr = i % 2 ? r * 0.28 : r;
    const a = (i * Math.PI) / points - Math.PI / 2;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

export function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

export function polygon(ctx: CanvasRenderingContext2D, pts: Pt[]): void {
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
}

/** Round party balloon with shine, knot and a wavy string of `stringLen`. */
export function balloon(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, stringLen: number, t: number): void {
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = Math.max(1, r * 0.04);
  ctx.beginPath();
  ctx.moveTo(x, y + r * 1.15);
  for (let i = 1; i <= 12; i += 1) {
    const k = i / 12;
    ctx.lineTo(x + Math.sin(t * 3 + k * 6) * r * 0.15, y + r * 1.15 + k * stringLen);
  }
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(x, y, r * 0.86, r, 0, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x - r * 0.12, y + r * 1.15);
  ctx.lineTo(x + r * 0.12, y + r * 1.15);
  ctx.lineTo(x, y + r * 0.97);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x - r * 0.32, y - r * 0.38, r * 0.16, r * 0.28, -0.5, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fill();
  ctx.restore();
}

/** Text with a thick outline, readable over any photo. */
export function outlinedText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, fill: string, stroke = '#ffffff'): void {
  ctx.save();
  ctx.font = `${size}px Lobster, 'Nunito', sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = size * 0.18;
  ctx.strokeStyle = stroke;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
  ctx.restore();
}
