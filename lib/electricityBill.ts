// Izračun računa za elektriko po postavkah, kot jih ima račun (vse cene brez DDV).
// Vir: račun za september 2026 (dobavitelj + Elektro Maribor). Ob spremembi cen dodaj nov vnos v PRICES.
import { tariffFor, type Block } from "./networkTariff";

type Prices = {
  validFrom: string; // YYYY-MM-DD
  supplyVt: number; // EUR/kWh, energija dobavitelja
  supplyMt: number;
  monthlyFee: number; // EUR/mesec, pavšalni stroški poslovanja
  monthlyDiscount: number; // EUR/mesec, popust (pozitivno število)
  marketOperator: number; // EUR/kWh, prispevek za delovanje operaterja trga
  efficiency: number; // EUR/kWh, prispevek za energetsko učinkovitost
  spteOve: number; // EUR/kW/mesec, prispevek SPTE + OVE (× moč v ČB1)
  excise: number; // EUR/kWh, trošarina I. stopnje
  vat: number; // DDV
};

export const PRICES: Prices[] = [
  {
    validFrom: "2026-09-01",
    supplyVt: 0.12479,
    supplyMt: 0.10285,
    monthlyFee: 1.99,
    monthlyDiscount: 1.0,
    marketOperator: 0.00013,
    efficiency: 0.0008,
    spteOve: 0.77562,
    excise: 0.00153,
    vat: 0.22,
  },
];

/**
 * Dogovorjena (obračunska) moč po blokih ČB1-ČB5 v kW, kadar je Moj Elektro ne vrne.
 * Iz računa za september 2026: ČB2 3,7, ČB3-5 5,2. ČB1 na septembrskem računu ni (nižja sezona);
 * 3,7 kW je vzeto iz postavke SPTE+OVE, ki se obračuna po moči v ČB1.
 */
export const FALLBACK_AGREED_POWER: { from: string; to: string; kw: [number, number, number, number, number] }[] = [
  { from: "2026-01-01", to: "2026-12-31", kw: [3.7, 3.7, 5.2, 5.2, 5.2] },
];

export function pricesFor(day: string): Prices | null {
  let found: Prices | null = null;
  for (const p of PRICES) if (p.validFrom <= day) found = p;
  return found;
}

export type BillBreakdown = {
  supply: number; // energija (VT + MT)
  networkEnergy: number; // omrežnina za prevzeto energijo
  networkPower: number; // omrežnina za dogovorjeno moč
  contributions: number; // prispevki (operater trga, učinkovitost, SPTE+OVE)
  excise: number; // trošarina
  fees: number; // pavšal − popust
  net: number; // skupaj brez DDV
  vat: number;
  total: number; // z DDV
};

export type BillInput = {
  vtKwh: number;
  mtKwh: number;
  byBlock: Partial<Record<Block, number>>;
  /** Dnevi obdobja, ki jih račun pokriva (YYYY-MM-DD), vsak s svojo dogovorjeno močjo. */
  days: { day: string; daysInMonth: number; kw: [number, number, number, number, number] | null }[];
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Račun za dane kWh in dneve. Mesečne postavke (moč, SPTE, pavšal) se delijo sorazmerno po dnevih. */
export function computeBill(input: BillInput): BillBreakdown | null {
  const first = input.days[0]?.day;
  const prices = first ? pricesFor(first) : null;
  const tariff = first ? tariffFor(first) : null;
  if (!prices || !tariff) return null;

  const kwh = input.vtKwh + input.mtKwh;
  const supply = input.vtKwh * prices.supplyVt + input.mtKwh * prices.supplyMt;

  let networkEnergy = 0;
  for (const [b, v] of Object.entries(input.byBlock)) networkEnergy += (v ?? 0) * tariff.energy[Number(b) - 1];

  let networkPower = 0;
  let spte = 0;
  let fees = 0;
  for (const d of input.days) {
    const p = pricesFor(d.day) ?? prices;
    const t = tariffFor(d.day) ?? tariff;
    const share = 1 / d.daysInMonth;
    fees += (p.monthlyFee - p.monthlyDiscount) * share;
    if (d.kw) {
      // ČB1 obstaja samo v višji sezoni (nov-feb); v nižji se moč obračuna le za ČB2-ČB5 (kot na računu).
      const month = Number(d.day.slice(5, 7));
      const highSeason = month >= 11 || month <= 2;
      networkPower += d.kw.reduce((s, kw, i) => (i === 0 && !highSeason ? s : s + kw * t.power[i]), 0) * share;
      spte += d.kw[0] * p.spteOve * share;
    }
  }

  const contributions = kwh * (prices.marketOperator + prices.efficiency) + spte;
  const excise = kwh * prices.excise;
  const net = supply + networkEnergy + networkPower + contributions + excise + fees;
  const vat = net * prices.vat;
  return {
    supply: round2(supply),
    networkEnergy: round2(networkEnergy),
    networkPower: round2(networkPower),
    contributions: round2(contributions),
    excise: round2(excise),
    fees: round2(fees),
    net: round2(net),
    vat: round2(vat),
    total: round2(net + vat),
  };
}
