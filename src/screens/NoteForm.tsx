import { useEffect, useState } from 'react';
import type { Note, Worker } from '../types';
import { ymd } from '../calc';
import { PhotoPicker } from '../components/PhotoPicker';

type Props = {
  worker: Worker;
  existing?: Note;
  onCancel: () => void;
  onSave: (data: Omit<Note, 'id' | 'workerId'>) => void;
  onDelete?: () => void;
};

export function NoteForm({ worker, existing, onCancel, onSave, onDelete }: Props) {
  const [date, setDate] = useState(existing?.date ?? ymd(new Date()));
  const [direction, setDirection] = useState<'minus' | 'plus'>(
    existing?.direction ?? 'minus',
  );
  const [amount, setAmount] = useState<string>(
    existing ? String(existing.amount) : '',
  );
  const [description, setDescription] = useState(existing?.description ?? '');
  const [photos, setPhotos] = useState<string[]>(existing?.photos ?? []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const num = (s: string) => parseFloat(s.replace(',', '.')) || 0;
  const canSave = num(amount) > 0 && description.trim() !== '';

  function handleSave() {
    onSave({
      date,
      direction,
      amount: num(amount),
      description: description.trim(),
      photos: photos.length ? photos : undefined,
    });
  }

  return (
    <div className="screen">
      <header className="topbar">
        <button className="link" onClick={onCancel}>Отмена</button>
        <h1>{existing ? 'Заметка' : 'Новая заметка'}</h1>
        <button className="link" disabled={!canSave} onClick={handleSave}>Сохранить</button>
      </header>

      <div className="form-sub">{worker.name}</div>

      <div className="form">
        <label className="field">
          <span>Дата</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>

        <div className="field">
          <span>Направление</span>
          <div className="multi-row">
            <label className={`multi-chip ${direction === 'minus' ? 'on minus' : ''}`}>
              <input
                type="radio"
                name="direction"
                checked={direction === 'minus'}
                onChange={() => setDirection('minus')}
              />
              <span>Я должен</span>
            </label>
            <label className={`multi-chip ${direction === 'plus' ? 'on plus' : ''}`}>
              <input
                type="radio"
                name="direction"
                checked={direction === 'plus'}
                onChange={() => setDirection('plus')}
              />
              <span>Мне должны</span>
            </label>
          </div>
        </div>

        <label className="field">
          <span>Сумма €</span>
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="100"
            autoFocus={!existing}
          />
        </label>

        <label className="field">
          <span>Описание</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Например: заправка для личных нужд на Total"
            rows={3}
          />
        </label>

        <PhotoPicker photos={photos} onChange={setPhotos} />

        <div className="form-hint">
          Заметки <strong>не добавляются автоматически</strong> в сумму к выплате за работу — они учитываются отдельно. В конце месяца вы увидите два итога.
        </div>

        {onDelete && (
          <button
            className="danger"
            onClick={() => {
              if (confirm('Удалить заметку?')) onDelete();
            }}
          >
            Удалить заметку
          </button>
        )}
      </div>
    </div>
  );
}
