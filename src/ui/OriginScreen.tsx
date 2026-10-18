import { useState } from 'preact/hooks';
import { freshPosition } from '../geo/watcher';
import { setOrigin, useApp } from './appState';
import { Button } from './components/common';
import { t } from './strings.ru';

// Used only when the phone gives no position at all: geo steps then open by codes or by the host.
const PLACEHOLDER_ORIGIN = { lat: 59.9386, lon: 30.3141, placeholder: true };

export function OriginScreen() {
  const app = useApp();
  const [state, setState] = useState<'idle' | 'locating' | 'denied' | 'unavailable'>('idle');
  const locate = async () => {
    setState('locating');
    const result = await freshPosition();
    if (result.ok) await setOrigin({ lat: result.fix.lat, lon: result.fix.lon });
    else setState(result.reason);
  };
  return (
    <section class="step origin">
      <div class="origin-emoji" aria-hidden>
        🎈❤️🎈
      </div>
      <h1 class="step-title center">{app.pack.quest.title}</h1>
      <p class="step-text center">
        {app.pack.quest.points.every((p) => p.relative) ? t.origin.text(app.engine.points.length) : t.origin.textFixedRoute}
      </p>
      <Button onClick={locate} disabled={state === 'locating'}>
        {state === 'locating' ? t.origin.locating : `📍 ${t.origin.locate}`}
      </Button>
      {state === 'denied' && <p class="error center">{t.geo.denied}</p>}
      {state === 'unavailable' && <p class="error center">{t.geo.unavailable}</p>}
      {(state === 'denied' || state === 'unavailable') && (
        <>
          <Button kind="secondary" onClick={locate}>
            {t.origin.retry}
          </Button>
          <Button kind="ghost" onClick={() => setOrigin(PLACEHOLDER_ORIGIN)}>
            {t.origin.withoutGps}
          </Button>
        </>
      )}
    </section>
  );
}
