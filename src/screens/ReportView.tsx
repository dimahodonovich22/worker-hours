import { useEffect } from 'react';
import type { Entry, Worker } from '../types';
import {
  ddmm,
  entryHours,
  entryMonthKey,
  entryPay,
  formatMonthLabel,
  formatNum,
  monthTotal,
} from '../calc';

type Props = {
  worker: Worker;
  entries: Entry[];
  monthKey: string;
  onBack: () => void;
};

export function ReportView({ worker, entries, monthKey, onBack }: Props) {
  const visible = entries
    .filter((e) => e.workerId === worker.id && entryMonthKey(e.date) === monthKey)
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  const total = monthTotal(entries, worker, monthKey);

  useEffect(() => {
    document.title = `Отчёт ${worker.name} — ${formatMonthLabel(monthKey)}`;
    return () => {
      document.title = 'Учёт часов';
    };
  }, [worker.name, monthKey]);

  function handlePrint() {
    window.print();
  }

  return (
    <div className="report-screen">
      <header className="topbar no-print">
        <button className="link" onClick={onBack}>‹ Назад</button>
        <h1>Отчёт</h1>
        <button className="link" onClick={handlePrint}>Печать</button>
      </header>

      <div className="report-hint no-print">
        Нажмите «Печать», затем в диалоге Safari выберите <strong>«Сохранить в Файлы»</strong> или
        отправьте PDF напрямую через AirDrop / Telegram / почту.
      </div>

      <article className="report">
        <div className="report-header">
          <div>
            <h1 className="report-title">Отчёт о работе</h1>
            <div className="report-period">{formatMonthLabel(monthKey)}</div>
          </div>
          <div className="report-worker">
            <div className="report-worker-label">Работник</div>
            <div className="report-worker-name">{worker.name}</div>
          </div>
        </div>

        <table className="report-table">
          <thead>
            <tr>
              <th>Дата</th>
              <th>Локация</th>
              <th>Время</th>
              <th>Обед</th>
              <th className="num">Часы</th>
              <th className="num">Км</th>
              <th className="num">Сумма €</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((e) => {
              const h = entryHours(e);
              const sum = entryPay(e, worker);
              return (
                <tr key={e.id}>
                  <td className="nowrap">{ddmm(e.date)}</td>
                  <td>{e.location}</td>
                  <td className="nowrap">{e.start}–{e.end}</td>
                  <td>{e.lunch ? '30 мин' : '—'}</td>
                  <td className="num">{formatNum(h)}</td>
                  <td className="num">{formatNum(e.km)}</td>
                  <td className="num">{formatNum(sum)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4}>ИТОГО</td>
              <td className="num">{formatNum(total.hours)}</td>
              <td className="num">{formatNum(total.km)}</td>
              <td className="num">{formatNum(total.pay)}</td>
            </tr>
          </tfoot>
        </table>

        <div className="report-summary">
          <div className="summary-block">
            <div className="summary-label">Всего часов</div>
            <div className="summary-value">{formatNum(total.hours)}</div>
          </div>
          <div className="summary-block">
            <div className="summary-label">Всего км</div>
            <div className="summary-value">{formatNum(total.km)}</div>
          </div>
          <div className="summary-block accent">
            <div className="summary-label">К выплате</div>
            <div className="summary-value">€{formatNum(total.pay)}</div>
          </div>
        </div>

        <div className="report-footer">
          Сформировано {new Date().toLocaleDateString('ru-RU')}
        </div>
      </article>

      <div className="footer-actions no-print">
        <button className="primary" onClick={handlePrint}>Сохранить как PDF</button>
      </div>
    </div>
  );
}
