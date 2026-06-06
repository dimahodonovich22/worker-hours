import { useRef } from 'react';
import type { AppState } from '../types';
import { currentMonthKey, formatMonthLabel, formatNum, monthTotal } from '../calc';

function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m100 >= 11 && m100 <= 14) return many;
  if (m10 === 1) return one;
  if (m10 >= 2 && m10 <= 4) return few;
  return many;
}
function pluralizeRecords(n: number): string {
  return plural(n, 'запись', 'записи', 'записей');
}
function pluralizeWorkers(n: number): string {
  return plural(n, 'работник', 'работника', 'работников');
}

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
        <>
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

          {(() => {
            const totals = state.workers.reduce(
              (acc, w) => {
                const t = monthTotal(state.entries, w, month);
                acc.hours += t.hours;
                acc.km += t.km;
                acc.pay += t.pay;
                acc.count += t.count;
                return acc;
              },
              { hours: 0, km: 0, pay: 0, count: 0 },
            );
            const round = (n: number) => Math.round(n * 100) / 100;
            return (
              <div className="grand-total">
                <div className="grand-total-label">
                  Итог за {formatMonthLabel(month).toLowerCase()} · все работники
                </div>
                <div className="totals">
                  <div>
                    <span>{formatNum(round(totals.hours))}</span> ч
                  </div>
                  <div>
                    <span>{formatNum(round(totals.km))}</span> км
                  </div>
                  <div className="pay">
                    <span>€{formatNum(round(totals.pay))}</span>
                  </div>
                </div>
                <div className="grand-total-sub">
                  {totals.count} {pluralizeRecords(totals.count)} · {state.workers.length}{' '}
                  {pluralizeWorkers(state.workers.length)}
                </div>
              </div>
            );
          })()}
        </>
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
