import { useMemo, useState } from 'react';
import type { Entry, Note, Worker } from '../types';
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
  notes: Note[];
  allEntriesForWorker: Entry[];
  onBack: () => void;
  onAddEntry: () => void;
  onAddNote: () => void;
  onEditEntry: (id: string) => void;
  onEditNote: (id: string) => void;
  onEditWorker: () => void;
  onDeleteEntry: (id: string) => void;
  onOpenReport: (monthKey: string) => void;
};

export function WorkerDetail({
  worker,
  entries,
  notes,
  onBack,
  onAddEntry,
  onAddNote,
  onEditEntry,
  onEditNote,
  onEditWorker,
  onOpenReport,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const months = useMemo(() => {
    const set = new Set([
      ...entries.map((e) => entryMonthKey(e.date)),
      ...notes.map((n) => entryMonthKey(n.date)),
    ]);
    set.add(currentMonthKey());
    return Array.from(set).sort().reverse();
  }, [entries, notes]);

  const [month, setMonth] = useState<string>(() => months[0] ?? currentMonthKey());

  const visible = useMemo(
    () =>
      entries
        .filter((e) => entryMonthKey(e.date) === month)
        .sort((a, b) => (a.date < b.date ? 1 : -1)),
    [entries, month],
  );

  const visibleNotes = useMemo(
    () =>
      notes
        .filter((n) => entryMonthKey(n.date) === month)
        .sort((a, b) => (a.date < b.date ? 1 : -1)),
    [notes, month],
  );

  const noteTotals = useMemo(() => {
    let minus = 0;
    let plus = 0;
    for (const n of visibleNotes) {
      if (n.direction === 'minus') minus += n.amount;
      else plus += n.amount;
    }
    return {
      minus: Math.round(minus * 100) / 100,
      plus: Math.round(plus * 100) / 100,
      net: Math.round((plus - minus) * 100) / 100,
    };
  }, [visibleNotes]);

  const total = monthTotal(entries, worker, month);

  function exportText() {
    const lines = visible
      .slice()
      .sort((a, b) => (a.date < b.date ? -1 : 1))
      .map((e) => {
        const lunch = e.lunch ? '' : ' без обеда';
        const locs = [e.location, ...(e.extraSegments?.map((s) => s.location) ?? [])].join(' + ');
        const times = [
          `${e.start}-${e.end}`,
          ...(e.extraSegments?.map((s) => `${s.start}-${s.end}`) ?? []),
        ].join(' · ');
        return `${ddmm(e.date)} ${locs}${lunch}   ${times}/${formatNum(entryHours(e))}/${formatNum(e.km)}км`;
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
                    {e.extraSegments && e.extraSegments.length > 0 && (
                      <>
                        {e.extraSegments.map((s, i) => (
                          <span key={i}>, {s.location}</span>
                        ))}
                      </>
                    )}
                    {!e.lunch && <span className="entry-no-lunch">без обеда</span>}
                    {e.multiplier && e.multiplier !== 1 && (
                      <span className="entry-mult">× {e.multiplier}</span>
                    )}
                  </div>
                  <div className="entry-time">
                    {e.start}–{e.end}
                    {e.extraSegments?.map((s, i) => (
                      <span key={i}> · {s.start}–{s.end}</span>
                    ))}
                    {' / '}
                    {formatNum(h)} ч / {formatNum(e.km)} км
                  </div>
                </div>
                <div className="entry-pay">€{formatNum(pay)}</div>
              </li>
            );
          })}
        </ul>
      )}

      {(visibleNotes.length > 0 || noteTotals.minus > 0 || noteTotals.plus > 0) && (
        <div className="notes-section">
          <div className="section-title">Заметки за {formatMonthLabel(month)}</div>
          <div className="note-totals">
            <div className="note-total minus">
              <div className="note-total-label">Я должен</div>
              <div className="note-total-value">€{formatNum(noteTotals.minus)}</div>
            </div>
            <div className="note-total plus">
              <div className="note-total-label">Мне должны</div>
              <div className="note-total-value">€{formatNum(noteTotals.plus)}</div>
            </div>
            <div className={`note-total net ${noteTotals.net >= 0 ? 'pos' : 'neg'}`}>
              <div className="note-total-label">Итог</div>
              <div className="note-total-value">
                {noteTotals.net >= 0 ? '+' : ''}€{formatNum(Math.abs(noteTotals.net))}
              </div>
            </div>
          </div>

          {visibleNotes.length === 0 ? null : (
            <ul className="entries notes-list">
              {visibleNotes.map((n) => (
                <li key={n.id} className="entry-row" onClick={() => onEditNote(n.id)}>
                  <div className="entry-date">{ddmm(n.date)}</div>
                  <div className="entry-main">
                    <div className="entry-loc">{n.description}</div>
                    <div className="entry-time">
                      {n.direction === 'minus' ? 'я должен' : 'мне должны'}
                    </div>
                  </div>
                  <div className={`entry-pay note-pay ${n.direction}`}>
                    {n.direction === 'minus' ? '−' : '+'}€{formatNum(n.amount)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <footer className="footer-actions">
        <button className="ghost" onClick={() => setMenuOpen(true)}>Экспорт</button>
        <button className="primary" onClick={() => setAddMenuOpen(true)}>+ Добавить</button>
      </footer>

      {addMenuOpen && (
        <div className="sheet-backdrop" onClick={() => setAddMenuOpen(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-title">Что добавить</div>
            <button
              className="sheet-btn"
              onClick={() => {
                setAddMenuOpen(false);
                onAddEntry();
              }}
            >
              <span className="sheet-btn-icon">💼</span>
              <span>
                <strong>Рабочий день</strong>
                <small>локация, время, км — идёт в зарплату</small>
              </span>
            </button>
            <button
              className="sheet-btn"
              onClick={() => {
                setAddMenuOpen(false);
                onAddNote();
              }}
            >
              <span className="sheet-btn-icon">📝</span>
              <span>
                <strong>Заметка</strong>
                <small>заправка, расходы — отдельный учёт</small>
              </span>
            </button>
            <button className="sheet-cancel" onClick={() => setAddMenuOpen(false)}>Отмена</button>
          </div>
        </div>
      )}

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
