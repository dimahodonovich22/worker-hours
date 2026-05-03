import { useState } from 'react';
import type { Worker } from '../types';

type Props = {
  existing?: Worker;
  onCancel: () => void;
  onSave: (data: Omit<Worker, 'id'>) => void;
  onDelete?: () => void;
};

export function WorkerForm({ existing, onCancel, onSave, onDelete }: Props) {
  const [name, setName] = useState(existing?.name ?? '');
  const [hourly, setHourly] = useState<string>(existing ? String(existing.hourly) : '15');
  const [perKm, setPerKm] = useState<string>(existing ? String(existing.perKm) : '0');

  const canSave = name.trim() !== '';

  function handleSave() {
    onSave({
      name: name.trim(),
      hourly: parseFloat(hourly.replace(',', '.')) || 0,
      perKm: parseFloat(perKm.replace(',', '.')) || 0,
    });
  }

  return (
    <div className="screen">
      <header className="topbar">
        <button className="link" onClick={onCancel}>Отмена</button>
        <h1>{existing ? 'Работник' : 'Новый работник'}</h1>
        <button className="link" disabled={!canSave} onClick={handleSave}>Сохранить</button>
      </header>

      <div className="form">
        <label className="field">
          <span>Имя</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Например: Роман"
            autoFocus
          />
        </label>

        <label className="field">
          <span>Ставка €/час</span>
          <input
            type="text"
            inputMode="decimal"
            value={hourly}
            onChange={(e) => setHourly(e.target.value)}
          />
        </label>

        <label className="field">
          <span>Ставка €/км (если нужна)</span>
          <input
            type="text"
            inputMode="decimal"
            value={perKm}
            onChange={(e) => setPerKm(e.target.value)}
          />
        </label>

        {onDelete && (
          <button
            className="danger"
            onClick={() => {
              if (confirm('Удалить работника и все его записи?')) onDelete();
            }}
          >
            Удалить работника
          </button>
        )}
      </div>
    </div>
  );
}
