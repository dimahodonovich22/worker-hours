export type Worker = {
  id: string;
  name: string;
  // Сохраняются для обратной совместимости со старыми записями.
  hourly?: number;
  perKm?: number;
};

export type Entry = {
  id: string;
  workerId: string;
  date: string;     // YYYY-MM-DD
  location: string;
  start: string;    // HH:mm
  end: string;      // HH:mm
  lunch: boolean;   // true → вычесть 30 мин
  km: number;
  hourly?: number;  // €/ч за этот день
  perKm?: number;   // €/км за этот день
  multiplier?: number; // 1 | 1.5 | 2 — коэффициент для часов
  // Дополнительные объекты в этот же день, у каждого своё время.
  // Часы суммируются с основным сегментом, обед вычитается один раз за день.
  extraSegments?: Segment[];
  photos?: string[]; // data URL'ы (JPEG, сжатые)
};

export type Segment = {
  location: string;
  start: string;
  end: string;
};

export type Note = {
  id: string;
  workerId: string;
  date: string;          // YYYY-MM-DD
  direction: 'minus' | 'plus'; // minus = я должен начальнику, plus = начальник должен мне
  amount: number;        // евро
  description: string;
  photos?: string[];     // data URL'ы (JPEG, сжатые)
  // Для «мне должны»: способ получения. По умолчанию на карту.
  cash?: boolean;
  // Процент, который вычитается из суммы, если получено кэшом (0–100).
  cashDeductPercent?: number;
  // Для «мне должны»: расход по работе (парковка, покупки) — прибавляется
  // к сумме к выплате за работу, а не учитывается отдельно в заметках.
  addToPay?: boolean;
};

// Выбранный период просмотра — общий для главного экрана и экрана работника.
export type PeriodView = {
  period: 'month' | 'week';
  month: string;      // YYYY-MM
  rangeStart: string; // YYYY-MM-DD
  rangeEnd: string;   // YYYY-MM-DD
};

// Кто вошёл: администратор видит всё, работник — только своё.
export type Session = {
  login: string;
  role: 'admin' | 'worker';
  workerId: string | null;
  name: string | null;
};

// Чьи часы показывать на главном экране (ленте месяцев).
export type FeedFilter =
  | { kind: 'me' }
  | { kind: 'all' }
  | { kind: 'worker'; workerId: string };

export type AppState = {
  workers: Worker[];
  entries: Entry[];
  notes: Note[];
  // Ставки для общей плашки на главном экране (независимы от ставок в записях).
  overviewRates?: {
    hourly: number;
    perKm: number;
  };
  // Кто из работников — сам пользователь (для режима «Мои часы»).
  selfWorkerId?: string;
  // Последний выбранный режим ленты.
  feedFilter?: FeedFilter;
};
