import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { getLog, type LogEvent } from '../core/log';
import { storageEstimate } from '../core/store';
import { deleteZipPack, importZipPack, listRepoPacks, listZipPacks, loadPack, type PackLoadResult, type RepoPackInfo } from '../content/loader';
import type { PackError } from '../content/validate';
import { getLastFix, watchPosition } from '../geo/watcher';
import type { Fix } from '../geo/zone';
import { deleteAllPhotos } from '../photos/repository';
import { downloadBlob } from '../photos/download';
import { knownStepTypes } from '../steps/registry';
import { autoDownloadEnabled, resetProgress, switchPack, updatePrefs, useApp } from '../ui/appState';
import { Button, toast } from '../ui/components/common';
import { checkForUpdate, applyUpdate } from '../ui/pwa';
import { t } from '../ui/strings.ru';
import { emulateAtPoint, emulatedPointId } from './emulator';

const formatBytes = (n: number): string =>
  n > 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(1)} ГБ` : `${(n / 1024 ** 2).toFixed(1)} МБ`;

const formatDuration = (ms: number): string => {
  const min = Math.floor(ms / 60_000);
  return `${Math.floor(min / 60)} ч ${min % 60} мин`;
};

function Section(props: { title: string; children: ComponentChildren }) {
  return (
    <section class="admin-section">
      <h2>{props.title}</h2>
      {props.children}
    </section>
  );
}

function ErrorList({ errors }: { errors: PackError[] }) {
  return (
    <ul class="pack-errors">
      {errors.map((e, i) => (
        <li key={i}>
          <code>{e.path}</code>: {e.message}
        </li>
      ))}
    </ul>
  );
}

function StateSection() {
  const app = useApp();
  const { engine } = app;
  const [fix, setFix] = useState<Fix | undefined>(getLastFix());
  useEffect(() => watchPosition((u) => u.fix && setFix(u.fix)), []);
  const pos = engine.current;
  return (
    <Section title={t.admin.state}>
      <dl class="kv">
        <dt>{t.admin.point}</dt>
        <dd>{pos ? `${pos.point.visitOrder}. ${pos.point.name} (${pos.point.id})` : t.admin.finished}</dd>
        <dt>{t.admin.step}</dt>
        <dd>{pos ? `${pos.stepIndex + 1}/${pos.point.steps.length} · ${pos.step.type} · ${pos.step.id}` : '—'}</dd>
        <dt>{t.admin.elapsed}</dt>
        <dd>{formatDuration(Date.now() - engine.state.startedAt)}</dd>
        <dt>{t.admin.gps}</dt>
        <dd>{fix ? `${fix.lat.toFixed(5)}, ${fix.lon.toFixed(5)} ±${Math.round(fix.accuracy)} м` : t.admin.noGps}</dd>
      </dl>
    </Section>
  );
}

function NavigationSection() {
  const { engine } = useApp();
  const pos = engine.current;
  const [pointIndex, setPointIndex] = useState(pos?.pointIndex ?? 0);
  const [stepIndex, setStepIndex] = useState(pos?.stepIndex ?? 0);
  const steps = engine.points[pointIndex]?.steps ?? [];
  return (
    <Section title={t.admin.goTo}>
      <div class="col">
        <Button onClick={() => engine.completeStep(undefined, 'gesture')} disabled={!pos}>
          ⏭ {t.admin.skipStep}
        </Button>
        <Button kind="secondary" onClick={() => engine.skipPoint('gesture')} disabled={!pos}>
          ⏩ {t.admin.skipPoint}
        </Button>
        {pos?.step.type === 'action' && (
          <Button kind="secondary" onClick={() => engine.completeStep()}>
            ✅ {t.admin.markActionDone}
          </Button>
        )}
        <select
          class="input"
          value={pointIndex}
          onChange={(e) => {
            setPointIndex(Number((e.target as HTMLSelectElement).value));
            setStepIndex(0);
          }}
        >
          {engine.points.map((p, i) => (
            <option key={p.id} value={i}>
              {p.visitOrder}. {p.name}
            </option>
          ))}
        </select>
        <select class="input" value={stepIndex} onChange={(e) => setStepIndex(Number((e.target as HTMLSelectElement).value))}>
          {steps.map((s, i) => (
            <option key={s.id} value={i}>
              {i + 1}. {s.type} — {s.title ?? s.id}
            </option>
          ))}
        </select>
        <Button kind="secondary" onClick={() => engine.goTo(pointIndex, stepIndex)}>
          {t.admin.go}
        </Button>
      </div>
    </Section>
  );
}

function PackSection() {
  const app = useApp();
  const [repoPacks, setRepoPacks] = useState<RepoPackInfo[]>([]);
  const [zipPacks, setZipPacks] = useState<string[]>([]);
  const [errors, setErrors] = useState<PackError[] | null>(app.bootErrors);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    listRepoPacks().then(setRepoPacks).catch(() => setRepoPacks([]));
    listZipPacks().then(setZipPacks);
  }, []);

  const apply = async (load: () => Promise<PackLoadResult>) => {
    setBusy(true);
    try {
      const result = await load();
      if (!result.ok) return setErrors(result.errors);
      setErrors(null);
      const changesQuest = result.pack.quest.id !== app.pack.quest.id;
      if (changesQuest && !confirm(t.admin.switchPackConfirm)) return;
      await switchPack(result.pack);
      setZipPacks(await listZipPacks());
      toast(`${t.admin.activePack}: ${result.pack.quest.title}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title={t.admin.packs}>
      <p>
        {t.admin.activePack}: <b>{app.pack.quest.title}</b> <small class="muted">({app.pack.ref.source}:{app.pack.ref.id})</small>
      </p>
      <h3>{t.admin.repoPacks}</h3>
      <div class="col">
        {repoPacks.map((p) => (
          <Button key={p.id} kind="secondary" disabled={busy} onClick={() => apply(() => loadPack({ source: 'repo', id: p.id }, knownStepTypes()))}>
            {p.title} <small>({p.id})</small>
          </Button>
        ))}
      </div>
      {zipPacks.length > 0 && <h3>{t.admin.phonePacks}</h3>}
      {zipPacks.map((id) => (
        <div class="row" key={id}>
          <Button kind="secondary" disabled={busy} onClick={() => apply(() => loadPack({ source: 'zip', id }, knownStepTypes()))}>
            {id}
          </Button>
          <Button kind="ghost" disabled={busy || app.pack.ref.id === id} onClick={() => deleteZipPack(id).then(() => listZipPacks().then(setZipPacks))}>
            🗑
          </Button>
        </div>
      ))}
      <label class="btn secondary file-btn">
        📦 {t.admin.loadZip}
        <input
          type="file"
          accept=".zip,application/zip"
          hidden
          onChange={(e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            (e.target as HTMLInputElement).value = '';
            if (file) apply(() => importZipPack(file, knownStepTypes()));
          }}
        />
      </label>
      {errors && (
        <>
          <h3 class="error">{t.admin.packErrors}</h3>
          <ErrorList errors={errors} />
        </>
      )}
    </Section>
  );
}

