import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { AppState, Entry, FeedFilter, Note } from '../types';
import { shiftMonth, ymd } from '../calc';
import { daysOfRange, filterWorkerId, groupByDate, monthDiff, sumDays } from '../feedModel';
import { MonthSection, type PeriodRequest } from '../components/feed/MonthSection';
import { DaySheet, MenuSheet, PeriodSheet, PickWorkerSheet, SwitcherSheet } from '../components/feed/FeedSheets';
import { downloadBackup, readBackup } from '../backup';
import '../feed.css';

type Props = {
  state: AppState;
  onSetFilter: (f: FeedFilter) => void;
  onSetSelf: (workerId: string) => void;
  onAddEntry: (workerId: string, date: string) => void;
  onEditEntry: (e: Entry) => void;
  onAddNote: (workerId: string, date: string) => void;
  onEditNote: (n: Note) => void;
  onOpenWorkerPeriod: (workerId: string, req: PeriodRequest) => void;
  onAddWorker: () => void;
  onEditWorker: (workerId: string) => void;
  onOpenSummary: () => void;
  onImport: (s: AppState) => void;
};

type Sheet =
  | { kind: 'switcher' }
  | { kind: 'self'; then?: { date: string; what: 'entry' | 'note' } }
  | { kind: 'menu' }
  | { kind: 'day'; date: string }
  | { kind: 'period'; req: PeriodRequest }
  | { kind: 'pickWorker'; date: string; what: 'entry' | 'note' };

type Jump = { date: string; smooth: boolean; flash: boolean };

const MONTHS_PER_LOAD = 3;

// Позиция прокрутки и подгруженные месяцы сохраняются, когда уходим на другой экран
// (запись, работник…) — при возврате лента открывается там же, где была.
const memory = { scrollY: null as number | null, loaded: MONTHS_PER_LOAD, floor: null as string | null };

