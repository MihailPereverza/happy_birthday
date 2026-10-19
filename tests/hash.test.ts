import { describe, expect, it } from 'vitest';
import { hashAnswer, matchesAnyHash, normalizeAnswer } from '../src/core/hash';
import { checkMasterCode } from '../src/admin/masterCode';

const settings = async () => ({ masterCodeHash: await hashAnswer('магия'), adminPinHash: await hashAnswer('1234') });

describe('normalizeAnswer', () => {
  it('treats decomposed й and ё (letter + combining mark) like the usual letters', () => {
    expect(normalizeAnswer('Таврически\u0438\u0306')).toBe('таврический');
    expect(normalizeAnswer('Е\u0308лка')).toBe('елка');
  });

  it('ignores case, ё/е, punctuation and extra spaces', () => {
    expect(normalizeAnswer('  Ёлка,   ПРИВЕТ!! ')).toBe('елка привет');
  });
});

describe('matchesAnyHash', () => {
  it('accepts any of several answers', async () => {
    const hashes = [await hashAnswer('часы'), await hashAnswer('часики')];
    expect(await matchesAnyHash('Часики.', hashes)).toBe(true);
    expect(await matchesAnyHash('будильник', hashes)).toBe(false);
  });

  it('never matches an empty input', async () => {
    expect(await matchesAnyHash('  !! ', [await hashAnswer('')])).toBe(false);
  });
});

describe('checkMasterCode', () => {
  it('distinguishes step skip and point skip', async () => {
    const s = await settings();
    expect(await checkMasterCode('Магия', s)).toBe('step');
    expect(await checkMasterCode('магия!', s)).toBe('point');
    expect(await checkMasterCode('магия?', s)).toBe('step');
    expect(await checkMasterCode('не то', s)).toBeNull();
  });
});
