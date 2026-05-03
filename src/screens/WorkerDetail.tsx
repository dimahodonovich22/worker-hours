import { useMemo, useState } from 'react';
import type { Entry, Worker } from '../types';
import {
  ddmm,
  entryHours,
  entryMonthKey,
  entryPay,
  formatMonthLabel,
  formatNum,
  monthTotal,
  currentMonthKey,
} from '../calc';
import { exportExcel } from '../export';

type Props = {
  worker: Worker;
  entries: Entry[];
  allEntriesForWorker: Entry[];
  onBack: () => void;
  onAddEntry: () => void;
  onEditEntry: (id: string) => void;
  onEditWorker: () => void;
  onDeleteEntry: (id: string) => void;
  onOpenReport: (monthKey: string) => void;
};

export function WorkerDetail({
  worker,
  entries,
  onBack,
  onAddEntry,
  onEditEntry,
  onEditWorker,
  onOpenReport,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const months = useMemo(() => {
    const set = new Set(entries.map((e) => entryMonthKey(e.date)));
    set.add(currentMonthKey());
    return Array.from(set).sort().reverse();
  }, [entries]);

  const [month, setMonth] = useState<string>(() => months[0] ?? currentMonthKey());

  const visible = useMemo(
    () =>
      entries
        .filter((e) => entryMonthKey(e.date) === month)
        .sort((a, b) => (a.date < b.date ? 1 : -1)),
    [entries, month],
  );

  const total = monthTotal(entries, worker, month);

  function exportText() {
    const lines = visible
      .slice()
      .sort((a, b) => (a.date < b.date ? -1 : 1))
      .map((e) => {
        const lunch = e.lunch ? '' : ' без обеда';
        return `${ddmm(e.date)} ${e.location}${lunch}   ${e.start}-${e.end}/${formatNum(entryHours(e))}/${formatNum(e.km)}км`;
      });
    lines.push('');
    lines.push(`Итого: ${formatNum(total.hours)} ч / ${formatNum(total.km)} км / €${formatNum(total.pay)}`);
    const text = lines.join('\n');
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(
        () => alert('Скопировано в буфер обмена'),
        () => prompt('Скопируй вручную:', text),
      );
    } else {
      prompt('Скопируй вручную:', text);
    }
  }

  return (
    <div className="screen">
      <header className="topbar">
        <button className="link" onClick={onBack}>‹ Назад</button>
        <h1>{worker.name}</h1>
        <button className="link" onClick={onEditWorker}>⚙</button>
      </header>

      <div className="month-picker">
        <select value={month} onChange={(e) => setMonth(e.target.value)}>
          {months.map((m) => (
            <option key={m} value={m}>{formatMonthLabel(m)}</option>
          ))}
        </select>
      </div>

      <div className="totals">
        <div><span>{formatNum(total.hours)}</span> ч</div>
        <div><span>{formatNum(total.km)}</span> км</div>
        <div className="pay"><span>€{formatNum(total.pay)}</span></div>
      </div>

      {visible.length === 0 ? (
        <div className="empty"><p>Записей нет.</p></div>
      ) : (
        <ul className="entries">
          {visible.map((e) => {
            const h = entryHours(e);
            const pay = entryPay(e, worker);
            return (
              <li key={e.id} className="entry-row" onClick={() => onEditEntry(e.id)}>
                <div className="entry-date">{ddmm(e.date)}</div>
                <div className="entry-main">
                  <div className="entry-loc">
                    {e.location}
                    {!e.lunch && <span className="muted"> без обеда</span>}
                  </div>
                  <div className="entry-time">
                    {e.start}–{e.end} / {formatNum(h)} ч / {formatNum(e.km)} км
                  </div>
                </div>
                <div className="entry-pay">€{formatNum(pay)}</div>
              </li>
            );
          })}
        </ul>
      )}

      <footer className="footer-actions">
        <button className="ghost" onClick={() => setMenuOpen(true)}>Экспорт</button>
        <button className="primary" onClick={onAddEntry}>+ Запись</button>
      </footer>

      {menuOpen && (
        <div className="sheet-backdrop" onClick={() => setMenuOpen(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-title">Экспорт за {formatMonthLabel(month)}</div>
            <button
              className="sheet-btn"
              onClick={() => {
                setMenuOpen(false);
                onOpenReport(month);
              }}
            >
              <span className="sheet-btn-icon">📄</span>
              <span>
                <strong>PDF (для начальника)</strong>
                <small>красиво оформленный отчёт</small>
              </span>
            </button>
            <button
              className="sheet-btn"
              onClick={() => {
                setMenuOpen(false);
                exportExcel(worker, visible, month);
              }}
            >
              <span className="sheet-btn-icon">📊</span>
              <span>
                <strong>Excel (.xlsx)</strong>
                <small>таблица для редактирования</small>
              </span>
            </button>
            <button
              className="sheet-btn"
              onClick={() => {
                setMenuOpen(false);
                exportText();
              }}
            >
              <span className="sheet-btn-icon">📋</span>
              <span>
                <strong>Текст в буфер</strong>
                <small>как в ваших заметках</small>
              </span>
            </button>
            <button className="sheet-cancel" onClick={() => setMenuOpen(false)}>Отмена</button>
          </div>
        </div>
      )}
    </div>
  );
}
