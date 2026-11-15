// Gospodarstva sveta: BDP in BDP na prebivalca (Svetovna banka, zadnje znano leto), letna realna rast
// in četrtletna rast (OECD za ~45 držav, Eurostat za preostale članice EU). Drugje četrtletnih podatkov ni.
export type Economy = {
  iso2: string;
  iso3: string;
  name: string; // angleško ime iz Svetovne banke (UI ga prevede z Intl.DisplayNames)
  region: string; // regija Svetovne banke
  gdpUsd: number | null;
  gdpYear: string | null;
  gdpPerCapitaUsd: number | null;
  growthYear: number | null; // realna letna rast BDP, %
  growthYearOf: string | null;
  qoq: number | null; // rast glede na prejšnje četrtletje (desezonirano), %
  yoyQ: number | null; // rast glede na isto četrtletje lani, %
  quarter: string | null; // npr. 2026-Q3
  quarterSource: "OECD" | "Eurostat" | null;
};
export type EconomiesData = { items: Economy[]; worldGdpUsd: number | null; fetchedAt: string };
const quarterHistory = new Map<string, { source: "OECD" | "Eurostat"; history: QuarterPoint[] }>();

const WB = "https://api.worldbank.org/v2";
const CACHE_MS = 12 * 3_600_000;
let cache: { at: number; data: EconomiesData } | null = null;
let inFlight: Promise<EconomiesData> | null = null;

