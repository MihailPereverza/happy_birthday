import { checkMasterCode } from '../admin/masterCode';
import { matchesAnyHash } from '../core/hash';
import type { Position } from '../core/engine';
import { getStepDefinition } from '../steps/registry';
import type { StepContext } from '../steps/types';
import { useApp, type AppState } from './appState';
import { FinalView } from './FinalView';

function buildContext(app: AppState, pos: Position): StepContext {
  const { engine, pack } = app;
  const { point, step } = pos;
  const onComplete: StepContext['onComplete'] = (result, skippedBy) => engine.completeStep(result, skippedBy);
  return {
    quest: pack.quest,
    point,
    engine,
    attempts: engine.attemptsFor(point, step),
    asset: pack.asset,
    onComplete,
    submitAnswer: async (raw, answersHash) => {
      const master = await checkMasterCode(raw, pack.quest.settings);
      if (master === 'point') {
        await engine.skipPoint('master');
        return 'ok';
      }
      if (master === 'step') {
        await onComplete(undefined, 'master');
        return 'ok';
      }
      if (await matchesAnyHash(raw, step.unlock?.codesHash)) {
        await onComplete(undefined, 'code');
        return 'ok';
      }
      if (await matchesAnyHash(raw, answersHash)) {
        await onComplete();
        return 'ok';
      }
      await engine.registerFailedAttempt();
      return 'wrong';
    },
  };
}

export function PlayScreen() {
  const app = useApp();
  const pos = app.engine.current;
  if (!pos) return <FinalView />;
  const definition = getStepDefinition(pos.step.type);
  if (!definition) return <p class="error">Неизвестный тип шага: {pos.step.type}</p>;
  return (
    <div class="play" key={`${pos.point.id}/${pos.step.id}`}>
      {definition.render(pos.step, buildContext(app, pos))}
    </div>
  );
}
