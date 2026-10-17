import type { PhotoRecord } from './repository';

const pad = (n: number, width = 2): string => String(n).padStart(width, '0');

/** `NN_<pointId>_<HHMM>.jpg`, NN being the point's visitOrder. */
export function photoFileName(visitOrder: number, pointId: string, takenAt: number): string {
  const d = new Date(takenAt);
  return `${pad(visitOrder)}_${pointId}_${pad(d.getHours())}${pad(d.getMinutes())}.jpg`;
}

/** Chrome on Android drops `<a download>` files into Downloads, where the Gallery picks them up. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function sharePhoto(photo: PhotoRecord, fileName: string): Promise<'shared' | 'unsupported' | 'cancelled'> {
  const file = new File([photo.blob], fileName, { type: 'image/jpeg' });
  if (!navigator.canShare?.({ files: [file] })) return 'unsupported';
  try {
    await navigator.share({ files: [file] });
    return 'shared';
  } catch {
    return 'cancelled';
  }
}
