import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { formatPath, validateQuest } from '../src/content/validate';
import { BUILTIN_STEP_TYPES } from '../src/steps/registry';

const load = (id: string) => JSON.parse(readFileSync(`content/${id}/quest.json`, 'utf8'));
const errorsOf = (data: unknown) => {
  const result = validateQuest(data, BUILTIN_STEP_TYPES);
  return result.ok ? [] : result.errors.map((e) => `${e.path}: ${e.message}`);
};

describe('validateQuest', () => {
  it('accepts every pack in content/', () => {
    for (const id of readdirSync('content')) expect(errorsOf(load(id)), id).toEqual([]);
  });

  it('reports an empty answer list with the spec path format', () => {
    const quest = load('demo');
    quest.points[1].steps[1].answersHash = [];
    expect(errorsOf(quest)).toContain('points[1].steps[1].answersHash: пусто');
  });

  it('reports missing fields, bad hashes, unknown types and dangling masks together', () => {
    const quest = load('demo');
    delete quest.points[1].relative;
    quest.settings.masterCodeHash = 'magic';
    quest.points[2].steps[1].type = 'teleport';
    quest.points[0].steps[2].defaultMask = 'nope';
    const schemaErrors = errorsOf(quest);
    expect(schemaErrors).toContain('points[1].lat: обязательное поле отсутствует');
    expect(schemaErrors).toContain('points[1].relative: обязательное поле отсутствует');
    expect(schemaErrors.some((e) => e.startsWith('settings.masterCodeHash'))).toBe(true);

    quest.points[1].relative = { northM: 10, eastM: 10 };
    quest.settings.masterCodeHash = 'a'.repeat(64);
    const semantic = errorsOf(quest);
    expect(semantic).toContain('points[2].steps[1].type: неизвестный тип «teleport»');
    expect(semantic).toContain('points[0].steps[2]: маска «nope» не найдена в masks');
  });

  it('rejects garbage without throwing', () => {
    expect(errorsOf(null).length).toBeGreaterThan(0);
    expect(errorsOf({ points: 'x' }).length).toBeGreaterThan(0);
  });
});

it('formats JSON pointers as dotted paths', () => {
  expect(formatPath('/points/3/steps/1', 'answersHash')).toBe('points[3].steps[1].answersHash');
});

it('keeps no plaintext secrets in pack settings', () => {
  for (const id of readdirSync('content')) {
    const { settings } = load(id);
    expect(settings.masterCodeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(settings.adminPinHash).toMatch(/^[0-9a-f]{64}$/);
    expect(Object.keys(settings).some((k) => /code|pin|password/i.test(k) && !k.endsWith('Hash'))).toBe(false);
  }
});
