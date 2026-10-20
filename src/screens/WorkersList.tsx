import { useRef, useState } from 'react';
import type { AppState, PeriodView, Worker } from '../types';
import {
  expensesTotal,
  formatNum,
  isPayExpense,
  noteEffectiveAmount,
  periodBounds,
  rangeTotal,
} from '../calc';
import { PeriodNav } from '../components/PeriodNav';
import { Icon } from '../components/Icon';
import { downloadBackup, readBackup } from '../backup';

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
  view: PeriodView;
  onChangeView: (next: PeriodView) => void;
  onOpenWorker: (id: string) => void;
  onAddWorker: () => void;
  onImport: (state: AppState) => void;
  onSetOverviewRates: (rates: { hourly: number; perKm: number }) => void;
  onOpenNote: (workerId: string, noteId: string) => void;
  onBack: () => void;
};

export function WorkersList({
  state,
  view,
  onChangeView,
  onOpenWorker,
  onAddWorker,
  onImport,
  onSetOverviewRates,
  onOpenNote,
  onBack,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [notesModal, setNotesModal] = useState<null | 'minus' | 'plus' | 'net'>(null);

  const isWeek = view.period === 'week';
  const bounds = periodBounds(view);
  // «Итог за октябрь 2026» / «Итог за 28.09 – 04.10.2026»
  const periodCaption = isWeek ? bounds.label : bounds.label.toLowerCase();

  function totalForWorker(w: Worker) {
    return rangeTotal(state.entries, w, bounds.start, bounds.end);
  }

  // Расходы по работе (заметки «мне должны» с галочкой) — прибавляются к сумме к выплате.
  function expensesForWorker(w: Worker) {
    return expensesTotal(state.notes, bounds.start, bounds.end, w.id);
  }
  const allExpenses = expensesTotal(state.notes, bounds.start, bounds.end);

  function inPeriod(dateStr: string): boolean {
    return dateStr >= bounds.start && dateStr <= bounds.end;
  }

  const noteTotals = (() => {
    let minus = 0;
    let plus = 0;
    let count = 0;
    for (const n of state.notes) {
      if (!inPeriod(n.date)) continue;
      count += 1;
      // Расходы по работе уже в сумме к выплате — здесь не считаем, чтобы не было двойного учёта.
      if (isPayExpense(n)) continue;
      if (n.direction === 'minus') minus += n.amount;
      else plus += noteEffectiveAmount(n);
    }
    return {
      minus: Math.round(minus * 100) / 100,
      plus: Math.round(plus * 100) / 100,
      net: Math.round((plus - minus) * 100) / 100,
      count,
    };
  })();


  return (
    <div className="screen">
      <header className="topbar">
        <button className="link" onClick={onBack}>‹ Назад</button>
        <h1>Сводка <span className="test-tag">ТЕСТ</span></h1>
        <button className="link" onClick={onAddWorker}>+ Добавить</button>
      </header>

      <PeriodNav view={view} onChange={onChangeView} />

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
              const pay = Math.round((t.pay + expensesForWorker(w)) * 100) / 100;
              return (
                <li key={w.id} className="card" onClick={() => onOpenWorker(w.id)}>
                  <div className="card-name">{w.name}</div>
                  <div className="card-stats">
                    <span>{formatNum(t.hours)} ч</span>
                    <span>{formatNum(t.km)} км</span>
                    <span className="pay">€{formatNum(pay)}</span>
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
            const payTotal = round(payH + payK + allExpenses);

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
                  Итог за {periodCaption} · все работники
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
                    <div className="overview-sub">
                      {allExpenses > 0 ? `часы + км + расходы €${formatNum(allExpenses)}` : 'часы + км'}
                    </div>
                  </div>
                </div>
                <div className="grand-total-sub">
                  {totals.count} {pluralizeRecords(totals.count)} · {state.workers.length}{' '}
                  {pluralizeWorkers(state.workers.length)}
                </div>
              </div>
            );
          })()}

          {state.notes.length > 0 && (
            <div className="grand-total grand-total-notes">
              <div className="grand-total-label">
                Заметки · все работники
              </div>
              <div className="note-totals">
                <button
                  type="button"
                  className="note-total minus clickable"
                  onClick={() => setNotesModal('minus')}
                >
                  <div className="note-total-label">Я должен</div>
                  <div className="note-total-value">€{formatNum(noteTotals.minus)}</div>
                </button>
                <button
                  type="button"
                  className="note-total plus clickable"
                  onClick={() => setNotesModal('plus')}
                >
                  <div className="note-total-label">Мне должны</div>
                  <div className="note-total-value">€{formatNum(noteTotals.plus)}</div>
                </button>
                <button
                  type="button"
                  className={`note-total net clickable ${noteTotals.net >= 0 ? 'pos' : 'neg'}`}
                  onClick={() => setNotesModal('net')}
                >
                  <div className="note-total-label">Итог</div>
                  <div className="note-total-value">
                    {noteTotals.net >= 0 ? '+' : ''}€{formatNum(Math.abs(noteTotals.net))}
                  </div>
                </button>
              </div>
              <div className="grand-total-sub">
                {noteTotals.count} {pluralizeRecords(noteTotals.count)}
              </div>
            </div>
          )}
        </>
      )}

      <footer className="footer-actions">
        <button className="ghost" onClick={() => downloadBackup(state)}>Скачать backup</button>
        <button className="ghost" onClick={() => fileRef.current?.click()}>Импорт</button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) readBackup(f, onImport);
            e.target.value = '';
          }}
        />
      </footer>

      {notesModal && (() => {
        const filtered = state.notes
          .filter((n) => inPeriod(n.date))
          .filter((n) => (notesModal === 'net' ? true : n.direction === notesModal))
          .sort((a, b) => (a.date < b.date ? 1 : -1));
        const title =
          notesModal === 'minus' ? 'Я должен' : notesModal === 'plus' ? 'Мне должны' : 'Все заметки';
        const workerName = (id: string) =>
          state.workers.find((w) => w.id === id)?.name ?? '—';
        return (
          <div className="sheet-backdrop" onClick={() => setNotesModal(null)}>
            <div className="sheet notes-modal" onClick={(e) => e.stopPropagation()}>
              <div className="sheet-title">
                {title} · {periodCaption}
              </div>
              {filtered.length === 0 ? (
                <div className="empty" style={{ padding: '20px 8px' }}>
                  <p>Заметок нет.</p>
                </div>
              ) : (
                <ul className="entries notes-modal-list">
                  {filtered.map((n) => (
                    <li
                      key={n.id}
                      className="entry-row"
                      onClick={() => {
                        setNotesModal(null);
                        onOpenNote(n.workerId, n.id);
                      }}
                    >
                      <div className="entry-date">{n.date.slice(8, 10)}.{n.date.slice(5, 7)}</div>
                      <div className="entry-main">
                        <div className="entry-loc">
                          {n.description}
                          {n.photos && n.photos.length > 0 && (
                            <span className="entry-photo"><Icon name="paperclip" size={11} /> {n.photos.length}</span>
                          )}
                          {n.direction === 'plus' && n.cash && (
                            <span className="entry-cash">
                              кэш{n.cashDeductPercent ? ` −${formatNum(n.cashDeductPercent)}%` : ''}
                            </span>
                          )}
                          {isPayExpense(n) && <span className="entry-in-pay">в сумме</span>}
                        </div>
                        <div className="entry-time">
                          {workerName(n.workerId)}
                          {n.direction === 'plus' && n.cash && n.cashDeductPercent
                            ? ` · факт €${formatNum(noteEffectiveAmount(n))}`
                            : ''}
                        </div>
                      </div>
                      <div className={`entry-pay note-pay ${n.direction}`}>
                        {n.direction === 'minus' ? '−' : '+'}€{formatNum(n.amount)}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <button className="sheet-cancel" onClick={() => setNotesModal(null)}>
                Закрыть
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
