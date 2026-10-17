import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { Step } from '../../core/types';
import { t } from '../strings.ru';

export function StepShell(props: {
  step: Step;
  asset: (p: string | undefined) => string | undefined;
  children?: ComponentChildren;
}) {
  const { step, asset } = props;
  const image = asset(step.image);
  return (
    <section class="step">
      {step.title && <h1 class="step-title">{step.title}</h1>}
      {image && <img class="step-image" src={image} alt="" />}
      {step.text && <p class="step-text">{step.text}</p>}
      {props.children}
    </section>
  );
}

/** Hint k becomes visible after `hintAfterAttempts + k` failed attempts. */
export function Hints(props: { step: Step; attempts: number }) {
  const { hints = [], hintAfterAttempts = 2 } = props.step;
  if (!hints.length) return null;
  const visible = hints.filter((_, k) => props.attempts >= hintAfterAttempts + k);
  return (
    <div class="hints">
      {visible.map((h, i) => (
        <p class="hint" key={i}>
          💡 {t.hint}: {h}
        </p>
      ))}
      {visible.length === 0 && props.attempts > 0 && <p class="muted">{t.hintIn(hintAfterAttempts)}</p>}
    </div>
  );
}

export function AnswerForm(props: {
  placeholder: string;
  inputMode?: 'text' | 'numeric' | 'decimal';
  onSubmit: (value: string) => Promise<'ok' | 'wrong' | string>;
  autoFocus?: boolean;
}) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: Event) => {
    e.preventDefault();
    if (!value.trim() || busy) return;
    setBusy(true);
    const result = await props.onSubmit(value);
    setBusy(false);
    if (result === 'ok') return;
    setError(result === 'wrong' ? t.wrongAnswer : result);
    navigator.vibrate?.([40, 60, 40]);
  };
  return (
    <form class="answer-form" onSubmit={submit}>
      <input
        class="input"
        value={value}
        placeholder={props.placeholder}
        inputMode={props.inputMode ?? 'text'}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellcheck={false}
        autoFocus={props.autoFocus}
        onInput={(e) => {
          setValue((e.target as HTMLInputElement).value);
          setError(null);
        }}
      />
      {error && <p class="error">{error}</p>}
      <button class="btn primary" type="submit" disabled={busy || !value.trim()}>
        {t.check}
      </button>
    </form>
  );
}

export function Button(props: {
  onClick?: () => void;
  kind?: 'primary' | 'secondary' | 'danger' | 'ghost';
  disabled?: boolean;
  children: ComponentChildren;
  href?: string;
}) {
  const cls = `btn ${props.kind ?? 'primary'}`;
  if (props.href) {
    return (
      <a class={cls} href={props.href} target="_blank" rel="noopener">
        {props.children}
      </a>
    );
  }
  return (
    <button class={cls} type="button" onClick={props.onClick} disabled={props.disabled}>
      {props.children}
    </button>
  );
}

export function Modal(props: { onClose?: () => void; children: ComponentChildren; wide?: boolean }) {
  return (
    <div class="modal-backdrop" onClick={(e) => e.target === e.currentTarget && props.onClose?.()}>
      <div class={`modal ${props.wide ? 'wide' : ''}`}>{props.children}</div>
    </div>
  );
}

export function useObjectUrl(blob: Blob | undefined): string | undefined {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : undefined), [blob]);
  useEffect(() => () => url && URL.revokeObjectURL(url), [url]);
  return url;
}

let toastListener: ((text: string) => void) | null = null;
export const toast = (text: string): void => toastListener?.(text);

export function ToastHost() {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    let timer: number | undefined;
    toastListener = (next) => {
      setText(next);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setText(null), 2500);
    };
    return () => {
      toastListener = null;
    };
  }, []);
  return text ? <div class="toast">{text}</div> : null;
}

/** Keeps the screen on while `active` (geo walk, camera); silently ignored where unsupported. */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      try {
        sentinel = await navigator.wakeLock.request('screen');
        if (cancelled) sentinel.release();
      } catch {
        sentinel = null;
      }
    };
    const onVisible = () => document.visibilityState === 'visible' && acquire();
    acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      sentinel?.release().catch(() => undefined);
    };
  }, [active]);
}
