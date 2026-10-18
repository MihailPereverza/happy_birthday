import { useMemo, useRef, useState } from 'preact/hooks';
import { mainPhotoByPoint } from '../photos/repository';
import { FinalAnimation } from '../progress/finalAnimation';
import { useApp } from './appState';
import { Button } from './components/common';
import { RewardStrip } from './components/RewardStrip';
import { downloadAll } from './exportAll';
import { t } from './strings.ru';

export function FinalView(props: { title?: string; text?: string }) {
  const app = useApp();
  const { quest } = app.pack;
  const root = useRef<HTMLDivElement>(null);
  const [runId, setRunId] = useState(0);
  const [busy, setBusy] = useState(false);
  const mainPhotos = useMemo(() => mainPhotoByPoint(app.photos), [app.photos]);
  const image = app.pack.asset(quest.final.image);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else root.current?.requestFullscreen?.();
  };

  return (
    <div class="final" ref={root}>
      <h1 class="final-title">{props.title ?? quest.final.title}</h1>
      <FinalAnimation points={app.engine.points} mainPhotos={mainPhotos} runId={runId} />
      {image && <img class="step-image" src={image} alt="" />}
      <p class="final-text">{props.text ?? quest.final.text}</p>
      <RewardStrip quest={app.engine.quest} progress={app.engine.state} variant="card" />
      <div class="final-actions">
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await downloadAll(app).finally(() => setBusy(false));
          }}
        >
          {busy ? t.gallery.preparing : t.gallery.downloadAll}
        </Button>
        <div class="row">
          <Button kind="secondary" onClick={toggleFullscreen}>
            ⛶ {t.final.fullscreen}
          </Button>
          <Button kind="secondary" onClick={() => setRunId((n) => n + 1)}>
            ↻ {t.final.replay}
          </Button>
        </div>
      </div>
    </div>
  );
}
