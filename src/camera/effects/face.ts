import type { Category, NormalizedLandmark } from '@mediapipe/tasks-vision';

export interface Pt {
  x: number;
  y: number;
}

/** Raw tracker output for one face: normalized landmarks + expression scores (0..1). */
export interface FaceResult {
  landmarks: NormalizedLandmark[];
  blend: Record<string, number>;
}

/** One face in frame pixels (already mirrored for the selfie preview), ready for effects. */
export interface FaceData {
  pts: Pt[];
  eyeL: Pt;
  eyeR: Pt;
  lidL: Pt;
  lidR: Pt;
  cheekL: Pt;
  cheekR: Pt;
  mouth: Pt;
  mouthL: Pt;
  mouthR: Pt;
  nose: Pt;
  bridge: Pt;
  forehead: Pt;
  chin: Pt;
  eyeDist: number;
  faceHeight: number;
  angle: number;
  /** Unit vector from chin towards forehead. */
  up: Pt;
  /** Unit vector to the viewer's right along the eye line. */
  right: Pt;
  oval: Pt[];
  jawOpen: number;
  smile: number;
  pucker: number;
  browUp: number;
  blink: number;
}

// MediaPipe Face Mesh topology (478 points incl. irises).
export const FACE_OVAL = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136,
  172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109,
];
const IDX = {
  irisA: 468, irisB: 473, outerA: 33, outerB: 263, lidA: 145, lidB: 374, cheekA: 50, cheekB: 280,
  lipTop: 13, lipBottom: 14, cornerA: 61, cornerB: 291, noseTip: 1, bridge: 168, forehead: 10, chin: 152,
};

export const blendFrom = (categories: Category[] | undefined): Record<string, number> =>
  Object.fromEntries((categories ?? []).map((c) => [c.categoryName, c.score]));

const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
export const lerpPt = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
export const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);
const byX = (a: Pt, b: Pt): [Pt, Pt] => (a.x <= b.x ? [a, b] : [b, a]);

export function buildFace(face: FaceResult, width: number, height: number, mirrored: boolean): FaceData {
  const pts = face.landmarks.map((p) => ({ x: (mirrored ? 1 - p.x : p.x) * width, y: p.y * height }));
  const at = (i: number) => pts[i] ?? pts[0];
  const [outerL, outerR] = byX(at(IDX.outerA), at(IDX.outerB));
  const [eyeL, eyeR] = pts.length > 473 ? byX(at(IDX.irisA), at(IDX.irisB)) : [outerL, outerR];
  const [lidL, lidR] = byX(at(IDX.lidA), at(IDX.lidB));
  const [cheekL, cheekR] = byX(at(IDX.cheekA), at(IDX.cheekB));
  const [mouthL, mouthR] = byX(at(IDX.cornerA), at(IDX.cornerB));
  const eyeDist = Math.max(1, dist(outerL, outerR));
  const angle = Math.atan2(outerR.y - outerL.y, outerR.x - outerL.x);
  const right = { x: Math.cos(angle), y: Math.sin(angle) };
  const b = face.blend;
  return {
    pts, eyeL, eyeR, lidL, lidR, cheekL, cheekR, mouthL, mouthR,
    mouth: mid(at(IDX.lipTop), at(IDX.lipBottom)),
    nose: at(IDX.noseTip),
    bridge: at(IDX.bridge),
    forehead: at(IDX.forehead),
    chin: at(IDX.chin),
    eyeDist,
    faceHeight: dist(at(IDX.forehead), at(IDX.chin)),
    angle,
    right,
    up: { x: right.y, y: -right.x },
    oval: FACE_OVAL.map(at),
    jawOpen: b.jawOpen ?? 0,
    smile: ((b.mouthSmileLeft ?? 0) + (b.mouthSmileRight ?? 0)) / 2,
    pucker: Math.max(b.mouthPucker ?? 0, b.mouthFunnel ?? 0),
    browUp: Math.max(b.browInnerUp ?? 0, ((b.eyeWideLeft ?? 0) + (b.eyeWideRight ?? 0)) / 2),
    blink: ((b.eyeBlinkLeft ?? 0) + (b.eyeBlinkRight ?? 0)) / 2,
  };
}

/** EMA over landmarks and expression scores per face slot; snaps when another face took the slot. */
export class FaceSmoother {
  private prev: FaceResult[] = [];

  smooth(faces: FaceResult[], alpha = 0.5): FaceResult[] {
    const out = faces.map((face, i) => {
      const q = this.prev[i];
      if (!q || q.landmarks.length !== face.landmarks.length) return face;
      const jump = Math.hypot(face.landmarks[1].x - q.landmarks[1].x, face.landmarks[1].y - q.landmarks[1].y);
      if (jump > 0.08) return face;
      const lerp = (a: number, b: number) => b + (a - b) * alpha;
      return {
        landmarks: face.landmarks.map((p, k) => ({ ...p, x: lerp(p.x, q.landmarks[k].x), y: lerp(p.y, q.landmarks[k].y) })),
        blend: Object.fromEntries(Object.entries(face.blend).map(([k, v]) => [k, lerp(v, q.blend[k] ?? v)])),
      };
    });
    this.prev = out;
    return out;
  }
}
