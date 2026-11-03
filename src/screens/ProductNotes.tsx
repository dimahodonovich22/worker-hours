import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api';

type Props = {
  canEdit: boolean; // пишет только администратор, менеджер читает
  onBack: () => void;
};

type Status = 'loading' | 'saved' | 'dirty' | 'saving' | 'error';

const when = (at: number | null) =>
  at
    ? new Date(at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : null;

/** Страница «Продукт» — как заметка: что и сколько продукта ушло на какой объект. */
export function ProductNotes({ canEdit, onBack }: Props) {
  const [text, setText] = useState('');
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [loadError, setLoadError] = useState('');
  const pending = useRef<string | null>(null); // текст, ещё не отправленный на сервер
  const timer = useRef<number | undefined>(undefined);
  const area = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    api
      .productNotes()
      .then((r) => {
        setText(r.text);
        setUpdatedAt(r.updatedAt);
        setStatus('saved');
      })
      .catch((e) => setLoadError(e instanceof ApiError ? e.message : 'Не удалось загрузить'));
  }, []);

  async function flush() {
    window.clearTimeout(timer.current);
    const t = pending.current;
    if (t === null) return;
    pending.current = null;
    setStatus('saving');
    try {
      const r = await api.saveProductNotes(t);
      setUpdatedAt(r.updatedAt);
      setStatus(pending.current === null ? 'saved' : 'dirty');
    } catch {
      pending.current = pending.current ?? t; // не потерять текст — сохраним при следующей правке
      setStatus('error');
    }
  }

  // Сохранение само: через секунду после того, как перестали печатать.
  function onChange(v: string) {
    setText(v);
    pending.current = v;
    setStatus('dirty');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, 1000);
  }

  // Ушли со страницы или свернули приложение — сохранить сразу.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Поле растёт вместе с текстом — страница листается целиком, как заметка.
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [text, status]);

  const statusText =
    status === 'loading'
      ? 'Загрузка…'
      : status === 'saving' || status === 'dirty'
        ? 'Сохраняю…'
        : status === 'error'
          ? 'Не сохранилось — проверьте интернет'
          : updatedAt
            ? `Сохранено ${when(updatedAt)}`
            : '';

  return (
    <div className="screen product-screen">
      <header className="topbar">
        <button className="link" onClick={onBack}>
          ‹ Назад
        </button>
        <h1>Продукт</h1>
        <span />
      </header>

      {loadError ? (
        <div className="form-hint pending-hint">{loadError}</div>
      ) : (
        <>
          <div className={`product-status${status === 'error' ? ' error' : ''}`}>
            {canEdit ? statusText : updatedAt ? `Обновлено ${when(updatedAt)}` : ''}
          </div>
          {canEdit ? (
            <textarea
              ref={area}
              className="product-text"
              value={text}
              disabled={status === 'loading'}
              onChange={(e) => onChange(e.target.value)}
              onBlur={flush}
              placeholder={'Например:\n03.11 Гент — 5 л гидрофобизатора\n04.11 Антверпен — 2 мешка смеси'}
            />
          ) : (
            <div className="product-text product-read">
              {status === 'loading' ? '' : text || 'Пока пусто.'}
            </div>
          )}
        </>
      )}
    </div>
  );
}
