import type { PhotoStep } from '../core/types';
import { storePhoto } from '../photos/capturePhoto';
import { autoDownloadEnabled, useApp } from '../ui/appState';
import { CameraView } from '../ui/components/CameraView';
import { Button, StepShell, toast } from '../ui/components/common';
import { t } from '../ui/strings.ru';
import type { StepContext, StepDefinition } from './types';

export function masksForStep(step: PhotoStep, ctx: StepContext) {
  const all = ctx.quest.masks;
  return step.allowedMasks?.length ? all.filter((m) => step.allowedMasks!.includes(m.id)) : all;
}

function Photo({ step, ctx }: { step: PhotoStep; ctx: StepContext }) {
  const app = useApp();
  const minPhotos = step.minPhotos ?? 1;
  const taken = app.photos.filter((p) => p.pointId === ctx.point.id && p.stepId === step.id).length;
  const enough = taken >= minPhotos;
  return (
    <StepShell step={step} asset={ctx.asset}>
      <CameraView
        masks={masksForStep(step, ctx)}
        defaultMaskId={step.defaultMask}
        facing={step.facing}
        asset={ctx.asset}
        onSave={async (blob, maskId) => {
          await storePhoto({
            packId: ctx.quest.id,
            point: ctx.point,
            stepId: step.id,
            maskId,
            blob,
            autoDownload: autoDownloadEnabled(app),
          });
          toast(t.camera.saved);
        }}
        footer={
          <div class="photo-footer">
            {minPhotos > 0 && <p class="muted center">{t.camera.progress(Math.min(taken, minPhotos), minPhotos)}</p>}
            {enough && <Button onClick={() => ctx.onComplete({ photos: taken })}>{t.camera.continue}</Button>}
          </div>
        }
      />
    </StepShell>
  );
}

export const photoStep: StepDefinition<PhotoStep> = { type: 'photo', render: (step, ctx) => <Photo step={step} ctx={ctx} /> };
