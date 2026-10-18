import { expect, it } from 'vitest';
import { audioExtension, isLongEnough } from '../src/audio/repository';

it('requires a recording of at least minSeconds (2 s by default)', () => {
  expect(isLongEnough(1.9)).toBe(false);
  expect(isLongEnough(2)).toBe(true);
  expect(isLongEnough(2.9, 3)).toBe(false);
  expect(isLongEnough(3.2, 3)).toBe(true);
  expect(isLongEnough(null)).toBe(false);
  expect(isLongEnough(Number.POSITIVE_INFINITY)).toBe(false);
});

it('picks a file extension from the recorder mime type', () => {
  expect(audioExtension('audio/webm;codecs=opus')).toBe('webm');
  expect(audioExtension('audio/mp4')).toBe('m4a');
  expect(audioExtension('audio/mpeg')).toBe('mp3');
  expect(audioExtension('')).toBe('webm');
});
