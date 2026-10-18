import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { newProgress, QuestEngine } from '../src/core/engine';
import { collectedRewards, questRewards } from '../src/core/rewards';
import type { Progress, Quest } from '../src/core/types';

function questWithKeys(): Quest {
  const quest: Quest = JSON.parse(readFileSync('content/demo/quest.json', 'utf8'));
  const byId = (id: string) => quest.points.find((p) => p.id === id)!;
  byId('start').steps[0].reward = { id: 'key1', title: 'Ключ 1', icon: '🔑' };
  byId('left').steps[1].reward = { id: 'key2', title: 'Ключ 2' };
  byId('right').steps[1].reward = { id: 'key3', title: 'Ключ 3', icon: '🗝️' };
  return quest;
}

const engineFor = (quest: Quest) => new QuestEngine(quest, newProgress(quest.id), vi.fn(async (_p: Progress) => undefined));

describe('rewards', () => {
  it('lists every reward of the quest in visit order', () => {
    expect(questRewards(questWithKeys()).map((r) => [r.id, r.pointId, r.stepId])).toEqual([
      ['key1', 'start', 'hello'],
      ['key2', 'left', 'candles'],
      ['key3', 'right', 'surprise'],
    ]);
  });

  it('collects a reward when its step is completed normally', async () => {
    const quest = questWithKeys();
    const engine = engineFor(quest);
    expect(collectedRewards(quest, engine.state)).toEqual([]);
    await engine.completeStep();
    const [key] = collectedRewards(quest, engine.state);
    expect(key).toMatchObject({ id: 'key1', title: 'Ключ 1', icon: '🔑', pointId: 'start', stepId: 'hello' });
    expect(key.skippedBy).toBeUndefined();
  });

  it('collects rewards of steps skipped by the host, one by one or with the whole point', async () => {
    const quest = questWithKeys();
    const engine = engineFor(quest);
    await engine.completeStep(undefined, 'master');
    await engine.skipPoint('gesture');
    await engine.skipPoint('code');
    const collected = collectedRewards(quest, engine.state);
    expect(collected.map((r) => [r.id, r.skippedBy])).toEqual([
      ['key1', 'master'],
      ['key2', 'code'],
    ]);
  });

  it('is empty for a quest without rewards', () => {
    const quest: Quest = JSON.parse(readFileSync('content/demo/quest.json', 'utf8'));
    expect(questRewards(quest)).toEqual([]);
  });
});
