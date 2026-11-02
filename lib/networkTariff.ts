// Omrežnina (prenos + distribucija) za uporabniško skupino 0 (gospodinjstva, NN) po časovnih blokih.
// Vir: SODO, Cenik omrežnin - https://www.sodo.si/ceniki/<datum>/cenik-omreznin (zneski brez DDV).
// Ob novem ceniku dodaj vrstico v TARIFFS.

export type Block = 1 | 2 | 3 | 4 | 5;

type Tariff = {
  validFrom: string; // YYYY-MM-DD
  power: [number, number, number, number, number]; // EUR/kW/mesec, bloki 1-5
  energy: [number, number, number, number, number]; // EUR/kWh, bloki 1-5
};

export const TARIFFS: Tariff[] = [
  {
    validFrom: "2026-03-01",
    power: [3.82301, 1.0923, 0.28902, 0.02436, 0.00245],
    energy: [0.02217, 0.01998, 0.01717, 0.01805, 0.01299],
  },
  {
    validFrom: "2026-11-01",
    power: [2.67611, 1.0923, 0.28902, 0.02436, 0.00245],
    energy: [0.02217, 0.01998, 0.01717, 0.01805, 0.01299],
  },
];

export function tariffFor(day: string): Tariff | null {
  let found: Tariff | null = null;
  for (const t of TARIFFS) if (t.validFrom <= day) found = t;
  return found;
}

// Velikonočni ponedeljek (gregorijanski algoritem).
function easterMonday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  const mon = new Date(year, month - 1, day + 1);
  return `${mon.getMonth() + 1}-${mon.getDate()}`;
}

// Dela prosti dnevi v Sloveniji (mesec-dan); šteti so kot nedelovni dnevi.
const FIXED_HOLIDAYS = ["1-1", "1-2", "2-8", "4-27", "5-1", "5-2", "6-25", "8-15", "10-31", "11-1", "12-25", "12-26"];

export function isWorkingDay(year: number, month: number, day: number, weekday: number): boolean {
  if (weekday === 0 || weekday === 6) return false;
  const key = `${month}-${day}`;
  return !FIXED_HOLIDAYS.includes(key) && key !== easterMonday(year);
}

/**
 * Časovni blok za lokalni čas (Ljubljana).
 * Višja sezona: november-februar. Ure: vršne 7-14 in 16-20, srednje 6-7, 14-16, 20-22, nizke 22-6.
 * Višja sezona delovni dan: 1/2/3, višja nedelovni ali nižja delovni: 2/3/4, nižja nedelovni: 3/4/5.
 */
export function blockFor(month: number, hour: number, workingDay: boolean): Block {
  const peak = (hour >= 7 && hour < 14) || (hour >= 16 && hour < 20);
  const mid = hour === 6 || (hour >= 14 && hour < 16) || (hour >= 20 && hour < 22);
  const hourLevel = peak ? 0 : mid ? 1 : 2;
  const highSeason = month >= 11 || month <= 2;
  const offset = (highSeason ? 0 : 1) + (workingDay ? 0 : 1);
  return (1 + offset + hourLevel) as Block;
}

const partsFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Ljubljana",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  hourCycle: "h23",
  weekday: "short",
});
const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Lokalni deli časa in blok za začetek 15-minutnega intervala. */
export function intervalInfo(start: Date): { day: string; block: Block } {
  const p = Object.fromEntries(partsFmt.formatToParts(start).map((x) => [x.type, x.value]));
  const year = Number(p.year);
  const month = Number(p.month);
  const day = Number(p.day);
  const working = isWorkingDay(year, month, day, WEEKDAYS[p.weekday]);
  return {
    day: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    block: blockFor(month, Number(p.hour), working),
  };
}
