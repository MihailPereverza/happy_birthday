import type { ComponentChildren, VNode } from 'preact';
import type { QuestEngine } from '../core/engine';
import type { Point, Quest, SkippedBy, Step } from '../core/types';

export interface StepContext {
  quest: Quest;
  point: Point;
  engine: QuestEngine;
  attempts: number;
  asset: (path: string | undefined) => string | undefined;
  /** Marks the step done and moves on. */
  onComplete: (result?: unknown, skippedBy?: SkippedBy) => Promise<void>;
  /**
   * Shared check for typed answers: master code (step / whole point), step unlock codes, then the answer hashes.
   * Counts a failed attempt when nothing matched.
   */
  submitAnswer: (raw: string, answersHash?: string[]) => Promise<'ok' | 'wrong'>;
}

/** A step type is a plain renderer; adding one means registering it, the engine never changes. */
export interface StepDefinition<S extends Step = Step> {
  type: string;
  render: (step: S, ctx: StepContext) => VNode;
}

export type { ComponentChildren };
