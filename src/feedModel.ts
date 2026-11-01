// Модель ленты месяцев: недели, номера недель, фильтр по людям, итоги за дни.
import type { Entry, FeedFilter, Note, Worker } from './types';
import {
  ddmm,
  entryHours,
  entryPay,
  isPayExpense,
  noteEffectiveAmount,
  shiftDate,
  shiftMonth,
  weekEnd,
  weekStartFromDateStr,
} from './calc';

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

export type Rates = { hourly: number; perKm: number };

/**
 * Сумма в ленте — по ставке фактуры: все часы и км по одной ставке
 * (как плашка «Всего» в «Сводке»), плюс расходы по работе.
 */
export function invoiceTotals(t: DayTotals, rates: Rates): DayTotals {
  const work = round2(round2(t.hours * rates.hourly) + round2(t.km * rates.perKm));
  return { ...t, work, pay: round2(work + t.expenses) };
}

/** Сумма одной записи по ставке фактуры. */
export function entryInvoicePay(e: Entry, rates: Rates): number {
  return round2(entryHours(e) * rates.hourly + (e.km || 0) * rates.perKm);
}

/** Локации записи одной строкой: «Гент + Антверпен». */
export function entryLocations(e: Entry): string {
  return [e.location, ...(e.extraSegments?.map((s) => s.location) ?? [])].join(' + ');
}

/* ---------- Период для окна итогов (неделя или месяц) ---------- */

export type PeriodRequest = {
  kind: 'week' | 'month';
  start: string;
  end: string;
  title: string;
};

/** «Неделя 44 · 26.10–01.11» (коротко, если неделя внутри одного месяца: «19–25.10»). */
export function weekRequest(weekStart: string): PeriodRequest {
  const end = weekEnd(weekStart);
  const range =
    weekStart.slice(5, 7) === end.slice(5, 7) ? `${weekStart.slice(8)}–${ddmm(end)}` : `${ddmm(weekStart)}–${ddmm(end)}`;
  return { kind: 'week', start: weekStart, end, title: `Неделя ${isoWeek(weekStart)} · ${range}` };
}

export function monthRequest(monthKey: string): PeriodRequest {
  const [y, m] = monthKey.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return {
    kind: 'month',
    start: `${monthKey}-01`,
    end: `${monthKey}-${String(last).padStart(2, '0')}`,
    title: `${MONTHS_NOM[m - 1]} ${y}`,
  };
}

/** Соседняя неделя или месяц (стрелки ‹ › в окне итогов). */
export function shiftRequest(req: PeriodRequest, dir: 1 | -1): PeriodRequest {
  return req.kind === 'week' ? weekRequest(shiftDate(req.start, 7 * dir)) : monthRequest(shiftMonth(req.start.slice(0, 7), dir));
}

/* ---------- Мой заработок (только администратор) ---------- */

export type WorkerEarning = {
  worker: Worker;
  days: number;
  hours: number;
  km: number;
  invoice: number; // часы и км работника по ставке фактуры
  paid: number; // сколько платим работнику (по ставкам в его записях)
  margin: number; // invoice − paid
};

export type Earnings = {
  self: WorkerEarning | null; // моя работа (invoice = мой заработок за свои часы)
  others: WorkerEarning[]; // работники и маржа с них
  margin: number; // моя маржа со всех работников
  net: number; // мой чистый заработок = моя работа + маржа
  expenses: number; // расходы по работе — возмещаются, в заработок не входят
  invoiceTotal: number; // вся фактура клиенту: все часы и км + расходы
};

export function computeEarnings(
  start: string,
  end: string,
  entries: Entry[],
  notes: Note[],
  workers: Worker[],
  selfWorkerId: string | undefined,
  rates: Rates,
): Earnings {
  const rows: WorkerEarning[] = [];
  let expenses = 0;
  for (const w of workers) {
    const es = entries.filter((e) => e.workerId === w.id && e.date >= start && e.date <= end);
    let hours = 0;
    let km = 0;
    let paid = 0;
    for (const e of es) {
      hours += entryHours(e);
      km += e.km || 0;
      paid += entryPay(e, w);
    }
    for (const n of notes) {
      if (n.workerId === w.id && n.date >= start && n.date <= end && isPayExpense(n)) expenses += noteEffectiveAmount(n);
    }
    if (es.length === 0) continue;
    hours = round2(hours);
    km = round2(km);
    const invoice = round2(round2(hours * rates.hourly) + round2(km * rates.perKm));
    paid = round2(paid);
    rows.push({ worker: w, days: new Set(es.map((e) => e.date)).size, hours, km, invoice, paid, margin: round2(invoice - paid) });
  }
  const self = rows.find((r) => r.worker.id === selfWorkerId) ?? null;
  const others = rows.filter((r) => r !== self);
  const margin = round2(others.reduce((s, r) => s + r.margin, 0));
  const invoiceTotal = round2(rows.reduce((s, r) => s + r.invoice, 0) + expenses);
  return { self, others, margin, net: round2((self?.invoice ?? 0) + margin), expenses: round2(expenses), invoiceTotal };
}
