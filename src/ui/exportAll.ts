import { exportZip } from '../photos/exportZip';
import { downloadBlob } from '../photos/download';
import type { AppState } from './appState';

export async function downloadAll(app: AppState): Promise<void> {
  const blob = await exportZip(app.pack.quest, app.engine.state, app.photos);
  const date = new Date().toISOString().slice(0, 10);
  downloadBlob(blob, `${app.pack.quest.id}_${date}.zip`);
}
