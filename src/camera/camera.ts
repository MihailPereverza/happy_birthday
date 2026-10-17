export type Facing = 'user' | 'environment';

/**
 * Phone sensors are 4:3; asking for 16:9 makes the camera crop the sensor. 1920×1440 keeps the whole field of view
 * and stays light enough to redraw with effects every frame. resizeMode "none" stops Chrome from cropping a native
 * format to match the requested size exactly.
 */
export async function openCamera(facing: Facing, deviceId?: string): Promise<MediaStream> {
  const size = {
    width: { ideal: 1920 },
    height: { ideal: 1440 },
    frameRate: { ideal: 30 },
    resizeMode: 'none',
  } as MediaTrackConstraints;
  const video: MediaTrackConstraints = deviceId ? { deviceId: { exact: deviceId }, ...size } : { facingMode: { ideal: facing }, ...size };
  return navigator.mediaDevices.getUserMedia({ audio: false, video });
}

export function stopStream(stream: MediaStream | null | undefined): void {
  stream?.getTracks().forEach((t) => t.stop());
}

export async function attachStream(video: HTMLVideoElement, stream: MediaStream): Promise<void> {
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  await video.play();
  if (!video.videoWidth) {
    await new Promise<void>((resolve) => video.addEventListener('loadedmetadata', () => resolve(), { once: true }));
  }
}

export interface ZoomRange {
  min: number;
  max: number;
}

/** Optical/digital zoom of the track; on phones with a logical multi-camera min < 1 means the ultra-wide lens. */
export function zoomRange(track: MediaStreamTrack | undefined): ZoomRange | null {
  const caps = track?.getCapabilities?.() as (MediaTrackCapabilities & { zoom?: { min: number; max: number } }) | undefined;
  return caps?.zoom && caps.zoom.max > caps.zoom.min ? { min: caps.zoom.min, max: caps.zoom.max } : null;
}

export async function setZoom(track: MediaStreamTrack, zoom: number): Promise<void> {
  await track.applyConstraints({ advanced: [{ zoom } as MediaTrackConstraintSet] });
}

/** Zoom stops like the system camera: ultra-wide (if any), 1×, 2×, 5×. */
export function zoomStops(range: ZoomRange): number[] {
  const stops = [range.min < 1 ? range.min : null, 1, 2, 5].filter(
    (z): z is number => z !== null && z >= range.min - 1e-6 && z <= range.max + 1e-6,
  );
  return [...new Set(stops)];
}

export interface Lens {
  deviceId: string;
  label: string;
}

/** Cameras facing the same way; Chrome on Android labels them "camera2 N, facing back|front". */
export async function lensesFor(facing: Facing): Promise<Lens[]> {
  const devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
  const want = facing === 'user' ? /front|user|фронт/i : /back|rear|environment|задн/i;
  const matching = devices.filter((d) => want.test(d.label));
  return matching.map((d, i) => ({ deviceId: d.deviceId, label: `${i + 1}` }));
}

export const formatZoom = (z: number): string => `${Number.isInteger(z) ? z : z.toFixed(1).replace(/\.0$/, '')}×`;
