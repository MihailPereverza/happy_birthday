import type { ReceiptStep } from '../core/types';

/** What a Russian fiscal receipt QR carries: date/time, total, fiscal drive, document number and sign. */
export interface Receipt {
  /** Local time printed on the receipt, `YYYY-MM-DDTHH:MM`. */
  date: string;
  sum: number;
  fn: string;
  i: string;
  fp: string;
}

export type ReceiptError = 'format' | 'date' | 'sumLow' | 'sumHigh';

const DATE_RE = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?$/;
const SUM_RE = /^\d+(?:[.,]\d{1,2})?$/;
const DIGITS_RE = /^\d+$/;

/** Parses `t=20261020T1302&s=187.00&fn=…&i=…&fp=…&n=1` (any parameter order); null when it is not a receipt. */
export function parseReceipt(raw: string): Receipt | null {
  const params = new URLSearchParams(raw.trim().replace(/^.*\?/, ''));
  const [t, s, fn, i, fp] = ['t', 's', 'fn', 'i', 'fp'].map((k) => params.get(k)?.trim() ?? '');
  const date = DATE_RE.exec(t);
  if (!date || !SUM_RE.test(s) || ![fn, i, fp].every((v) => DIGITS_RE.test(v))) return null;
  const [, y, mo, d, h, mi] = date;
  if (+mo < 1 || +mo > 12 || +d < 1 || +d > 31 || +h > 23 || +mi > 59) return null;
  return { date: `${y}-${mo}-${d}T${h}:${mi}`, sum: Number(s.replace(',', '.')), fn, i, fp };
}

const localDate = (now: Date): string =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

export function checkReceipt(receipt: Receipt, step: ReceiptStep, now = new Date()): ReceiptError | null {
  if ((step.requireToday ?? true) && receipt.date.slice(0, 10) !== localDate(now)) return 'date';
  if (step.minSum !== undefined && receipt.sum < step.minSum) return 'sumLow';
  if (step.maxSum !== undefined && receipt.sum > step.maxSum) return 'sumHigh';
  return null;
}

export type ReceiptVerdict = { ok: true; receipt: Receipt } | { ok: false; error: ReceiptError; receipt?: Receipt };

export function verifyReceipt(raw: string, step: ReceiptStep, now = new Date()): ReceiptVerdict {
  const receipt = parseReceipt(raw);
  if (!receipt) return { ok: false, error: 'format' };
  const error = checkReceipt(receipt, step, now);
  return error ? { ok: false, error, receipt } : { ok: true, receipt };
}
