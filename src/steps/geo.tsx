import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { DEFAULT_MAX_ACCURACY_M, DEFAULT_RADIUS_M, type GeoStep } from '../core/types';
import { yandexRouteUrl } from '../geo/deeplink';
import { bearingDeg, distanceM } from '../geo/haversine';
import { watchPosition, type GeoStatus } from '../geo/watcher';
import { ZoneDetector, type Fix } from '../geo/zone';
import { AnswerForm, Button, StepShell, useWakeLock } from '../ui/components/common';
import { testModeEnabled, useApp } from '../ui/appState';
import { t } from '../ui/strings.ru';
import { geoVisibility, stepStartedAt } from './geoReveal';
import type { StepContext, StepDefinition } from './types';

const NO_FIX_TIMEOUT_MS = 60_000;
const REVEAL_TICK_MS = 15_000;

function accuracyLevel(accuracy: number, max: number): 'good' | 'fair' | 'bad' {
  if (accuracy <= Math.min(30, max)) return 'good';
  return accuracy <= max ? 'fair' : 'bad';
}

/** Device heading in degrees from north, via the absolute orientation sensor Chrome on Android exposes. */
function useCompass(enabled: boolean): number | null {
  const [heading, setHeading] = useState<number | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const onOrientation = (e: DeviceOrientationEvent) => {
      if (e.alpha !== null) setHeading((360 - e.alpha) % 360);
    };
    window.addEventListener('deviceorientationabsolute', onOrientation as EventListener);
    return () => window.removeEventListener('deviceorientationabsolute', onOrientation as EventListener);
  }, [enabled]);
  return heading;
}

/** Re-evaluates the riddle reveal every few seconds so the route buttons show up without a tap. */
function useGeoVisibility(step: GeoStep, ctx: StepContext) {
  const mountedAt = useRef(Date.now());
  const [now, setNow] = useState(Date.now());
  const timed = Boolean(step.hideTarget && step.revealRouteAfterMin !== undefined);
  useEffect(() => {
    if (!timed) return;
    const timer = setInterval(() => setNow(Date.now()), REVEAL_TICK_MS);
    return () => clearInterval(timer);
  }, [timed]);
  const stepIndex = ctx.point.steps.findIndex((s) => s.id === step.id);
  const startedAt = stepStartedAt(ctx.engine.state, ctx.point, stepIndex) ?? mountedAt.current;
  return geoVisibility(step, startedAt, now);
}

function Geo({ step, ctx }: { step: GeoStep; ctx: StepContext }) {
  const { point, quest } = ctx;
  const testMode = testModeEnabled(useApp());
  const target = useMemo(
    () => ({
      lat: point.lat,
      lon: point.lon,
      radiusM: point.radiusM ?? quest.settings.defaultRadiusM ?? DEFAULT_RADIUS_M,
      maxAccuracyM: quest.settings.maxAccuracyM ?? DEFAULT_MAX_ACCURACY_M,
    }),
    [point, quest],
  );
  const [status, setStatus] = useState<GeoStatus>('waiting');
  const [fix, setFix] = useState<Fix | null>(null);
  const [noFixTooLong, setNoFixTooLong] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [compassOn, setCompassOn] = useState(false);
  const heading = useCompass(compassOn);
  const visibility = useGeoVisibility(step, ctx);
  const lastGoodAt = useRef(Date.now());
  const arrived = useRef(false);
  useWakeLock(true);

  useEffect(() => {
    const detector = new ZoneDetector(target);
    let latest: Fix | null = null;
    const arrive = () => {
      if (arrived.current || !latest) return;
      arrived.current = true;
      navigator.vibrate?.([100, 50, 100]);
      ctx.onComplete({ lat: latest.lat, lon: latest.lon, accuracy: latest.accuracy });
    };
    const stop = watchPosition((update) => {
      setStatus(update.status);
      if (!update.fix) return;
      latest = update.fix;
      setFix(update.fix);
      if (update.fix.accuracy <= target.maxAccuracyM) lastGoodAt.current = Date.now();
      if (detector.push(update.fix)) arrive();
    });
    const dwellTimer = setInterval(() => detector.dwellReached() && arrive(), 1000);
    const timer = setInterval(() => setNoFixTooLong(Date.now() - lastGoodAt.current > NO_FIX_TIMEOUT_MS), 5000);
    return () => {
      stop();
      clearInterval(timer);
      clearInterval(dwellTimer);
    };
  }, [target]);

  const distance = fix ? distanceM(fix.lat, fix.lon, target.lat, target.lon) : null;
  const level = fix ? accuracyLevel(fix.accuracy, target.maxAccuracyM) : 'bad';
  const arrow = fix && heading !== null ? bearingDeg(fix.lat, fix.lon, target.lat, target.lon) - heading : null;
  const canAskCode = status === 'denied' || status === 'unavailable' || noFixTooLong;

  return (
    <StepShell step={{ ...step, title: step.title ?? t.geo.heading }} asset={ctx.asset}>
      {visibility.showTarget && (
        <p class="geo-target">
          {t.geo.to}: <b>{step.targetName ?? point.name}</b>
        </p>
      )}
      <div class="geo-distance">{distance !== null ? t.geo.distance(distance) : '—'}</div>
      {arrow !== null && visibility.showRoute && (
        <div class="compass-arrow" style={{ transform: `rotate(${arrow}deg)` }} aria-hidden>
          ➤
        </div>
      )}
      {fix && (
        <p class={`gps gps-${level}`}>
          <span class="gps-dot" /> {t.geo.accuracy(fix.accuracy)} · {t.geo[`accuracy${level[0].toUpperCase()}${level.slice(1)}` as 'accuracyGood']}
        </p>
      )}
      {status === 'waiting' && !fix && <p class="muted">{t.geo.waiting}</p>}
      {status === 'denied' && <p class="error">{t.geo.denied}</p>}
      {status === 'unavailable' && <p class="error">{t.geo.unavailable}</p>}
      {visibility.showRoute ? (
        <div class="row">
          <Button kind="secondary" href={yandexRouteUrl(target.lat, target.lon, 'pd')}>
            🚶 {t.geo.routeWalk}
          </Button>
          <Button kind="secondary" href={yandexRouteUrl(target.lat, target.lon, 'mt')}>
            🚌 {t.geo.routeTransit}
          </Button>
        </div>
      ) : (
        visibility.routeInMin !== null && <p class="muted center">{t.geo.routeIn(visibility.routeInMin)}</p>
      )}
      {/* The arrow would give the riddle away, so it comes back together with the route. */}
      {visibility.showRoute && !compassOn && 'ondeviceorientationabsolute' in window && (
        <Button kind="ghost" onClick={() => setCompassOn(true)}>
          🧭 {t.geo.compass}
        </Button>
      )}
      {testMode && (
        <Button kind="secondary" onClick={() => ctx.onComplete({ test: true })}>
          📍 {t.geo.testArrive}
        </Button>
      )}
      {canAskCode && !showCode && (
        <Button kind="ghost" onClick={() => setShowCode(true)}>
          {t.geo.cantFind}
        </Button>
      )}
      {showCode && (
        <>
          <p class="muted">{t.geo.enterCode}</p>
          <AnswerForm placeholder={t.codePlaceholder} onSubmit={(v) => ctx.submitAnswer(v)} autoFocus />
        </>
      )}
    </StepShell>
  );
}

export const geoStep: StepDefinition<GeoStep> = { type: 'geo', render: (step, ctx) => <Geo step={step} ctx={ctx} /> };
