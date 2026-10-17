import { useEffect, useState } from 'preact/hooks';
import type { Point } from '../core/types';
import type { PhotoRecord } from '../photos/repository';
import { OutlineView } from './outlineView';

const STEP_MS = 900;

/** Reveals points one by one along the outline, then closes the contour. */
export function FinalAnimation(props: { points: Point[]; mainPhotos: Map<string, PhotoRecord>; runId: number }) {
  const [revealed, setRevealed] = useState(0);
  useEffect(() => {
    setRevealed(0);
    const timer = setInterval(() => {
      setRevealed((n) => {
        if (n >= props.points.length) clearInterval(timer);
        return Math.min(n + 1, props.points.length);
      });
    }, STEP_MS);
    return () => clearInterval(timer);
  }, [props.runId, props.points.length]);
  const complete = revealed >= props.points.length;
  return (
    <div class={`final-outline ${complete ? 'complete' : ''}`}>
      <OutlineView
        points={props.points}
        stateOf={() => 'done'}
        mainPhotos={props.mainPhotos}
        hideFuture={false}
        revealed={revealed}
        size={400}
      />
    </div>
  );
}
