import type { Step } from '../core/types';
import type { StepDefinition } from './types';

const registry = new Map<string, StepDefinition>();

export function registerStep<S extends Step>(definition: StepDefinition<S>): void {
  registry.set(definition.type, definition as unknown as StepDefinition);
}

export const getStepDefinition = (type: string): StepDefinition | undefined => registry.get(type);

/** Must match the set registered in steps/index.ts; validation of packs relies on it before the UI loads. */
export const BUILTIN_STEP_TYPES = [
  'info', 'riddle', 'choice', 'code', 'qr', 'geo', 'action', 'number', 'photo', 'audio', 'receipt', 'final',
];

export const knownStepTypes = (): string[] => [...new Set([...BUILTIN_STEP_TYPES, ...registry.keys()])];
