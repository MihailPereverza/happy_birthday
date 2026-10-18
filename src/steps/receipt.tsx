import { useRef, useState } from 'preact/hooks';
import type { ReceiptStep } from '../core/types';
import { AnswerForm, Button, Hints, StepShell } from '../ui/components/common';
import { QrScanner, qrScanSupported } from '../ui/components/QrScanner';
import { t } from '../ui/strings.ru';
import { verifyReceipt, type ReceiptVerdict } from './receiptCheck';
import type { StepContext, StepDefinition } from './types';

function errorText(verdict: Extract<ReceiptVerdict, { ok: false }>, step: ReceiptStep): string {
  switch (verdict.error) {
    case 'date':
      return t.receipt.wrongDate(verdict.receipt!.date);
    case 'sumLow':
      return t.receipt.sumLow(step.minSum!);
    case 'sumHigh':
      return t.receipt.sumHigh(step.maxSum!);
    default:
      return t.receipt.notReceipt;
  }
}

function Receipt({ step, ctx }: { step: ReceiptStep; ctx: StepContext }) {
  const supported = qrScanSupported();
  const [manual, setManual] = useState(!supported);
  const [error, setError] = useState<string | null>(null);
  const lastRejected = useRef('');

  const check = async (raw: string): Promise<'ok' | string> => {
    const verdict = verifyReceipt(raw, step);
    if (verdict.ok) {
      await ctx.onComplete(verdict.receipt);
      return 'ok';
    }
    if (verdict.error === 'format') {
      // Not a receipt at all: it may be the master or an unlock code typed by the host.
      if ((await ctx.submitAnswer(raw)) === 'ok') return 'ok';
    } else {
      await ctx.engine.registerFailedAttempt();
    }
    return errorText(verdict, step);
  };

  const onScanned = async (raw: string) => {
    // The scanner re-reports a receipt still in view; count one failed attempt per receipt, not per frame.
    if (raw === lastRejected.current) return;
    const result = await check(raw);
    if (result === 'ok') return;
    lastRejected.current = raw;
    setError(result);
  };

  return (
    <StepShell step={step} asset={ctx.asset}>
      {!manual && (
        <>
          <p class="muted center">{t.receipt.scan}</p>
          <QrScanner onValue={onScanned} />
          {error && <p class="error center">{error}</p>}
          <Button kind="ghost" onClick={() => setManual(true)}>
            {t.receipt.manual}
          </Button>
        </>
      )}
      {manual && (
        <>
          {!supported && <p class="muted">{t.receipt.unsupported}</p>}
          <AnswerForm placeholder={t.receipt.placeholder} onSubmit={check} />
        </>
      )}
      <Hints step={step} attempts={ctx.attempts} />
    </StepShell>
  );
}

export const receiptStep: StepDefinition<ReceiptStep> = {
  type: 'receipt',
  render: (step, ctx) => <Receipt step={step} ctx={ctx} />,
};
