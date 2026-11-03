import { useCallback, useEffect, useState } from 'react';
import type { AppState, Entry, FeedFilter, Note, PeriodView, Session, Worker } from './types';
import { loadFeedFilter, saveFeedFilter, uid } from './storage';
import { api, ApiError } from './api';
import { currentMonthKey, currentWeekStart, isPayExpense, periodBounds, weekEnd, ymd } from './calc';
import { CalendarFeed } from './screens/CalendarFeed';
import { WorkersList } from './screens/WorkersList';
import { WorkerDetail } from './screens/WorkerDetail';
import { EntryForm } from './screens/EntryForm';
import { WorkerForm } from './screens/WorkerForm';
import { ReportView } from './screens/ReportView';
import { NoteForm } from './screens/NoteForm';
import { InviteScreen, LoginScreen } from './screens/AuthScreens';
import { ProductNotes } from './screens/ProductNotes';
import { withProposal } from './changes';
import type { PeriodRequest } from './components/feed/MonthSection';

type Route =
  | { name: 'feed' }
  | { name: 'summary' }
  | { name: 'product' }
  | { name: 'worker'; workerId: string }
  | { name: 'entry'; workerId: string; entryId?: string; date?: string }
  | { name: 'workerForm'; workerId?: string }
  | { name: 'noteForm'; workerId: string; noteId?: string; date?: string }
  | { name: 'report'; workerId: string; start: string; end: string; label: string };

/** Если экран ссылается на удалённого работника (или недоступен) — возвращаемся на главный. */
function BackHome({ onHome }: { onHome: () => void }) {
  useEffect(onHome, [onHome]);
  return null;
}

