import { useEffect, useRef, useState } from 'preact/hooks';
import { DEFAULT_MIN_AUDIO_SECONDS, isLongEnough, listAudio, onAudioChanged, saveAudio, type AudioRecord } from '../audio/repository';
import { canRecord, measureDuration, startRecording, type MicError, type Recording } from '../audio/recorder';
import { logEvent } from '../core/log';
import type { AudioStep } from '../core/types';
import { Button, StepShell, toast, useObjectUrl } from '../ui/components/common';
import { t } from '../ui/strings.ru';
import type { StepContext, StepDefinition } from './types';

interface Draft {
  blob: Blob;
  durationSec: number | null;
}

const formatSeconds = (sec: number): string => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

function useStepAudio(packId: string, pointId: string, stepId: string): AudioRecord[] {
  const [records, setRecords] = useState<AudioRecord[]>([]);
  useEffect(() => {
    const load = () => listAudio(packId).then((all) => setRecords(all.filter((a) => a.pointId === pointId && a.stepId === stepId)));
    load();
    return onAudioChanged(load);
  }, [packId, pointId, stepId]);
  return records;
}

function Player({ blob }: { blob: Blob }) {
  const url = useObjectUrl(blob);
  return url ? <audio class="audio" src={url} controls preload="auto" /> : null;
}

function AudioTask({ step, ctx }: { step: AudioStep; ctx: StepContext }) {
  const minSeconds = step.minSeconds ?? DEFAULT_MIN_AUDIO_SECONDS;
  const saved = useStepAudio(ctx.quest.id, ctx.point.id, step.id);
  const savedEnough = saved.some((a) => isLongEnough(a.durationSec, minSeconds));
  const recording = useRef<Recording | null>(null);
  const [recordingSince, setRecordingSince] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(canRecord() ? null : t.audio.unsupported);
  const [busy, setBusy] = useState(false);

  useEffect(() => () => recording.current?.cancel(), []);
  useEffect(() => {
    if (recordingSince === null) return;
    const timer = setInterval(() => setElapsed((Date.now() - recordingSince) / 1000), 200);
    return () => clearInterval(timer);
  }, [recordingSince]);

  const record = async () => {
    setError(null);
    setDraft(null);
    try {
      recording.current = await startRecording();
      setElapsed(0);
      setRecordingSince(recording.current.startedAt);
    } catch (e) {
      setError(t.audio.micErrors[e as MicError] ?? t.audio.micErrors.unsupported);
      logEvent({ type: 'error', pointId: ctx.point.id, stepId: step.id, detail: { mic: String(e) } });
    }
  };

  const stop = async () => {
    const current = recording.current;
    recording.current = null;
    setRecordingSince(null);
    if (current) setDraft(await current.stop());
  };

  const upload = async (file: File) => {
    setError(null);
    setBusy(true);
    const durationSec = await measureDuration(file).finally(() => setBusy(false));
    if (durationSec === null) return setError(t.audio.unreadable);
    setDraft({ blob: file, durationSec });
  };

  const save = async () => {
    if (!draft || !isLongEnough(draft.durationSec, minSeconds)) return;
    setBusy(true);
    try {
      await saveAudio({
        packId: ctx.quest.id,
        pointId: ctx.point.id,
        stepId: step.id,
        recordedAt: Date.now(),
        durationSec: draft.durationSec!,
        mimeType: draft.blob.type || 'audio/webm',
        blob: draft.blob,
      });
      logEvent({ type: 'audio_saved', pointId: ctx.point.id, stepId: step.id, detail: { durationSec: draft.durationSec } });
      toast(t.audio.saved);
      await ctx.onComplete({ recordings: saved.length + 1, durationSec: Math.round(draft.durationSec! * 10) / 10 });
    } finally {
      setBusy(false);
    }
  };

  const tooShort = draft !== null && !isLongEnough(draft.durationSec, minSeconds);
  return (
    <StepShell step={step} asset={ctx.asset}>
      <p class="muted center">{t.audio.minHint(minSeconds)}</p>
      {recordingSince !== null ? (
        <>
          <p class="audio-timer" aria-live="polite">
            <span class="rec-dot" /> {formatSeconds(elapsed)}
          </p>
          <Button onClick={stop}>⏹ {t.audio.stop}</Button>
        </>
      ) : draft ? (
        <>
          <Player blob={draft.blob} />
          {draft.durationSec !== null && <p class="muted center">{t.audio.length(formatSeconds(draft.durationSec))}</p>}
          {tooShort && <p class="error center">{t.audio.tooShort(minSeconds)}</p>}
          {!tooShort && (
            <Button disabled={busy} onClick={save}>
              💾 {t.audio.save}
            </Button>
          )}
          <Button kind="secondary" disabled={busy} onClick={record}>
            🎙 {t.audio.rerecord}
          </Button>
        </>
      ) : (
        canRecord() && (
          <Button disabled={busy} onClick={record}>
            🎙 {t.audio.record}
          </Button>
        )
      )}
      {error && <p class="error center">{error}</p>}
      {recordingSince === null && (
        <label class={`btn ${canRecord() && !error ? 'ghost' : 'secondary'} file-btn`}>
          📁 {t.audio.upload}
          <input
            type="file"
            accept="audio/*"
            hidden
            disabled={busy}
            onChange={(e) => {
              const file = (e.target as HTMLInputElement).files?.[0];
              (e.target as HTMLInputElement).value = '';
              if (file) upload(file);
            }}
          />
        </label>
      )}
      {savedEnough && !draft && recordingSince === null && (
        <Button onClick={() => ctx.onComplete({ recordings: saved.length })}>{t.audio.continue}</Button>
      )}
    </StepShell>
  );
}

export const audioStep: StepDefinition<AudioStep> = { type: 'audio', render: (step, ctx) => <AudioTask step={step} ctx={ctx} /> };
