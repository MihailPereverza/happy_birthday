import { useState } from 'preact/hooks';
import type { QrStep } from '../core/types';
import { AnswerForm, Button, Hints, StepShell } from '../ui/components/common';
import { QrScanner, qrScanSupported } from '../ui/components/QrScanner';
import { t } from '../ui/strings.ru';
import type { StepContext, StepDefinition } from './types';

function Qr({ step, ctx }: { step: QrStep; ctx: StepContext }) {
  const supported = qrScanSupported();
  const [manual, setManual] = useState(!supported);
  const [wrong, setWrong] = useState(false);
  const onScanned = async (value: string) => {
    const result = await ctx.submitAnswer(value, step.answersHash);
    setWrong(result === 'wrong');
  };
  return (
    <StepShell step={step} asset={ctx.asset}>
      {!manual && (
        <>
          <p class="muted center">{t.qr.scan}</p>
          <QrScanner onValue={onScanned} />
          {wrong && <p class="error center">{t.qr.wrong}</p>}
          <Button kind="ghost" onClick={() => setManual(true)}>
            {t.qr.manual}
          </Button>
        </>
      )}
      {manual && (
        <>
          {!supported && <p class="muted">{t.qr.unsupported}</p>}
          <AnswerForm placeholder={t.codePlaceholder} onSubmit={(v) => ctx.submitAnswer(v, step.answersHash)} />
        </>
      )}
      <Hints step={step} attempts={ctx.attempts} />
    </StepShell>
  );
}

export const qrStep: StepDefinition<QrStep> = { type: 'qr', render: (step, ctx) => <Qr step={step} ctx={ctx} /> };