export function CalendarFeed(props: Props) {
  const { state } = props;
  const filter: FeedFilter = state.feedFilter ?? (state.selfWorkerId ? { kind: 'me' } : { kind: 'all' });
  const workerFilter = filterWorkerId(filter, state.selfWorkerId);
  const showNames = workerFilter === undefined;
  const today = ymd(new Date());
  const thisMonth = today.slice(0, 7);

  const [sheet, setSheet] = useState<Sheet | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  /* ---------- Данные для выбранного режима ---------- */

  const workersById = useMemo(() => new Map(state.workers.map((w) => [w.id, w])), [state.workers]);
  const visibleEntries = useMemo(
    () =>
      workerFilter === null ? [] : workerFilter === undefined ? state.entries : state.entries.filter((e) => e.workerId === workerFilter),
    [state.entries, workerFilter],
  );
  const visibleNotes = useMemo(
    () =>
      workerFilter === null ? [] : workerFilter === undefined ? state.notes : state.notes.filter((n) => n.workerId === workerFilter),
    [state.notes, workerFilter],
  );
  const entriesByDate = useMemo(() => groupByDate(visibleEntries), [visibleEntries]);
  const notesByDate = useMemo(() => groupByDate(visibleNotes), [visibleNotes]);

  /* ---------- Какие месяцы показывать ---------- */

  // От самой ранней записи до текущего месяца (или более позднего, если есть записи в будущем).
  const { firstMonth, lastMonth } = useMemo(() => {
    let first = thisMonth;
    let last = thisMonth;
    for (const x of [...state.entries, ...state.notes]) {
      const mk = x.date.slice(0, 7);
      if (mk < first) first = mk;
      if (mk > last) last = mk;
    }
    return { firstMonth: first, lastMonth: last };
  }, [state.entries, state.notes, thisMonth]);

  const [floor, setFloor] = useState<string | null>(memory.floor); // если выбрали дату раньше всех записей
  const [loaded, setLoaded] = useState(memory.loaded);
  const earliest = floor && floor < firstMonth ? floor : firstMonth;
  const totalMonths = monthDiff(earliest, lastMonth) + 1;
  const count = Math.min(loaded, totalMonths);
  const hasMore = count < totalMonths;
  const months = useMemo(
    () => Array.from({ length: count }, (_, i) => shiftMonth(lastMonth, i - count + 1)),
    [count, lastMonth],
  );

  useEffect(() => {
    memory.loaded = loaded;
    memory.floor = floor;
  }, [loaded, floor]);

  /* ---------- Прокрутка ---------- */

  // Подгрузка более ранних месяцев сверху без «прыжка» экрана.
  const prependFrom = useRef<number | null>(null);
  const loadMore = useCallback(() => {
    prependFrom.current = document.documentElement.scrollHeight;
    setLoaded((n) => n + MONTHS_PER_LOAD);
  }, []);

  const jump = useRef<Jump | null>(null);
  const [jumpTick, setJumpTick] = useState(0);

  useLayoutEffect(() => {
    if (prependFrom.current !== null) {
      window.scrollBy(0, document.documentElement.scrollHeight - prependFrom.current);
      prependFrom.current = null;
    }
    const j = jump.current;
    if (j) {
      jump.current = null;
      const el = document.getElementById(`day-${j.date}`);
      if (el) {
        // День — в центр экрана. Далеко — сразу, рядом — плавно (длинная плавная прокрутка тормозит).
        const r = el.getBoundingClientRect();
        const top = Math.max(0, window.scrollY + r.top - (window.innerHeight - r.height) / 2);
        const far = Math.abs(r.top) > window.innerHeight * 2;
        window.scrollTo({ top, behavior: j.smooth && !far ? 'smooth' : 'auto' });
        if (j.flash) {
          el.classList.remove('flash');
          void el.offsetWidth; // перезапуск анимации
          el.classList.add('flash');
          window.setTimeout(() => el.classList.remove('flash'), 1700);
        }
      }
    }
  }, [count, jumpTick, entriesByDate]);

  // Первый показ: вернуться туда, где были, или открыть на сегодняшнем дне.
  useLayoutEffect(() => {
    if (memory.scrollY !== null) window.scrollTo(0, memory.scrollY);
    else document.getElementById(`day-${today}`)?.scrollIntoView({ block: 'center' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const topRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!hasMore || !topRef.current) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && loadMore(), {
      rootMargin: '700px 0px 0px 0px',
    });
    io.observe(topRef.current);
    return () => io.disconnect();
  }, [hasMore, loadMore, count]);

  function goTo(date: string, opts: { smooth?: boolean; flash?: boolean } = {}) {
    const mk = date.slice(0, 7);
    if (mk > lastMonth) {
      alert('Будущие месяцы пока не показываются — записей там нет.');
      return;
    }
    if (mk < earliest) setFloor(mk);
    const need = monthDiff(mk, lastMonth) + 1;
    if (need > loaded) setLoaded(need);
    jump.current = { date, smooth: opts.smooth ?? true, flash: opts.flash ?? true };
    setJumpTick((t) => t + 1);
  }

  // При смене режима остаёмся на том же дне, что был по центру экрана.
  function changeFilter(f: FeedFilter) {
    const center = document
      .elementFromPoint(window.innerWidth / 2, window.innerHeight / 2)
      ?.closest('.feed-day') as HTMLElement | null;
    if (center?.id) jump.current = { date: center.id.slice(4), smooth: false, flash: false };
    setSheet(null);
    props.onSetFilter(f);
    setJumpTick((t) => t + 1);
  }

  /* ---------- Переходы на другие экраны ---------- */

  const leave = (fn: () => void) => {
    memory.scrollY = window.scrollY;
    setSheet(null);
    fn();
  };

  // Добавление записи: для кого — зависит от режима.
  function startAdd(date: string, what: 'entry' | 'note') {
    if (workerFilter === null) {
      setSheet({ kind: 'self', then: { date, what } });
      return;
    }
    if (workerFilter === undefined) {
      if (state.workers.length === 1) return finishAdd(state.workers[0].id, date, what);
      setSheet({ kind: 'pickWorker', date, what });
      return;
    }
    finishAdd(workerFilter, date, what);
  }
  function finishAdd(workerId: string, date: string, what: 'entry' | 'note') {
    leave(() => (what === 'entry' ? props.onAddEntry(workerId, date) : props.onAddNote(workerId, date)));
  }

  const onDay = useCallback((date: string) => setSheet({ kind: 'day', date }), []);
  const onPeriod = useCallback((req: PeriodRequest) => setSheet({ kind: 'period', req }), []);

  function periodData(req: PeriodRequest) {
    const days = daysOfRange(req.start, req.end);
    const scope = workerFilter === undefined ? state.workers : state.workers.filter((w) => w.id === workerFilter);
    const rows = scope
      .map((w) => {
        const es = state.entries.filter((e) => e.workerId === w.id && e.date >= req.start && e.date <= req.end);
        const ns = state.notes.filter((n) => n.workerId === w.id && n.date >= req.start && n.date <= req.end);
        return { worker: w, t: sumDays(days, groupByDate(es), groupByDate(ns), workersById) };
      })
      .filter((r) => workerFilter !== undefined || r.t.count > 0 || r.t.pay > 0);
    return { rows, total: sumDays(days, entriesByDate, notesByDate, workersById) };
  }

  const filterLabel =
    filter.kind === 'all'
      ? 'Все работники'
      : filter.kind === 'me'
        ? 'Мои часы'
        : (workersById.get(filter.workerId)?.name ?? 'Работник');

  return (
    <div className="feed">
      <header className="feed-header">
        <span className="test-tag">ТЕСТ</span>
        <button className="feed-switch" onClick={() => setSheet({ kind: 'switcher' })}>
          <span className="feed-switch-label">{filterLabel}</span>
          <span className="feed-switch-caret">▾</span>
        </button>
        <label className="feed-icon-btn" aria-label="Перейти к дате">
          📅
          <input
            type="date"
            className="feed-date-input"
            defaultValue={today}
            onClick={(e) => (e.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.()}
            onChange={(e) => e.target.value && goTo(e.target.value)}
          />
        </label>
        <button className="feed-icon-btn" onClick={() => setSheet({ kind: 'menu' })} aria-label="Меню">
          ⋯
        </button>
      </header>

      {state.workers.length === 0 ? (
        <div className="feed-banner">
          <span>Добавьте первого работника (или себя), чтобы начать записывать часы.</span>
          <button onClick={() => leave(props.onAddWorker)}>Добавить</button>
        </div>
      ) : (
        workerFilter === null && (
          <div className="feed-banner">
            <span>Выберите, кто из работников — вы, чтобы видеть «Мои часы».</span>
            <button onClick={() => setSheet({ kind: 'self' })}>Выбрать</button>
          </div>
        )
      )}

      {/* Ранние месяцы подгружаются сами при прокрутке вверх; кнопка — на всякий случай. */}
      <div ref={topRef} className="feed-top">
        {hasMore ? (
          <button className="feed-more" onClick={loadMore}>
            ↑ Показать более ранние месяцы
          </button>
        ) : (
          'Начало записей'
        )}
      </div>

      {months.map((mk) => (
        <MonthSection
          key={mk}
          monthKey={mk}
          entriesByDate={entriesByDate}
          notesByDate={notesByDate}
          workersById={workersById}
          showNames={showNames}
          today={today}
          isLastMonth={mk === lastMonth}
          onDay={onDay}
          onPeriod={onPeriod}
        />
      ))}

      <button className="feed-today-btn" onClick={() => goTo(today)}>
        Сегодня
      </button>
      <button className="feed-fab" onClick={() => startAdd(today, 'entry')} aria-label="Добавить запись за сегодня">
        +
      </button>

      <input
        ref={fileRef}
        type="file"
        accept="application/json"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) readBackup(f, props.onImport);
          e.target.value = '';
        }}
      />

      {sheet?.kind === 'switcher' && (
        <SwitcherSheet
          workers={state.workers}
          filter={filter}
          selfWorkerId={state.selfWorkerId}
          onPick={(f) => (f.kind === 'me' && !state.selfWorkerId ? setSheet({ kind: 'self' }) : changeFilter(f))}
          onChangeSelf={() => setSheet({ kind: 'self' })}
          onAddWorker={() => leave(props.onAddWorker)}
          onEditWorker={(id) => leave(() => props.onEditWorker(id))}
          onClose={() => setSheet(null)}
        />
      )}

      {sheet?.kind === 'self' && (
        <PickWorkerSheet
          title="Кто из работников — вы?"
          hint="Это нужно для режима «Мои часы». Изменить можно в любой момент."
          workers={state.workers}
          onPick={(id) => {
            props.onSetSelf(id);
            const then = sheet.then;
            if (then) finishAdd(id, then.date, then.what);
            else changeFilter({ kind: 'me' });
          }}
          onAddWorker={() => leave(props.onAddWorker)}
          onClose={() => setSheet(null)}
        />
      )}

      {sheet?.kind === 'pickWorker' && (
        <PickWorkerSheet
          title={sheet.what === 'entry' ? 'Для кого рабочий день?' : 'Для кого заметка?'}
          workers={state.workers}
          onPick={(id) => finishAdd(id, sheet.date, sheet.what)}
          onAddWorker={() => leave(props.onAddWorker)}
          onClose={() => setSheet(null)}
        />
      )}

      {sheet?.kind === 'menu' && (
        <MenuSheet
          onSummary={() => leave(props.onOpenSummary)}
          onBackup={() => {
            setSheet(null);
            downloadBackup(state);
          }}
          onImport={() => {
            setSheet(null);
            fileRef.current?.click();
          }}
          onClose={() => setSheet(null)}
        />
      )}

      {sheet?.kind === 'day' && (
        <DaySheet
          date={sheet.date}
          entries={entriesByDate.get(sheet.date) ?? []}
          notes={notesByDate.get(sheet.date) ?? []}
          workersById={workersById}
          showNames={showNames}
          onEditEntry={(e) => leave(() => props.onEditEntry(e))}
          onEditNote={(n) => leave(() => props.onEditNote(n))}
          onAddEntry={() => startAdd(sheet.date, 'entry')}
          onAddNote={() => startAdd(sheet.date, 'note')}
          onClose={() => setSheet(null)}
        />
      )}

      {sheet?.kind === 'period' &&
        (() => {
          const { rows, total } = periodData(sheet.req);
          return (
            <PeriodSheet
              req={sheet.req}
              rows={rows}
              total={total}
              team={workerFilter === undefined}
              onOpenWorker={(id) => leave(() => props.onOpenWorkerPeriod(id, sheet.req))}
              onClose={() => setSheet(null)}
            />
          );
        })()}
    </div>
  );
}
