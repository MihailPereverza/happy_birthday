import Ajv, { type ErrorObject } from 'ajv';
import schema from './schema.json';
import type { Quest } from '../core/types';
import { EFFECT_IDS } from '../camera/effects/ids';

export interface PackError {
  path: string;
  message: string;
}

export type ValidationResult = { ok: true; quest: Quest } | { ok: false; errors: PackError[] };

const ajv = new Ajv({ allErrors: true, strict: false });
const validateSchema = ajv.compile(schema);

/** `/points/3/steps/1/answersHash` → `points[3].steps[1].answersHash`. */
export function formatPath(instancePath: string, child?: string): string {
  const parts = [...instancePath.split('/').filter(Boolean), ...(child ? [child] : [])];
  return parts.reduce((acc, part) => (/^\d+$/.test(part) ? `${acc}[${part}]` : acc ? `${acc}.${part}` : part), '');
}

function describe(error: ErrorObject): PackError {
  const p = error.params as Record<string, unknown>;
  switch (error.keyword) {
    case 'required':
      return { path: formatPath(error.instancePath, String(p.missingProperty)), message: 'обязательное поле отсутствует' };
    case 'minItems':
      return { path: formatPath(error.instancePath), message: p.limit === 1 ? 'пусто' : `нужно минимум ${p.limit}` };
    case 'maxItems':
      return { path: formatPath(error.instancePath), message: `допустимо максимум ${p.limit}` };
    case 'minLength':
      return { path: formatPath(error.instancePath), message: 'пусто' };
    case 'type':
      return { path: formatPath(error.instancePath), message: `ожидается ${p.type}` };
    case 'enum':
      return { path: formatPath(error.instancePath), message: `допустимо: ${(p.allowedValues as unknown[]).join(', ')}` };
    case 'pattern':
      return { path: formatPath(error.instancePath), message: 'неверный формат (ожидается SHA-256 или id)' };
    default:
      return { path: formatPath(error.instancePath), message: error.message ?? error.keyword };
  }
}

function schemaErrors(data: unknown): PackError[] {
  if (validateSchema(data)) return [];
  // if/then and anyOf wrappers only repeat the concrete errors reported next to them.
  const concrete = (validateSchema.errors ?? []).filter((e) => !['if', 'anyOf', 'allOf'].includes(e.keyword));
  const unique = new Map(concrete.map(describe).map((e) => [`${e.path}|${e.message}`, e]));
  return [...unique.values()];
}

function duplicates(ids: string[]): string[] {
  return ids.filter((id, i) => ids.indexOf(id) !== i);
}

function semanticErrors(quest: Quest, knownStepTypes: readonly string[]): PackError[] {
  const errors: PackError[] = [];
  const maskIds = new Set((quest.masks ?? []).map((m) => m.id));
  (quest.masks ?? []).forEach((m, i) => {
    if (m.type === 'effect' && !(EFFECT_IDS as readonly string[]).includes(m.effect)) {
      errors.push({ path: `masks[${i}].effect`, message: `неизвестный эффект «${m.effect}» (есть: ${EFFECT_IDS.join(', ')})` });
    }
  });
  duplicates((quest.masks ?? []).map((m) => m.id)).forEach((id) =>
    errors.push({ path: 'masks', message: `повторяется id маски «${id}»` }),
  );
  duplicates(quest.points.map((p) => p.id)).forEach((id) =>
    errors.push({ path: 'points', message: `повторяется id точки «${id}»` }),
  );
  duplicates(quest.points.map((p) => String(p.visitOrder))).forEach((n) =>
    errors.push({ path: 'points', message: `повторяется visitOrder ${n}` }),
  );
  quest.points.forEach((point, pi) => {
    duplicates(point.steps.map((s) => s.id)).forEach((id) =>
      errors.push({ path: `points[${pi}].steps`, message: `повторяется id шага «${id}»` }),
    );
    point.steps.forEach((step, si) => {
      const path = `points[${pi}].steps[${si}]`;
      if (!knownStepTypes.includes(step.type)) {
        errors.push({ path: `${path}.type`, message: `неизвестный тип «${step.type}»` });
      }
      const referenced = [step.defaultMask, ...((step.allowedMasks as string[] | undefined) ?? [])];
      referenced
        .filter((id): id is string => typeof id === 'string' && !maskIds.has(id))
        .forEach((id) => errors.push({ path, message: `маска «${id}» не найдена в masks` }));
      const options = step.options as string[] | undefined;
      ((step.correct as number[] | undefined) ?? [])
        .filter((i) => !options || i >= options.length)
        .forEach((i) => errors.push({ path: `${path}.correct`, message: `нет варианта с индексом ${i}` }));
    });
  });
  return errors;
}

export function validateQuest(data: unknown, knownStepTypes: readonly string[]): ValidationResult {
  const errors = schemaErrors(data);
  if (errors.length) return { ok: false, errors };
  const quest = data as Quest;
  quest.masks ??= [];
  const semantic = semanticErrors(quest, knownStepTypes);
  return semantic.length ? { ok: false, errors: semantic } : { ok: true, quest };
}
