import { useEffect, useState } from 'react';
import type { AppState, Entry, Note, Worker } from './types';
import { loadState, saveState, uid } from './storage';
import { ymd } from './calc';
import { WorkersList } from './screens/WorkersList';
import { WorkerDetail } from './screens/WorkerDetail';
import { EntryForm } from './screens/EntryForm';
import { WorkerForm } from './screens/WorkerForm';
import { ReportView } from './screens/ReportView';
import { NoteForm } from './screens/NoteForm';

type Route =
  | { name: 'workers' }
  | { name: 'worker'; workerId: string }
  | { name: 'entry'; workerId: string; entryId?: string }
  | { name: 'workerForm'; workerId?: string }
  | { name: 'noteForm'; workerId: string; noteId?: string }
  | { name: 'report'; workerId: string; monthKey: string };

export function App() {
  const [state, setState] = useState<AppState>(() => loadState());
  const [route, setRoute] = useState<Route>({ name: 'workers' });

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
      workers: s.workers.filter((w) => w.id !== id),
      entries: s.entries.filter((e) => e.workerId !== id),
      notes: s.notes.filter((n) => n.workerId !== id),
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
  }

  if (route.name === 'workers') {
    return (
      <WorkersList
        state={state}
        onOpenWorker={(id) => setRoute({ name: 'worker', workerId: id })}
        onAddWorker={() => setRoute({ name: 'workerForm' })}
        onImport={importState}
      />
    );
  }

  if (route.name === 'worker') {
    const worker = state.workers.find((w) => w.id === route.workerId);
    if (!worker) {
      setRoute({ name: 'workers' });
      return null;
    }
    return (
      <WorkerDetail
        worker={worker}
        entries={state.entries.filter((e) => e.workerId === worker.id)}
        notes={state.notes.filter((n) => n.workerId === worker.id)}
        onBack={() => setRoute({ name: 'workers' })}
        onAddEntry={() => setRoute({ name: 'entry', workerId: worker.id })}
        onAddNote={() => setRoute({ name: 'noteForm', workerId: worker.id })}
        onEditEntry={(eid) => setRoute({ name: 'entry', workerId: worker.id, entryId: eid })}
        onEditNote={(nid) => setRoute({ name: 'noteForm', workerId: worker.id, noteId: nid })}
        onEditWorker={() => setRoute({ name: 'workerForm', workerId: worker.id })}
        onDeleteEntry={deleteEntry}
        allEntriesForWorker={state.entries.filter((e) => e.workerId === worker.id)}
        onOpenReport={(monthKey) => setRoute({ name: 'report', workerId: worker.id, monthKey })}
      />
    );
  }

  if (route.name === 'noteForm') {
    const worker = state.workers.find((w) => w.id === route.workerId);
    if (!worker) {
      setRoute({ name: 'workers' });
      return null;
    }
    const existing = route.noteId ? state.notes.find((n) => n.id === route.noteId) : undefined;
    return (
      <NoteForm
        key={existing?.id ?? 'new'}
        worker={worker}
        existing={existing}
        onCancel={() => setRoute({ name: 'worker', workerId: worker.id })}
        onSave={(data) => {
          upsertNote({ id: existing?.id ?? uid(), workerId: worker.id, ...data });
          setRoute({ name: 'worker', workerId: worker.id });
        }}
        onDelete={
          existing
            ? () => {
                deleteNote(existing.id);
                setRoute({ name: 'worker', workerId: worker.id });
              }
            : undefined
        }
      />
    );
  }

  if (route.name === 'entry') {
    const worker = state.workers.find((w) => w.id === route.workerId)!;
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
        knownLocations={Array.from(new Set(state.entries.map((e) => e.location).filter(Boolean)))}
        defaults={defaults}
        onCancel={() => setRoute({ name: 'worker', workerId: worker.id })}
        onSave={(data) => {
          upsertEntry({ id: existing?.id ?? uid(), workerId: worker.id, ...data });
          setRoute({ name: 'worker', workerId: worker.id });
        }}
        onDuplicate={
          existing
            ? () => {
                const copyId = uid();
                upsertEntry({
                  ...existing,
                  id: copyId,
                  date: ymd(new Date()),
                });
                setRoute({ name: 'entry', workerId: worker.id, entryId: copyId });
              }
            : undefined
        }
        onDelete={
          existing
            ? () => {
                deleteEntry(existing.id);
                setRoute({ name: 'worker', workerId: worker.id });
              }
            : undefined
        }
      />
    );
  }

  if (route.name === 'report') {
    const worker = state.workers.find((w) => w.id === route.workerId);
    if (!worker) {
      setRoute({ name: 'workers' });
      return null;
    }
    return (
      <ReportView
        worker={worker}
        entries={state.entries}
        monthKey={route.monthKey}
        onBack={() => setRoute({ name: 'worker', workerId: worker.id })}
      />
    );
  }

  if (route.name === 'workerForm') {
    const existing = route.workerId ? state.workers.find((w) => w.id === route.workerId) : undefined;
    return (
      <WorkerForm
        existing={existing}
        onCancel={() =>
          existing
            ? setRoute({ name: 'worker', workerId: existing.id })
            : setRoute({ name: 'workers' })
        }
        onSave={(data) => {
          const w: Worker = { id: existing?.id ?? uid(), ...data };
          upsertWorker(w);
          setRoute({ name: 'worker', workerId: w.id });
        }}
        onDelete={
          existing
            ? () => {
                deleteWorker(existing.id);
                setRoute({ name: 'workers' });
              }
            : undefined
        }
      />
    );
  }

  return null;
}
