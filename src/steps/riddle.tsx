import type { RiddleStep } from '../core/types';
import { AnswerForm, Hints, StepShell } from '../ui/components/common';
import { t } from '../ui/strings.ru';
import type { StepDefinition } from './types';

export const riddleStep: StepDefinition<RiddleStep> = {
  type: 'riddle',
  render: (step, ctx) => (
    <StepShell step={step} asset={ctx.asset}>
      <AnswerForm placeholder={t.answerPlaceholder} onSubmit={(v) => ctx.submitAnswer(v, step.answersHash)} />
      <Hints step={step} attempts={ctx.attempts} />
    </StepShell>
  ),
};
