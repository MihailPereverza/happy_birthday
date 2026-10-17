const COLORS = ['#ff4081', '#ffd54f', '#7c4dff', '#40c4ff', '#69f0ae', '#ff6e40', '#ffffff'];

interface Piece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  rot: number;
  vr: number;
  shape: 'rect' | 'heart' | 'circle';
}

let canvas: HTMLCanvasElement | null = null;
let pieces: Piece[] = [];
let raf = 0;

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function ensureCanvas(): CanvasRenderingContext2D {
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.className = 'confetti-canvas';
    document.body.appendChild(canvas);
  }
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

function drawHeart(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.beginPath();
  ctx.moveTo(0, s * 0.3);
  ctx.bezierCurveTo(-s, -s * 0.3, -s * 0.4, -s, 0, -s * 0.45);
  ctx.bezierCurveTo(s * 0.4, -s, s, -s * 0.3, 0, s * 0.3);
  ctx.fill();
}

function frame(ctx: CanvasRenderingContext2D): void {
  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  pieces = pieces.filter((p) => p.y < window.innerHeight + 40);
  for (const p of pieces) {
    p.vy += 0.18;
    p.vx *= 0.99;
    p.x += p.vx;
    p.y += p.vy;
    p.rot += p.vr;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.fillStyle = p.color;
    if (p.shape === 'heart') drawHeart(ctx, p.size);
    else if (p.shape === 'circle') {
      ctx.beginPath();
      ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
      ctx.fill();
    } else ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
    ctx.restore();
  }
  if (pieces.length) {
    raf = requestAnimationFrame(() => frame(ctx));
    return;
  }
  canvas?.remove();
  canvas = null;
}

/** Fires a burst of confetti from (x, y) in viewport fractions. */
export function confetti(options: { count?: number; x?: number; y?: number; spread?: number } = {}): void {
  if (reducedMotion()) return;
  const { count = 80, x = 0.5, y = 0.35, spread = 1 } = options;
  const ctx = ensureCanvas();
  for (let i = 0; i < count; i += 1) {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * spread;
    const speed = 6 + Math.random() * 8;
    pieces.push({
      x: x * window.innerWidth,
      y: y * window.innerHeight,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 7 + Math.random() * 8,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      shape: (['rect', 'heart', 'circle'] as const)[Math.floor(Math.random() * 3)],
    });
  }
  cancelAnimationFrame(raf);
  frame(ctx);
}

export const smallCelebration = (): void => confetti({ count: 60, y: 0.45, spread: 0.8 });

export function bigCelebration(): void {
  confetti({ count: 120, x: 0.2, y: 0.6, spread: 0.6 });
  setTimeout(() => confetti({ count: 120, x: 0.8, y: 0.6, spread: 0.6 }), 250);
  setTimeout(() => confetti({ count: 140, x: 0.5, y: 0.4, spread: 1.2 }), 550);
}
