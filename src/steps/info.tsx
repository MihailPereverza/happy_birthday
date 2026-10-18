import type { InfoStep } from '../core/types';
import { Button, StepShell } from '../ui/components/common';
import { t } from '../ui/strings.ru';
import type { StepContext, StepDefinition } from './types';

function Info({ step, ctx }: { step: InfoStep; ctx: StepContext }) {
  return (
    <StepShell step={step} asset={ctx.asset}>
      <Button onClick={() => ctx.onComplete()}>{step.buttonText ?? t.next}</Button>
    </StepShell>
  );
}

export const infoStep: StepDefinition<InfoStep> = { type: 'info', render: (step, ctx) => <Info step={step} ctx={ctx} /> };
