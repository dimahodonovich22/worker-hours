// Обращения к серверу. Все данные теперь хранятся на сервере, вход — по паролю (cookie).
import type { AppState, Entry, Note, Session, Worker } from './types';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/${path}`, {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        // Сервер принимает изменения только с этим заголовком — защита от запросов с чужих сайтов.
        'X-Chasy': '1',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'Нет связи с сервером. Проверьте интернет.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error || `Ошибка ${res.status}`);
  return data as T;
}

const enc = encodeURIComponent;

/** Страница «Продукт»: действующий текст и непроверенное исправление менеджера (если есть). */
export type ProductNotesView = {
  text: string;
  updatedAt: number | null;
  pending: { text: string; at: number; by: string } | null;
};

export const api = {
  session: () => request<{ user: Session }>('GET', 'session'),
  login: (login: string, password: string) => request<{ user: Session }>('POST', 'login', { login, password }),
  logout: () => request<object>('POST', 'logout'),
  inviteInfo: (token: string) => request<{ user: Session }>('GET', `invite/${enc(token)}`),
  acceptInvite: (token: string, password: string) =>
    request<{ user: Session }>('POST', `invite/${enc(token)}`, { password }),

  data: () => request<AppState>('GET', 'data'),
  putEntry: (e: Entry) => request<Entry>('PUT', `entries/${enc(e.id)}`, e),
  deleteEntry: (id: string) => request<object>('DELETE', `entries/${enc(id)}`),
  putNote: (n: Note) => request<Note>('PUT', `notes/${enc(n.id)}`, n),
  deleteNote: (id: string) => request<object>('DELETE', `notes/${enc(id)}`),
  /** Администратор принимает или отклоняет исправление работника; в ответе — запись после решения. */
  review: (kind: 'entries' | 'notes', id: string, action: 'approve' | 'reject') =>
    request<Entry | Note>('POST', `${kind}/${enc(id)}/${action}`),
  putWorker: (w: Worker) => request<Worker>('PUT', `workers/${enc(w.id)}`, w),
  deleteWorker: (id: string) => request<object>('DELETE', `workers/${enc(id)}`),
  settings: (s: { overviewRates?: { hourly: number; perKm: number }; selfWorkerId?: string | null }) =>
    request<object>('PUT', 'settings', s),
  importAll: (s: AppState) =>
    request<{ workers: number; entries: number; notes: number }>('POST', 'import', s),

  productNotes: () => request<ProductNotesView>('GET', 'product-notes'),
  saveProductNotes: (text: string) => request<ProductNotesView>('PUT', 'product-notes', { text }),
  reviewProduct: (action: 'approve' | 'reject') => request<ProductNotesView>('POST', `product-notes/${action}`),

  account: (workerId: string) =>
    request<{ status: 'none' | 'invited' | 'expired' | 'active'; login: string | null }>(
      'GET',
      `workers/${enc(workerId)}/account`,
    ),
  invite: (workerId: string) =>
    request<{ link: string; login: string; days: number }>('POST', `workers/${enc(workerId)}/invite`),
  closeAccount: (workerId: string) => request<object>('DELETE', `workers/${enc(workerId)}/account`),
};
