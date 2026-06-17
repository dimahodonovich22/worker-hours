import type { Entry, Worker } from './types';

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function segmentMinutes(start: string, end: string): number {
  if (!start || !end) return 0;
  let mins = toMinutes(end) - toMinutes(start);
  if (mins < 0) mins += 24 * 60; // через полночь
  return Math.max(0, mins);
}

export function entryHours(e: Entry): number {
  let mins = segmentMinutes(e.start, e.end);
  for (const s of e.extraSegments ?? []) {
    mins += segmentMinutes(s.start, s.end);
  }
  if (e.lunch) mins -= 30;
  if (mins < 0) mins = 0;
  const mult = e.multiplier && e.multiplier > 0 ? e.multiplier : 1;
  return Math.round((mins / 60) * mult * 100) / 100;
}

export function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function entryMonthKey(dateStr: string): string {
  return dateStr.slice(0, 7); // YYYY-MM
}

export type MonthTotal = {
  hours: number;
  km: number;
  pay: number;
  count: number;
};

export function entryRate(e: Entry, worker: Worker): { hourly: number; perKm: number } {
  return {
    hourly: e.hourly ?? worker.hourly ?? 0,
    perKm: e.perKm ?? worker.perKm ?? 0,
  };
}

export function entryPay(e: Entry, worker: Worker): number {
  const { hourly, perKm } = entryRate(e, worker);
  return Math.round((entryHours(e) * hourly + (e.km || 0) * perKm) * 100) / 100;
}

/** Понедельник недели, в которую попадает дата (формат YYYY-MM-DD). */
export function weekStartDate(d: Date): Date {
  const x = new Date(d);
  const day = x.getDay(); // 0=вс, 1=пн, ...
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}
export function currentWeekStart(): string {
  return ymd(weekStartDate(new Date()));
}
export function weekStartFromDateStr(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return ymd(weekStartDate(d));
}
export function weekEnd(startStr: string): string {
  const d = new Date(startStr + 'T00:00:00');
  d.setDate(d.getDate() + 6);
  return ymd(d);
}
export function shiftWeek(startStr: string, deltaWeeks: number): string {
  const d = new Date(startStr + 'T00:00:00');
  d.setDate(d.getDate() + 7 * deltaWeeks);
  return ymd(d);
}
export function formatWeekLabel(startStr: string): string {
  return formatRangeLabel(startStr, weekEnd(startStr));
}
export function formatRangeLabel(startStr: string, endStr: string): string {
  const [ys, ms, ds] = startStr.split('-');
  const [ye, me, de] = endStr.split('-');
  if (ys === ye && ms === me) return `${ds}–${de}.${ms}.${ys}`;
  if (ys === ye) return `${ds}.${ms} – ${de}.${me}.${ys}`;
  return `${ds}.${ms}.${ys} – ${de}.${me}.${ye}`;
}
export function daysBetween(startStr: string, endStr: string): number {
  const s = new Date(startStr + 'T00:00:00');
  const e = new Date(endStr + 'T00:00:00');
  return Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
}
export function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return ymd(d);
}

export function rangeTotal(
  entries: Entry[],
  worker: Worker,
  startStr: string,
  endStr: string,
): MonthTotal {
  let hours = 0;
  let km = 0;
  let pay = 0;
  let count = 0;
  for (const e of entries) {
    if (e.workerId !== worker.id) continue;
    if (e.date < startStr || e.date > endStr) continue;
    hours += entryHours(e);
    km += e.km || 0;
    pay += entryPay(e, worker);
    count += 1;
  }
  return {
    hours: Math.round(hours * 100) / 100,
    km: Math.round(km * 100) / 100,
    pay: Math.round(pay * 100) / 100,
    count,
  };
}

export function monthTotal(entries: Entry[], worker: Worker, monthKey: string): MonthTotal {
  let hours = 0;
  let km = 0;
  let pay = 0;
  let count = 0;
  for (const e of entries) {
    if (e.workerId !== worker.id) continue;
    if (entryMonthKey(e.date) !== monthKey) continue;
    hours += entryHours(e);
    km += e.km || 0;
    pay += entryPay(e, worker);
    count += 1;
  }
  return {
    hours: Math.round(hours * 100) / 100,
    km: Math.round(km * 100) / 100,
    pay: Math.round(pay * 100) / 100,
    count,
  };
}

export function formatNum(n: number): string {
  // 8 → "8", 8.5 → "8,5"
  if (Number.isInteger(n)) return String(n);
  return String(n).replace('.', ',');
}

export function formatMonthLabel(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  const months = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
  return `${months[m - 1]} ${y}`;
}

export function ddmm(dateStr: string): string {
  const [, m, d] = dateStr.split('-');
  return `${d}.${m}`;
}
