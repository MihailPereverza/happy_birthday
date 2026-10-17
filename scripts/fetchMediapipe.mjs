// Copies MediaPipe WASM runtime from node_modules and downloads the FaceLandmarker model into public/,
// so the app never touches a CDN at runtime and everything is precached for offline use.
import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const wasmSrc = 'node_modules/@mediapipe/tasks-vision/wasm';
const outDir = 'public/mediapipe';

mkdirSync(join(outDir, 'wasm'), { recursive: true });
for (const file of readdirSync(wasmSrc)) {
  // Only the SIMD/no-SIMD "internal" builds are loaded by FilesetResolver.forVisionTasks.
  if (file.startsWith('vision_wasm_internal') || file.startsWith('vision_wasm_nosimd_internal')) {
    copyFileSync(join(wasmSrc, file), join(outDir, 'wasm', file));
  }
}

const modelPath = join(outDir, 'face_landmarker.task');
if (!existsSync(modelPath) || process.argv.includes('--force')) {
  const res = await fetch(MODEL_URL);
  if (!res.ok) throw new Error(`Model download failed: ${res.status}`);
  writeFileSync(modelPath, Buffer.from(await res.arrayBuffer()));
}
console.log('MediaPipe assets ready in', outDir);
