import type { AppState } from './types';

const KEY = 'worker-hours-v1';

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { workers: [], entries: [], notes: [] };
    const parsed = JSON.parse(raw) as AppState;
    return {
      workers: parsed.workers ?? [],
      entries: parsed.entries ?? [],
      notes: parsed.notes ?? [],
    };
  } catch {
    return { workers: [], entries: [], notes: [] };
  }
}

export function saveState(state: AppState): void {
  localStorage.setItem(KEY, JSON.stringify(state));
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
