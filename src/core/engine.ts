import { logEvent } from './log';
import { stepKey, type Point, type Progress, type Quest, type SkippedBy, type Step } from './types';

export interface Position {
  point: Point;
  step: Step;
  pointIndex: number;
  stepIndex: number;
}

type Listener = () => void;

export function sortedPoints(quest: Quest): Point[] {
  return [...quest.points].sort((a, b) => a.visitOrder - b.visitOrder);
}

export function newProgress(packId: string): Progress {
  return {
    packId,
    pointIndex: 0,
    stepIndex: 0,
    attempts: {},
    results: {},
    pointStartedAt: {},
    pointFinishedAt: {},
    startedAt: Date.now(),
  };
}

/** State machine over points (by visitOrder) and their steps; every mutation is persisted right away. */
export class QuestEngine {
  readonly points: Point[];
  private listeners = new Set<Listener>();

  constructor(
    readonly quest: Quest,
    private progress: Progress,
    private readonly persist: (progress: Progress) => Promise<void>,
  ) {
    this.points = sortedPoints(quest);
    this.clampPosition();
    this.markPointStarted();
  }

  get state(): Readonly<Progress> {
    return this.progress;
  }

  get isFinished(): boolean {
    return this.progress.pointIndex >= this.points.length;
  }

  get current(): Position | null {
    const { pointIndex, stepIndex } = this.progress;
    const point = this.points[pointIndex];
    const step = point?.steps[stepIndex];
    return point && step ? { point, step, pointIndex, stepIndex } : null;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  isPointDone(pointId: string): boolean {
    return pointId in this.progress.pointFinishedAt;
  }

  attemptsFor(point: Point, step: Step): number {
    return this.progress.attempts[stepKey(point.id, step.id)] ?? 0;
  }

  resultOf(pointId: string, stepId: string) {
    return this.progress.results[stepKey(pointId, stepId)];
  }

  async registerFailedAttempt(): Promise<number> {
    const pos = this.current;
    if (!pos) return 0;
    const key = stepKey(pos.point.id, pos.step.id);
    const attempts = (this.progress.attempts[key] ?? 0) + 1;
    this.progress = { ...this.progress, attempts: { ...this.progress.attempts, [key]: attempts } };
    logEvent({ type: 'attempt_failed', pointId: pos.point.id, stepId: pos.step.id });
    await this.commit();
    return attempts;
  }

  /** Completes the current step; `skippedBy` marks a host override, which the player sees as a normal pass. */
  async completeStep(value?: unknown, skippedBy?: SkippedBy): Promise<void> {
    const pos = this.current;
    if (!pos) return;
    this.recordResult(pos.point, pos.step, value, skippedBy);
    logEvent({
      type: skippedBy ? 'step_skipped' : 'step_completed',
      pointId: pos.point.id,
      stepId: pos.step.id,
      detail: skippedBy ? { skippedBy } : undefined,
    });
    this.advance();
    await this.commit();
  }

  async skipPoint(skippedBy: SkippedBy): Promise<void> {
    const pos = this.current;
    if (!pos) return;
    for (const step of pos.point.steps.slice(pos.stepIndex)) {
      this.recordResult(pos.point, step, undefined, skippedBy);
    }
    logEvent({ type: 'point_skipped', pointId: pos.point.id, detail: { skippedBy } });
    this.finishPoint(pos.point);
    await this.commit();
  }

  /** Host jump to any step; earlier steps of that point keep their results, later points are reopened. */
  async goTo(pointIndex: number, stepIndex: number): Promise<void> {
    const reopened = this.points.slice(pointIndex).map((p) => p.id);
    const pointFinishedAt = { ...this.progress.pointFinishedAt };
    for (const id of reopened) delete pointFinishedAt[id];
    this.progress = { ...this.progress, pointIndex, stepIndex, pointFinishedAt };
    this.clampPosition();
    this.markPointStarted();
    logEvent({ type: 'goto', pointId: this.current?.point.id, stepId: this.current?.step.id });
    await this.commit();
  }

  private recordResult(point: Point, step: Step, value: unknown, skippedBy?: SkippedBy): void {
    const key = stepKey(point.id, step.id);
    const result = { completedAt: Date.now(), ...(skippedBy && { skippedBy }), ...(value !== undefined && { value }) };
    this.progress = { ...this.progress, results: { ...this.progress.results, [key]: result } };
  }

  private advance(): void {
    const point = this.points[this.progress.pointIndex];
    if (this.progress.stepIndex + 1 < point.steps.length) {
      this.progress = { ...this.progress, stepIndex: this.progress.stepIndex + 1 };
      return;
    }
    this.finishPoint(point);
  }

  private finishPoint(point: Point): void {
    this.progress = {
      ...this.progress,
      pointIndex: this.progress.pointIndex + 1,
      stepIndex: 0,
      pointFinishedAt: { ...this.progress.pointFinishedAt, [point.id]: Date.now() },
    };
    logEvent({ type: 'point_finished', pointId: point.id });
    this.markPointStarted();
  }

  private markPointStarted(): void {
    const point = this.points[this.progress.pointIndex];
    if (!point || point.id in this.progress.pointStartedAt) return;
    this.progress = { ...this.progress, pointStartedAt: { ...this.progress.pointStartedAt, [point.id]: Date.now() } };
  }

  /** Keeps a stored position valid when the pack was edited between sessions. */
  private clampPosition(): void {
    const pointIndex = Math.max(0, Math.min(this.progress.pointIndex, this.points.length));
    const steps = this.points[pointIndex]?.steps.length ?? 0;
    const stepIndex = Math.max(0, Math.min(this.progress.stepIndex, Math.max(steps - 1, 0)));
    this.progress = { ...this.progress, pointIndex, stepIndex };
  }

  private async commit(): Promise<void> {
    this.listeners.forEach((l) => l());
    await this.persist(this.progress);
  }
}
