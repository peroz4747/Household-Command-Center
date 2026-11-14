// Kdaj je elektrika najcenejša: energija dobavitelja (VT/MT) + omrežnina za energijo po časovnem bloku.
// Moči (kW) ne upoštevamo: ta se obračuna po največji 15-minutni moči v bloku, zato je nasvet
// "ne prižigaj več velikih porabnikov hkrati" ločen od tega, kdaj je kWh najcenejša.
import { pricesFor } from "./electricityBill";
import { blockFor, isWorkingDay, tariffFor, type Block } from "./networkTariff";

export type HourPrice = { hour: number; eurPerKwh: number; tariff: "VT" | "MT"; block: Block };
export type CheapWindow = { from: number; to: number; eurPerKwh: number }; // ure [from, to), to je lahko 24
export type CheapDay = { day: string; hours: HourPrice[]; windows: CheapWindow[]; peakEurPerKwh: number };

const TZ = "Europe/Ljubljana";
const TOLERANCE = 0.002; // EUR/kWh: ure, ki so od najcenejše dražje manj kot to, štejejo k oknu
const FLAT = 0.006; // EUR/kWh: če je cel dan razlika manjša, je vseeno, kdaj (npr. vikend, ves dan MT)

export const localDay = (date = new Date()) => date.toLocaleDateString("sv-SE", { timeZone: TZ });

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function hourPrices(day: string): HourPrice[] {
  const [y, m, d] = day.split("-").map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const working = isWorkingDay(y, m, d, weekday);
  const supply = pricesFor(day);
  const network = tariffFor(day);
  return Array.from({ length: 24 }, (_, hour) => {
    const tariff: "VT" | "MT" = working && hour >= 6 && hour < 22 ? "VT" : "MT";
    const block = blockFor(m, hour, working);
    const energy = supply ? (tariff === "VT" ? supply.supplyVt : supply.supplyMt) : 0;
    const net = network ? network.energy[block - 1] : 0;
    const vat = supply?.vat ?? 0.22;
    return { hour, tariff, block, eurPerKwh: (energy + net) * (1 + vat) };
  });
}

/** Najcenejša strnjena okna dneva (npr. 0-6 in 22-24). */
export function cheapDay(day: string): CheapDay {
  const hours = hourPrices(day);
  const min = Math.min(...hours.map((h) => h.eurPerKwh));
  const peak = Math.max(...hours.map((h) => h.eurPerKwh));
  if (peak - min < FLAT) return { day, hours, windows: [{ from: 0, to: 24, eurPerKwh: min }], peakEurPerKwh: peak };
  const windows: CheapWindow[] = [];
  for (const h of hours) {
    if (h.eurPerKwh - min > TOLERANCE) continue;
    const last = windows[windows.length - 1];
    if (last && last.to === h.hour) last.to = h.hour + 1;
    else windows.push({ from: h.hour, to: h.hour + 1, eurPerKwh: h.eurPerKwh });
  }
  return { day, hours, windows, peakEurPerKwh: peak };
}

const pad = (h: number) => `${String(h % 24).padStart(2, "0")}:00`;
export const formatWindow = (w: CheapWindow) => `${pad(w.from)}–${w.to === 24 ? "24:00" : pad(w.to)}`; // to > 24 = do jutri

/** Naslednje najcenejše okno od zdaj (danes ali jutri) in ali teče že zdaj. */
export function nextCheapWindow(now = new Date()): { day: string; window: CheapWindow; active: boolean } | null {
  const today = localDay(now);
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "numeric", hourCycle: "h23" }).format(now)) % 24;
  for (const [day, offset] of [
    [today, 0],
    [addDays(today, 1), 1],
  ] as const) {
    for (const w of cheapDay(day).windows) {
      if (offset === 0 && w.to <= hour) continue;
      // Okno do polnoči se nadaljuje v jutrišnje nočno okno (npr. 22:00–06:00).
      const after = w.to === 24 && w.from > 0 ? cheapDay(addDays(day, 1)).windows[0] : null;
      const window = after && after.from === 0 && after.to < 24 ? { ...w, to: 24 + after.to } : w;
      return { day, window, active: offset === 0 && w.from <= hour };
    }
  }
  return null;
}
