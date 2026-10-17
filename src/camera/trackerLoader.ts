import type { FaceTracker } from './faceTracker';

export type { FaceTracker } from './faceTracker';
export type { FaceResult } from './effects/face';

/** MediaPipe is a large chunk: it is fetched only when the camera (or idle-time warm-up) needs it. */
export const loadTracker = (): Promise<FaceTracker> => import('./faceTracker').then((m) => m.loadFaceTracker());
