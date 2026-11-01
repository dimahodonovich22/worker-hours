import { useState, type ReactNode } from 'react';
import type { Entry, FeedFilter, Note, Worker } from '../../types';
import { Icon } from '../Icon';
import { entryHours, entryPay, formatNum, isPayExpense, noteEffectiveAmount } from '../../calc';
import {
  entryInvoicePay,
  entryLocations,
  WEEKDAYS,
  weekdayIndex,
  type DayTotals,
  type Earnings,
  type Rates,
  type WorkerEarning,
} from '../../feedModel';
import type { PeriodRequest } from './MonthSection';
import type { PendingItem } from '../../changes';

const WEEKDAYS_FULL = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];

function Sheet({ title, onClose, children }: { title: ReactNode; onClose: () => void; children: ReactNode }) {
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
  canManage: boolean; // администратор: настройки работников, «кто я», добавить работника
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
        {(p.canManage || self) && (
          <div className="pick-row-wrap">
            <button className={`pick-row ${isOn({ kind: 'me' }) ? 'on' : ''}`} onClick={() => p.onPick({ kind: 'me' })}>
              <span>Мои часы {self && <small>· {self.name}</small>}</span>
              <span>{mark(isOn({ kind: 'me' }))}</span>
            </button>
            {p.canManage && (
              <button className="pick-side" onClick={p.onChangeSelf} aria-label="Кто из работников — я">
                <Icon name="userCheck" size={18} />
              </button>
            )}
          </div>
        )}
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
              {p.canManage && (
                <button className="pick-side" onClick={() => p.onEditWorker(w.id)} aria-label="Настройки работника">
                  <Icon name="pencil" size={17} />
                </button>
              )}
            </div>
          );
        })}
      </div>
      {p.canManage && (
        <button className="ghost" onClick={p.onAddWorker}>
          + Добавить работника
        </button>
      )}
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
  isAdmin: boolean;
  login: string;
  onLogout: () => void;
  onSummary: () => void;
  onBackup: () => void;
  onImport: () => void;
  onClose: () => void;
};

