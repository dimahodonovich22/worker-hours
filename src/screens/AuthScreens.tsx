import { useEffect, useState } from 'react';
import type { Session } from '../types';
import { api, ApiError } from '../api';

function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth">
      <div className="auth-card">
        <img className="auth-icon" src="icon-192.png" alt="" width={64} height={64} />
        <h1 className="auth-title">Учёт часов</h1>
        {children}
      </div>
    </div>
  );
}

/* ---------- Вход по логину и паролю ---------- */

export function LoginScreen({ onLoggedIn }: { onLoggedIn: (u: Session) => void }) {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { user } = await api.login(login.trim(), password);
      onLoggedIn(user);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось войти');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout>
      <form className="form auth-form" onSubmit={submit}>
        <label className="field">
          <span>Логин</span>
          <input
            type="text"
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="username"
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            placeholder="например, roman"
            required
          />
        </label>
        <label className="field">
          <span>Пароль</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error && <div className="auth-error">{error}</div>}
        <button className="primary" type="submit" disabled={busy || !login.trim() || !password}>
          {busy ? 'Вход…' : 'Войти'}
        </button>
        <div className="auth-hint">Нет пароля или забыли его? Попросите у Романа ссылку для входа.</div>
      </form>
    </AuthLayout>
  );
}

/* ---------- Первый вход по ссылке: придумать пароль ---------- */

export function InviteScreen({ token, onDone }: { token: string; onDone: (u: Session) => void }) {
  const [info, setInfo] = useState<Session | null>(null);
  const [loadError, setLoadError] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .inviteInfo(token)
      .then((r) => setInfo(r.user))
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : 'Не удалось открыть ссылку'));
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) return setError('Пароль — минимум 6 символов');
    if (password !== repeat) return setError('Пароли не совпадают');
    setBusy(true);
    setError('');
    try {
      const { user } = await api.acceptInvite(token, password);
      onDone(user);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось сохранить пароль');
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <AuthLayout>
        <div className="auth-error">{loadError}</div>
        <button className="ghost" onClick={() => (window.location.hash = '')}>
          Перейти ко входу
        </button>
      </AuthLayout>
    );
  }
  if (!info) {
    return (
      <AuthLayout>
        <div className="auth-hint">Проверяю ссылку…</div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <div className="auth-welcome">
        {info.role === 'admin' ? 'Доступ администратора' : `Здравствуйте, ${info.name ?? info.login}!`}
        <span>Придумайте пароль. Логин для входа: <b>{info.login}</b></span>
      </div>
      <form className="form auth-form" onSubmit={submit}>
        {/* Скрытое поле логина — чтобы iPhone предложил сохранить логин и пароль вместе */}
        <input type="text" autoComplete="username" value={info.login} readOnly hidden />
        <label className="field">
          <span>Новый пароль</span>
          <input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="минимум 6 символов"
            required
          />
        </label>
        <label className="field">
          <span>Повторите пароль</span>
          <input
            type="password"
            autoComplete="new-password"
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
            required
          />
        </label>
        {error && <div className="auth-error">{error}</div>}
        <button className="primary" type="submit" disabled={busy || !password || !repeat}>
          {busy ? 'Сохраняю…' : 'Сохранить пароль и войти'}
        </button>
      </form>
    </AuthLayout>
  );
}
