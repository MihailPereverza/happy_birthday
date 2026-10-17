import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { blendFrom, type FaceResult } from './effects/face';

const BASE = import.meta.env.BASE_URL;
let loading: Promise<FaceLandmarker> | null = null;

async function create(delegate: 'GPU' | 'CPU'): Promise<FaceLandmarker> {
  // Model and WASM ship inside the app (public/mediapipe) so tracking works offline.
  const fileset = await FilesetResolver.forVisionTasks(`${BASE}mediapipe/wasm`);
  return FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: `${BASE}mediapipe/face_landmarker.task`, delegate },
    runningMode: 'VIDEO',
    numFaces: 2,
    // Expression scores (open mouth, pucker, raised brows…) drive the interactive effects.
    outputFaceBlendshapes: true,
    minFaceDetectionConfidence: 0.5,
    minFacePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
}

export interface FaceTracker {
  detect(source: HTMLVideoElement | HTMLCanvasElement): FaceResult[];
}

let lastTimestamp = 0;

function wrap(landmarker: FaceLandmarker): FaceTracker {
  return {
    detect(source) {
      // detectForVideo requires strictly increasing timestamps.
      const now = Math.max(performance.now(), lastTimestamp + 1);
      lastTimestamp = now;
      const result = landmarker.detectForVideo(source, now);
      return (result.faceLandmarks ?? []).map((landmarks, i) => ({
        landmarks,
        blend: blendFrom(result.faceBlendshapes?.[i]?.categories),
      }));
    },
  };
}

/** Lazily creates one shared landmarker; GPU first, CPU if WebGL is unavailable on the phone. */
export function loadFaceTracker(): Promise<FaceTracker> {
  loading ??= create('GPU').catch(() => create('CPU'));
  loading.catch(() => {
    loading = null;
  });
  return loading.then(wrap);
}
