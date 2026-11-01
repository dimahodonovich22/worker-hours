// Что именно изменил работник: список «было → стало» для проверки администратором.
import type { Entry, Note } from './types';
import { ddmm, entryHours, formatNum } from './calc';
import { entryLocations } from './feedModel';

export type DiffLine = { label: string; from: string; to: string };

const yesNo = (v: boolean | undefined) => (v ? 'да' : 'нет');
const money = (n: number | undefined) => `€${formatNum(n ?? 0)}`;
const times = (e: Entry) =>
  [`${e.start}–${e.end}`, ...(e.extraSegments?.map((s) => `${s.start}–${s.end}`) ?? [])].join(' · ');

function collect(pairs: [string, string, string][]): DiffLine[] {
  return pairs.filter(([, a, b]) => a !== b).map(([label, from, to]) => ({ label, from, to }));
}

export function entryDiff(cur: Entry, next: Entry): DiffLine[] {
  return collect([
    ['Дата', ddmm(cur.date), ddmm(next.date)],
    ['Объект', entryLocations(cur), entryLocations(next)],
    ['Время', times(cur), times(next)],
    ['Обед 30 мин', yesNo(cur.lunch), yesNo(next.lunch)],
    ['Км', formatNum(cur.km || 0), formatNum(next.km || 0)],
    ['Коэффициент', `×${formatNum(cur.multiplier ?? 1)}`, `×${formatNum(next.multiplier ?? 1)}`],
    ['Фото', String(cur.photos?.length ?? 0), String(next.photos?.length ?? 0)],
    // Итог по часам — чтобы сразу было видно, на сколько изменилось
    ['Часы', `${formatNum(entryHours(cur))} ч`, `${formatNum(entryHours(next))} ч`],
  ]);
}

const DIRECTION = { minus: 'я должен', plus: 'мне должны' } as const;

export function noteDiff(cur: Note, next: Note): DiffLine[] {
  return collect([
    ['Дата', ddmm(cur.date), ddmm(next.date)],
    ['Тип', DIRECTION[cur.direction], DIRECTION[next.direction]],
    ['Сумма', money(cur.amount), money(next.amount)],
    ['Описание', cur.description, next.description],
    ['Расход по работе', yesNo(cur.addToPay), yesNo(next.addToPay)],
    ['Кэш', yesNo(cur.cash), yesNo(next.cash)],
    ['Вычет с кэша', `${formatNum(cur.cashDeductPercent ?? 0)}%`, `${formatNum(next.cashDeductPercent ?? 0)}%`],
    ['Фото', String(cur.photos?.length ?? 0), String(next.photos?.length ?? 0)],
  ]);
}

export type PendingItem =
  | { kind: 'entries'; item: Entry; diff: DiffLine[] }
  | { kind: 'notes'; item: Note; diff: DiffLine[] };

/** Все исправления, ждущие решения, — новые сверху. */
export function pendingItems(entries: Entry[], notes: Note[]): PendingItem[] {
  const list: PendingItem[] = [];
  for (const e of entries) if (e.pendingChange) list.push({ kind: 'entries', item: e, diff: entryDiff(e, e.pendingChange.data) });
  for (const n of notes) if (n.pendingChange) list.push({ kind: 'notes', item: n, diff: noteDiff(n, n.pendingChange.data) });
  return list.sort((a, b) => (b.item.pendingChange?.at ?? 0) - (a.item.pendingChange?.at ?? 0));
}

/** Как показать запись так, как её видит работник: с его исправлением, если оно ещё не проверено. */
export function withProposal<T extends Entry | Note>(item: T): T {
  if (!item.pendingChange) return item;
  return { ...(item.pendingChange.data as T), id: item.id, workerId: item.workerId };
}
