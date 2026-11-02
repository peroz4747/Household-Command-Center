// Poraba elektrike v obračunskem obdobju iz Moj Elektro API-ja.
// Dokumentacija: https://docs.informatika.si/mojelektro/api/ (žeton: portal Moj Elektro → Profil).
//
// Uporabljajo se dnevna stanja števca (vrsta STANJE) za delovno energijo prejem (VT, MT ali ET).
// Poraba = zadnje stanje − stanje na začetku obdobja. Podatki zamujajo ~1 dan.
// Kode registrov se poiščejo prek GET /reading-type (shranjeno 7 dni); MOJELEKTRO_READING_TYPES jih lahko povozi.
import storage from "./storage";
import { billingPeriod, toDateString } from "./billing";
import { intervalInfo, tariffFor, type Block } from "./networkTariff";

const API_URL = process.env.MOJELEKTRO_API_URL ?? "https://api.informatika.si/mojelektro/v1";
const REFRESH_MS = 3 * 3600_000; // podatki so dnevni, zato največ vsake 3 ure
const ERROR_RETRY_MS = 30 * 60_000;
const READING_TYPES_TTL_MS = 7 * 24 * 3600_000;
const A_PLUS_15MIN = "32.0.2.4.1.2.12.0.0.0.0.0.0.0.0.3.72.0"; // prejeta 15-minutna delovna energija
const TZ = "Europe/Ljubljana";

export const mojElektroConfigured = () => Boolean(process.env.MOJELEKTRO_API_TOKEN && process.env.MOJELEKTRO_USAGE_POINT);

type Tariff = "VT" | "MT" | "ET";
type RegisterMap = Partial<Record<Tariff, string>>; // tarifa → readingType koda

// Rezerva, če /reading-type ne vrne pričakovanega: dnevna stanja A+ (CIM, 16. polje = tarifa).
const FALLBACK_REGISTERS: RegisterMap = {
  ET: "32.0.4.1.1.2.12.0.0.0.0.0.0.0.0.3.72.0",
  VT: "32.0.4.1.1.2.12.0.0.0.0.1.0.0.0.3.72.0",
  MT: "32.0.4.1.1.2.12.0.0.0.0.2.0.0.0.3.72.0",
};

export type ElectricityErrorCode = "unauthorized" | "forbidden" | "bad-request" | "no-data" | "other";

export type ElectricityData = {
  periodStart: string; // YYYY-MM-DD
  periodEnd: string;
  dataUntil: string | null; // zadnji dan, ki je vključen v porabo
  usedKwh: number | null;
  byTariff: Partial<Record<"VT" | "MT", number>>;
  lastPeriodKwh: number | null;
  projectedKwh: number | null;
  costEur: number | null; // omrežnina (+ energija dobavitelja, če je cena nastavljena), brez DDV in prispevkov
  networkEur: number | null; // omrežnina: energija po blokih (+ moč, če je dogovorjena moč znana)
  networkPowerIncluded: boolean;
  supplyEur: number | null; // energija po ceni dobavitelja (ELECTRICITY_PRICE*)
  byBlock: Partial<Record<Block, number>>; // kWh po časovnih blokih
  fetchedAt: string;
};

export type ElectricityResponse = {
  source: "mojelektro" | "demo";
  data: ElectricityData | null;
  error: { code: ElectricityErrorCode; detail?: string } | null;
};

type Stored = {
  registers?: { map: RegisterMap; at: number };
  // Dogovorjene moči merilne točke (iz /merilna-tocka), za postavko omrežnine za moč.
  agreedPower?: { list: AgreedPower[]; at: number };
  data?: ElectricityData;
  lastAttemptAt?: number;
  error?: ElectricityResponse["error"];
};

class MojElektroError extends Error {
  constructor(
    public code: ElectricityErrorCode,
    public detail?: string,
  ) {
    super(code);
  }
}

async function readStored(): Promise<Stored> {
  const raw = await storage.readItems("electricity");
  return raw && !Array.isArray(raw) ? (raw as Stored) : {};
}

