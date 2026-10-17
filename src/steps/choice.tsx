import { useState } from 'preact/hooks';
import type { ChoiceStep } from '../core/types';
import { Hints, StepShell } from '../ui/components/common';
import type { StepContext, StepDefinition } from './types';

function Choice({ step, ctx }: { step: ChoiceStep; ctx: StepContext }) {
  const [wrong, setWrong] = useState<number[]>([]);
  const pick = async (index: number) => {
    if (step.anyCorrect || step.correct?.includes(index)) {
      await ctx.onComplete(index);
      return;
    }
    setWrong((w) => [...w, index]);
    navigator.vibrate?.([40, 60, 40]);
    await ctx.engine.registerFailedAttempt();
  };
  return (
    <StepShell step={step} asset={ctx.asset}>
      <div class="choices">
        {step.options.map((option, i) => (
          <button key={i} type="button" class={`btn choice ${wrong.includes(i) ? 'wrong' : ''}`} onClick={() => pick(i)}>
            {option}
          </button>
        ))}
      </div>
      <Hints step={step} attempts={ctx.attempts} />
    </StepShell>
  );
}

export const choiceStep: StepDefinition<ChoiceStep> = { type: 'choice', render: (step, ctx) => <Choice step={step} ctx={ctx} /> };
