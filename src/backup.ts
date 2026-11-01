import type { AppState } from './types';

// Имя файла с пометкой TEST, чтобы бэкап тестовой копии не перепутать
// с бэкапом основного приложения при импорте.
export function downloadBackup(state: AppState): void {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `worker-hours-TEST-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Читает файл бэкапа (в т.ч. из основного приложения) и после подтверждения передаёт данные. */
export function readBackup(file: File, onImport: (state: AppState) => void): void {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result));
      if (!Array.isArray(parsed.workers) || !Array.isArray(parsed.entries)) {
        alert('Неверный формат файла');
        return;
      }
      if (!confirm('Заменить данные ТЕСТОВОГО приложения данными из файла?')) return;
      onImport({
        workers: parsed.workers,
        entries: parsed.entries,
        notes: Array.isArray(parsed.notes) ? parsed.notes : [],
        overviewRates: parsed.overviewRates,
        selfWorkerId: parsed.selfWorkerId,
        feedFilter: parsed.feedFilter,
      });
    } catch {
      alert('Не удалось прочитать файл');
    }
  };
  reader.readAsText(file);
}
