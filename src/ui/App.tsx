import { useEffect, useRef, useState } from 'preact/hooks';
import { AdminPanel } from '../admin/panel';
import { PinDialog } from '../admin/PinDialog';
import { useLongPress, useTripleTap } from '../admin/gestures';
import { logEvent } from '../core/log';
import { collectedRewards, questRewards } from '../core/rewards';
import { needsOrigin, useApp, type AppState } from './appState';
import { toast, ToastHost } from './components/common';
import { RewardStrip } from './components/RewardStrip';
import { bigCelebration, smallCelebration } from './confetti';
import { OriginScreen } from './OriginScreen';
import { GalleryScreen } from './GalleryScreen';
import { PlayScreen } from './PlayScreen';
import { ProgressScreen } from './ProgressScreen';
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

const BALLOONS = [
  { left: '6%', delay: '0s', duration: '19s', emoji: '🎈' },
  { left: '28%', delay: '7s', duration: '23s', emoji: '🎉' },
  { left: '52%', delay: '3s', duration: '21s', emoji: '🎈' },
  { left: '74%', delay: '11s', duration: '25s', emoji: '💝' },
  { left: '90%', delay: '5s', duration: '20s', emoji: '🎈' },
];

function BalloonsBackground() {
  return (
    <div class="balloons-bg" aria-hidden>
      {BALLOONS.map((b, i) => (
        <span key={i} style={{ left: b.left, animationDelay: b.delay, animationDuration: b.duration }}>
          {b.emoji}
        </span>
      ))}
    </div>
  );
}

/** Confetti and a cheer whenever a step is passed (by answer or by the host — the player can't tell). */
function useCelebrations(app: AppState): void {
  const done = Object.keys(app.engine.state.results).length;
  const points = Object.keys(app.engine.state.pointFinishedAt).length;
  const rewards = collectedRewards(app.engine.quest, app.engine.state);
  const prev = useRef({ done, points, rewards: rewards.length, quest: app.pack.quest.id });
  useEffect(() => {
    const before = prev.current;
    prev.current = { done, points, rewards: rewards.length, quest: app.pack.quest.id };
    if (before.quest !== app.pack.quest.id) return;
    const newest = rewards.length > before.rewards ? rewards.reduce((a, b) => (b.collectedAt > a.collectedAt ? b : a)) : null;
    if (newest) {
      bigCelebration();
      toast(t.rewards.obtained(newest.title, newest.icon ?? t.rewards.defaultIcon));
    } else if (points > before.points) {
      bigCelebration();
      toast(t.pointDone);
    } else if (done > before.done) {
      smallCelebration();
      toast(t.cheers[Math.floor(Math.random() * t.cheers.length)]);
    }
  }, [done, points, rewards.length]);
}

export function App() {
  const app = useApp();
  useCelebrations(app);
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
        {app.prefs.testMode && <span class="test-badge">{t.testBadge}</span>}
        {questRewards(app.engine.quest).length > 0 ? (
          <RewardStrip quest={app.engine.quest} progress={app.engine.state} variant="header" />
        ) : (
          <span class="header-balloons" aria-hidden>
            🎈
          </span>
        )}
      </header>
      <BalloonsBackground />
      {/* Invisible top-right hot zone for the host's quick skip; kept above everything incl. the camera. */}
      <div class="corner-zone" onClick={cornerTap} />
      <main class="content">
        {showAdmin ? (
          <AdminPanel
            onExit={() => {
              setAdminUnlocked(false);
              navigate('play');
            }}
          />
        ) : needsOrigin(app) ? (
          <OriginScreen />
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