export function MenuSheet(p: MenuProps) {
  return (
    <Sheet title="Меню" onClose={p.onClose}>
      {p.isAdmin && (
        <>
          <button className="sheet-btn" onClick={p.onSummary}>
            <span className="sheet-btn-icon">
              <Icon name="chart" />
            </span>
            <span>
              <strong>Сводка и итоги</strong>
              <small>прежний главный экран: работники, ставки, заметки</small>
            </span>
          </button>
          <button className="sheet-btn" onClick={p.onBackup}>
            <span className="sheet-btn-icon">
              <Icon name="download" />
            </span>
            <span>
              <strong>Скачать backup</strong>
              <small>копия всех данных с сервера в файл</small>
            </span>
          </button>
          <button className="sheet-btn" onClick={p.onImport}>
            <span className="sheet-btn-icon">
              <Icon name="upload" />
            </span>
            <span>
              <strong>Импорт данных</strong>
              <small>загрузить backup из прежнего приложения на сервер</small>
            </span>
          </button>
        </>
      )}
      <button className="sheet-btn" onClick={p.onLogout}>
        <span className="sheet-btn-icon">
          <Icon name="logout" />
        </span>
        <span>
          <strong>Выйти</strong>
          <small>вы вошли как {p.login}</small>
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
  rates: Rates | null; // ставка фактуры (администратор); null — по ставке в записи (работник)
  isAdmin: boolean;
  login: string;
  onEditEntry: (e: Entry) => void;
  onEditNote: (n: Note) => void;
  onAddEntry: () => void;
  onAddNote: () => void;
  onClose: () => void;
};

export function DaySheet(p: DayProps) {
  const pendingTagText = (by: string) =>
    !p.isAdmin && by === p.login ? 'ваше исправление ждёт подтверждения' : 'исправление ждёт проверки';
  const [y, m, d] = p.date.split('-');
  const title = `${WEEKDAYS_FULL[weekdayIndex(p.date)]}, ${d}.${m}.${y}`;
  const name = (id: string) => (p.showNames ? `${p.workersById.get(id)?.name ?? '—'} · ` : '');

  return (
    <Sheet title={title} onClose={p.onClose}>
      <div className="sheet-list">
        {p.entries.map((e) => {
          const times = [`${e.start}–${e.end}`, ...(e.extraSegments?.map((s) => `${s.start}–${s.end}`) ?? [])].join(
            ' · ',
          );
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
                {e.pendingChange && (
                  <small className="pending-tag">
                    {pendingTagText(e.pendingChange.by)}
                  </small>
                )}
              </span>
              <span className="day-item-side">
                <b>{formatNum(entryHours(e))} ч</b>
                <small>
                  €
                  {formatNum(
                    p.rates
                      ? entryInvoicePay(e, p.rates)
                      : entryPay(
                          e,
                          p.workersById.get(e.workerId) ?? {
                            id: e.workerId,
                            name: '',
                          },
                        ),
                  )}
                </small>
              </span>
            </button>
          );
        })}
        {p.notes.map((n) => (
          <button key={n.id} className="day-item" onClick={() => p.onEditNote(n)}>
            <span className="day-item-main">
              <b>
                <Icon name="note" size={14} className="day-item-icon" />
                {n.description}
              </b>
              <small>
                {name(n.workerId)}
                {isPayExpense(n) ? 'расход по работе · в сумме' : n.direction === 'minus' ? 'я должен' : 'мне должны'}
              </small>
              {n.pendingChange && (
                <small className="pending-tag">
                  {pendingTagText(n.pendingChange.by)}
                </small>
              )}
            </span>
            <span className={`day-item-side note-${n.direction}`}>
              <b>
                {n.direction === 'minus' ? '−' : '+'}€{formatNum(noteEffectiveAmount(n))}
              </b>
            </span>
          </button>
        ))}
        {p.entries.length === 0 && p.notes.length === 0 && (
          <div className="feed-sheet-hint">В этот день записей нет.</div>
        )}
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
  rates: Rates | null;
  ownRate?: Rates | null; // ставка только для просмотра (работник — своя, менеджер — фактуры)
  ownRateLabel?: string;
  showSplitLabel?: boolean;
  onEditRate?: (which: 'hourly' | 'perKm') => void;
  onShift: (dir: 1 | -1) => void; // соседняя неделя / месяц
  earnings?: Earnings | null; // только администратор: «Мой заработок»
  onOpenWorker: (workerId: string) => void;
  onClose: () => void;
};

export function PeriodSheet(p: PeriodProps) {
  const vals = (t: DayTotals) => `${formatNum(t.hours)} ч · ${formatNum(t.km)} км`;
  const [showEarnings, setShowEarnings] = useState(false);
  const unit = p.req.kind === 'week' ? 'неделю' : 'месяц';
  const title = (
    <div className="period-head">
      {p.earnings && (
        <div className="period-head-top">
          <button className={`earn-toggle${showEarnings ? ' on' : ''}`} onClick={() => setShowEarnings((v) => !v)}>
            {showEarnings ? 'Итоги' : 'Мой заработок'}
          </button>
        </div>
      )}
      <div className="period-nav">
        <button
          className="period-arrow"
          onClick={() => p.onShift(-1)}
          aria-label={`Предыдущая ${unit === 'неделю' ? 'неделя' : 'месяц'}`}
        >
          ‹
        </button>
        <span>{p.req.title}</span>
        <button
          className="period-arrow"
          onClick={() => p.onShift(1)}
          aria-label={`Следующая ${unit === 'неделю' ? 'неделя' : 'месяц'}`}
        >
          ›
        </button>
      </div>
    </div>
  );
  if (showEarnings && p.earnings) {
    return (
      <Sheet title={title} onClose={p.onClose}>
        <EarningsView e={p.earnings} />
      </Sheet>
    );
  }
  return (
    <Sheet title={title} onClose={p.onClose}>
      {/* У администратора суммы — по ставке фактуры; её можно изменить здесь. У работника блока нет. */}
      {p.ownRate && !p.onEditRate && (
        <div className="pay-rates">
          <span>{p.ownRateLabel ?? 'Ваша ставка:'}</span>
          <span className="pay-rate pay-rate-static">€{formatNum(p.ownRate.hourly)}/ч</span>
          <span className="pay-rate pay-rate-static">€{formatNum(p.ownRate.perKm)}/км</span>
        </div>
      )}
      {p.rates && p.onEditRate && (
        <div className="pay-rates">
          <span>Ставка фактуры:</span>
          <button className="pay-rate" onClick={() => p.onEditRate?.('hourly')}>
            {p.rates.hourly ? `€${formatNum(p.rates.hourly)}/ч` : 'задать €/ч'}
            <Icon name="pencil" size={13} />
          </button>
          <button className="pay-rate" onClick={() => p.onEditRate?.('perKm')}>
            {p.rates.perKm ? `€${formatNum(p.rates.perKm)}/км` : 'задать €/км'}
            <Icon name="pencil" size={13} />
          </button>
        </div>
      )}
      {p.team && (
        <div className="period-total">
          <span>Вся команда</span>
          <span>
            {vals(p.total)} · <b>€{formatNum(p.total.pay)}</b>
          </span>
        </div>
      )}
      {p.team && p.showSplitLabel && p.rows.length > 0 && (
        <div className="period-split-label">Каждый — по своей ставке</div>
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

/* ---------- Исправления работников: проверка администратором ---------- */

type ChangesProps = {
  items: PendingItem[];
  workersById: Map<string, Worker>;
  onReview: (kind: 'entries' | 'notes', id: string, action: 'approve' | 'reject') => void;
  onClose: () => void;
};

export function ChangesSheet(p: ChangesProps) {
  const when = (at: number) =>
    new Date(at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  return (
    <Sheet title="Изменения ждут проверки" onClose={p.onClose}>
      {p.items.length === 0 ? (
        <div className="feed-sheet-hint">Всё проверено — новых исправлений нет.</div>
      ) : (
        <>
          <div className="feed-sheet-hint">Пока вы не примете исправление, в итогах остаются прежние данные.</div>
          <div className="sheet-list">
            {p.items.map(({ kind, item, diff }) => {
              const who = p.workersById.get(item.workerId)?.name ?? '—';
              const title =
                kind === 'entries' ? entryLocations(item as Entry) : `Заметка: ${(item as Note).description}`;
              const [, m, d] = item.date.split('-');
              return (
                <div className="change-card" key={`${kind}-${item.id}`}>
                  <div className="change-head">
                    <b>{who}</b>
                    <span>
                      {WEEKDAYS[weekdayIndex(item.date)]} {d}.{m} · {title}
                    </span>
                    <small>
                      исправил {item.pendingChange!.by} · {when(item.pendingChange!.at)}
                    </small>
                  </div>
                  {diff.length === 0 ? (
                    <div className="change-line">Изменений по сути нет</div>
                  ) : (
                    diff.map((l) => (
                      <div className="change-line" key={l.label}>
                        <span className="change-label">{l.label}</span>
                        <span className="change-from">{l.from}</span>
                        <span className="change-arrow">→</span>
                        <span className="change-to">{l.to}</span>
                      </div>
                    ))
                  )}
                  <div className="multi-row">
                    <button className="ghost" onClick={() => p.onReview(kind, item.id, 'reject')}>
                      Отклонить
                    </button>
                    <button className="primary" onClick={() => p.onReview(kind, item.id, 'approve')}>
                      Принять
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </Sheet>
  );
}

/* ---------- Мой заработок (только администратор) ---------- */

function EarningsView({ e }: { e: Earnings }) {
  const time = (r: WorkerEarning) => `${formatNum(r.hours)} ч · ${formatNum(r.km)} км · ${r.days} ${days(r.days)}`;
  return (
    <div className="earn">
      <div className="earn-net">
        <span>Мой чистый заработок</span>
        <b>€{formatNum(e.net)}</b>
        <small>
          моя работа €{formatNum(e.self?.invoice ?? 0)} + маржа с работников €{formatNum(e.margin)}
        </small>
      </div>

      <div className="earn-block">
        <div className="earn-title">Моё отработанное время</div>
        {e.self ? (
          <div className="earn-row">
            <span>{time(e.self)}</span>
            <b>€{formatNum(e.self.invoice)}</b>
          </div>
        ) : (
          <div className="earn-muted">
            Нет записей — или не выбрано, кто из работников вы (переключатель вверху → «Мои часы»).
          </div>
        )}
      </div>

      <div className="earn-block">
        <div className="earn-title">
          Маржа с работников <b>€{formatNum(e.margin)}</b>
        </div>
        {e.others.length === 0 && <div className="earn-muted">У работников нет записей за этот период.</div>}
        {e.others.map((r) => (
          <div className="earn-worker" key={r.worker.id}>
            <div className="earn-row">
              <span className="earn-name">{r.worker.name}</span>
              <b>€{formatNum(r.margin)}</b>
            </div>
            <div className="earn-sub">{time(r)}</div>
            <div className="earn-sub">
              фактура €{formatNum(r.invoice)} − оплата €{formatNum(r.paid)}
            </div>
          </div>
        ))}
      </div>

      <div className="earn-foot">
        <div className="earn-row">
          <span>Фактура клиенту (все часы, км и расходы)</span>
          <b>€{formatNum(e.invoiceTotal)}</b>
        </div>
        {e.expenses > 0 && (
          <div className="earn-sub">
            в т.ч. расходы по работе €{formatNum(e.expenses)} — возмещаются, в заработок не входят
          </div>
        )}
      </div>
    </div>
  );
}

function days(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m100 >= 11 && m100 <= 14) return 'дней';
  if (m10 === 1) return 'день';
  if (m10 >= 2 && m10 <= 4) return 'дня';
  return 'дней';
}
