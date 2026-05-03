import type { Entry, Worker } from './types';

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function entryHours(e: Entry): number {
  if (!e.start || !e.end) return 0;
  let mins = toMinutes(e.end) - toMinutes(e.start);
  if (mins < 0) mins += 24 * 60; // через полночь
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
