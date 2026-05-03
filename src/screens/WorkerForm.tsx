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

  const canSave = name.trim() !== '';

  function handleSave() {
    onSave({
      name: name.trim(),
      // Сохраняем старые ставки, если работник уже существовал — для совместимости со старыми записями.
      hourly: existing?.hourly,
      perKm: existing?.perKm,
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

        <div className="form-hint">
          Ставка €/ч и €/км задаются при добавлении каждой записи — они могут отличаться от объекта к объекту.
        </div>

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
