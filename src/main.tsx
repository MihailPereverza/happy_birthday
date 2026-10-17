import { render } from 'preact';
import './steps/index';
import '@fontsource/lobster/cyrillic-400.css';
import '@fontsource/lobster/latin-400.css';
import '@fontsource/nunito/cyrillic-400.css';
import '@fontsource/nunito/cyrillic-800.css';
import '@fontsource/nunito/latin-400.css';
import '@fontsource/nunito/latin-800.css';
import './ui/styles.css';
import { App } from './ui/App';
import { boot } from './ui/appState';
import { loadTracker } from './camera/trackerLoader';
import { t } from './ui/strings.ru';
import type { PackError } from './content/validate';

const root = document.getElementById('app')!;

function BootError({ errors }: { errors: PackError[] }) {
  return (
    <div class="boot-error">
      <h1>{t.bootError}</h1>
      <ul class="pack-errors">
        {errors.map((e, i) => (
          <li key={i}>
            <code>{e.path}</code>: {e.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Warms up FaceLandmarker in idle time so the first photo step opens with masks ready. */
function preloadTracker(): void {
  const start = () => loadTracker().catch(() => undefined);
  if ('requestIdleCallback' in window) requestIdleCallback(start, { timeout: 8000 });
  else setTimeout(start, 3000);
}

boot()
  .then((errors) => {
    if (errors) return render(<BootError errors={errors} />, root);
    render(<App />, root);
    preloadTracker();
  })
  .catch((e) => render(<BootError errors={[{ path: 'app', message: String(e) }]} />, root));
