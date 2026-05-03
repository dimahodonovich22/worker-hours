import { useRef } from 'react';
import type { AppState } from '../types';
import { currentMonthKey, formatMonthLabel, formatNum, monthTotal } from '../calc';

type Props = {
  state: AppState;
  onOpenWorker: (id: string) => void;
  onAddWorker: () => void;
  onImport: (state: AppState) => void;
};

export function WorkersList({ state, onOpenWorker, onAddWorker, onImport }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const month = currentMonthKey();

  function exportBackup() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `worker-hours-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importBackup(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (Array.isArray(parsed.workers) && Array.isArray(parsed.entries)) {
          if (confirm('Заменить текущие данные импортом?')) onImport(parsed);
        } else {
          alert('Неверный формат файла');
        }
      } catch {
        alert('Не удалось прочитать файл');
      }
    };
    reader.readAsText(file);
  }

  return (
    <div className="screen">
      <header className="topbar">
        <h1>Работники</h1>
        <button className="link" onClick={onAddWorker}>+ Добавить</button>
      </header>

      <div className="month-label">{formatMonthLabel(month)}</div>

      {state.workers.length === 0 ? (
        <div className="empty">
          <p>Нет работников.</p>
          <button className="primary" onClick={onAddWorker}>Добавить первого</button>
        </div>
      ) : (
        <ul className="cards">
          {state.workers.map((w) => {
            const t = monthTotal(state.entries, w, month);
            return (
              <li key={w.id} className="card" onClick={() => onOpenWorker(w.id)}>
                <div className="card-name">{w.name}</div>
                <div className="card-stats">
                  <span>{formatNum(t.hours)} ч</span>
                  <span>{formatNum(t.km)} км</span>
                  <span className="pay">€{formatNum(t.pay)}</span>
                </div>
                <div className="card-sub">{t.count} записей</div>
              </li>
            );
          })}
        </ul>
      )}

      <footer className="footer-actions">
        <button className="ghost" onClick={exportBackup}>Скачать backup</button>
        <button className="ghost" onClick={() => fileRef.current?.click()}>Импорт</button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) importBackup(f);
            e.target.value = '';
          }}
        />
      </footer>
    </div>
  );
}
