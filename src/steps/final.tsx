import type { FinalStep } from '../core/types';
import { FinalView } from '../ui/FinalView';
import type { StepDefinition } from './types';

export const finalStep: StepDefinition<FinalStep> = {
  type: 'final',
  render: (step) => <FinalView title={step.title} text={step.text} />,
};
