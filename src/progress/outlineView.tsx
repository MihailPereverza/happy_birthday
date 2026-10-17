import { useEffect, useMemo } from 'preact/hooks';
import type { Point } from '../core/types';
import type { PhotoRecord } from '../photos/repository';
import { project } from './projection';

export type PointState = 'done' | 'current' | 'future';

export interface OutlineProps {
  points: Point[];
  stateOf: (point: Point) => PointState;
  mainPhotos: Map<string, PhotoRecord>;
  hideFuture: boolean;
  /** Number of points (in outlineOrder) revealed so far; used by the final animation. Undefined = all. */
  revealed?: number;
  onTap?: (point: Point) => void;
  size?: number;
}

function useThumbUrls(photos: Map<string, PhotoRecord>): Map<string, string> {
  const urls = useMemo(
    () => new Map([...photos].map(([pointId, p]) => [pointId, URL.createObjectURL(p.blob)])),
    [photos],
  );
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);
  return urls;
}

/** Points joined in outlineOrder into a closed contour, each passed point showing its main photo. */
export function OutlineView(props: OutlineProps) {
  const size = props.size ?? 360;
  const ordered = useMemo(() => [...props.points].sort((a, b) => a.outlineOrder - b.outlineOrder), [props.points]);
  const projected = useMemo(() => project(ordered, size, size, 40), [ordered, size]);
  const thumbs = useThumbUrls(props.mainPhotos);
  const revealed = props.revealed ?? projected.length;
  const isVisible = (p: Point, i: number) =>
    i < revealed && (!props.hideFuture || props.stateOf(p) !== 'future');
  const closed = revealed >= projected.length && projected.every((p, i) => isVisible(p, i));
  const radius = Math.max(14, Math.min(30, size / (projected.length * 1.6)));

  const segments = projected.slice(0, -1).map((a, i) => [a, projected[i + 1], i] as const);
  if (closed && projected.length > 2) segments.push([projected[projected.length - 1], projected[0], projected.length - 1]);

  return (
    <svg class="outline" viewBox={`0 0 ${size} ${size}`} role="img">
      <defs>
        {projected.map((p) => (
          <clipPath id={`clip-${p.id}`} key={p.id}>
            <circle cx={p.x} cy={p.y} r={radius} />
          </clipPath>
        ))}
      </defs>
      {segments
        .filter(([a, b, i]) => isVisible(a, i) && isVisible(b, (i + 1) % projected.length))
        .map(([a, b, i]) => (
          <line key={`seg-${i}`} class="outline-seg" x1={a.x} y1={a.y} x2={b.x} y2={b.y} pathLength={1} />
        ))}
      {projected.map((p, i) => {
        const state = props.stateOf(p);
        if (!isVisible(p, i)) return null;
        const thumb = state === 'done' ? thumbs.get(p.id) : undefined;
        return (
          <g key={p.id} class={`outline-point ${state}`} onClick={() => state === 'done' && props.onTap?.(p)}>
            <circle cx={p.x} cy={p.y} r={radius + 3} class="outline-ring" />
            {thumb ? (
              <image
                href={thumb}
                x={p.x - radius}
                y={p.y - radius}
                width={radius * 2}
                height={radius * 2}
                preserveAspectRatio="xMidYMid slice"
                clip-path={`url(#clip-${p.id})`}
              />
            ) : (
              <circle cx={p.x} cy={p.y} r={radius} class="outline-dot" />
            )}
            {!thumb && (
              <text x={p.x} y={p.y + 5} text-anchor="middle" class="outline-num">
                {p.visitOrder}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
