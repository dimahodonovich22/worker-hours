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
  const [cash, setCash] = useState<boolean>(existing?.cash ?? false);
  const [cashPercent, setCashPercent] = useState<string>(
    existing?.cashDeductPercent ? String(existing.cashDeductPercent) : '',
  );
  // Для новых заметок «мне должны» по умолчанию считаем расходом по работе.
  const [addToPay, setAddToPay] = useState<boolean>(existing ? !!existing.addToPay : true);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const num = (s: string) => parseFloat(s.replace(',', '.')) || 0;
  const canSave = num(amount) > 0 && description.trim() !== '';

  function handleSave() {
    const isPlus = direction === 'plus';
    const pct = num(cashPercent);
    onSave({
      date,
      direction,
      amount: num(amount),
      description: description.trim(),
      photos: photos.length ? photos : undefined,
      cash: isPlus && cash ? true : undefined,
      cashDeductPercent: isPlus && cash && pct > 0 ? pct : undefined,
      addToPay: isPlus && addToPay ? true : undefined,
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

        {direction === 'plus' && (
          <>
            <label className="field-check">
              <input
                type="checkbox"
                checked={addToPay}
                onChange={(e) => setAddToPay(e.target.checked)}
              />
              <span>Расход по работе — прибавить к сумме к выплате</span>
            </label>
            <div className="field">
              <span>Способ получения</span>
              <div className="multi-row">
                <label className={`multi-chip ${!cash ? 'on' : ''}`}>
                  <input
                    type="radio"
                    name="cash"
                    checked={!cash}
                    onChange={() => setCash(false)}
                  />
                  <span>На карту</span>
                </label>
                <label className={`multi-chip ${cash ? 'on' : ''}`}>
                  <input
                    type="radio"
                    name="cash"
                    checked={cash}
                    onChange={() => setCash(true)}
                  />
                  <span>Кэш</span>
                </label>
              </div>
            </div>
            {cash && (
              <label className="field">
                <span>Вычесть % с кэша</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={cashPercent}
                  onChange={(e) => setCashPercent(e.target.value)}
                  placeholder="0"
                />
              </label>
            )}
          </>
        )}

        <label className="field">
          <span>Описание</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Например: парковка в Генте / заправка для личных нужд"
            rows={3}
          />
        </label>

        <PhotoPicker photos={photos} onChange={setPhotos} />

        <div className="form-hint">
          {direction === 'plus' && addToPay ? (
            <>Эта сумма <strong>прибавится к сумме к выплате</strong> за работу (сверху и в общем итоге) и войдёт в PDF/Excel.</>
          ) : (
            <>Эта заметка <strong>не добавляется</strong> в сумму к выплате за работу — она учитывается отдельно в блоке заметок.</>
          )}
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
