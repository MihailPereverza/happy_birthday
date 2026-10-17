import { useState } from 'preact/hooks';
import type { PhotoStep } from '../core/types';
import { storePhoto } from '../photos/capturePhoto';
import type { PhotoRecord } from '../photos/repository';
import { autoDownloadEnabled, useApp } from '../ui/appState';
import { CameraView } from '../ui/components/CameraView';
import { Button, StepShell, toast, useObjectUrl } from '../ui/components/common';
import { t } from '../ui/strings.ru';
import type { StepContext, StepDefinition } from './types';

export function masksForStep(step: PhotoStep, ctx: StepContext) {
  const all = ctx.quest.masks;
  return step.allowedMasks?.length ? all.filter((m) => step.allowedMasks!.includes(m.id)) : all;
}

function Shot({ photo }: { photo: PhotoRecord }) {
  const url = useObjectUrl(photo.blob);
  return url ? <img class="step-shot" src={url} alt="" /> : null;
}

function Photo({ step, ctx }: { step: PhotoStep; ctx: StepContext }) {
  const app = useApp();
  const [open, setOpen] = useState(false);
  const minPhotos = step.minPhotos ?? 1;
  const taken = app.photos.filter((p) => p.pointId === ctx.point.id && p.stepId === step.id);
  const enough = taken.length >= minPhotos;
  return (
    <StepShell step={step} asset={ctx.asset}>
      {taken.length > 0 && (
        <div class="step-shots">
          {taken.map((p) => (
            <Shot key={p.id} photo={p} />
          ))}
        </div>
      )}
      {minPhotos > 0 && <p class="muted center">{t.camera.progress(Math.min(taken.length, minPhotos), minPhotos)}</p>}
      <Button kind={enough ? 'secondary' : 'primary'} onClick={() => setOpen(true)}>
        📸 {taken.length ? t.camera.more : t.camera.open}
      </Button>
      {enough && <Button onClick={() => ctx.onComplete({ photos: taken.length })}>{t.camera.continue}</Button>}
      {open && (
        <CameraView
          masks={masksForStep(step, ctx)}
          defaultMaskId={step.defaultMask}
          facing={step.facing}
          asset={ctx.asset}
          title={step.title}
          onClose={() => setOpen(false)}
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
            setOpen(false);
          }}
        />
      )}
    </StepShell>
  );
}

export const photoStep: StepDefinition<PhotoStep> = { type: 'photo', render: (step, ctx) => <Photo step={step} ctx={ctx} /> };
