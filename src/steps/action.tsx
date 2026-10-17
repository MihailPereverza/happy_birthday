import type { ActionStep } from '../core/types';
import { Button, StepShell } from '../ui/components/common';
import { t } from '../ui/strings.ru';
import type { StepDefinition } from './types';

export const actionStep: StepDefinition<ActionStep> = {
  type: 'action',
  render: (step, ctx) => (
    <StepShell step={step} asset={ctx.asset}>
      {step.hostOnly ? (
        <p class="muted center">{t.hostOnlyAction}</p>
      ) : (
        <Button onClick={() => ctx.onComplete()}>{step.buttonText ?? t.done}</Button>
      )}
    </StepShell>
  ),
};
