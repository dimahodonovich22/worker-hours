import type { FeedFilter } from './types';

// Данные живут на сервере. На устройстве храним только личный выбор:
// чьи часы показывать в ленте (у каждого телефона свой).
const FILTER_KEY = 'chasy-feed-filter';

export function loadFeedFilter(): FeedFilter | undefined {
  try {
    const raw = localStorage.getItem(FILTER_KEY);
    return raw ? (JSON.parse(raw) as FeedFilter) : undefined;
  } catch {
    return undefined;
  }
}

export function saveFeedFilter(f: FeedFilter): void {
  try {
    localStorage.setItem(FILTER_KEY, JSON.stringify(f));
  } catch {
    // нет доступа к хранилищу — выбор просто не запомнится
  }
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
