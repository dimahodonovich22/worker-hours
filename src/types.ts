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
};

export type AppState = {
  workers: Worker[];
  entries: Entry[];
  notes: Note[];
};
