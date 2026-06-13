import { useRef, useState } from 'react';
import type { AppState, Worker } from '../types';
import {
  currentMonthKey,
  currentWeekStart,
  formatMonthLabel,
  formatNum,
  formatWeekLabel,
  monthTotal,
  rangeTotal,
  shiftWeek,
  weekEnd,
} from '../calc';

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
  onSetOverviewRates: (rates: { hourly: number; perKm: number }) => void;
};

export function WorkersList({ state, onOpenWorker, onAddWorker, onImport, onSetOverviewRates }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [period, setPeriod] = useState<'month' | 'week'>('month');
  const month = currentMonthKey();
  const [weekStart, setWeekStart] = useState<string>(() => currentWeekStart());
  const weekEndStr = weekEnd(weekStart);

  const isWeek = period === 'week';
  const periodLabel = isWeek ? formatWeekLabel(weekStart) : formatMonthLabel(month);

  function totalForWorker(w: Worker) {
    return isWeek
      ? rangeTotal(state.entries, w, weekStart, weekEndStr)
      : monthTotal(state.entries, w, month);
  }

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

      <div className="period-switch">
        <button
          className={`period-tab ${!isWeek ? 'on' : ''}`}
          onClick={() => setPeriod('month')}
        >
          Месяц
        </button>
        <button
          className={`period-tab ${isWeek ? 'on' : ''}`}
          onClick={() => setPeriod('week')}
        >
          Неделя
        </button>
      </div>

      {isWeek ? (
        <div className="week-nav">
          <button className="week-arrow" onClick={() => setWeekStart(shiftWeek(weekStart, -1))}>
            ‹
          </button>
          <button
            className="week-current"
            onClick={() => setWeekStart(currentWeekStart())}
          >
            {periodLabel}
          </button>
          <button className="week-arrow" onClick={() => setWeekStart(shiftWeek(weekStart, 1))}>
            ›
          </button>
        </div>
      ) : (
        <div className="month-label">{periodLabel}</div>
      )}

      {state.workers.length === 0 ? (
        <div className="empty">
          <p>Нет работников.</p>
          <button className="primary" onClick={onAddWorker}>Добавить первого</button>
        </div>
      ) : (
        <>
          <ul className="cards">
            {state.workers.map((w) => {
              const t = totalForWorker(w);
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
                const t = totalForWorker(w);
                acc.hours += t.hours;
                acc.km += t.km;
                acc.count += t.count;
                return acc;
              },
              { hours: 0, km: 0, count: 0 },
            );
            const round = (n: number) => Math.round(n * 100) / 100;
            const rateH = state.overviewRates?.hourly ?? 0;
            const rateK = state.overviewRates?.perKm ?? 0;
            const payH = round(totals.hours * rateH);
            const payK = round(totals.km * rateK);
            const payTotal = round(payH + payK);

            const askRate = (which: 'hourly' | 'perKm') => {
              const current = which === 'hourly' ? rateH : rateK;
              const label = which === 'hourly' ? 'Ставка €/час' : 'Ставка €/км';
              const input = prompt(label, current ? String(current) : '');
              if (input === null) return;
              const val = parseFloat(input.replace(',', '.'));
              if (Number.isNaN(val) || val < 0) {
                alert('Введите число (например 15 или 0.35)');
                return;
              }
              onSetOverviewRates({
                hourly: which === 'hourly' ? val : rateH,
                perKm: which === 'perKm' ? val : rateK,
              });
            };

            return (
              <div className="grand-total">
                <div className="grand-total-label">
                  Итог за {isWeek ? `неделю ${periodLabel}` : formatMonthLabel(month).toLowerCase()} · все работники
                </div>
                <div className="totals overview-totals">
                  <button className="overview-cell" onClick={() => askRate('hourly')}>
                    <span>{formatNum(round(totals.hours))}</span>
                    <div className="overview-unit">ч</div>
                    <div className="overview-sub">
                      {rateH > 0 ? `€${formatNum(payH)}` : 'нажмите для ставки'}
                    </div>
                    {rateH > 0 && (
                      <div className="overview-rate">× €{formatNum(rateH)}/ч</div>
                    )}
                  </button>
                  <button className="overview-cell" onClick={() => askRate('perKm')}>
                    <span>{formatNum(round(totals.km))}</span>
                    <div className="overview-unit">км</div>
                    <div className="overview-sub">
                      {rateK > 0 ? `€${formatNum(payK)}` : 'нажмите для ставки'}
                    </div>
                    {rateK > 0 && (
                      <div className="overview-rate">× €{formatNum(rateK)}/км</div>
                    )}
                  </button>
                  <div className="pay overview-cell overview-cell-static">
                    <span>€{formatNum(payTotal)}</span>
                    <div className="overview-unit">всего</div>
                    <div className="overview-sub">часы + км</div>
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
