import { useEffect, useState } from 'react';
import type { AppState, Entry, FeedFilter, Note, PayMode, PeriodView, Worker } from './types';
import { loadState, saveState, uid } from './storage';
import { currentMonthKey, currentWeekStart, isPayExpense, periodBounds, weekEnd, ymd } from './calc';
import { CalendarFeed } from './screens/CalendarFeed';
import { WorkersList } from './screens/WorkersList';
import { WorkerDetail } from './screens/WorkerDetail';
import { EntryForm } from './screens/EntryForm';
import { WorkerForm } from './screens/WorkerForm';
import { ReportView } from './screens/ReportView';
import { NoteForm } from './screens/NoteForm';
import type { PeriodRequest } from './components/feed/MonthSection';

type Route =
  | { name: 'feed' }
  | { name: 'summary' }
  | { name: 'worker'; workerId: string }
  | { name: 'entry'; workerId: string; entryId?: string; date?: string }
  | { name: 'workerForm'; workerId?: string }
  | { name: 'noteForm'; workerId: string; noteId?: string; date?: string }
  | { name: 'report'; workerId: string; start: string; end: string; label: string };

/** Если экран ссылается на удалённого работника — возвращаемся на главный. */
function BackHome({ onHome }: { onHome: () => void }) {
  useEffect(onHome, [onHome]);
  return null;
}

export function App() {
  const [state, setState] = useState<AppState>(() => loadState());
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

  useEffect(() => {
    saveState(state);
  }, [state]);

  function upsertWorker(w: Worker) {
    setState((s) => {
      const exists = s.workers.some((x) => x.id === w.id);
      return {
        ...s,
        workers: exists ? s.workers.map((x) => (x.id === w.id ? w : x)) : [...s.workers, w],
      };
    });
  }

  function deleteWorker(id: string) {
    setState((s) => ({
      ...s,
      workers: s.workers.filter((w) => w.id !== id),
      entries: s.entries.filter((e) => e.workerId !== id),
      notes: s.notes.filter((n) => n.workerId !== id),
      selfWorkerId: s.selfWorkerId === id ? undefined : s.selfWorkerId,
      feedFilter:
        s.feedFilter?.kind === 'worker' && s.feedFilter.workerId === id ? { kind: 'all' } : s.feedFilter,
    }));
  }

  function upsertEntry(e: Entry) {
    setState((s) => {
      const exists = s.entries.some((x) => x.id === e.id);
      return {
        ...s,
        entries: exists ? s.entries.map((x) => (x.id === e.id ? e : x)) : [...s.entries, e],
      };
    });
  }

  function deleteEntry(id: string) {
    setState((s) => ({ ...s, entries: s.entries.filter((e) => e.id !== id) }));
  }

  function upsertNote(n: Note) {
    setState((s) => {
      const exists = s.notes.some((x) => x.id === n.id);
      return {
        ...s,
        notes: exists ? s.notes.map((x) => (x.id === n.id ? n : x)) : [...s.notes, n],
      };
    });
  }

  function deleteNote(id: string) {
    setState((s) => ({ ...s, notes: s.notes.filter((n) => n.id !== id) }));
  }

  function importState(next: AppState) {
    setState(next);
    goHome();
  }

  function setOverviewRates(rates: { hourly: number; perKm: number }) {
    setState((s) => ({ ...s, overviewRates: rates }));
  }

  function setFeedFilter(f: FeedFilter) {
    setState((s) => ({ ...s, feedFilter: f }));
  }

  function setPayMode(m: PayMode) {
    setState((s) => ({ ...s, feedPayMode: m }));
  }

  function setSelf(workerId: string) {
    setState((s) => ({ ...s, selfWorkerId: workerId, feedFilter: { kind: 'me' } }));
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

  if (route.name === 'feed') {
    return (
      <CalendarFeed
        state={state}
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
        onImport={importState}
        onSetPayMode={setPayMode}
        onSetRates={setOverviewRates}
      />
    );
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
        onEditWorker={() => push({ name: 'workerForm', workerId: worker.id })}
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
        existing={existing}
        initialDate={route.date}
        onCancel={pop}
        onSave={(data) => {
          upsertNote({ id: existing?.id ?? uid(), workerId: worker.id, ...data });
          pop();
        }}
        onDelete={
          existing
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
        existing={existing}
        initialDate={route.date}
        knownLocations={Array.from(new Set(state.entries.map((e) => e.location).filter(Boolean)))}
        defaults={defaults}
        onCancel={pop}
        onSave={(data) => {
          upsertEntry({ id: existing?.id ?? uid(), workerId: worker.id, ...data });
          pop();
        }}
        onDuplicate={
          existing
            ? () => {
                const copyId = uid();
                upsertEntry({ ...existing, id: copyId, date: ymd(new Date()) });
                replace({ name: 'entry', workerId: worker.id, entryId: copyId });
              }
            : undefined
        }
        onDelete={
          existing
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
