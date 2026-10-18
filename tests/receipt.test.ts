import { describe, expect, it } from 'vitest';
import { checkReceipt, parseReceipt, verifyReceipt } from '../src/steps/receiptCheck';
import type { ReceiptStep } from '../src/core/types';

const RAW = 't=20261020T1302&s=187.00&fn=7380440700076549&i=41497&fp=2026358205&n=1';
const step: ReceiptStep = { id: 'r', type: 'receipt', minSum: 30, maxSum: 1500 };
const oct20 = new Date(2026, 9, 20, 15, 0);

describe('parseReceipt', () => {
  it('reads date, sum and fiscal ids', () => {
    expect(parseReceipt(RAW)).toEqual({ date: '2026-10-20T13:02', sum: 187, fn: '7380440700076549', i: '41497', fp: '2026358205' });
  });

  it('accepts any parameter order, seconds in the time and a whole-ruble sum', () => {
    expect(parseReceipt('fn=1&fp=2&i=3&n=1&s=99&t=20261020T130245')).toMatchObject({ date: '2026-10-20T13:02', sum: 99 });
  });

  it('rejects garbage and incomplete receipts', () => {
    expect(parseReceipt('HEART-QR')).toBeNull();
    expect(parseReceipt('https://example.com')).toBeNull();
    expect(parseReceipt('')).toBeNull();
    expect(parseReceipt('t=20261020T1302&s=187.00&fn=1&i=2')).toBeNull();
    expect(parseReceipt('t=20261020&s=187.00&fn=1&i=2&fp=3')).toBeNull();
    expect(parseReceipt('t=20261320T1302&s=187.00&fn=1&i=2&fp=3')).toBeNull();
    expect(parseReceipt('t=20261020T1302&s=abc&fn=1&i=2&fp=3')).toBeNull();
  });
});

describe('checkReceipt', () => {
  it('passes a receipt from today within the sum range', () => {
    expect(verifyReceipt(RAW, step, oct20)).toMatchObject({ ok: true, receipt: { sum: 187 } });
  });

  it('rejects a receipt from another day unless requireToday is off', () => {
    const r = parseReceipt(RAW)!;
    expect(checkReceipt(r, step, new Date(2026, 9, 19, 23, 59))).toBe('date');
    expect(checkReceipt(r, { ...step, requireToday: false }, new Date(2025, 0, 1))).toBeNull();
  });

  it('checks the sum against minSum and maxSum', () => {
    const r = parseReceipt(RAW)!;
    expect(checkReceipt({ ...r, sum: 29.99 }, step, oct20)).toBe('sumLow');
    expect(checkReceipt({ ...r, sum: 1500.01 }, step, oct20)).toBe('sumHigh');
    expect(checkReceipt({ ...r, sum: 1500 }, step, oct20)).toBeNull();
  });

  it('reports garbage as a format error so it can fall through to master/unlock codes', () => {
    expect(verifyReceipt('магия', step, oct20)).toEqual({ ok: false, error: 'format' });
  });
});
