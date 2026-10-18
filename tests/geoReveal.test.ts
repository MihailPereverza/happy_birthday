import { describe, expect, it } from 'vitest';
import { newProgress } from '../src/core/engine';
import type { GeoStep, Point } from '../src/core/types';
import { geoVisibility, isPointSecret, stepStartedAt } from '../src/steps/geoReveal';

const geo = (extra: Partial<GeoStep> = {}): GeoStep => ({ id: 'go', type: 'geo', ...extra });
const MIN = 60_000;

describe('geoVisibility', () => {
  it('shows target and route by default', () => {
    expect(geoVisibility(geo(), 0, 0)).toEqual({ showTarget: true, showRoute: true, routeInMin: null });
  });

  it('hides target and route for a location riddle', () => {
    expect(geoVisibility(geo({ hideTarget: true }), 0, 60 * MIN)).toEqual({ showTarget: false, showRoute: false, routeInMin: null });
  });

  it('reveals the route after revealRouteAfterMin, still without the target name', () => {
    const step = geo({ hideTarget: true, revealRouteAfterMin: 10 });
    expect(geoVisibility(step, 0, 4 * MIN + 1)).toEqual({ showTarget: false, showRoute: false, routeInMin: 6 });
    expect(geoVisibility(step, 0, 10 * MIN)).toEqual({ showTarget: false, showRoute: true, routeInMin: null });
  });
});

describe('stepStartedAt', () => {
  const point = { id: 'p', steps: [{ id: 'a', type: 'info' }, geo()] } as unknown as Point;

  it('uses the point start for the first step and the previous step completion otherwise', () => {
    const progress = { ...newProgress('x'), pointStartedAt: { p: 100 }, results: { 'p/a': { completedAt: 500 } } };
    expect(stepStartedAt(progress, point, 0)).toBe(100);
    expect(stepStartedAt(progress, point, 1)).toBe(500);
  });
});

it('keeps a riddle point secret until its geo step is passed', () => {
  const point = { id: 'p', name: 'Парк', steps: [geo({ hideTarget: true }), { id: 'ph', type: 'photo' }] } as unknown as Point;
  const progress = newProgress('x');
  expect(isPointSecret(point, progress)).toBe(true);
  expect(isPointSecret({ ...point, steps: [geo()] }, progress)).toBe(false);
  expect(isPointSecret(point, { ...progress, results: { 'p/go': { completedAt: 1, skippedBy: 'code' } } })).toBe(false);
});
