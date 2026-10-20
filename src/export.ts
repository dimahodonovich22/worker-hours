import * as XLSX from 'xlsx';
import type { Entry, Note, Worker } from './types';
import { ddmm, entryHours, entryPay, noteEffectiveAmount } from './calc';

export function exportExcel(
  worker: Worker,
  entries: Entry[],
  period: { label: string; tag: string },
  expenses: Note[] = [],
): void {
  const sorted = entries.slice().sort((a, b) => (a.date < b.date ? -1 : 1));

  let totalHours = 0;
  let totalKm = 0;
  let totalPay = 0;

  const rows: Record<string, string | number>[] = sorted.map((e) => {
    const hours = entryHours(e);
    const sum = entryPay(e, worker);
    totalHours += hours;
    totalKm += e.km || 0;
    totalPay += sum;
    const locs = [e.location, ...(e.extraSegments?.map((s) => s.location) ?? [])].join(' + ');
    const times = [
      `${e.start}–${e.end}`,
      ...(e.extraSegments?.map((s) => `${s.start}–${s.end}`) ?? []),
    ].join(' · ');
    return {
      Дата: ddmm(e.date),
      Локация: locs,
      Время: times,
      Обед: e.lunch ? '30 мин' : 'без обеда',
      'Часы': hours,
      'Км': e.km,
      'Сумма €': sum,
    };
  });

  // Расходы по работе (парковка, покупки) — отдельными строками, входят в итог.
  if (expenses.length) {
    rows.push({ Дата: '', Локация: 'РАСХОДЫ ПО РАБОТЕ', Время: '', Обед: '', Часы: '', Км: '', 'Сумма €': '' });
    for (const n of expenses) {
      const amount = noteEffectiveAmount(n);
      totalPay += amount;
      rows.push({ Дата: ddmm(n.date), Локация: n.description, Время: '', Обед: '', Часы: '', Км: '', 'Сумма €': amount });
    }
  }

  totalPay = Math.round(totalPay * 100) / 100;

  rows.push({
    Дата: '',
    Локация: 'ИТОГО',
    Время: '',
    Обед: '',
    Часы: Math.round(totalHours * 100) / 100,
    Км: Math.round(totalKm * 100) / 100,
    'Сумма €': totalPay,
  });

  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [
    { wch: 8 },  // дата
    { wch: 28 }, // локация
    { wch: 18 }, // время
    { wch: 12 }, // обед
    { wch: 8 },  // часы
    { wch: 8 },  // км
    { wch: 12 }, // сумма
  ];

  // Жирная нижняя строка с итогами
  const lastRow = rows.length + 1; // +1 для заголовка
  ['A','B','C','D','E','F','G'].forEach((col) => {
    const cell = ws[`${col}${lastRow}`];
    if (cell) {
      cell.s = { font: { bold: true } };
    }
  });

  const wb = XLSX.utils.book_new();
  const sheetName = period.label.slice(0, 31);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  const filename = `${sanitize(worker.name)}_${period.tag}.xlsx`;
  XLSX.writeFile(wb, filename);
}

function sanitize(s: string): string {
  return s.replace(/[^a-zA-Zа-яА-Я0-9_-]/g, '_');
}
