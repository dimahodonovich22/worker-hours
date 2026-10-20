import type { ReactNode } from 'react';
import type { Entry, FeedFilter, Note, Worker } from '../../types';
import { Icon } from '../Icon';
import { entryHours, entryPay, formatNum, isPayExpense, noteEffectiveAmount } from '../../calc';
import { entryLocations, weekdayIndex, type DayTotals } from '../../feedModel';
import type { PeriodRequest } from './MonthSection';

const WEEKDAYS_FULL = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet feed-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-title">{title}</div>
        {children}
        <button className="sheet-cancel" onClick={onClose}>
          Закрыть
        </button>
      </div>
    </div>
  );
}

/* ---------- Чьи часы показывать ---------- */

type SwitcherProps = {
  workers: Worker[];
  filter: FeedFilter;
  selfWorkerId?: string;
  onPick: (f: FeedFilter) => void;
  onChangeSelf: () => void;
  onAddWorker: () => void;
  onEditWorker: (id: string) => void;
  onClose: () => void;
};

export function SwitcherSheet(p: SwitcherProps) {
  const self = p.workers.find((w) => w.id === p.selfWorkerId);
  const isOn = (f: FeedFilter) =>
    f.kind === p.filter.kind &&
    (f.kind !== 'worker' || (p.filter.kind === 'worker' && p.filter.workerId === f.workerId));
  const mark = (on: boolean) => (on ? <Icon name="check" size={18} /> : null);

  return (
    <Sheet title="Чьи часы показывать" onClose={p.onClose}>
      <div className="sheet-list">
        <div className="pick-row-wrap">
          <button className={`pick-row ${isOn({ kind: 'me' }) ? 'on' : ''}`} onClick={() => p.onPick({ kind: 'me' })}>
            <span>
              Мои часы {self && <small>· {self.name}</small>}
            </span>
            <span>{mark(isOn({ kind: 'me' }))}</span>
          </button>
          <button className="pick-side" onClick={p.onChangeSelf} aria-label="Кто из работников — я">
            <Icon name="userCheck" size={18} />
          </button>
        </div>
        <button className={`pick-row ${isOn({ kind: 'all' }) ? 'on' : ''}`} onClick={() => p.onPick({ kind: 'all' })}>
          <span>Все работники</span>
          <span>{mark(isOn({ kind: 'all' }))}</span>
        </button>
        {p.workers.map((w) => {
          const f: FeedFilter = { kind: 'worker', workerId: w.id };
          return (
            <div className="pick-row-wrap" key={w.id}>
              <button className={`pick-row ${isOn(f) ? 'on' : ''}`} onClick={() => p.onPick(f)}>
                <span>
                  {w.name} {w.id === p.selfWorkerId && <small>· это вы</small>}
                </span>
                <span>{mark(isOn(f))}</span>
              </button>
              <button className="pick-side" onClick={() => p.onEditWorker(w.id)} aria-label="Настройки работника">
                <Icon name="pencil" size={17} />
              </button>
            </div>
          );
        })}
      </div>
      <button className="ghost" onClick={p.onAddWorker}>
        + Добавить работника
      </button>
    </Sheet>
  );
}

/* ---------- Выбор работника (кто я / для кого запись) ---------- */

type PickWorkerProps = {
  title: string;
  hint?: string;
  workers: Worker[];
  onPick: (workerId: string) => void;
  onAddWorker: () => void;
  onClose: () => void;
};

export function PickWorkerSheet(p: PickWorkerProps) {
  return (
    <Sheet title={p.title} onClose={p.onClose}>
      {p.hint && <div className="feed-sheet-hint">{p.hint}</div>}
      <div className="sheet-list">
        {p.workers.map((w) => (
          <button key={w.id} className="pick-row" onClick={() => p.onPick(w.id)}>
            <span>{w.name}</span>
            <span>›</span>
          </button>
        ))}
        {p.workers.length === 0 && <div className="feed-sheet-hint">Работников пока нет.</div>}
      </div>
      <button className="ghost" onClick={p.onAddWorker}>
        + Добавить работника
      </button>
    </Sheet>
  );
}

/* ---------- Меню ---------- */

type MenuProps = {
  onSummary: () => void;
  onBackup: () => void;
  onImport: () => void;
  onClose: () => void;
};

export function MenuSheet(p: MenuProps) {
  return (
    <Sheet title="Меню" onClose={p.onClose}>
      <button className="sheet-btn" onClick={p.onSummary}>
        <span className="sheet-btn-icon"><Icon name="chart" /></span>
        <span>
          <strong>Сводка и итоги</strong>
          <small>прежний главный экран: работники, ставки, заметки</small>
        </span>
      </button>
      <button className="sheet-btn" onClick={p.onBackup}>
        <span className="sheet-btn-icon"><Icon name="download" /></span>
        <span>
          <strong>Скачать backup</strong>
          <small>копия данных тестового приложения</small>
        </span>
      </button>
      <button className="sheet-btn" onClick={p.onImport}>
        <span className="sheet-btn-icon"><Icon name="upload" /></span>
        <span>
          <strong>Импорт данных</strong>
          <small>например, backup из основного приложения</small>
        </span>
      </button>
    </Sheet>
  );
}

