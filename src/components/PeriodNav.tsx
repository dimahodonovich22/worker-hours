import { useState } from 'react';
import type { PeriodView } from '../types';
import {
  currentMonthKey,
  currentWeekStart,
  daysBetween,
  periodBounds,
  shiftDate,
  shiftMonth,
  weekEnd,
} from '../calc';

type Props = {
  view: PeriodView;
  onChange: (next: PeriodView) => void;
};

// Переключатель Месяц/Неделя + стрелки ‹ › + выбор диапазона дат.
export function PeriodNav({ view, onChange }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [draftStart, setDraftStart] = useState(view.rangeStart);
  const [draftEnd, setDraftEnd] = useState(view.rangeEnd);

  const isWeek = view.period === 'week';
  const { label } = periodBounds(view);

  function shift(dir: 1 | -1) {
    if (isWeek) {
      const len = daysBetween(view.rangeStart, view.rangeEnd);
      onChange({
        ...view,
        rangeStart: shiftDate(view.rangeStart, dir * len),
        rangeEnd: shiftDate(view.rangeEnd, dir * len),
      });
    } else {
      onChange({ ...view, month: shiftMonth(view.month, dir) });
    }
  }

  function handleCenter() {
    if (isWeek) {
      setDraftStart(view.rangeStart);
      setDraftEnd(view.rangeEnd);
      setPickerOpen(true);
    } else {
      onChange({ ...view, month: currentMonthKey() });
    }
  }

  function applyPicker() {
    if (draftStart > draftEnd) {
      alert('Дата начала позже даты конца');
      return;
    }
    onChange({ ...view, rangeStart: draftStart, rangeEnd: draftEnd });
    setPickerOpen(false);
  }

  function resetToCurrentWeek() {
    const s = currentWeekStart();
    onChange({ ...view, rangeStart: s, rangeEnd: weekEnd(s) });
    setPickerOpen(false);
  }

  return (
    <>
      <div className="period-switch">
        <button
          className={`period-tab ${!isWeek ? 'on' : ''}`}
          onClick={() => onChange({ ...view, period: 'month' })}
        >
          Месяц
        </button>
        <button
          className={`period-tab ${isWeek ? 'on' : ''}`}
          onClick={() => onChange({ ...view, period: 'week' })}
        >
          Неделя
        </button>
      </div>

      <div className="week-nav">
        <button className="week-arrow" onClick={() => shift(-1)}>
          ‹
        </button>
        <button className="week-current" onClick={handleCenter}>
          {label}
        </button>
        <button className="week-arrow" onClick={() => shift(1)}>
          ›
        </button>
      </div>

      {pickerOpen && (
        <div className="sheet-backdrop" onClick={() => setPickerOpen(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-title">Выберите диапазон дат</div>
            <label className="field">
              <span>От</span>
              <input
                type="date"
                value={draftStart}
                onChange={(e) => setDraftStart(e.target.value)}
              />
            </label>
            <label className="field">
              <span>До</span>
              <input
                type="date"
                value={draftEnd}
                onChange={(e) => setDraftEnd(e.target.value)}
              />
            </label>
            <button className="primary" onClick={applyPicker}>
              Применить
            </button>
            <button className="ghost" onClick={resetToCurrentWeek}>
              Текущая неделя
            </button>
            <button className="sheet-cancel" onClick={() => setPickerOpen(false)}>
              Отмена
            </button>
          </div>
        </div>
      )}
    </>
  );
}
