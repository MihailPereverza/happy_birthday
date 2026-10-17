import { useState } from 'preact/hooks';
import { Button, Modal } from '../ui/components/common';
import { t } from '../ui/strings.ru';
import { checkAdminPin } from './masterCode';
import type { QuestSettings } from '../core/types';

export function PinDialog(props: { settings: QuestSettings; onSuccess: () => void; onCancel: () => void }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const submit = async (e: Event) => {
    e.preventDefault();
    if (await checkAdminPin(pin, props.settings)) props.onSuccess();
    else {
      setError(true);
      setPin('');
      navigator.vibrate?.([40, 60, 40]);
    }
  };
  return (
    <Modal onClose={props.onCancel}>
      <form class="pin" onSubmit={submit}>
        <h2>{t.admin.pinTitle}</h2>
        <input
          class="input pin-input"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          value={pin}
          onInput={(e) => {
            setPin((e.target as HTMLInputElement).value);
            setError(false);
          }}
        />
        {error && <p class="error">{t.admin.pinWrong}</p>}
        <div class="row">
          <Button kind="ghost" onClick={props.onCancel}>
            {t.cancel}
          </Button>
          <button class="btn primary" type="submit" disabled={!pin}>
            {t.confirm}
          </button>
        </div>
      </form>
    </Modal>
  );
}
