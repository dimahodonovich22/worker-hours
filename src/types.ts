export type Worker = {
  id: string;
  name: string;
  hourly: number; // €/час
  perKm: number;  // €/км
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
};

export type AppState = {
  workers: Worker[];
  entries: Entry[];
};
