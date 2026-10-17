import { useState } from 'preact/hooks';
import type { PhotoStep, Point } from '../core/types';
import { photoFileName, downloadBlob, sharePhoto } from '../photos/download';
import { storePhoto } from '../photos/capturePhoto';
import { deletePhoto, setMainPhoto, type PhotoRecord } from '../photos/repository';
import { autoDownloadEnabled, useApp } from './appState';
import { CameraView } from './components/CameraView';
import { Button, Modal, toast, useObjectUrl } from './components/common';
import { downloadAll } from './exportAll';
import { t } from './strings.ru';

function Thumb({ photo, onClick }: { photo: PhotoRecord; onClick: () => void }) {
  const url = useObjectUrl(photo.blob);
  return (
    <button type="button" class="thumb" onClick={onClick}>
      {url && <img src={url} alt="" loading="lazy" />}
      {photo.isMain && <span class="thumb-badge">★</span>}
    </button>
  );
}

function Viewer(props: { photo: PhotoRecord; point: Point; onClose: () => void; onRetake: () => void }) {
  const { photo, point } = props;
  const url = useObjectUrl(photo.blob);
  const fileName = photoFileName(point.visitOrder, point.id, photo.takenAt);
  return (
    <Modal onClose={props.onClose} wide>
      {url && <img class="viewer-img" src={url} alt="" />}
      <div class="viewer-actions">
        <Button
          kind="secondary"
          onClick={async () => {
            const result = await sharePhoto(photo, fileName);
            if (result === 'unsupported') {
              downloadBlob(photo.blob, fileName);
              toast(t.gallery.shareUnsupported);
            }
          }}
        >
          {t.gallery.share}
        </Button>
        <Button kind="secondary" onClick={() => downloadBlob(photo.blob, fileName)}>
          {t.gallery.download}
        </Button>
        {!photo.isMain && (
          <Button kind="secondary" onClick={() => setMainPhoto(photo.id).then(props.onClose)}>
            ★ {t.gallery.makeMain}
          </Button>
        )}
        <Button kind="secondary" onClick={props.onRetake}>
          {t.gallery.retake}
        </Button>
        <Button
          kind="danger"
          onClick={async () => {
            if (!confirm(t.gallery.deleteConfirm)) return;
            await deletePhoto(photo.id);
            props.onClose();
          }}
        >
          {t.gallery.delete}
        </Button>
        <Button kind="ghost" onClick={props.onClose}>
          {t.close}
        </Button>
      </div>
    </Modal>
  );
}

function RetakeCamera(props: { point: Point; replaces?: PhotoRecord; onDone: () => void }) {
  const app = useApp();
  const { quest } = app.pack;
  const photoStep = props.point.steps.find((s): s is PhotoStep => s.type === 'photo');
  const allowed = photoStep?.allowedMasks;
  const masks = allowed?.length ? quest.masks.filter((m) => allowed.includes(m.id)) : quest.masks;
  return (
    <Modal onClose={props.onDone} wide>
      <h2>{props.point.name}</h2>
      <CameraView
        masks={masks}
        defaultMaskId={props.replaces?.maskId ?? photoStep?.defaultMask}
        facing={photoStep?.facing}
        asset={app.pack.asset}
        onSave={async (blob, maskId) => {
          await storePhoto({
            packId: quest.id,
            point: props.point,
            stepId: props.replaces?.stepId ?? photoStep?.id ?? 'retake',
            maskId,
            blob,
            autoDownload: autoDownloadEnabled(app),
            replaces: props.replaces,
          });
          toast(t.camera.saved);
          props.onDone();
        }}
        footer={
          <Button kind="ghost" onClick={props.onDone}>
            {t.cancel}
          </Button>
        }
      />
    </Modal>
  );
}

export function GalleryScreen({ pointId }: { pointId?: string }) {
  const app = useApp();
  const { engine } = app;
  const [open, setOpen] = useState<PhotoRecord | null>(null);
  const [retake, setRetake] = useState<{ point: Point; replaces?: PhotoRecord } | null>(null);
  const [busy, setBusy] = useState(false);
  const points = engine.points.filter(
    (p) => (!pointId || p.id === pointId) && (engine.isPointDone(p.id) || app.photos.some((ph) => ph.pointId === p.id)),
  );
  const pointOf = (photo: PhotoRecord) => engine.points.find((p) => p.id === photo.pointId)!;

  return (
    <section class="gallery">
      <h1 class="step-title">{t.gallery.title}</h1>
      {app.photos.length > 0 && (
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await downloadAll(app).finally(() => setBusy(false));
          }}
        >
          {busy ? t.gallery.preparing : t.gallery.downloadAll}
        </Button>
      )}
      {points.length === 0 && <p class="muted center">{t.gallery.empty}</p>}
      {points.map((point) => {
        const photos = app.photos.filter((p) => p.pointId === point.id);
        return (
          <div class="gallery-point" key={point.id}>
            <div class="gallery-point-head">
              <h2>
                {point.visitOrder}. {point.name}
              </h2>
              {engine.isPointDone(point.id) && (
                <button type="button" class="link" onClick={() => setRetake({ point })}>
                  + {t.camera.more}
                </button>
              )}
            </div>
            <div class="thumbs">
              {photos.map((photo) => (
                <Thumb key={photo.id} photo={photo} onClick={() => setOpen(photo)} />
              ))}
            </div>
          </div>
        );
      })}
      {open && (
        <Viewer
          photo={open}
          point={pointOf(open)}
          onClose={() => setOpen(null)}
          onRetake={() => {
            setRetake({ point: pointOf(open), replaces: open });
            setOpen(null);
          }}
        />
      )}
      {retake && <RetakeCamera point={retake.point} replaces={retake.replaces} onDone={() => setRetake(null)} />}
    </section>
  );
}
