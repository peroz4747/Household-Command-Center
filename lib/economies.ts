import { conflictStatus } from "./defense";
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
  milUsd: number | null; // izdatki za obrambo, tekoči USD (SIPRI prek Svetovne banke)
  milPct: number | null; // izdatki za obrambo, % BDP
  armedForces: number | null; // oborožene sile, osebje
  conflict: "war" | "conflict" | null; // trenutni oboroženi konflikt države (UCDP): vojna ≥1000 žrtev v letu
};
export type EconomiesData = { items: Economy[]; worldGdpUsd: number | null; fetchedAt: string };

const WB = "https://api.worldbank.org/v2";
const CACHE_MS = 12 * 3_600_000;
let cache: { at: number; data: EconomiesData } | null = null;
let inFlight: Promise<EconomiesData> | null = null;

async function json(url: string, headers: Record<string, string> = {}): Promise<any> {
  const res = await fetch(url, { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0 (HouseholdCommandCenter)", ...headers }, signal: AbortSignal.timeout(25_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}

/** Zgodovina kazalnika za vse države v eni poizvedbi (~1 s); poizvedbe po državah so pri Svetovni banki zelo počasne. */
async function wbBulk(code: string): Promise<Map<string, YearPoint[]>> {
  const to = new Date().getUTCFullYear() - 1;
  const url = `${WB}/country/all/indicator/${code}?format=json&date=${to - 20}:${to}&per_page=20000`;
  // Svetovna banka pogosto vrne 503; do 4 poskusi.
  let body: any = null;
  for (let attempt = 0; attempt < 4 && !body; attempt += 1) {
    body = await json(url).catch(() => null);
    if (!body) await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
  }
  if (!body) throw new Error(`World Bank ${code}`);
  const out = new Map<string, YearPoint[]>();
  for (const r of body?.[1] ?? []) {
    if (r.value === null || !r.countryiso3code) continue;
    const list = out.get(r.countryiso3code) ?? [];
    list.push({ year: String(r.date), value: Number(r.value) });
    out.set(r.countryiso3code, list);
  }
  for (const list of out.values()) list.sort((x, y) => x.year.localeCompare(y.year));
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
  const empty = () => new Map<string, YearPoint[]>();
  const [meta, gdp, pc, growth, pop, infl, unemp, exp, milUsd, milPct, forces, armsIn, armsOut, oecd, eurostat] = await Promise.all([
    json(`${WB}/country?format=json&per_page=400`),
    wbBulk("NY.GDP.MKTP.CD"),
    wbBulk("NY.GDP.PCAP.CD"),
    wbBulk("NY.GDP.MKTP.KD.ZG"),
    wbBulk("SP.POP.TOTL").catch(() => new Map<string, YearPoint[]>()),
    wbBulk("FP.CPI.TOTL.ZG").catch(() => new Map<string, YearPoint[]>()),
    wbBulk("SL.UEM.TOTL.ZS").catch(() => new Map<string, YearPoint[]>()),
    wbBulk("NE.EXP.GNFS.ZS").catch(empty),
    wbBulk("MS.MIL.XPND.CD").catch(empty),
    wbBulk("MS.MIL.XPND.GD.ZS").catch(empty),
    wbBulk("MS.MIL.TOTL.P1").catch(empty),
    wbBulk("MS.MIL.MPRT.KD").catch(empty),
    wbBulk("MS.MIL.XPRT.KD").catch(empty),
    // OECD občasno zavrne zahtevo (omejitev števila poizvedb); trije poskusi z razmikom.
    oecdQuarterly()
      .catch(() => new Promise((r) => setTimeout(r, 5000)).then(oecdQuarterly))
      .catch(() => new Promise((r) => setTimeout(r, 15000)).then(oecdQuarterly))
      .catch(() => new Map<string, Quarterly>()),
    eurostatQuarterly().catch(() => new Map<string, Quarterly>()),
  ]);
  const items: Economy[] = [];
  const nextDetails = new Map<string, CountryDetail>();
  for (const c of meta?.[1] ?? []) {
    if (c.region?.id === "NA" || !c.iso2Code || !/^[A-Z]{2}$/.test(c.iso2Code)) continue; // agregati (svet, regije ...)
    const iso3 = String(c.id);
    const q = oecd.get(iso3) ?? eurostat.get(iso3) ?? null;
    const lastOf = (m: Map<string, YearPoint[]>) => m.get(iso3)?.at(-1) ?? null;
    items.push({
      iso2: c.iso2Code,
      iso3,
      name: String(c.name),
      region: String(c.region?.value ?? "").trim(),
      gdpUsd: lastOf(gdp)?.value ?? null,
      gdpYear: lastOf(gdp)?.year ?? null,
      gdpPerCapitaUsd: lastOf(pc)?.value ?? null,
      growthYear: lastOf(growth)?.value ?? null,
      growthYearOf: lastOf(growth)?.year ?? null,
      qoq: q?.qoq ?? null,
      yoyQ: q?.yoy ?? null,
      quarter: q?.quarter ?? null,
      quarterSource: q?.source ?? null,
      milUsd: lastOf(milUsd)?.value ?? null,
      milPct: lastOf(milPct)?.value ?? null,
      armedForces: lastOf(forces)?.value ?? null,
      conflict: conflictStatus(String(c.iso2Code)),
    });
    nextDetails.set(iso3, {
      iso3,
      incomeLevel: c.incomeLevel?.value ? String(c.incomeLevel.value) : null,
      capital: c.capitalCity ? String(c.capitalCity) : null,
      gdp: gdp.get(iso3) ?? [],
      gdpPerCapita: pc.get(iso3) ?? [],
      growth: growth.get(iso3) ?? [],
      quarters: q?.history.slice(-12) ?? [],
      quarterSource: q?.source ?? null,
      population: lastOf(pop),
      milSpending: milUsd.get(iso3) ?? [],
      milPct: lastOf(milPct),
      armedForces: lastOf(forces),
      armsImports: lastOf(armsIn),
      armsExports: lastOf(armsOut),
      inflation: lastOf(infl),
      unemployment: lastOf(unemp),
      exports: lastOf(exp),
    });
  }
  details = nextDetails;
  items.sort((a, b) => (b.gdpUsd ?? -1) - (a.gdpUsd ?? -1));
  return { items, worldGdpUsd: gdp.get("WLD")?.at(-1)?.value ?? null, fetchedAt: new Date().toISOString() };
}

export async function getEconomies(): Promise<EconomiesData> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.data;
  inFlight ??= load()
    .then((data) => {
      // Če OECD ni odgovoril (ni četrtletnih podatkov), poskusimo znova čez 5 min, ne čez 12 h.
      const partial = data.items.filter((e) => e.qoq !== null).length < 20;
      cache = { at: partial ? Date.now() - CACHE_MS + 5 * 60_000 : Date.now(), data };
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
  milSpending: YearPoint[]; // USD
  milPct: YearPoint | null;
  armedForces: YearPoint | null;
  armsImports: YearPoint | null; // SIPRI TIV (konstantni USD 1990)
  armsExports: YearPoint | null;
  inflation: YearPoint | null; // CPI, %
  unemployment: YearPoint | null; // % aktivnega prebivalstva
  exports: YearPoint | null; // izvoz, % BDP
};

let details = new Map<string, CountryDetail>(); // napolni load() iz skupnih prenosov

export async function getCountryDetail(iso3: string): Promise<CountryDetail | null> {
  await getEconomies();
  return details.get(iso3) ?? null;
}
