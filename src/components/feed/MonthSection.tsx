import { memo, useMemo } from 'react';
import type { Entry, Note, Worker } from '../../types';
import { Icon } from '../Icon';
import { ddmm, entryHours, formatNum, noteEffectiveAmount } from '../../calc';
import {
  MONTHS_NOM,
  WEEKDAYS,
  daysOfRange,
  entryLocations,
  isoWeek,
  monthWeeks,
  sumDays,
  weekdayIndex,
  type DayTotals,
} from '../../feedModel';

export type PeriodRequest = {
  kind: 'week' | 'month';
  start: string;
  end: string;
  title: string;
};

type Props = {
  monthKey: string;
  entriesByDate: Map<string, Entry[]>;
  notesByDate: Map<string, Note[]>;
  workersById: Map<string, Worker>;
  showNames: boolean; // режим «Все работники» — подписываем, чья запись
  today: string;
  isLastMonth: boolean; // нижний месяц ленты — его последнюю неделю подытоживаем здесь
  onDay: (date: string) => void;
  onPeriod: (req: PeriodRequest) => void;
};

export function totalsLabel(t: DayTotals): string {
  if (t.count === 0 && t.pay === 0) return '—';
  return `${formatNum(t.hours)} ч · €${formatNum(t.pay)}`;
}

export const MonthSection = memo(function MonthSection({
  monthKey,
  entriesByDate,
  notesByDate,
  workersById,
  showNames,
  today,
  isLastMonth,
  onDay,
  onPeriod,
}: Props) {
  const parts = useMemo(() => monthWeeks(monthKey), [monthKey]);
  const monthDays = parts.flatMap((p) => p.days);
  const [y, m] = monthKey.split('-').map(Number);
  const title = `${MONTHS_NOM[m - 1]} ${y}`;
  // Итог месяца — только дни этого месяца (неделя на стыке делится, без дублей).
  const monthTotal = sumDays(monthDays, entriesByDate, notesByDate, workersById);

  return (
    <section className="feed-month" id={`month-${monthKey}`}>
      <button
        className="feed-month-head"
        onClick={() =>
          onPeriod({ kind: 'month', start: monthDays[0], end: monthDays[monthDays.length - 1], title })
        }
      >
        <span className="feed-month-title">{title}</span>
        <span className="feed-sum">{totalsLabel(monthTotal)}</span>
      </button>

      {parts.map((p, i) => {
        const weekNo = isoWeek(p.weekStart);
        const range = `${ddmm(p.weekStart)}–${ddmm(p.weekEnd)}`;
        // Итог недели показываем один раз: в части, где её воскресенье
        // (или в самом нижнем месяце, если неделя уходит в будущий месяц).
        const showTotals = p.hasWeekEnd || (isLastMonth && i === parts.length - 1);
        const weekTotal = showTotals
          ? sumDays(daysOfRange(p.weekStart, p.weekEnd), entriesByDate, notesByDate, workersById)
          : null;
        return (
          <div className="feed-week" key={p.weekStart}>
            <button
              className="feed-week-head"
              onClick={() =>
                onPeriod({
                  kind: 'week',
                  start: p.weekStart,
                  end: p.weekEnd,
                  title: `Неделя ${weekNo} · ${range}`,
                })
              }
            >
              <span>
                Неделя {weekNo}
                <span className="feed-week-range">{range}</span>
              </span>
              {weekTotal ? (
                <span className="feed-sum">{totalsLabel(weekTotal)}</span>
              ) : (
                <span className="feed-week-cont">итог ниже ↓</span>
              )}
            </button>
            {p.days.map((ds) => (
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
            <span className="feed-obj">
              {entryLocations(e)}
              {who(e.workerId)}
            </span>
            <span className="feed-hours">{formatNum(entryHours(e))} ч</span>
          </span>
        ))}
        {notes.map((n) => (
          <span className={`feed-note ${n.direction}`} key={n.id}>
            <span className="feed-obj">
              <Icon name="note" size={12} className="feed-note-icon" />
              {n.description}
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
