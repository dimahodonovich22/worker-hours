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
};

export type AppState = {
  workers: Worker[];
  entries: Entry[];
};