function EmulatorSection() {
  const { engine } = useApp();
  const [selected, setSelected] = useState<string | null>(emulatedPointId(engine.points));
  const choose = (id: string | null) => {
    setSelected(id);
    emulateAtPoint(engine.points.find((p) => p.id === id) ?? null);
  };
  return (
    <Section title={t.admin.emulator}>
      <div class="col">
        <Button kind={selected ? 'secondary' : 'primary'} onClick={() => choose(null)}>
          {t.admin.emulatorOff}
        </Button>
        {engine.points.map((p) => (
          <Button key={p.id} kind={selected === p.id ? 'primary' : 'secondary'} onClick={() => choose(p.id)}>
            📍 {t.admin.iAmHere}: {p.visitOrder}. {p.name}
          </Button>
        ))}
      </div>
    </Section>
  );
}

function MaintenanceSection() {
  const app = useApp();
  const [storage, setStorage] = useState<{ usage: number; quota: number; persisted: boolean } | null>(null);
  const [updating, setUpdating] = useState(false);
  useEffect(() => {
    storageEstimate().then(setStorage);
  }, [app.photos.length]);
  return (
    <Section title={t.admin.storage}>
      <dl class="kv">
        <dt>{t.admin.photos}</dt>
        <dd>{app.photos.length}</dd>
        <dt>{t.admin.storage}</dt>
        <dd>
          {storage ? `${formatBytes(storage.usage)} / ${formatBytes(storage.quota)}` : '…'} ·{' '}
          {storage?.persisted ? t.admin.persisted : t.admin.notPersisted}
        </dd>
      </dl>
      <label class="toggle">
        <input
          type="checkbox"
          checked={autoDownloadEnabled(app)}
          onChange={(e) => updatePrefs({ autoDownload: (e.target as HTMLInputElement).checked })}
        />
        {t.admin.autoDownload}
      </label>
      <div class="col">
        <Button
          kind="secondary"
          disabled={updating}
          onClick={async () => {
            setUpdating(true);
            toast(t.admin.updateChecking);
            const ready = await checkForUpdate().catch(() => false);
            setUpdating(false);
            if (ready) await applyUpdate();
            else toast(t.admin.updateNone);
          }}
        >
          🔄 {t.admin.update}
        </Button>
        <Button kind="danger" onClick={() => confirm(t.admin.resetConfirm) && resetProgress()}>
          {t.admin.reset}
        </Button>
        <Button kind="danger" onClick={() => confirm(t.admin.deletePhotosConfirm) && deleteAllPhotos(app.pack.quest.id)}>
          {t.admin.deletePhotos}
        </Button>
      </div>
    </Section>
  );
}

function LogSection() {
  const events = getLog();
  const describe = (e: LogEvent) =>
    [new Date(e.t).toLocaleTimeString('ru-RU'), e.type, e.pointId, e.stepId, e.detail ? JSON.stringify(e.detail) : '']
      .filter(Boolean)
      .join(' · ');
  return (
    <Section title={t.admin.log}>
      <Button
        kind="secondary"
        onClick={() =>
          downloadBlob(new Blob([JSON.stringify(events, null, 2)], { type: 'application/json' }), `log_${Date.now()}.json`)
        }
      >
        {t.admin.exportLog}
      </Button>
      <ol class="log" reversed>
        {events
          .slice(-80)
          .reverse()
          .map((e, i) => (
            <li key={i} class={e.type === 'error' ? 'error' : ''}>
              {describe(e)}
            </li>
          ))}
      </ol>
    </Section>
  );
}

export function AdminPanel(props: { onExit: () => void }) {
  return (
    <div class="admin">
      <div class="admin-head">
        <h1>{t.admin.title}</h1>
        <Button kind="ghost" onClick={props.onExit}>
          ✕ {t.admin.exit}
        </Button>
      </div>
      <StateSection />
      <NavigationSection />
      <PackSection />
      <EmulatorSection />
      <MaintenanceSection />
      <LogSection />
    </div>
  );
}