async function api<T>(path: string, params?: URLSearchParams): Promise<T> {
  const url = `${API_URL}${path}${params ? `?${params}` : ""}`;
  const res = await fetch(url, {
    headers: { "X-API-TOKEN": process.env.MOJELEKTRO_API_TOKEN!, accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      // Napake imajo obliko { errors: [{ koda, opis }] }
      detail = (body?.errors ?? []).map((e: any) => [e.koda, e.opis].filter(Boolean).join(" - ")).join("; ");
    } catch {
      /* ni JSON */
    }
    const code: ElectricityErrorCode =
      res.status === 401 ? "unauthorized" : res.status === 403 ? "forbidden" : res.status === 400 ? "bad-request" : "other";
    throw new MojElektroError(code, detail || `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

/** Poišče kode registrov za dnevna stanja delovne energije (prejem) po tarifah. */
async function resolveRegisters(stored: Stored): Promise<RegisterMap> {
  const override = process.env.MOJELEKTRO_READING_TYPES; // npr. "VT=32.0…,MT=32.0…"
  if (override) {
    return Object.fromEntries(
      override
        .split(",")
        .map((p) => p.split("=").map((s) => s.trim()))
        .filter(([k, v]) => (k === "VT" || k === "MT" || k === "ET") && v),
    ) as RegisterMap;
  }
  if (stored.registers && Date.now() - stored.registers.at < READING_TYPES_TTL_MS) return stored.registers.map;

  const map: RegisterMap = {};
  try {
    const types = await api<any[]>("/reading-type");
    for (const rt of types ?? []) {
      const tip = String(rt?.tip ?? "").trim().toLowerCase();
      const code = rt?.readingType;
      if (!code || String(rt?.vrsta).toUpperCase() !== "STANJE" || !tip.startsWith("delovna prejem")) continue;
      // Dnevna stanja: perioda ni 15-minutna/mesečna (vrednosti niso dokumentirane, zato le izločimo očitne).
      const perioda = String(rt?.perioda ?? "").toLowerCase();
      if (perioda && /15|min|mes|month/.test(perioda) && !/dan|day|dn/.test(perioda)) continue;
      const tariff: Tariff = tip.endsWith(" vt") ? "VT" : tip.endsWith(" mt") ? "MT" : "ET";
      map[tariff] ??= code;
    }
  } catch (e) {
    if (e instanceof MojElektroError && (e.code === "unauthorized" || e.code === "forbidden")) throw e;
  }
  const result = Object.keys(map).length ? map : FALLBACK_REGISTERS;
  stored.registers = { map: result, at: Date.now() };
  return result;
}

type AgreedPower = { from: string; to: string; kw: [number, number, number, number, number] };

/** Veljavne dogovorjene moči merilne točke odjema (OMTO); shranjeno 7 dni. */
async function agreedPowers(stored: Stored): Promise<AgreedPower[]> {
  if (stored.agreedPower && Date.now() - stored.agreedPower.at < READING_TYPES_TTL_MS) return stored.agreedPower.list;
  let list: AgreedPower[] = [];
  try {
    const mm = await api<any>(`/merilno-mesto/${encodeURIComponent(process.env.MOJELEKTRO_USAGE_POINT!)}`);
    const gsrn = (mm?.merilneTocke ?? []).find((t: any) => t.vrsta === "OMTO")?.gsrn;
    if (gsrn) {
      const mt = await api<any>(`/merilna-tocka/${encodeURIComponent(gsrn)}`);
      list = (mt?.dogovorjeneMoci ?? [])
        .filter((m: any) => m.veljavnost)
        .map((m: any) => ({
          from: String(m.datumOd).slice(0, 10),
          to: String(m.datumDo).slice(0, 10),
          kw: [1, 2, 3, 4, 5].map((b) => Number(m[`casovniBlok${b}`]) || 0) as AgreedPower["kw"],
        }));
    }
  } catch {
    /* brez podatka o moči se izračuna le energijski del omrežnine */
  }
  stored.agreedPower = { list, at: Date.now() };
  return list;
}

type Reading = { day: string; value: number }; // day = datum, ko je stanje zabeleženo (00:00)

/** Lokalni datum (Ljubljana) za časovno značko odčitka. */
const dayOf = (ts: string) => new Date(ts).toLocaleDateString("sv-SE", { timeZone: TZ });

function stateAt(readings: Reading[], day: string): number | null {
  // Stanje na dan `day` ali prvo kasnejše (če točnega ni).
  const r = readings.find((x) => x.day >= day);
  return r ? r.value : null;
}

async function fetchElectricity(stored: Stored): Promise<ElectricityData> {
  const todayLj = new Date().toLocaleDateString("sv-SE", { timeZone: TZ }); // YYYY-MM-DD
  const [y, m, d] = todayLj.split("-").map(Number);
  const now = new Date(y, m - 1, d);
  const period = billingPeriod(now);
  const prev = billingPeriod(now, -1);

  const registers = await resolveRegisters(stored);
  const byRegister = new Map<string, Reading[]>();

  // API dovoli največ 35 dni na zahtevo: za prejšnje obdobje rabimo le stanje na njegov začetek,
  // za trenutno pa vsa stanja od začetka obdobja do danes (obdobje ima največ 31 dni).
  const fetchRange = async (start: Date, end: string) => {
    const params = new URLSearchParams({
      usagePoint: process.env.MOJELEKTRO_USAGE_POINT!,
      startTime: toDateString(start),
      endTime: end,
    });
    for (const code of Object.values(registers)) params.append("option", `ReadingType=${code}`);
    const body = await api<any>("/meter-readings", params);
    for (const b of body?.intervalBlocks ?? []) {
      const list = byRegister.get(String(b.readingType)) ?? [];
      for (const r of b?.intervalReadings ?? []) {
        const value = Number(r.value);
        if (Number.isFinite(value)) list.push({ day: dayOf(r.timestamp), value });
      }
      byRegister.set(String(b.readingType), list);
    }
  };
  const prevEnd = new Date(prev.start.getFullYear(), prev.start.getMonth(), prev.start.getDate() + 2);
  await fetchRange(prev.start, toDateString(prevEnd));
  await fetchRange(period.start, todayLj);
  for (const [code, list] of byRegister) {
    const unique = new Map(list.map((r) => [r.day, r]));
    byRegister.set(code, [...unique.values()].sort((a, b) => a.day.localeCompare(b.day)));
  }
  if (![...byRegister.values()].some((l) => l.length)) throw new MojElektroError("no-data");

  const periodStart = toDateString(period.start);
  const prevStart = toDateString(prev.start);
  const usage = (code: string | undefined) => {
    const readings = code ? byRegister.get(code) : undefined;
    if (!readings?.length) return null;
    const startState = stateAt(readings, periodStart);
    const last = readings[readings.length - 1];
    const prevState = stateAt(readings, prevStart);
    return {
      used: startState !== null ? last.value - startState : null,
      last: startState !== null && prevState !== null ? startState - prevState : null,
      lastDay: last.day,
    };
  };

  const vt = usage(registers.VT);
  const mt = usage(registers.MT);
  const et = usage(registers.ET);
  const parts = [vt, mt].filter(Boolean) as NonNullable<typeof vt>[];
  const sum = (key: "used" | "last") =>
    parts.length && parts.every((p) => p[key] !== null) ? parts.reduce((s, p) => s + (p[key] as number), 0) : null;
  const usedKwh = parts.length ? sum("used") : (et?.used ?? null);
  const lastPeriodKwh = parts.length ? sum("last") : (et?.last ?? null);
  const lastDay = (parts[0] ?? et)?.lastDay ?? null;

  // Stanje z datumom D velja ob 00:00, torej vključuje porabo do vključno D−1.
  let dataUntil: string | null = null;
  let daysWithData = 0;
  if (lastDay) {
    const [ly, lm, ld] = lastDay.split("-").map(Number);
    const until = new Date(ly, lm - 1, ld - 1);
    dataUntil = toDateString(until);
    daysWithData = Math.round((until.getTime() - period.start.getTime()) / 86_400_000) + 1;
  }
  const projectedKwh = usedKwh !== null && daysWithData > 0 ? (usedKwh / daysWithData) * period.totalDays : null;

  // Omrežnina: 15-minutna energija po časovnih blokih × tarifa (obdobje ima največ 31 dni, torej 1 zahteva).
  const byBlock: Partial<Record<Block, number>> = {};
  let networkEnergy = 0;
  let has15min = false;
  try {
    const params = new URLSearchParams({
      usagePoint: process.env.MOJELEKTRO_USAGE_POINT!,
      startTime: periodStart,
      endTime: todayLj,
    });
    params.append("option", `ReadingType=${A_PLUS_15MIN}`);
    const body = await api<any>("/meter-readings", params);
    for (const b of body?.intervalBlocks ?? []) {
      for (const r of b?.intervalReadings ?? []) {
        const kwh = Number(r.value);
        if (!Number.isFinite(kwh)) continue;
        // Časovna značka označuje konec 15-minutnega intervala.
        const { day, block } = intervalInfo(new Date(Date.parse(r.timestamp) - 15 * 60_000));
        if (day < periodStart) continue;
        const tariff = tariffFor(day);
        if (!tariff) continue;
        byBlock[block] = (byBlock[block] ?? 0) + kwh;
        networkEnergy += kwh * tariff.energy[block - 1];
        has15min = true;
      }
    }
  } catch (e) {
    if (e instanceof MojElektroError && (e.code === "unauthorized" || e.code === "forbidden")) throw e;
  }

  // Postavka za moč: dogovorjena moč po blokih × EUR/kW/mesec, sorazmerno po dnevih z znanimi podatki.
  let networkPower = 0;
  let powerKnown = false;
  if (dataUntil) {
    const powers = await agreedPowers(stored);
    for (let d = new Date(period.start); toDateString(d) <= dataUntil; d.setDate(d.getDate() + 1)) {
      const day = toDateString(d);
      const p = powers.find((x) => x.from <= day && day <= x.to);
      const tariff = tariffFor(day);
      if (!p || !tariff || p.kw.every((kw) => kw === 0)) continue;
      const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      networkPower += p.kw.reduce((sum, kw, i) => sum + kw * tariff.power[i], 0) / daysInMonth;
      powerKnown = true;
    }
  }
  const networkEur = has15min ? networkEnergy + networkPower : null;

  const priceVt = Number(process.env.ELECTRICITY_PRICE_VT ?? process.env.ELECTRICITY_PRICE ?? NaN);
  const priceMt = Number(process.env.ELECTRICITY_PRICE_MT ?? process.env.ELECTRICITY_PRICE ?? NaN);
  const price = Number(process.env.ELECTRICITY_PRICE ?? NaN);
  let supplyEur: number | null = null;
  if (vt?.used != null && mt?.used != null && Number.isFinite(priceVt) && Number.isFinite(priceMt)) {
    supplyEur = vt.used * priceVt + mt.used * priceMt;
  } else if (usedKwh !== null && Number.isFinite(price)) {
    supplyEur = usedKwh * price;
  }
  const costEur = networkEur === null && supplyEur === null ? null : (networkEur ?? 0) + (supplyEur ?? 0);

  return {
    periodStart,
    periodEnd: toDateString(period.end),
    dataUntil,
    usedKwh,
    byTariff: { ...(vt?.used != null ? { VT: vt.used } : {}), ...(mt?.used != null ? { MT: mt.used } : {}) },
    lastPeriodKwh,
    projectedKwh,
    costEur,
    networkEur,
    networkPowerIncluded: powerKnown,
    supplyEur,
    byBlock,
    fetchedAt: new Date().toISOString(),
  };
}

let inFlight: Promise<void> | null = null;

export async function getElectricity(): Promise<ElectricityResponse> {
  if (!mojElektroConfigured()) return { source: "demo", data: null, error: null };

  let stored = await readStored();
  const now = Date.now();
  const fresh = stored.data && now - Date.parse(stored.data.fetchedAt) < REFRESH_MS;
  const retryBlocked = stored.error && stored.lastAttemptAt && now - stored.lastAttemptAt < ERROR_RETRY_MS;
  // Novo obračunsko obdobje → podatki niso več veljavni.
  const samePeriod = stored.data?.periodEnd === toDateString(billingPeriod(new Date()).end);

  if (!(fresh && samePeriod) && !retryBlocked) {
    if (!inFlight) {
      inFlight = (async () => {
        const s = await readStored();
        s.lastAttemptAt = Date.now();
        try {
          s.data = await fetchElectricity(s);
          s.error = null;
        } catch (e) {
          s.error =
            e instanceof MojElektroError
              ? { code: e.code, ...(e.detail ? { detail: e.detail } : {}) }
              : { code: "other", detail: (e as Error).message };
        }
        await storage.writeItems("electricity", s);
      })().finally(() => (inFlight = null));
    }
    await inFlight;
    stored = await readStored();
  }
  return { source: "mojelektro", data: stored.data ?? null, error: stored.error ?? null };
}
