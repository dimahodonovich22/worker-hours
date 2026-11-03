import { useEffect, useRef, useState } from 'react';
import { api, ApiError, type ProductNotesView } from '../api';

type Props = {
  // администратор пишет сразу; менеджер правит, но его правки ждут подтверждения администратора
  role: 'admin' | 'manager';
  login: string;
  onBack: () => void;
};

type Status = 'loading' | 'saved' | 'proposed' | 'dirty' | 'saving' | 'error';

const when = (at: number | null) =>
  at
    ? new Date(at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : null;

/** Страница «Продукт» — как заметка: что и сколько продукта ушло на какой объект. */
export function ProductNotes({ role, login, onBack }: Props) {
  const isAdmin = role === 'admin';
  const [text, setText] = useState('');
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [loadError, setLoadError] = useState('');
  const [othersPending, setOthersPending] = useState<ProductNotesView['pending']>(null); // для администратора
  const unsent = useRef<string | null>(null); // текст, ещё не отправленный на сервер
  const timer = useRef<number | undefined>(undefined);
  const area = useRef<HTMLTextAreaElement>(null);

  // Состояние после ответа сервера: у менеджера — ждёт ли его исправление проверки.
  function applyView(r: ProductNotesView) {
    setUpdatedAt(r.updatedAt);
    if (isAdmin) setOthersPending(r.pending);
    return !isAdmin && r.pending?.by === login ? 'proposed' : 'saved';
  }

  useEffect(() => {
    api
      .productNotes()
      .then((r) => {
        const st = applyView(r);
        // Менеджер продолжает со своим непроверенным исправлением, а не с «чистым» текстом.
        setText(st === 'proposed' && r.pending ? r.pending.text : r.text);
        setStatus(st);
      })
      .catch((e) => setLoadError(e instanceof ApiError ? e.message : 'Не удалось загрузить'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function flush() {
    window.clearTimeout(timer.current);
    const t = unsent.current;
    if (t === null) return;
    unsent.current = null;
    setStatus('saving');
    try {
      const st = applyView(await api.saveProductNotes(t));
      setStatus(unsent.current === null ? st : 'dirty');
    } catch {
      unsent.current = unsent.current ?? t; // не потерять текст — сохраним при следующей правке
      setStatus('error');
    }
  }

  // Сохранение само: через секунду после того, как перестали печатать.
  function onChange(v: string) {
    setText(v);
    unsent.current = v;
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
        ? isAdmin
          ? 'Сохраняю…'
          : 'Отправляю…'
        : status === 'error'
          ? 'Не сохранилось — проверьте интернет'
          : status === 'proposed'
            ? 'Отправлено — ждёт подтверждения администратора'
            : updatedAt
              ? `${isAdmin ? 'Сохранено' : 'Обновлено'} ${when(updatedAt)}`
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
          {isAdmin && othersPending && (
            <div className="form-hint pending-hint">
              {othersPending.by} предложил исправление этой страницы — посмотрите его на главном экране, кнопка
              «Проверить».
            </div>
          )}
          {!isAdmin && status === 'saved' && (
            <div className="form-hint">Ваши правки увидят остальные после подтверждения администратора.</div>
          )}
          <div className={`product-status${status === 'error' ? ' error' : ''}`}>{statusText}</div>
          <textarea
            ref={area}
            className="product-text"
            value={text}
            disabled={status === 'loading'}
            onChange={(e) => onChange(e.target.value)}
            onBlur={flush}
            placeholder={'Например:\n03.11 Гент — 5 л гидрофобизатора\n04.11 Антверпен — 2 мешка смеси'}
          />
        </>
      )}
    </div>
  );
}
