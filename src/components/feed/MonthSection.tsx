import { memo, useMemo } from 'react';
import type { Entry, Note, Worker } from '../../types';
import { Icon } from '../Icon';
import { ddmm, entryHours, formatNum, noteEffectiveAmount } from '../../calc';
import {
  MONTHS_NOM,
  WEEKDAYS,
  daysOfRange,
  entryLocations,
  invoiceTotals,
  isoWeek,
  monthWeeks,
  sumDays,
  weekdayIndex,
  type DayTotals,
  type Rates,
  monthRequest,
  weekRequest,
  type PeriodRequest,
} from '../../feedModel';

export type { PeriodRequest } from '../../feedModel';

type Props = {
  monthKey: string;
  entriesByDate: Map<string, Entry[]>;
  notesByDate: Map<string, Note[]>;
  workersById: Map<string, Worker>;
  showNames: boolean; // режим «Все работники» — подписываем, чья запись
  today: string;
  isLastMonth: boolean; // самый новый месяц ленты — его последнюю неделю подытоживаем здесь
  lastWeekStart: string; // недели позже этой (будущие) не показываем
  rates: Rates | null; // ставка фактуры (администратор); null — суммы по ставкам в записях (работник)
  onDay: (date: string) => void;
  onPeriod: (req: PeriodRequest) => void;
};

export function totalsLabel(t: DayTotals): string {
  if (t.count === 0 && t.pay === 0) return '—';
  const km = t.km > 0 ? ` · ${formatNum(t.km)} км` : '';
  return `${formatNum(t.hours)} ч${km} · €${formatNum(t.pay)}`;
}

export const MonthSection = memo(function MonthSection({
  monthKey,
  entriesByDate,
  notesByDate,
  workersById,
  showNames,
  today,
  isLastMonth,
  lastWeekStart,
  rates,
  onDay,
  onPeriod,
}: Props) {
  const parts = useMemo(() => monthWeeks(monthKey), [monthKey]);
  const monthDays = parts.flatMap((p) => p.days);
  const [y, m] = monthKey.split('-').map(Number);
  const title = `${MONTHS_NOM[m - 1]} ${y}`;
  // Итог месяца — только дни этого месяца (неделя на стыке делится, без дублей).
  const withRates = (t: DayTotals) => (rates ? invoiceTotals(t, rates) : t);
  const monthTotal = withRates(sumDays(monthDays, entriesByDate, notesByDate, workersById));

  return (
    <section className="feed-month" id={`month-${monthKey}`}>
      <button
        className="feed-month-head"
        onClick={() =>
          onPeriod(monthRequest(monthKey))
        }
      >
        <span className="feed-month-title">{title}</span>
        <span className="feed-sum">{totalsLabel(monthTotal)}</span>
      </button>

      {/* Недели — новые сверху, прошлые ниже */}
      {parts
        .map((p, i) => ({ p, i }))
        .filter(({ p }) => p.weekStart <= lastWeekStart)
        .reverse()
        .map(({ p, i }) => {
          const weekNo = isoWeek(p.weekStart);
          // Коротко: «12–18.10», а на стыке месяцев — «28.09–04.10».
          const range =
            p.weekStart.slice(5, 7) === p.weekEnd.slice(5, 7)
              ? `${p.weekStart.slice(8)}–${ddmm(p.weekEnd)}`
              : `${ddmm(p.weekStart)}–${ddmm(p.weekEnd)}`;
          // Итог недели показываем один раз: в части, где её воскресенье
          // (или в самом новом месяце, если неделя уходит в будущий месяц).
          const showTotals = p.hasWeekEnd || (isLastMonth && i === parts.length - 1);
          const weekTotal = showTotals
            ? withRates(sumDays(daysOfRange(p.weekStart, p.weekEnd), entriesByDate, notesByDate, workersById))
            : null;
          return (
            <div className="feed-week" key={p.weekStart}>
              <button
                className="feed-week-head"
                onClick={() =>
                  onPeriod(weekRequest(p.weekStart))
                }
              >
                <span>
                  Неделя {weekNo}
                  <span className="feed-week-range">{range}</span>
                </span>
                {weekTotal ? (
                  <span className="feed-sum">{totalsLabel(weekTotal)}</span>
                ) : (
                  <span className="feed-week-cont">итог выше ↑</span>
                )}
              </button>
              {/* Дни снизу вверх: понедельник внизу, воскресенье сверху — как и вся лента (новое сверху) */}
            {[...p.days].reverse().map((ds) => (
                <DayRow
                  key={ds}
                  ds={ds}
                  entries={entriesByDate.get(ds)}
                  notes={notesByDate.get(ds)}
                  workersById={workersById}
                  showNames={showNames}
                  isToday={ds === today}
                  onDay={onDay}
                />
              ))}
            </div>
          );
        })}
    </section>
  );
});

type DayRowProps = {
  ds: string;
  entries?: Entry[];
  notes?: Note[];
  workersById: Map<string, Worker>;
  showNames: boolean;
  isToday: boolean;
  onDay: (date: string) => void;
};

function DayRow({ ds, entries = [], notes = [], workersById, showNames, isToday, onDay }: DayRowProps) {
  const wd = weekdayIndex(ds);
  const weekend = wd >= 5;
  const empty = entries.length === 0 && notes.length === 0;
  const who = (workerId: string) =>
    showNames ? <span className="feed-who"> · {workersById.get(workerId)?.name ?? '—'}</span> : null;

  return (
    <button
      id={`day-${ds}`}
      className={`feed-day${weekend ? ' weekend' : ''}${isToday ? ' today' : ''}${empty ? ' no-records' : ''}`}
      onClick={() => onDay(ds)}
    >
      <span className="feed-day-label">
        <b>{WEEKDAYS[wd]}</b> {ddmm(ds)}
      </span>
      <span className="feed-day-body">
        {entries.length === 0 && notes.length === 0 && (
          <span className="feed-day-empty">{weekend ? 'выходной' : '—'}</span>
        )}
        {entries.map((e) => (
          <span className="feed-line" key={e.id}>
            {/* Длинное название сокращается «…», имя работника видно всегда */}
            <span className="feed-obj">
              {e.pendingChange && <span className="feed-pending" title="Исправление ждёт проверки" />}
              <span className="feed-loc">{entryLocations(e)}</span>
              {who(e.workerId)}
            </span>
            <span className="feed-km">{e.km ? `${formatNum(e.km)} км` : ''}</span>
            <span className="feed-hours">{formatNum(entryHours(e))} ч</span>
          </span>
        ))}
        {notes.map((n) => (
          <span className={`feed-note ${n.direction}`} key={n.id}>
            <span className="feed-obj">
              <Icon name="note" size={12} className="feed-note-icon" />
              {n.pendingChange && <span className="feed-pending" title="Исправление ждёт проверки" />}
              <span className="feed-loc">{n.description}</span>
              {who(n.workerId)}
            </span>
            <span className="feed-note-amt">
              {n.direction === 'minus' ? '−' : '+'}€{formatNum(noteEffectiveAmount(n))}
            </span>
          </span>
        ))}
      </span>
    </button>
  );
}