async function json(url: string, headers: Record<string, string> = {}): Promise<any> {
  const res = await fetch(url, { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0 (HouseholdCommandCenter)", ...headers }, signal: AbortSignal.timeout(25_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}

async function wbIndicator(code: string): Promise<Map<string, { value: number; date: string }>> {
  const body = await json(`${WB}/country/all/indicator/${code}?format=json&mrnev=1&per_page=400`);
  const out = new Map<string, { value: number; date: string }>();
  for (const r of body?.[1] ?? []) if (r.value !== null && r.countryiso3code) out.set(r.countryiso3code, { value: Number(r.value), date: String(r.date) });
  return out;
}

type Quarterly = { qoq: number | null; yoy: number | null; quarter: string; source: "OECD" | "Eurostat"; history: QuarterPoint[] };

// OECD brez brskalniškega User-Agent vrne 500.
async function oecdQuarterly(): Promise<Map<string, Quarterly>> {
  const since = `${new Date().getUTCFullYear() - 3}-Q1`;
  const url = `https://sdmx.oecd.org/public/rest/data/OECD.SDD.NAD,DSD_NAMAIN1@DF_QNA_EXPENDITURE_GROWTH_OECD,/Q.Y..S1.S1.B1GQ._Z._Z._Z.PC.L.G1+GY.T0102?startPeriod=${since}`;
  const res = await fetch(url, { cache: "no-store", headers: { Accept: "application/vnd.sdmx.data+csv; charset=utf-8", "User-Agent": "Mozilla/5.0 (HouseholdCommandCenter)" }, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`OECD HTTP ${res.status}`);
  const [header, ...lines] = (await res.text()).trim().split(/\r?\n/);
  const cols = header.split(",");
  const at = (name: string) => cols.indexOf(name);
  const [iArea, iTr, iTime, iVal] = [at("REF_AREA"), at("TRANSFORMATION"), at("TIME_PERIOD"), at("OBS_VALUE")];
  const latest = new Map<string, Map<string, number>>(); // area → quarter → G1/GY
  const raw = new Map<string, { G1?: number; GY?: number }>();
  for (const line of lines) {
    const c = line.split(",");
    const key = `${c[iArea]}|${c[iTime]}`;
    const v = Number(c[iVal]);
    if (!Number.isFinite(v)) continue;
    raw.set(key, { ...raw.get(key), [c[iTr]]: v });
    latest.set(c[iArea], (latest.get(c[iArea]) ?? new Map()).set(c[iTime], 1));
  }
  const out = new Map<string, Quarterly>();
  for (const [area, quarters] of latest) {
    const q = [...quarters.keys()].sort().filter((t) => raw.get(`${area}|${t}`)?.G1 !== undefined).at(-1);
    if (!q) continue;
    const r = raw.get(`${area}|${q}`)!;
    const history = [...quarters.keys()].sort().map((t) => ({ quarter: t, qoq: raw.get(`${area}|${t}`)?.G1 ?? null, yoy: raw.get(`${area}|${t}`)?.GY ?? null }));
    out.set(area, { qoq: r.G1 ?? null, yoy: r.GY ?? null, quarter: q, source: "OECD", history });
  }
  return out;
}

const EUROSTAT_EXTRA: Record<string, string> = { BG: "BGR", HR: "HRV", CY: "CYP", MT: "MLT", RO: "ROU" };

async function eurostatQuarterly(): Promise<Map<string, Quarterly>> {
  const geo = Object.keys(EUROSTAT_EXTRA).map((g) => `&geo=${g}`).join("");
  const since = `${new Date().getUTCFullYear() - 3}-Q1`;
  const d = await json(`https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/namq_10_gdp?format=JSON&unit=CLV_PCH_PRE&unit=CLV_PCH_SM&s_adj=SCA&na_item=B1GQ${geo}&sinceTimePeriod=${since}&lang=EN`);
  const dims: string[] = d.id;
  const size: number[] = d.size;
  const index = (dim: string) => d.dimension[dim].category.index as Record<string, number>;
  const value = (coords: Record<string, number>) => {
    let pos = 0;
    dims.forEach((k, i) => (pos = pos * size[i] + (coords[k] ?? 0)));
    return d.value[String(pos)] as number | undefined;
  };
  const out = new Map<string, Quarterly>();
  const times = Object.keys(index("time")).sort();
  for (const [g, gi] of Object.entries(index("geo"))) {
    const at = (unit: string, t: string) => value({ unit: index("unit")[unit], geo: gi, time: index("time")[t] });
    const q = times.filter((t) => at("CLV_PCH_PRE", t) !== undefined).at(-1);
    const history = times.map((t) => ({ quarter: t, qoq: at("CLV_PCH_PRE", t) ?? null, yoy: at("CLV_PCH_SM", t) ?? null })).filter((h) => h.qoq !== null || h.yoy !== null);
    if (q) out.set(EUROSTAT_EXTRA[g], { qoq: at("CLV_PCH_PRE", q) ?? null, yoy: at("CLV_PCH_SM", q) ?? null, quarter: q, source: "Eurostat", history });
  }
  return out;
}

async function load(): Promise<EconomiesData> {
  const [meta, gdp, pc, growth, oecd, eurostat] = await Promise.all([
    json(`${WB}/country?format=json&per_page=400`),
    wbIndicator("NY.GDP.MKTP.CD"),
    wbIndicator("NY.GDP.PCAP.CD"),
    wbIndicator("NY.GDP.MKTP.KD.ZG"),
    oecdQuarterly().catch(() => new Map<string, Quarterly>()),
    eurostatQuarterly().catch(() => new Map<string, Quarterly>()),
  ]);
  const items: Economy[] = [];
  for (const c of meta?.[1] ?? []) {
    if (c.region?.id === "NA" || !c.iso2Code || !/^[A-Z]{2}$/.test(c.iso2Code)) continue; // agregati (svet, regije ...)
    const iso3 = String(c.id);
    const q = oecd.get(iso3) ?? eurostat.get(iso3) ?? null;
    if (q) quarterHistory.set(iso3, { source: q.source, history: q.history.slice(-12) });
    items.push({
      iso2: c.iso2Code,
      iso3,
      name: String(c.name),
      region: String(c.region?.value ?? "").trim(),
      gdpUsd: gdp.get(iso3)?.value ?? null,
      gdpYear: gdp.get(iso3)?.date ?? null,
      gdpPerCapitaUsd: pc.get(iso3)?.value ?? null,
      growthYear: growth.get(iso3)?.value ?? null,
      growthYearOf: growth.get(iso3)?.date ?? null,
      qoq: q?.qoq ?? null,
      yoyQ: q?.yoy ?? null,
      quarter: q?.quarter ?? null,
      quarterSource: q?.source ?? null,
    });
  }
  items.sort((a, b) => (b.gdpUsd ?? -1) - (a.gdpUsd ?? -1));
  return { items, worldGdpUsd: gdp.get("WLD")?.value ?? null, fetchedAt: new Date().toISOString() };
}

export async function getEconomies(): Promise<EconomiesData> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.data;
  inFlight ??= load()
    .then((data) => {
      // Če OECD ni odgovoril (ni četrtletnih podatkov), poskusimo znova čez 30 min, ne čez 12 h.
      const partial = data.items.filter((e) => e.qoq !== null).length < 20;
      cache = { at: partial ? Date.now() - CACHE_MS + 30 * 60_000 : Date.now(), data };
      return data;
    })
    .finally(() => (inFlight = null));
  try {
    return await inFlight;
  } catch (e) {
    if (cache) return cache.data;
    throw e;
  }
}

/* ---------------- Podrobnosti ene države (pojavno okno) ---------------- */

export type YearPoint = { year: string; value: number };
export type QuarterPoint = { quarter: string; qoq: number | null; yoy: number | null };
export type CountryDetail = {
  iso3: string;
  incomeLevel: string | null;
  capital: string | null;
  gdp: YearPoint[]; // USD, tekoče cene
  gdpPerCapita: YearPoint[];
  growth: YearPoint[]; // realna rast, %
  quarters: QuarterPoint[]; // zadnja 3 leta
  quarterSource: "OECD" | "Eurostat" | null;
  population: YearPoint | null;
  inflation: YearPoint | null; // CPI, %
  unemployment: YearPoint | null; // % aktivnega prebivalstva
  exports: YearPoint | null; // izvoz, % BDP
};

const detailCache = new Map<string, { at: number; data: CountryDetail }>();

/** Svetovna banka občasno vrne napako ali prazen odgovor; en ponovni poskus. */
const wbJson = (url: string) => json(url).catch(() => new Promise((r) => setTimeout(r, 1500)).then(() => json(url))).catch(() => null);

async function wbHistory(iso3: string, code: string, n = 20): Promise<YearPoint[]> {
  const body = await wbJson(`${WB}/country/${iso3}/indicator/${code}?format=json&mrv=${n}&per_page=100`);
  return ((body?.[1] ?? []) as any[])
    .filter((r) => r.value !== null)
    .map((r) => ({ year: String(r.date), value: Number(r.value) }))
    .sort((a, b) => a.year.localeCompare(b.year));
}

async function wbLatest(iso3: string, code: string): Promise<YearPoint | null> {
  const body = await wbJson(`${WB}/country/${iso3}/indicator/${code}?format=json&mrnev=1`);
  const r = body?.[1]?.[0];
  return r && r.value !== null ? { year: String(r.date), value: Number(r.value) } : null;
}

export async function getCountryDetail(iso3: string): Promise<CountryDetail | null> {
  const had = detailCache.get(iso3);
  if (had && Date.now() - had.at < CACHE_MS) return had.data;
  const meta = await wbJson(`${WB}/country/${iso3}?format=json`);
  const c = meta?.[1]?.[0];
  if (!c || c.region?.id === "NA") return null;
  // Četrtletna zgodovina je iz skupnega prenosa (OECD dovoli le nekaj poizvedb na uro).
  await getEconomies().catch(() => null);
  const q = quarterHistory.get(iso3);
  const [gdp, gdpPerCapita, growth, population, inflation, unemployment, exports] = await Promise.all([
    wbHistory(iso3, "NY.GDP.MKTP.CD"),
    wbHistory(iso3, "NY.GDP.PCAP.CD"),
    wbHistory(iso3, "NY.GDP.MKTP.KD.ZG"),
    wbLatest(iso3, "SP.POP.TOTL"),
    wbLatest(iso3, "FP.CPI.TOTL.ZG"),
    wbLatest(iso3, "SL.UEM.TOTL.ZS"),
    wbLatest(iso3, "NE.EXP.GNFS.ZS"),
  ]);
  const data: CountryDetail = {
    iso3,
    incomeLevel: c.incomeLevel?.value ? String(c.incomeLevel.value) : null,
    capital: c.capitalCity ? String(c.capitalCity) : null,
    gdp,
    gdpPerCapita,
    growth,
    quarters: q?.history ?? [],
    quarterSource: q?.source ?? null,
    population,
    inflation,
    unemployment,
    exports,
  };
  if (detailCache.size > 100) detailCache.clear();
  detailCache.set(iso3, { at: Date.now(), data });
  return data;
}
