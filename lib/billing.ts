// Obračunsko obdobje: koledarski mesec, od 1. do zadnjega dne (skupno strežniku in brskalniku).
const DAY_MS = 24 * 3600 * 1000;

export type BillingPeriod = { start: Date; end: Date; totalDays: number; elapsedDays: number };

/** Obdobje, ki vsebuje `now`; `offset` -1 = prejšnji mesec, +1 = naslednji. */
export function billingPeriod(now: Date, offset = 0): BillingPeriod {
  const y = now.getFullYear();
  const m = now.getMonth() + offset;
  const start = new Date(y, m, 1);
  const end = new Date(y, m + 1, 0); // 0. dan naslednjega meseca = zadnji dan tega
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const totalDays = Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1;
  const elapsedDays = Math.max(0, Math.min(totalDays, Math.round((today.getTime() - start.getTime()) / DAY_MS) + 1));
  return { start, end, totalDays, elapsedDays };
}

export const toDateString = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
