import { useEffect, useState } from 'preact/hooks';
import { AdminPanel } from '../admin/panel';
import { PinDialog } from '../admin/PinDialog';
import { useLongPress, useTripleTap } from '../admin/gestures';
import { logEvent } from '../core/log';
import { useApp } from './appState';
import { ToastHost } from './components/common';
import { GalleryScreen } from './GalleryScreen';
import { PlayScreen } from './PlayScreen';
import { ProgressScreen } from './ProgressScreen';
import { applyUpdate, onUpdateReady } from './pwa';
import { navigate, useRoute } from './router';
import { t } from './strings.ru';

type PinPurpose = 'panel' | 'skip';

function Logo() {
  return (
    <svg class="logo-icon" viewBox="0 0 512 512" aria-hidden>
      <path d="M256 430 C 120 330 70 260 70 190 C 70 130 115 90 168 90 C 205 90 236 110 256 145 C 276 110 307 90 344 90 C 397 90 442 130 442 190 C 442 260 392 330 256 430 Z" />
    </svg>
  );
}

function UpdateBanner() {
  const [ready, setReady] = useState(false);
  useEffect(() => onUpdateReady(setReady), []);
  if (!ready) return null;
  return (
    <div class="update-banner">
      {t.updateReady}
      <button type="button" class="link" onClick={() => applyUpdate()}>
        {t.updateNow}
      </button>
    </div>
  );
}

export function App() {
  const app = useApp();
  const route = useRoute();
  const [pinFor, setPinFor] = useState<PinPurpose | null>(null);
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const logoPress = useLongPress(() => setPinFor('panel'));
  const cornerTap = useTripleTap(() => app.engine.current && setPinFor('skip'));
  const [screen, param] = route.split('/');

  const onPinSuccess = async () => {
    const purpose = pinFor;
    setPinFor(null);
    if (purpose === 'skip') {
      await app.engine.completeStep(undefined, 'gesture');
      return;
    }
    logEvent({ type: 'admin_opened' });
    setAdminUnlocked(true);
    navigate('admin');
  };

  const showAdmin = screen === 'admin' && adminUnlocked;
  return (
    <div class="app">
      <header class="header">
        <button type="button" class="logo" {...logoPress} aria-label={t.appName}>
          <Logo />
        </button>
        <span class="header-title">{app.pack.quest.title}</span>
      </header>
      {/* Invisible top-right hot zone for the host's quick skip; kept above everything incl. the camera. */}
      <div class="corner-zone" onClick={cornerTap} />
      <UpdateBanner />
      <main class="content">
        {showAdmin ? (
          <AdminPanel
            onExit={() => {
              setAdminUnlocked(false);
              navigate('play');
            }}
          />
        ) : screen === 'map' ? (
          <ProgressScreen />
        ) : screen === 'gallery' ? (
          <GalleryScreen pointId={param} />
        ) : (
          <PlayScreen />
        )}
      </main>
      {!showAdmin && (
        <nav class="tabbar">
          {(
            [
              ['play', '❤️', t.nav.play],
              ['map', '🗺️', t.nav.progress],
              ['gallery', '📷', t.nav.gallery],
            ] as const
          ).map(([id, icon, label]) => (
            <a key={id} href={`#/${id}`} class={`tab ${screen === id || (id === 'play' && !['map', 'gallery'].includes(screen)) ? 'active' : ''}`}>
              <span>{icon}</span>
              <small>{label}</small>
            </a>
          ))}
        </nav>
      )}
      {pinFor && <PinDialog settings={app.pack.quest.settings} onSuccess={onPinSuccess} onCancel={() => setPinFor(null)} />}
      <ToastHost />
    </div>
  );
}
