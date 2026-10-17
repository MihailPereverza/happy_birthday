import { useMemo } from 'preact/hooks';
import type { Point } from '../core/types';
import { mainPhotoByPoint } from '../photos/repository';
import { OutlineView, type PointState } from '../progress/outlineView';
import { useApp } from './appState';
import { navigate } from './router';
import { t } from './strings.ru';

export function ProgressScreen() {
  const app = useApp();
  const { engine, pack } = app;
  const mainPhotos = useMemo(() => mainPhotoByPoint(app.photos), [app.photos]);
  const currentId = engine.current?.point.id;
  const stateOf = (p: Point): PointState => (engine.isPointDone(p.id) ? 'done' : p.id === currentId ? 'current' : 'future');
  const hideFuture = pack.quest.settings.hideFuturePoints ?? true;

  return (
    <section class="progress-screen">
      <h1 class="step-title">{t.progress.title}</h1>
      <OutlineView
        points={engine.points}
        stateOf={stateOf}
        mainPhotos={mainPhotos}
        hideFuture={hideFuture}
        onTap={(p) => navigate(`gallery/${p.id}`)}
      />
      <ol class="point-list">
        {engine.points
          .filter((p) => !hideFuture || stateOf(p) !== 'future')
          .map((p) => (
            <li key={p.id} class={`point-row ${stateOf(p)}`} onClick={() => stateOf(p) === 'done' && navigate(`gallery/${p.id}`)}>
              <span class="point-num">{p.visitOrder}</span>
              <span>{p.name}</span>
              {stateOf(p) === 'current' && <small class="badge">{t.progress.current}</small>}
            </li>
          ))}
      </ol>
    </section>
  );
}
