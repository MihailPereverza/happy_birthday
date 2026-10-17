export type Facing = 'user' | 'environment';

export async function openCamera(facing: Facing): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } },
  });
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
