import { useEffect, useMemo, useState } from 'preact/hooks';
import type { PhotoRecord } from '../photos/repository';
import { heartOutline, heartSlots, spreadPick } from './heartLayout';

const SIZE = 400;
const OUTLINE_MS = 1600;
const PHOTO_STEP_MS = 280;

/** Final collage: the heart outline draws itself, then the day's photos pop onto it one by one. */
export function HeartCollage(props: { photos: PhotoRecord[]; runId: number; centerText?: string }) {
  const photos = useMemo(() => spreadPick([...props.photos].sort((a, b) => a.takenAt - b.takenAt)), [props.photos]);
  const urls = useMemo(() => photos.map((p) => URL.createObjectURL(p.blob)), [photos]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);
  const slots = useMemo(() => heartSlots(photos.length, SIZE), [photos.length]);
  const outline = useMemo(
    () => heartOutline(SIZE).map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ') + ' Z',
    [],
  );
  const [shown, setShown] = useState(0);
  useEffect(() => {
    setShown(0);
    let timer: number | undefined;
    const start = window.setTimeout(() => {
      timer = window.setInterval(() => {
        setShown((n) => {
          if (n + 1 >= photos.length) window.clearInterval(timer);
          return Math.min(n + 1, photos.length);
        });
      }, PHOTO_STEP_MS);
    }, OUTLINE_MS);
    return () => {
      window.clearTimeout(start);
      window.clearInterval(timer);
    };
  }, [props.runId, photos.length]);
  const complete = shown >= photos.length;

  return (
    <div class={`final-outline heart-collage ${complete ? 'complete' : ''}`} key={props.runId}>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} class="outline" role="img">
        <defs>
          {slots.map((s, i) => (
            <clipPath id={`heart-slot-${i}`} key={i}>
              <circle cx={s.x} cy={s.y} r={s.r} />
            </clipPath>
          ))}
        </defs>
        <path d={outline} class="heart-line" pathLength={1} />
        {props.centerText && (
          <text x={SIZE / 2} y={SIZE * 0.58} text-anchor="middle" dominant-baseline="middle" class="heart-center">
            {props.centerText}
          </text>
        )}
        {slots.slice(0, shown).map((s, i) => (
          <g key={photos[i].id} class="heart-photo">
            <circle cx={s.x} cy={s.y} r={s.r + 3} class="outline-ring" />
            <image
              href={urls[i]}
              x={s.x - s.r}
              y={s.y - s.r}
              width={s.r * 2}
              height={s.r * 2}
              preserveAspectRatio="xMidYMid slice"
              clip-path={`url(#heart-slot-${i})`}
            />
          </g>
        ))}
      </svg>
    </div>
  );
}
