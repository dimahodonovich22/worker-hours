import { useEffect, useState } from 'react';
import type { Worker } from '../types';
import { api, ApiError } from '../api';

type Props = {
  existing?: Worker;
  isSelf?: boolean; // это сам администратор — он входит под своим логином admin
  onCancel: () => void;
  onSave: (data: Omit<Worker, 'id'>) => void;
  onDelete?: () => void;
};

export function WorkerForm({ existing, isSelf, onCancel, onSave, onDelete }: Props) {
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
            autoFocus={!existing}
          />
        </label>

        <div className="form-hint">
          Ставка €/ч и €/км задаются при добавлении каждой записи — они могут отличаться от объекта к объекту.
        </div>

        {existing && !isSelf && <AccountSection worker={existing} />}
        {!existing && (
          <div className="form-hint">Сохраните работника — потом здесь можно будет создать ссылку для входа.</div>
        )}

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

/* ---------- Вход работника в приложение ---------- */

type Account = { status: 'none' | 'invited' | 'expired' | 'active'; login: string | null };

const STATUS_TEXT: Record<Account['status'], string> = {
  none: 'Ещё не приглашён',
  invited: 'Ссылка создана, пароль ещё не задан',
  expired: 'Ссылка устарела — создайте новую',
  active: 'Входит в приложение',
};

function AccountSection({ worker }: { worker: Worker }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api
      .account(worker.id)
      .then(setAccount)
      .catch(() => setAccount({ status: 'none', login: null }));
  }, [worker.id]);

  async function createLink() {
    if (
      account?.status === 'active' &&
      !confirm(`Создать новую ссылку? ${worker.name} должен будет задать новый пароль, старый перестанет работать.`)
    )
      return;
    setBusy(true);
    try {
      const r = await api.invite(worker.id);
      setLink(r.link);
      setAccount({ status: 'invited', login: r.login });
    } catch (e) {
      alert(e instanceof ApiError ? e.message : 'Не удалось создать ссылку');
    } finally {
      setBusy(false);
    }
  }

  const message = () =>
    `${worker.name}, вот ссылка для входа в приложение «Учёт часов». Откройте её и придумайте пароль. ` +
    `Ваш логин: ${account?.login}. Ссылка действует 7 дней.\n${link}`;

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(message());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      prompt('Скопируйте ссылку:', link);
    }
  }

  async function share() {
    if (!link) return;
    if (navigator.share) {
      try {
        await navigator.share({ text: message() });
        return;
      } catch {
        // отменили отправку — можно скопировать
        return;
      }
    }
    copy();
  }

  async function closeAccess() {
    if (!confirm(`Закрыть доступ для ${worker.name}? Он больше не сможет войти. Записи останутся.`)) return;
    try {
      await api.closeAccount(worker.id);
      setAccount({ status: 'none', login: null });
      setLink(null);
    } catch (e) {
      alert(e instanceof ApiError ? e.message : 'Не удалось закрыть доступ');
    }
  }

  return (
    <div className="account">
      <div className="account-title">Вход в приложение</div>
      {!account ? (
        <div className="account-status">Проверяю…</div>
      ) : (
        <>
          <div className="account-status">
            {STATUS_TEXT[account.status]}
            {account.login && (
              <>
                {' · логин '}
                <b>{account.login}</b>
              </>
            )}
          </div>
          <div className="account-hint">
            {worker.name} увидит только свои часы, объекты и свой заработок. Ставку фактуры и других работников — нет.
          </div>

          {link ? (
            <>
              <div className="account-link">{link}</div>
              <div className="multi-row">
                <button className="primary" onClick={share}>
                  Отправить
                </button>
                <button className="ghost" onClick={copy}>
                  {copied ? 'Скопировано' : 'Скопировать'}
                </button>
              </div>
            </>
          ) : (
            <button className="primary" disabled={busy} onClick={createLink}>
              {account.status === 'none' ? 'Создать ссылку для входа' : 'Создать новую ссылку'}
            </button>
          )}
          {account.status !== 'none' && (
            <button className="link-danger" onClick={closeAccess}>
              Закрыть доступ
            </button>
          )}
        </>
      )}
    </div>
  );
}
