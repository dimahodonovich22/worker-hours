import type { AppState } from './types';

// Тестовая копия: свой ключ, чтобы не трогать данные основного приложения
// (оба живут на одном домене dimahodonovich22.github.io).
const KEY = 'worker-hours-test-v1';

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { workers: [], entries: [], notes: [] };
    const parsed = JSON.parse(raw) as AppState;
    return {
      workers: parsed.workers ?? [],
      entries: parsed.entries ?? [],
      notes: parsed.notes ?? [],
      overviewRates: parsed.overviewRates,
      selfWorkerId: parsed.selfWorkerId,
      feedFilter: parsed.feedFilter,
      feedPayMode: parsed.feedPayMode,
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
