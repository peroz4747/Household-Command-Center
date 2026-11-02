// Obračunsko obdobje: od 16. prejšnjega do 15. tega meseca (skupno strežniku in brskalniku).
export const BILLING_END_DAY = 15;
const DAY_MS = 24 * 3600 * 1000;

export type BillingPeriod = { start: Date; end: Date; totalDays: number; elapsedDays: number };

export function billingPeriod(now: Date, offset = 0): BillingPeriod {
  const y = now.getFullYear();
  const m = now.getMonth();
  const endMonth = (now.getDate() <= BILLING_END_DAY ? m : m + 1) + offset;
  const start = new Date(y, endMonth - 1, BILLING_END_DAY + 1);
  const end = new Date(y, endMonth, BILLING_END_DAY);
  const today = new Date(y, m, now.getDate());
  const totalDays = Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1;
  const elapsedDays = Math.min(totalDays, Math.round((today.getTime() - start.getTime()) / DAY_MS) + 1);
  return { start, end, totalDays, elapsedDays };
}

export const toDateString = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
