export type Anchor = 'eyesMid' | 'forehead' | 'noseTip' | 'chin' | 'mouth' | number;

export interface FaceMask {
  id: string;
  type?: 'face';
  src: string;
  title?: string;
  anchor: Anchor;
  widthEyes: number;
  offsetX?: number;
  offsetY?: number;
  rotate?: boolean;
}

export interface FrameMask {
  id: string;
  type: 'frame';
  src: string;
  title?: string;
}

export type Mask = FaceMask | FrameMask;

export interface Unlock {
  codesHash?: string[];
}

export interface StepBase {
  id: string;
  type: string;
  title?: string;
  text?: string;
  image?: string;
  hints?: string[];
  hintAfterAttempts?: number;
  skippable?: boolean;
  unlock?: Unlock;
  [extra: string]: unknown;
}

export interface InfoStep extends StepBase { type: 'info'; audio?: string; buttonText?: string }
export interface RiddleStep extends StepBase { type: 'riddle'; answersHash: string[] }
export interface CodeStep extends StepBase { type: 'code'; answersHash: string[] }
export interface QrStep extends StepBase { type: 'qr'; answersHash: string[] }
export interface ChoiceStep extends StepBase {
  type: 'choice';
  options: string[];
  correct?: number[];
  anyCorrect?: boolean;
}
export interface GeoStep extends StepBase { type: 'geo'; targetName?: string }
export interface ActionStep extends StepBase { type: 'action'; hostOnly?: boolean; buttonText?: string }
export interface NumberStep extends StepBase { type: 'number'; key?: string; min?: number; max?: number; unit?: string }
export interface PhotoStep extends StepBase {
  type: 'photo';
  minPhotos?: number;
  defaultMask?: string;
  allowedMasks?: string[];
  facing?: 'user' | 'environment';
}
export interface FinalStep extends StepBase { type: 'final' }

export type Step =
  | InfoStep | RiddleStep | CodeStep | QrStep | ChoiceStep | GeoStep
  | ActionStep | NumberStep | PhotoStep | FinalStep | StepBase;

export interface Point {
  id: string;
  name: string;
  lat: number;
  lon: number;
  radiusM?: number;
  visitOrder: number;
  outlineOrder: number;
  steps: Step[];
}

export interface QuestSettings {
  masterCodeHash: string;
  adminPinHash: string;
  defaultRadiusM?: number;
  maxAccuracyM?: number;
  hideFuturePoints?: boolean;
  autoDownload?: boolean;
}

export interface Quest {
  id: string;
  title: string;
  settings: QuestSettings;
  masks: Mask[];
  points: Point[];
  final: { title: string; text: string; image?: string };
}

export type SkippedBy = 'master' | 'code' | 'gesture';

export interface StepResult {
  completedAt: number;
  skippedBy?: SkippedBy;
  value?: unknown;
}

export interface Progress {
  packId: string;
  /** Index into points sorted by visitOrder; equal to points.length when the quest is finished. */
  pointIndex: number;
  stepIndex: number;
  attempts: Record<string, number>;
  results: Record<string, StepResult>;
  pointStartedAt: Record<string, number>;
  pointFinishedAt: Record<string, number>;
  startedAt: number;
}

export const DEFAULT_RADIUS_M = 150;
export const DEFAULT_MAX_ACCURACY_M = 100;

export const stepKey = (pointId: string, stepId: string): string => `${pointId}/${stepId}`;
