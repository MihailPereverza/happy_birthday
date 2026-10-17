import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { newProgress, QuestEngine } from '../src/core/engine';
import type { Progress, Quest } from '../src/core/types';

const demo = (): Quest => JSON.parse(readFileSync('content/demo/quest.json', 'utf8'));

function makeEngine(progress?: Progress) {
  const persist = vi.fn(async (_progress: Progress) => undefined);
  const engine = new QuestEngine(demo(), progress ?? newProgress('demo'), persist);
  return { engine, persist };
}

describe('QuestEngine', () => {
  it('walks every step of the demo pack to the end', async () => {
    const { engine, persist } = makeEngine();
    const total = engine.points.reduce((n, p) => n + p.steps.length, 0);
    for (let i = 0; i < total; i += 1) await engine.completeStep();
    expect(engine.isFinished).toBe(true);
    expect(engine.current).toBeNull();
    expect(Object.keys(engine.state.pointFinishedAt)).toEqual(['start', 'left', 'left-lobe', 'left-top', 'dip', 'right-top', 'right-lobe', 'right']);
    expect(persist).toHaveBeenCalledTimes(total);
  });

  it('records skips with their source', async () => {
    const { engine } = makeEngine();
    await engine.completeStep(undefined, 'master');
    expect(engine.resultOf('start', 'hello')?.skippedBy).toBe('master');
    expect(engine.current?.step.id).toBe('go');
  });

  it('skips the rest of a point at once', async () => {
    const { engine } = makeEngine();
    await engine.completeStep();
    await engine.skipPoint('gesture');
    expect(engine.current?.point.id).toBe('left');
    expect(engine.current?.stepIndex).toBe(0);
    expect(engine.resultOf('start', 'selfie')?.skippedBy).toBe('gesture');
  });

  it('restores the same position from persisted progress', async () => {
    const { engine, persist } = makeEngine();
    await engine.completeStep();
    await engine.completeStep(42);
    const saved = persist.mock.calls.at(-1)![0];
    const { engine: restored } = makeEngine(structuredClone(saved));
    expect(restored.current?.point.id).toBe('start');
    expect(restored.current?.step.id).toBe('selfie');
    expect(restored.resultOf('start', 'go')?.value).toBe(42);
  });

  it('counts failed attempts per step', async () => {
    const { engine } = makeEngine();
    await engine.registerFailedAttempt();
    await engine.registerFailedAttempt();
    const pos = engine.current!;
    expect(engine.attemptsFor(pos.point, pos.step)).toBe(2);
  });

  it('jumps to any step and reopens later points', async () => {
    const { engine } = makeEngine();
    await engine.skipPoint('gesture');
    await engine.skipPoint('gesture');
    await engine.goTo(0, 2);
    expect(engine.current?.step.id).toBe('selfie');
    expect(engine.isPointDone('start')).toBe(false);
    expect(engine.isPointDone('left')).toBe(false);
  });

  it('clamps a stale position from an edited pack', () => {
    const { engine } = makeEngine({ ...newProgress('demo'), pointIndex: 0, stepIndex: 99 });
    expect(engine.current?.step.id).toBe('selfie');
  });
});
