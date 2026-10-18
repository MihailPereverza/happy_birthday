import type { NumberStep } from '../core/types';
import { AnswerForm, Button, Hints, StepShell } from '../ui/components/common';
import { t } from '../ui/strings.ru';
import type { StepDefinition } from './types';

export function parseNumber(raw: string): number | null {
  const n = Number(raw.trim().replace(',', '.').replace(/\s/g, ''));
  return raw.trim() && Number.isFinite(n) ? n : null;
}

export const inRange = (n: number, min?: number, max?: number): boolean =>
  (min === undefined || n >= min) && (max === undefined || n <= max);

export const numberStep: StepDefinition<NumberStep> = {
  type: 'number',
  render: (step, ctx) => (
    <StepShell step={step} asset={ctx.asset}>
      <AnswerForm
        placeholder={step.unit ? `${t.numberPlaceholder}, ${step.unit}` : t.numberPlaceholder}
        inputMode="decimal"
        onSubmit={async (raw) => {
          const n = parseNumber(raw);
          if (n === null || !inRange(n, step.min, step.max)) {
            // Not a valid number: it may still be the master or unlock code.
            const override = await ctx.submitAnswer(raw);
            return override === 'ok' ? 'ok' : n === null ? t.wrongAnswer : t.numberRange(step.min, step.max);
          }
          await ctx.onComplete(n);
          return 'ok';
        }}
      />
      {step.skippable && (
        <Button kind="ghost" onClick={() => ctx.onComplete()}>
          {t.skipOptional}
        </Button>
      )}
      <Hints step={step} attempts={ctx.attempts} />
    </StepShell>
  ),
};
