import { useMemo, useState } from 'react';
import type { Entry, Worker } from '../types';
import { entryHours, formatNum, ymd } from '../calc';

type Props = {
  worker: Worker;
  existing?: Entry;
  knownLocations: string[];
  onCancel: () => void;
  onSave: (data: Omit<Entry, 'id' | 'workerId'>) => void;
  onDelete?: () => void;
};

export function EntryForm({ worker, existing, knownLocations, onCancel, onSave, onDelete }: Props) {
  const [date, setDate] = useState(existing?.date ?? ymd(new Date()));
  const [location, setLocation] = useState(existing?.location ?? '');
  const [start, setStart] = useState(existing?.start ?? '08:00');
  const [end, setEnd] = useState(existing?.end ?? '16:30');
  const [lunch, setLunch] = useState(existing?.lunch ?? true);
  const [km, setKm] = useState<string>(existing ? String(existing.km) : '15');

  const preview = useMemo(
    () =>
      entryHours({
        id: '',
        workerId: '',
        date,
        location,
        start,
        end,
        lunch,
        km: 0,
      }),
    [date, location, start, end, lunch],
  );

  const canSave = location.trim() !== '' && start !== '' && end !== '';

  function handleSave() {
    const kmNum = parseFloat(km.replace(',', '.')) || 0;
    onSave({ date, location: location.trim(), start, end, lunch, km: kmNum });
  }

  return (
    <div className="screen">
      <header className="topbar">
        <button className="link" onClick={onCancel}>Отмена</button>
        <h1>{existing ? 'Редактировать' : 'Новая запись'}</h1>
        <button className="link" disabled={!canSave} onClick={handleSave}>Сохранить</button>
      </header>

      <div className="form-sub">{worker.name}</div>

      <div className="form">
        <label className="field">
          <span>Дата</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>

        <label className="field">
          <span>Локация</span>
          <input
            type="text"
            list="locations"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="парковка, школа, Гент..."
          />
          <datalist id="locations">
            {knownLocations.map((l) => <option key={l} value={l} />)}
          </datalist>
        </label>

        <div className="field-row">
          <label className="field">
            <span>Начало</span>
            <input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label className="field">
            <span>Конец</span>
            <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
          </label>
        </div>

        <label className="field-check">
          <input type="checkbox" checked={lunch} onChange={(e) => setLunch(e.target.checked)} />
          <span>Обед 30 мин</span>
        </label>

        <label className="field">
          <span>Километры</span>
          <input
            type="text"
            inputMode="decimal"
            value={km}
            onChange={(e) => setKm(e.target.value)}
            placeholder="0"
          />
        </label>

        <div className="preview">
          Чистое время: <strong>{formatNum(preview)} ч</strong>
        </div>

        {onDelete && (
          <button
            className="danger"
            onClick={() => {
              if (confirm('Удалить запись?')) onDelete();
            }}
          >
            Удалить запись
          </button>
        )}
      </div>
    </div>
  );
}