/* ---------- День ---------- */

type DayProps = {
  date: string;
  entries: Entry[];
  notes: Note[];
  workersById: Map<string, Worker>;
  showNames: boolean;
  onEditEntry: (e: Entry) => void;
  onEditNote: (n: Note) => void;
  onAddEntry: () => void;
  onAddNote: () => void;
  onClose: () => void;
};

export function DaySheet(p: DayProps) {
  const [y, m, d] = p.date.split('-');
  const title = `${WEEKDAYS_FULL[weekdayIndex(p.date)]}, ${d}.${m}.${y}`;
  const name = (id: string) => (p.showNames ? `${p.workersById.get(id)?.name ?? '—'} · ` : '');

  return (
    <Sheet title={title} onClose={p.onClose}>
      <div className="sheet-list">
        {p.entries.map((e) => {
          const w = p.workersById.get(e.workerId) ?? { id: e.workerId, name: '' };
          const times = [`${e.start}–${e.end}`, ...(e.extraSegments?.map((s) => `${s.start}–${s.end}`) ?? [])].join(' · ');
          return (
            <button key={e.id} className="day-item" onClick={() => p.onEditEntry(e)}>
              <span className="day-item-main">
                <b>{entryLocations(e)}</b>
                <small>
                  {name(e.workerId)}
                  {times}
                  {!e.lunch && ' · без обеда'}
                  {e.multiplier && e.multiplier !== 1 ? ` · ×${e.multiplier}` : ''}
                </small>
              </span>
              <span className="day-item-side">
                <b>{formatNum(entryHours(e))} ч</b>
                <small>€{formatNum(entryPay(e, w))}</small>
              </span>
            </button>
          );
        })}
        {p.notes.map((n) => (
          <button key={n.id} className="day-item" onClick={() => p.onEditNote(n)}>
            <span className="day-item-main">
              <b><Icon name="note" size={14} className="day-item-icon" />{n.description}</b>
              <small>
                {name(n.workerId)}
                {isPayExpense(n) ? 'расход по работе · в сумме' : n.direction === 'minus' ? 'я должен' : 'мне должны'}
              </small>
            </span>
            <span className={`day-item-side note-${n.direction}`}>
              <b>
                {n.direction === 'minus' ? '−' : '+'}€{formatNum(noteEffectiveAmount(n))}
              </b>
            </span>
          </button>
        ))}
        {p.entries.length === 0 && p.notes.length === 0 && <div className="feed-sheet-hint">В этот день записей нет.</div>}
      </div>
      <div className="multi-row">
        <button className="primary" onClick={p.onAddEntry}>
          + Рабочий день
        </button>
        <button className="ghost" onClick={p.onAddNote}>
          + Заметка
        </button>
      </div>
    </Sheet>
  );
}

/* ---------- Итог недели / месяца ---------- */

type PeriodProps = {
  req: PeriodRequest;
  rows: { worker: Worker; t: DayTotals }[];
  total: DayTotals;
  team: boolean; // режим «Все работники»
  onOpenWorker: (workerId: string) => void;
  onClose: () => void;
};

export function PeriodSheet(p: PeriodProps) {
  const vals = (t: DayTotals) => `${formatNum(t.hours)} ч · ${formatNum(t.km)} км`;
  return (
    <Sheet title={p.req.title} onClose={p.onClose}>
      {p.team && (
        <div className="period-total">
          <span>Вся команда</span>
          <span>
            {vals(p.total)} · <b>€{formatNum(p.total.pay)}</b>
          </span>
        </div>
      )}
      <div className="sheet-list">
        {p.rows.map(({ worker, t }) => (
          <button key={worker.id} className="sum-row" onClick={() => p.onOpenWorker(worker.id)}>
            <span className="sum-name">{worker.name}</span>
            <span className="sum-vals">
              {vals(t)}
              {t.expenses > 0 && <small> · расходы €{formatNum(t.expenses)}</small>}
            </span>
            <span className="sum-pay">€{formatNum(t.pay)} ›</span>
          </button>
        ))}
        {p.rows.length === 0 && <div className="feed-sheet-hint">За этот период записей нет.</div>}
      </div>
      {p.rows.length > 0 && (
        <div className="feed-sheet-hint">
          Нажмите на человека — откроются его записи за {p.req.kind === 'week' ? 'эту неделю' : 'этот месяц'} с
          экспортом в PDF и Excel.
        </div>
      )}
    </Sheet>
  );
}