/** Ссылка-приглашение: https://…/#/invite/<код> */
function inviteTokenFromHash(): string | null {
  const m = window.location.hash.match(/^#\/invite\/([A-Za-z0-9_-]+)$/);
  return m ? m[1] : null;
}

function Splash({ text, action }: { text: string; action?: { label: string; run: () => void } }) {
  return (
    <div className="auth">
      <div className="auth-card">
        <img className="auth-icon" src="icon-192.png" alt="" width={64} height={64} />
        <div className="auth-hint">{text}</div>
        {action && (
          <button className="primary" onClick={action.run}>
            {action.label}
          </button>
        )}
      </div>
    </div>
  );
}

/* ---------- Вход ---------- */

export function App() {
  const [invite, setInvite] = useState<string | null>(() => inviteTokenFromHash());
  const [session, setSession] = useState<Session | null | 'loading'>('loading');

  useEffect(() => {
    const onHash = () => setInvite(inviteTokenFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    api
      .session()
      .then((r) => setSession(r.user))
      .catch(() => setSession(null));
  }, []);

  const logout = useCallback(() => {
    api.logout().catch(() => {});
    setSession(null);
  }, []);

  if (invite) {
    return (
      <InviteScreen
        token={invite}
        onDone={(user) => {
          history.replaceState(null, '', window.location.pathname); // убрать код из адреса
          setInvite(null);
          setSession(user);
        }}
      />
    );
  }
  if (session === 'loading') return <Splash text="Загрузка…" />;
  if (!session) return <LoginScreen onLoggedIn={setSession} />;
  return <Workspace key={session.login} session={session} onLogout={logout} />;
}

/* ---------- Приложение после входа ---------- */

function Workspace({ session, onLogout }: { session: Session; onLogout: () => void }) {
  const isAdmin = session.role === 'admin';
  // Менеджер видит всех (ставки ему приходят как ставка фактуры), работник — только себя.
  const seesAll = session.role !== 'worker';
  const [state, setState] = useState<AppState | null>(null);
  const [loadError, setLoadError] = useState('');

  // Стек экранов: «Назад» и «Сохранить» возвращают туда, откуда пришли (в ленту или к работнику).
  const [stack, setStack] = useState<Route[]>([{ name: 'feed' }]);
  const route = stack[stack.length - 1];
  const push = (r: Route) => setStack((s) => [...s, r]);
  const pop = () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
  const replace = (r: Route) => setStack((s) => [...s.slice(0, -1), r]);
  const [goHome] = useState(() => () => setStack([{ name: 'feed' }]));

  // Один период на сводку и экран работника.
  const [view, setView] = useState<PeriodView>(() => {
    const ws = currentWeekStart();
    return { period: 'month', month: currentMonthKey(), rangeStart: ws, rangeEnd: weekEnd(ws) };
  });

  const reload = useCallback(async () => {
    try {
      const d = await api.data();
      setState({
        workers: d.workers ?? [],
        entries: d.entries ?? [],
        notes: d.notes ?? [],
        overviewRates: d.overviewRates,
        selfWorkerId: d.selfWorkerId,
        // Выбор «чьи часы показывать» хранится на телефоне; работник всегда видит только свои.
        feedFilter: seesAll ? (loadFeedFilter() ?? (d.selfWorkerId ? { kind: 'me' } : { kind: 'all' })) : { kind: 'me' },
      });
      setLoadError('');
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return onLogout();
      setLoadError(e instanceof ApiError ? e.message : 'Не удалось загрузить данные');
    }
  }, [seesAll, onLogout]);

  useEffect(() => {
    reload();
  }, [reload]);

  // Вернулись в приложение — подтянуть свежие записи (например, работники внесли часы).
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') reload();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [reload]);

  /** Изменения показываются сразу, а на сервер уходят следом. Если не сохранилось — сообщаем и перезагружаем. */
  function persist<T>(p: Promise<T>, onSaved?: (r: T) => void) {
    p.then(onSaved).catch((e: unknown) => {
      if (e instanceof ApiError && e.status === 401) return onLogout();
      alert(`Не сохранилось: ${e instanceof Error ? e.message : 'ошибка'}`);
      reload();
    });
  }

  const update = (fn: (s: AppState) => AppState) => setState((s) => (s ? fn(s) : s));

  function upsertWorker(w: Worker) {
    update((s) => {
      const exists = s.workers.some((x) => x.id === w.id);
      return { ...s, workers: exists ? s.workers.map((x) => (x.id === w.id ? w : x)) : [...s.workers, w] };
    });
    persist(api.putWorker(w));
  }

  function deleteWorker(id: string) {
    update((s) => ({
      ...s,
      workers: s.workers.filter((w) => w.id !== id),
      entries: s.entries.filter((e) => e.workerId !== id),
      notes: s.notes.filter((n) => n.workerId !== id),
      selfWorkerId: s.selfWorkerId === id ? undefined : s.selfWorkerId,
      feedFilter: s.feedFilter?.kind === 'worker' && s.feedFilter.workerId === id ? { kind: 'all' } : s.feedFilter,
    }));
    persist(api.deleteWorker(id));
  }

  function replaceEntry(e: Entry) {
    update((s) => {
      const exists = s.entries.some((x) => x.id === e.id);
      return { ...s, entries: exists ? s.entries.map((x) => (x.id === e.id ? e : x)) : [...s.entries, e] };
    });
  }
  function upsertEntry(e: Entry) {
    // Исправление работника уходит администратору на проверку — в итогах остаются прежние данные.
    const isEdit = state?.entries.some((x) => x.id === e.id);
    if (isAdmin || !isEdit) replaceEntry(e);
    // Сервер может поправить запись (у работника ставку ставит сервер) — берём сохранённую версию.
    persist(api.putEntry(e), replaceEntry);
  }

  function deleteEntry(id: string) {
    update((s) => ({ ...s, entries: s.entries.filter((e) => e.id !== id) }));
    persist(api.deleteEntry(id));
  }

  function replaceNote(n: Note) {
    update((s) => {
      const exists = s.notes.some((x) => x.id === n.id);
      return { ...s, notes: exists ? s.notes.map((x) => (x.id === n.id ? n : x)) : [...s.notes, n] };
    });
  }
  function upsertNote(n: Note) {
    const isEdit = state?.notes.some((x) => x.id === n.id);
    if (isAdmin || !isEdit) replaceNote(n);
    persist(api.putNote(n), replaceNote);
  }

  /** Администратор принимает или отклоняет исправление работника. */
  function reviewChange(kind: 'entries' | 'notes', id: string, action: 'approve' | 'reject') {
    persist(api.review(kind, id, action), (item) =>
      kind === 'entries' ? replaceEntry(item as Entry) : replaceNote(item as Note),
    );
  }

  function deleteNote(id: string) {
    update((s) => ({ ...s, notes: s.notes.filter((n) => n.id !== id) }));
    persist(api.deleteNote(id));
  }

  function importState(next: AppState) {
    api
      .importAll(next)
      .then((r) => {
        alert(`Загружено на сервер: работников ${r.workers}, записей ${r.entries}, заметок ${r.notes}.`);
        goHome();
        reload();
      })
      .catch((e: unknown) => alert(`Не загрузилось: ${e instanceof Error ? e.message : 'ошибка'}`));
  }

  function setOverviewRates(rates: { hourly: number; perKm: number }) {
    update((s) => ({ ...s, overviewRates: rates }));
    persist(api.settings({ overviewRates: rates }));
  }

  function setFeedFilter(f: FeedFilter) {
    saveFeedFilter(f);
    update((s) => ({ ...s, feedFilter: f }));
  }

  function setSelf(workerId: string) {
    saveFeedFilter({ kind: 'me' });
    update((s) => ({ ...s, selfWorkerId: workerId, feedFilter: { kind: 'me' } }));
    persist(api.settings({ selfWorkerId: workerId }));
  }

  // Из ленты: открыть работника сразу на нужной неделе или месяце.
  function openWorkerPeriod(workerId: string, req: PeriodRequest) {
    setView((v) =>
      req.kind === 'week'
        ? { ...v, period: 'week', rangeStart: req.start, rangeEnd: req.end }
        : { ...v, period: 'month', month: req.start.slice(0, 7) },
    );
    push({ name: 'worker', workerId });
  }

  /** Подсказка в форме, если по записи есть непроверенное исправление. */
  function pendingNotice(item?: Entry | Note): string | undefined {
    if (!item?.pendingChange) return undefined;
    if (isAdmin)
      return 'Предложено исправление — оно ещё не применено. Проверьте его в «Изменения ждут проверки» на главном экране.';
    return item.pendingChange.by === session.login
      ? 'Ваше исправление отправлено и ждёт подтверждения. До этого в итогах остаются прежние данные.'
      : 'По этой записи есть исправление, которое ждёт подтверждения администратора.';
  }

  if (!state) {
    return loadError ? (
      <Splash text={loadError} action={{ label: 'Повторить', run: reload }} />
    ) : (
      <Splash text="Загрузка данных…" />
    );
  }

  // Экраны только для администратора.
  if (!isAdmin && (route.name === 'summary' || route.name === 'workerForm')) return <BackHome onHome={goHome} />;

  if (route.name === 'feed') {
    return (
      <CalendarFeed
        state={state}
        session={session}
        onLogout={onLogout}
        onSetFilter={setFeedFilter}
        onSetSelf={setSelf}
        onAddEntry={(workerId, date) => push({ name: 'entry', workerId, date })}
        onEditEntry={(e) => push({ name: 'entry', workerId: e.workerId, entryId: e.id })}
        onAddNote={(workerId, date) => push({ name: 'noteForm', workerId, date })}
        onEditNote={(n) => push({ name: 'noteForm', workerId: n.workerId, noteId: n.id })}
        onOpenWorkerPeriod={openWorkerPeriod}
        onAddWorker={() => push({ name: 'workerForm' })}
        onEditWorker={(id) => push({ name: 'workerForm', workerId: id })}
        onOpenSummary={() => push({ name: 'summary' })}
        onOpenProduct={() => push({ name: 'product' })}
        onImport={importState}
        onSetRates={setOverviewRates}
        onReview={reviewChange}
      />
    );
  }

  // Страница «Продукт»: администратор пишет, менеджер читает, работникам недоступна.
  if (route.name === 'product') {
    if (!seesAll) return <BackHome onHome={goHome} />;
    return <ProductNotes canEdit={isAdmin} onBack={pop} />;
  }

  if (route.name === 'summary') {
    return (
      <WorkersList
        state={state}
        view={view}
        onChangeView={setView}
        onOpenWorker={(id) => push({ name: 'worker', workerId: id })}
        onAddWorker={() => push({ name: 'workerForm' })}
        onImport={importState}
        onSetOverviewRates={setOverviewRates}
        onOpenNote={(workerId, noteId) => push({ name: 'noteForm', workerId, noteId })}
        onBack={pop}
      />
    );
  }

  if (route.name === 'worker') {
    const worker = state.workers.find((w) => w.id === route.workerId);
    if (!worker) return <BackHome onHome={goHome} />;
    return (
      <WorkerDetail
        worker={worker}
        entries={state.entries.filter((e) => e.workerId === worker.id)}
        notes={state.notes.filter((n) => n.workerId === worker.id)}
        view={view}
        onChangeView={setView}
        onBack={pop}
        onAddEntry={() => push({ name: 'entry', workerId: worker.id })}
        onAddNote={() => push({ name: 'noteForm', workerId: worker.id })}
        onEditEntry={(eid) => push({ name: 'entry', workerId: worker.id, entryId: eid })}
        onEditNote={(nid) => push({ name: 'noteForm', workerId: worker.id, noteId: nid })}
        onEditWorker={isAdmin ? () => push({ name: 'workerForm', workerId: worker.id }) : undefined}
        onDeleteEntry={deleteEntry}
        allEntriesForWorker={state.entries.filter((e) => e.workerId === worker.id)}
        onOpenReport={() => {
          const { start, end, label } = periodBounds(view);
          push({ name: 'report', workerId: worker.id, start, end, label });
        }}
      />
    );
  }

  if (route.name === 'noteForm') {
    const worker = state.workers.find((w) => w.id === route.workerId);
    if (!worker) return <BackHome onHome={goHome} />;
    const existing = route.noteId ? state.notes.find((n) => n.id === route.noteId) : undefined;
    return (
      <NoteForm
        key={existing?.id ?? 'new'}
        worker={worker}
        existing={existing && !isAdmin ? withProposal(existing) : existing}
        notice={pendingNotice(existing)}
        initialDate={route.date}
        onCancel={pop}
        onSave={(data) => {
          upsertNote({ id: existing?.id ?? uid(), workerId: worker.id, ...data });
          pop();
        }}
        // Удалить заметку может только администратор.
        onDelete={
          existing && isAdmin
            ? () => {
                deleteNote(existing.id);
                pop();
              }
            : undefined
        }
      />
    );
  }

  if (route.name === 'entry') {
    const worker = state.workers.find((w) => w.id === route.workerId);
    if (!worker) return <BackHome onHome={goHome} />;
    const existing = route.entryId ? state.entries.find((e) => e.id === route.entryId) : undefined;
    const lastForWorker = state.entries
      .filter((e) => e.workerId === worker.id)
      .sort((a, b) => (a.date < b.date ? 1 : -1))[0];
    const defaults = {
      hourly: lastForWorker?.hourly ?? worker.hourly ?? 15,
      perKm: lastForWorker?.perKm ?? worker.perKm ?? 0,
      km: lastForWorker?.km ?? 15,
    };
    return (
      <EntryForm
        key={existing?.id ?? 'new'}
        worker={worker}
        existing={existing && !isAdmin ? withProposal(existing) : existing}
        notice={pendingNotice(existing)}
        initialDate={route.date}
        knownLocations={Array.from(new Set(state.entries.map((e) => e.location).filter(Boolean)))}
        defaults={defaults}
        showRates={isAdmin}
        onCancel={pop}
        onSave={(data) => {
          upsertEntry({ id: existing?.id ?? uid(), workerId: worker.id, ...data });
          pop();
        }}
        onDuplicate={
          existing
            ? () => {
                const copyId = uid();
                const { pendingChange: _pending, ...approved } = existing;
                upsertEntry({ ...approved, id: copyId, date: ymd(new Date()) });
                replace({ name: 'entry', workerId: worker.id, entryId: copyId });
              }
            : undefined
        }
        // Удалить рабочий день может только администратор; работник может его исправить.
        onDelete={
          existing && isAdmin
            ? () => {
                deleteEntry(existing.id);
                pop();
              }
            : undefined
        }
      />
    );
  }

  if (route.name === 'report') {
    const worker = state.workers.find((w) => w.id === route.workerId);
    if (!worker) return <BackHome onHome={goHome} />;
    return (
      <ReportView
        worker={worker}
        entries={state.entries}
        start={route.start}
        end={route.end}
        label={route.label}
        expenses={state.notes.filter((n) => n.workerId === worker.id && isPayExpense(n))}
        onBack={pop}
      />
    );
  }

  if (route.name === 'workerForm') {
    const existing = route.workerId ? state.workers.find((w) => w.id === route.workerId) : undefined;
    return (
      <WorkerForm
        existing={existing}
        isSelf={!!existing && existing.id === state.selfWorkerId}
        onCancel={pop}
        onSave={(data) => {
          upsertWorker({ id: existing?.id ?? uid(), ...data });
          pop();
        }}
        onDelete={
          existing
            ? () => {
                deleteWorker(existing.id);
                goHome();
              }
            : undefined
        }
      />
    );
  }

  return null;
}
