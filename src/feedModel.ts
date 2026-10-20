// Модель ленты месяцев: недели, номера недель, фильтр по людям, итоги за дни.
import type { Entry, FeedFilter, Note, Worker } from './types';
import { entryHours, entryPay, isPayExpense, noteEffectiveAmount, weekEnd, weekStartFromDateStr } from './calc';

export const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
export const MONTHS_NOM = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

const round2 = (n: number) => Math.round(n * 100) / 100;

function utcDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** 0 = понедельник … 6 = воскресенье. */
export function weekdayIndex(dateStr: string): number {
  return (utcDate(dateStr).getUTCDay() + 6) % 7;
}

/** ISO-номер недели: недели с понедельника, 1-я неделя содержит 4 января. */
export function isoWeek(dateStr: string): number {
  const date = utcDate(dateStr);
  date.setUTCDate(date.getUTCDate() - weekdayIndex(dateStr) + 3); // четверг этой недели
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  firstThursday.setUTCDate(firstThursday.getUTCDate() - ((firstThursday.getUTCDay() + 6) % 7) + 3);
  return 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 86400000));
}

/** Разница в месяцах между ключами YYYY-MM (b − a). */
export function monthDiff(a: string, b: string): number {
  const [ya, ma] = a.split('-').map(Number);
  const [yb, mb] = b.split('-').map(Number);
  return (yb - ya) * 12 + (mb - ma);
}

/**
 * Часть недели внутри одного месяца. Неделя на стыке месяцев делится на две части:
 * каждый день показывается ровно один раз — в своём месяце.
 */
export type WeekPart = {
  weekStart: string; // понедельник
  weekEnd: string;   // воскресенье
  days: string[];    // дни этой недели, попадающие в месяц
  hasWeekEnd: boolean;   // воскресенье недели в этом месяце
  hasWeekStart: boolean; // понедельник недели в этом месяце
};

export function monthWeeks(monthKey: string): WeekPart[] {
  const [y, m] = monthKey.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  const parts: WeekPart[] = [];
  for (let d = 1; d <= last; d++) {
    const ds = `${monthKey}-${String(d).padStart(2, '0')}`;
    const ws = weekStartFromDateStr(ds);
    let part = parts[parts.length - 1];
    if (!part || part.weekStart !== ws) {
      part = { weekStart: ws, weekEnd: weekEnd(ws), days: [], hasWeekEnd: false, hasWeekStart: false };
      parts.push(part);
    }
    part.days.push(ds);
    if (ds === part.weekEnd) part.hasWeekEnd = true;
    if (ds === part.weekStart) part.hasWeekStart = true;
  }
  return parts;
}

/** Все дни диапазона включительно (YYYY-MM-DD). */
export function daysOfRange(start: string, end: string): string[] {
  const out: string[] = [];
  const d = utcDate(start);
  const last = utcDate(end).getTime();
  while (d.getTime() <= last) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/**
 * Какого работника показывать: id — один человек, undefined — все,
 * null — режим «Мои часы», но пользователь ещё не выбрал себя.
 */
export function filterWorkerId(filter: FeedFilter, selfWorkerId?: string): string | null | undefined {
  if (filter.kind === 'all') return undefined;
  if (filter.kind === 'worker') return filter.workerId;
  return selfWorkerId ?? null;
}

export function groupByDate<T extends { date: string }>(items: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const it of items) {
    const list = map.get(it.date);
    if (list) list.push(it);
    else map.set(it.date, [it]);
  }
  return map;
}

export type DayTotals = {
  hours: number;
  km: number;
  work: number;     // заработок за часы и км
  expenses: number; // расходы по работе (входят в сумму к выплате)
  pay: number;      // work + expenses
  count: number;    // рабочих записей
};

/** Итоги за набор дней — каждый день учитывается один раз, без дублей на стыке месяцев. */
export function sumDays(
  days: string[],
  entriesByDate: Map<string, Entry[]>,
  notesByDate: Map<string, Note[]>,
  workersById: Map<string, Worker>,
): DayTotals {
  let hours = 0;
  let km = 0;
  let work = 0;
  let expenses = 0;
  let count = 0;
  for (const ds of days) {
    for (const e of entriesByDate.get(ds) ?? []) {
      const w = workersById.get(e.workerId) ?? { id: e.workerId, name: '' };
      hours += entryHours(e);
      km += e.km || 0;
      work += entryPay(e, w);
      count += 1;
    }
    for (const n of notesByDate.get(ds) ?? []) {
      if (isPayExpense(n)) expenses += noteEffectiveAmount(n);
    }
  }
  return {
    hours: round2(hours),
    km: round2(km),
    work: round2(work),
    expenses: round2(expenses),
    pay: round2(work + expenses),
    count,
  };
}

/** Локации записи одной строкой: «Гент + Антверпен». */
export function entryLocations(e: Entry): string {
  return [e.location, ...(e.extraSegments?.map((s) => s.location) ?? [])].join(' + ');
}
