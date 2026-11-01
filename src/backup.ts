import type { AppState } from './types';

// Копия всех данных с сервера в файл (для администратора).
export function downloadBackup(state: AppState): void {
  const { workers, entries, notes, overviewRates, selfWorkerId } = state;
  const data = { workers, entries, notes, overviewRates, selfWorkerId };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `chasy-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Читает файл бэкапа (в т.ч. из прежнего приложения) и после подтверждения передаёт данные. */
export function readBackup(file: File, onImport: (state: AppState) => void): void {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result));
      if (!Array.isArray(parsed.workers) || !Array.isArray(parsed.entries)) {
        alert('Неверный формат файла');
        return;
      }
      if (
        !confirm(
          'Заменить ВСЕ данные на сервере данными из файла?\nРаботники и их записи будут заменены, входы работников сохранятся.',
        )
      )
        return;
      onImport({
        workers: parsed.workers,
        entries: parsed.entries,
        notes: Array.isArray(parsed.notes) ? parsed.notes : [],
        overviewRates: parsed.overviewRates,
        selfWorkerId: parsed.selfWorkerId,
      });
    } catch {
      alert('Не удалось прочитать файл');
    }
  };
  reader.readAsText(file);
}
