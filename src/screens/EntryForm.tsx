import { useEffect, useMemo, useState } from 'react';
import type { Entry, Segment, Worker } from '../types';
import { entryHours, formatNum, ymd } from '../calc';

type Props = {
  worker: Worker;
  existing?: Entry;
  knownLocations: string[];
  defaults: { hourly: number; perKm: number; km: number };
  onCancel: () => void;
  onSave: (data: Omit<Entry, 'id' | 'workerId'>) => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
};

export function EntryForm({
  worker,
  existing,
  knownLocations,
  defaults,
  onCancel,
  onSave,
  onDuplicate,
  onDelete,
}: Props) {
  const [date, setDate] = useState(existing?.date ?? ymd(new Date()));
  const [location, setLocation] = useState(existing?.location ?? '');
  const [start, setStart] = useState(existing?.start ?? '08:00');
  const [end, setEnd] = useState(existing?.end ?? '16:30');
  const [lunch, setLunch] = useState(existing?.lunch ?? true);
  const [km, setKm] = useState<string>(
    existing ? String(existing.km) : String(defaults.km),
  );
  const [hourly, setHourly] = useState<string>(
    String(existing?.hourly ?? defaults.hourly),
  );
  const [perKm, setPerKm] = useState<string>(
    String(existing?.perKm ?? defaults.perKm),
  );
  const [multiplier, setMultiplier] = useState<number>(existing?.multiplier ?? 1);
  const [extraSegments, setExtraSegments] = useState<Segment[]>(
    existing?.extraSegments ?? [],
  );

  function updateSegment(i: number, patch: Partial<Segment>) {
    setExtraSegments((prev) =>
      prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)),
    );
  }
  function addSegment() {
    setExtraSegments((prev) => [
      ...prev,
      { location: '', start: end, end: end },
    ]);
  }
  function removeSegment(i: number) {
    setExtraSegments((prev) => prev.filter((_, idx) => idx !== i));
  }

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const hours = useMemo(
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
        multiplier,
        extraSegments,
      }),
    [date, location, start, end, lunch, multiplier, extraSegments],
  );

  const num = (s: string) => parseFloat(s.replace(',', '.')) || 0;
  const pay = Math.round((hours * num(hourly) + num(km) * num(perKm)) * 100) / 100;

  const cleanedExtras: Segment[] = extraSegments
    .map((s) => ({ location: s.location.trim(), start: s.start, end: s.end }))
    .filter((s) => s.location !== '' && s.start !== '' && s.end !== '');

  const canSave = location.trim() !== '' && start !== '' && end !== '';

  function handleSave() {
    onSave({
      date,
      location: location.trim(),
      start,
      end,
      lunch,
      km: num(km),
      hourly: num(hourly),
      perKm: num(perKm),
      multiplier,
      extraSegments: cleanedExtras.length ? cleanedExtras : undefined,
    });
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

        {extraSegments.map((seg, i) => (
          <div key={i} className="segment">
            <div className="segment-header">
              <span>Объект {i + 2}</span>
              <button type="button" className="segment-remove" onClick={() => removeSegment(i)}>
                Удалить
              </button>
            </div>
            <label className="field">
              <span>Локация</span>
              <input
                type="text"
                list="locations"
                value={seg.location}
                onChange={(e) => updateSegment(i, { location: e.target.value })}
                placeholder="ещё один объект..."
              />
            </label>
            <div className="field-row">
              <label className="field">
                <span>Начало</span>
                <input
                  type="time"
                  value={seg.start}
                  onChange={(e) => updateSegment(i, { start: e.target.value })}
                />
              </label>
              <label className="field">
                <span>Конец</span>
                <input
                  type="time"
                  value={seg.end}
                  onChange={(e) => updateSegment(i, { end: e.target.value })}
                />
              </label>
            </div>
          </div>
        ))}

        <button type="button" className="ghost add-segment" onClick={addSegment}>
          + Добавить локацию
        </button>

        <label className="field-check">
          <input type="checkbox" checked={lunch} onChange={(e) => setLunch(e.target.checked)} />
          <span>Обед 30 мин</span>
        </label>

        <div className="field">
          <span>Коэффициент часов</span>
          <div className="multi-row">
            <label className={`multi-chip ${multiplier === 1.5 ? 'on' : ''}`}>
              <input
                type="checkbox"
                checked={multiplier === 1.5}
                onChange={(e) => setMultiplier(e.target.checked ? 1.5 : 1)}
              />
              <span>× 1.5</span>
            </label>
            <label className={`multi-chip ${multiplier === 2 ? 'on' : ''}`}>
              <input
                type="checkbox"
                checked={multiplier === 2}
                onChange={(e) => setMultiplier(e.target.checked ? 2 : 1)}
              />
              <span>× 2</span>
            </label>
          </div>
        </div>

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

        <div className="field-row">
          <label className="field">
            <span>Ставка €/ч</span>
            <input
              type="text"
              inputMode="decimal"
              value={hourly}
              onChange={(e) => setHourly(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Ставка €/км</span>
            <input
              type="text"
              inputMode="decimal"
              value={perKm}
              onChange={(e) => setPerKm(e.target.value)}
            />
          </label>
        </div>

        <div className="preview">
          <div>Чистое время: <strong>{formatNum(hours)} ч</strong></div>
          <div className="preview-pay">К начислению: <strong>€{formatNum(pay)}</strong></div>
        </div>

        {onDuplicate && (
          <button className="ghost" onClick={onDuplicate}>
            Дублировать запись
          </button>
        )}

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
