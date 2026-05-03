import * as XLSX from 'xlsx';
import type { Entry, Worker } from './types';
import { ddmm, entryHours, entryPay, formatMonthLabel } from './calc';

export function exportExcel(worker: Worker, entries: Entry[], monthKey: string): void {
  const sorted = entries.slice().sort((a, b) => (a.date < b.date ? -1 : 1));

  let totalHours = 0;
  let totalKm = 0;
  let totalPay = 0;

  const rows = sorted.map((e) => {
    const hours = entryHours(e);
    const sum = entryPay(e, worker);
    totalHours += hours;
    totalKm += e.km || 0;
    totalPay += sum;
    return {
      Дата: ddmm(e.date),
      Локация: e.location,
      Начало: e.start,
      Конец: e.end,
      Обед: e.lunch ? '30 мин' : 'без обеда',
      'Часы': hours,
      'Км': e.km,
      'Сумма €': sum,
    };
  });

  totalPay = Math.round(totalPay * 100) / 100;

  rows.push({
    Дата: '',
    Локация: 'ИТОГО',
    Начало: '',
    Конец: '',
    Обед: '',
    Часы: Math.round(totalHours * 100) / 100,
    Км: Math.round(totalKm * 100) / 100,
    'Сумма €': totalPay,
  });

  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [
    { wch: 8 },  // дата
    { wch: 22 }, // локация
    { wch: 8 },  // начало
    { wch: 8 },  // конец
    { wch: 12 }, // обед
    { wch: 8 },  // часы
    { wch: 8 },  // км
    { wch: 12 }, // сумма
  ];

  // Жирная нижняя строка с итогами
  const lastRow = rows.length + 1; // +1 для заголовка
  ['A','B','C','D','E','F','G','H'].forEach((col) => {
    const cell = ws[`${col}${lastRow}`];
    if (cell) {
      cell.s = { font: { bold: true } };
    }
  });

  const wb = XLSX.utils.book_new();
  const sheetName = formatMonthLabel(monthKey).slice(0, 31);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  const filename = `${sanitize(worker.name)}_${monthKey}.xlsx`;
  XLSX.writeFile(wb, filename);
}

function sanitize(s: string): string {
  return s.replace(/[^a-zA-Zа-яА-Я0-9_-]/g, '_');
}
