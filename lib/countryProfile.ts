// Profil države po okviru PMESII-PT (politika, vojska, gospodarstvo, družba, informacije, infrastruktura,
// fizično okolje, čas). Viri: Svetovna banka (vključno s kazalniki upravljanja WGI), IMF, infobox in poglavja
// Wikipedije, Wikidata (sosede, volitve), Nager.Date (prazniki), Open-Meteo (podnebje prestolnice).
import { decode, getJson, sectionText, sitelinks, wiki, wikidataIds, type InfoText } from "./countryInfo";
import storage from "./storage";

export type Point = { year: string; value: number };
export type Fact = { label: string; value: string; section: string };
export type Election = { label: string; date: string; precision: number; upcoming: boolean };
export type Holiday = { date: string; localName: string; name: string };
export type ClimateMonth = { month: number; tempMean: number; tempMin: number; tempMax: number; precip: number };
export type CountryProfile = {
  iso2: string;
  indicators: Record<string, Point>; // zadnja vrednost kazalnika (oznake glej INDICATORS)
  indicatorsPending: boolean; // kazalniki se še nalagajo (okno jih kasneje ponovno zahteva)
  facts: Fact[]; // infobox članka o državi (angleška Wikipedija)
  economyFacts: Fact[]; // infobox članka "Economy of …"
  neighbours: string[]; // ISO2
  elections: Election[];
  holidays: Holiday[];
  timezone: string | null;
  climate: { year: number; months: ClimateMonth[]; place: string } | null;
};

const WB = "https://api.worldbank.org/v2";
const UA = { "User-Agent": "HouseholdCommandCenter/1.0 (home dashboard)" };
const DAY = 86_400_000;

/** Kazalniki Svetovne banke (in WGI, vir 3) za zavihke; naloženi skupaj za vse države. */
export const INDICATORS: Record<string, { source?: number }> = {
  // Politika: kazalniki upravljanja (0–100, več je bolje)
  "GOV_WGI_CC.SC": { source: 3 },
  "GOV_WGI_GE.SC": { source: 3 },
  "GOV_WGI_PV.SC": { source: 3 },
  "GOV_WGI_RL.SC": { source: 3 },
  "GOV_WGI_RQ.SC": { source: 3 },
  "GOV_WGI_VA.SC": { source: 3 },
  // Gospodarstvo
  "NE.EXP.GNFS.ZS": {},
  "NE.IMP.GNFS.ZS": {},
  "NV.AGR.TOTL.ZS": {},
  "NV.IND.TOTL.ZS": {},
  "NV.SRV.TOTL.ZS": {},
  "EG.IMP.CONS.ZS": {},
  "BN.CAB.XOKA.GD.ZS": {},
  // Družba
  "SP.POP.TOTL": {},
  "SP.POP.GROW": {},
  "SP.URB.TOTL.IN.ZS": {},
  "SP.DYN.LE00.IN": {},
  "SP.DYN.TFRT.IN": {},
  "SP.POP.65UP.TO.ZS": {},
  "SP.POP.0014.TO.ZS": {},
  "SM.POP.NETM": {},
  "SE.TER.ENRR": {},
  "SE.ADT.LITR.ZS": {},
  "SI.POV.GINI": {},
  // Informacije
  "IT.NET.USER.ZS": {},
  "IT.CEL.SETS.P2": {},
  "IT.NET.BBND.P2": {},
  // Infrastruktura
  "IS.RRS.TOTL.KM": {},
  "IS.AIR.PSGR": {},
  "IS.SHP.GOOD.TU": {},
  "EG.ELC.ACCS.ZS": {},
  "EG.FEC.RNEW.ZS": {},
  "LP.LPI.OVRL.XQ": {},
  // Fizično okolje
  "AG.LND.TOTL.K2": {},
  "AG.LND.ARBL.ZS": {},
  "AG.LND.FRST.ZS": {},
  "NY.GDP.TOTL.RT.ZS": {},
  "NY.GDP.PETR.RT.ZS": {},
  "NY.GDP.NGAS.RT.ZS": {},
  "NY.GDP.MINR.RT.ZS": {},
  "EN.POP.DNST": {},
};

let bulk: { at: number; data: Map<string, Record<string, Point>> } | null = null;
let bulkJob: Promise<Map<string, Record<string, Point>>> | null = null;

async function wbLatest(code: string, source?: number): Promise<Map<string, Point>> {
  const to = new Date().getUTCFullYear();
  const url = `${WB}/country/all/indicator/${code}?format=json&date=${to - 15}:${to}&per_page=20000${source ? `&source=${source}` : ""}`;
  let body: any = null;
  // Svetovna banka občasno zahtevo zadrži za več kot pol minute; raje hitro poskusimo znova.
  for (let attempt = 0; attempt < 3 && !body; attempt += 1) {
    body = await fetch(url, { cache: "no-store", headers: UA, signal: AbortSignal.timeout(12_000) })
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => (Array.isArray(b?.[1]) ? b : null))
      .catch(() => null);
    if (!body) await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
  }
  const out = new Map<string, Point>();
  for (const r of body?.[1] ?? []) {
    if (r.value === null || !r.countryiso3code) continue;
    const had = out.get(r.countryiso3code);
    if (!had || String(r.date) > had.year) out.set(r.countryiso3code, { year: String(r.date), value: Number(r.value) });
  }
  return out;
}

/** IMF World Economic Outlook: bruto javni dolg (% BDP); vrne vse države naenkrat. */
async function imfDebt(): Promise<Map<string, Point>> {
  const body = await getJson("https://www.imf.org/external/datamapper/api/v1/GGXWDG_NGDP").catch(() => null);
  const out = new Map<string, Point>();
  const thisYear = String(new Date().getUTCFullYear());
  for (const [iso3, years] of Object.entries<any>(body?.values?.GGXWDG_NGDP ?? {})) {
    // Zadnje leto do letošnjega (IMF objavlja tudi napovedi za naslednja leta).
    const y = Object.keys(years).filter((k) => k <= thisYear).sort().at(-1);
    if (y) out.set(iso3, { year: y, value: Number(years[y]) });
  }
  return out;
}

const BULK_MS = 12 * 3_600_000;
const BULK_FILE = "profile-indicators";

/** Prenos vseh kazalnikov (traja do nekaj minut, ker Svetovna banka občasno zadrži zahteve). */
function refreshBulk(): Promise<Map<string, Record<string, Point>>> {
  bulkJob ??= (async () => {
    const codes = Object.entries(INDICATORS);
    const results: Map<string, Point>[] = new Array(codes.length);
    let next = 0;
    // Ob preveč hkratnih zahtevah Svetovna banka vrača 503, zato največ 4 hkrati.
    await Promise.all(
      Array.from({ length: 4 }, async () => {
        while (next < codes.length) {
          const i = next++;
          results[i] = await wbLatest(codes[i][0], codes[i][1].source);
        }
      }),
    );
    const debt = await imfDebt().catch(() => new Map<string, Point>());
    // Kazalnik, ki tokrat ni uspel, obdrži prejšnje vrednosti.
    const data = new Map<string, Record<string, Point>>(bulk?.data ?? []);
    codes.forEach(([code], i) => {
      for (const [iso3, p] of results[i]) data.set(iso3, { ...(data.get(iso3) ?? {}), [code]: p });
    });
    for (const [iso3, p] of debt) data.set(iso3, { ...(data.get(iso3) ?? {}), "IMF.DEBT": p });
    const filled = results.filter((r) => r.size > 0).length;
    bulk = { at: filled > codes.length * 0.8 ? Date.now() : Date.now() - BULK_MS + 15 * 60_000, data };
    await storage.writeItems(BULK_FILE, { at: bulk.at, data: Object.fromEntries(data) }).catch(() => {});
    return data;
  })().finally(() => (bulkJob = null));
  return bulkJob;
}

/** Kazalniki brez čakanja, kadar le lahko: shranjeni na disku ali v pomnilniku; osvežitev teče v ozadju. */
async function loadBulk(): Promise<{ data: Map<string, Record<string, Point>>; pending: boolean }> {
  if (!bulk) {
    const raw = await storage.readItems(BULK_FILE).catch(() => null);
    if (raw && !Array.isArray(raw) && raw.data) bulk = { at: Number(raw.at) || 0, data: new Map(Object.entries(raw.data)) };
  }
  const stale = !bulk || Date.now() - bulk.at > BULK_MS;
  if (stale) {
    const job = refreshBulk();
    if (bulk) return { data: bulk.data, pending: true };
    // Prvi zagon brez shranjenih podatkov: počakamo kvečjemu 8 s.
    const quick = await Promise.race([job, new Promise<null>((r) => setTimeout(() => r(null), 8000))]);
    return quick ? { data: quick, pending: false } : { data: new Map(), pending: true };
  }
  return { data: bulk!.data, pending: false };
}

/** Ob zagonu strežnika: naloži kazalnike v ozadju, da je prvo okno države hitro. */
export function warmProfiles(): void {
  setTimeout(() => void loadBulk().catch(() => {}), 30_000);
}

/* ---------------- Infobox Wikipedije ---------------- */

/** Vrstice infoboxa (oznaka, vrednost, naslov skupine) iz izrisanega HTML. */
async function infobox(lang: string, title: string): Promise<Fact[]> {
  const body = await wiki(lang, { action: "parse", page: title, prop: "text", section: "0", redirects: "1" });
  const html = String(body?.parse?.text ?? "");
  const table = html.match(/<table class="infobox[\s\S]*?<\/table>\s*(?=<p|<div|$)/)?.[0] ?? html.match(/<table class="infobox[\s\S]*?<\/table>/)?.[0] ?? "";
  const facts: Fact[] = [];
  let section = "";
  for (const row of table.match(/<tr[\s\S]*?<\/tr>/g) ?? []) {
    const header = row.match(/<th[^>]*class="[^"]*infobox-header[^"]*"[^>]*>([\s\S]*?)<\/th>/);
    if (header) {
      section = clean(header[1]);
      continue;
    }
    const label = row.match(/<th[^>]*class="[^"]*infobox-label[^"]*"[^>]*>([\s\S]*?)<\/th>/);
    const data = row.match(/<td[^>]*class="[^"]*infobox-data[^"]*"[^>]*>([\s\S]*?)<\/td>/);
    if (label && data) facts.push({ section, label: clean(label[1]).replace(/^•\s*/, ""), value: clean(data[1], true) });
    else {
      // Vrstica čez celo širino pod naslovom (npr. "Gini (2023) 23.4")
      const full = row.match(/<td[^>]*class="[^"]*infobox-full-data[^"]*"[^>]*>([\s\S]*?)<\/td>/);
      if (full && section) facts.push({ section, label: section, value: clean(full[1], true) });
    }
  }
  return facts.filter((f) => f.value && f.value.length < 600);
}

function clean(html: string, keepLines = false): string {
  const text = decode(
    html
      .replace(/<sup>2<\/sup>/g, "²")
      .replace(/<sup[\s\S]*?<\/sup>/g, "") // sklici [1] (vsebujejo ugnezdene span)
      .replace(/<span class="[^"]*(geo|plainlinks|noprint)[^"]*"[\s\S]*?<\/span>\s*<\/span>/g, "") // koordinate
      .replace(/<style[\s\S]*?<\/style>/g, "")
      .replace(/<br\s*\/?>|<\/li>/g, keepLines ? "\n" : " ")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/&#x[0-9a-f]+;/gi, "")
    .replace(/[\u00a0\u202f\u2009]/g, " ") // nedeljivi presledki (sicer oznake ne ustrezajo vzorcem)
    .replace(/\d+°\s*\d+′[\s\S]*$/m, "") // ostanek koordinat
    .replace(/\[\d+\]|\[[a-z]\]|\[note \d+\]|\[citation needed\]/g, "")
    .replace(/[ \t]+/g, " ");
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join(keepLines ? "\n" : " ")
    .trim();
}

/* ---------------- Wikidata: sosede in volitve ---------------- */

async function wikidataFacts(qid: string): Promise<{ neighbours: string[]; elections: Election[] }> {
  const query = `SELECT ?kind ?iso ?eLabel ?date ?prec WHERE {
    { BIND("n" AS ?kind) wd:${qid} wdt:P47 ?n. ?n wdt:P297 ?iso. }
    UNION
    { BIND("e" AS ?kind) ?e wdt:P31/wdt:P279* wd:Q40231; wdt:P1001 wd:${qid}; p:P585/psv:P585 [ wikibase:timeValue ?date; wikibase:timePrecision ?prec ].
      FILTER(?date > "${new Date().getUTCFullYear() - 6}-01-01"^^xsd:dateTime) }
    SERVICE wikibase:label { bd:serviceParam wikibase:language "sl,en". }
  }`;
  const body = await getJson(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`);
  const neighbours = new Set<string>();
  const elections = new Map<string, Election>();
  const today = new Date().toISOString().slice(0, 10);
  for (const b of body?.results?.bindings ?? []) {
    if (b.kind.value === "n") neighbours.add(String(b.iso.value).toUpperCase());
    else {
      const date = String(b.date.value).slice(0, 10);
      const label = String(b.eLabel?.value ?? "");
      if (/^Q\d+$/.test(label)) continue;
      elections.set(`${label}|${date}`, { label, date, precision: Number(b.prec.value), upcoming: date >= today });
    }
  }
  return { neighbours: [...neighbours], elections: [...elections.values()].sort((a, b) => a.date.localeCompare(b.date)) };
}

/* ---------------- Prazniki in podnebje ---------------- */

async function holidays(iso2: string): Promise<Holiday[]> {
  const y = new Date().getUTCFullYear();
  const lists = await Promise.all(
    [y, y + 1].map((year) =>
      fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/${iso2}`, { cache: "no-store", signal: AbortSignal.timeout(10_000) })
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => []),
    ),
  );
  const today = new Date().toISOString().slice(0, 10);
  const seen = new Set<string>();
  return lists
    .flat()
    .filter((h: any) => h.date >= today && h.global !== false)
    .filter((h: any) => !seen.has(h.date) && seen.add(h.date))
    .slice(0, 10)
    .map((h: any) => ({ date: h.date, localName: h.localName, name: h.name }));
}

async function climate(lat: number, lon: number, place: string): Promise<CountryProfile["climate"] & { timezone: string | null }> {
  const year = new Date().getUTCFullYear() - 1;
  const params = new URLSearchParams({
    latitude: lat.toFixed(3),
    longitude: lon.toFixed(3),
    start_date: `${year}-01-01`,
    end_date: `${year}-12-31`,
    daily: "temperature_2m_mean,temperature_2m_min,temperature_2m_max,precipitation_sum",
    timezone: "auto",
  });
  const body = await getJson(`https://archive-api.open-meteo.com/v1/archive?${params}`);
  const d = body?.daily ?? {};
  const months: ClimateMonth[] = Array.from({ length: 12 }, (_, m) => {
    const idx = (d.time ?? []).map((t: string, i: number) => (Number(t.slice(5, 7)) === m + 1 ? i : -1)).filter((i: number) => i >= 0);
    const avg = (arr: (number | null)[]) => {
      const v = idx.map((i: number) => arr?.[i]).filter((x: number | null): x is number => typeof x === "number");
      return v.length ? v.reduce((a: number, b: number) => a + b, 0) / v.length : NaN;
    };
    const sum = (arr: (number | null)[]) => idx.map((i: number) => arr?.[i] ?? 0).reduce((a: number, b: number) => a + (b ?? 0), 0);
    return { month: m + 1, tempMean: avg(d.temperature_2m_mean), tempMin: avg(d.temperature_2m_min), tempMax: avg(d.temperature_2m_max), precip: sum(d.precipitation_sum) };
  });
  return { year, months, place, timezone: body?.timezone ?? null };
}

/* ---------------- Skupaj ---------------- */

const cache = new Map<string, { at: number; data: CountryProfile }>();

export async function getProfile(iso2: string, iso3: string): Promise<CountryProfile> {
  const had = cache.get(iso2);
  if (had && Date.now() - had.at < DAY) return had.data;
  const [ids, indicators, meta] = await Promise.all([
    wikidataIds().catch(() => null),
    loadBulk().catch(() => ({ data: new Map<string, Record<string, Point>>(), pending: true })),
    getJson(`${WB}/country/${iso3}?format=json`).catch(() => null),
  ]);
  const id = ids?.get(iso2);
  const links = id ? await sitelinks([id.country, ...(id.economy ? [id.economy] : [])]).catch(() => ({}) as Record<string, Record<string, string>>) : {};
  const enCountry = id ? links[id.country]?.enwiki : undefined;
  const enEconomy = id?.economy ? links[id.economy]?.enwiki : undefined;
  const capital = meta?.[1]?.[0];
  const lat = Number(capital?.latitude);
  const lon = Number(capital?.longitude);
  const [facts, economyFacts, wd, hol, clim] = await Promise.all([
    enCountry ? infobox("en", enCountry).catch(() => []) : Promise.resolve([]),
    enEconomy ? infobox("en", enEconomy).catch(() => []) : Promise.resolve([]),
    id ? wikidataFacts(id.country).catch(() => ({ neighbours: [], elections: [] })) : Promise.resolve({ neighbours: [], elections: [] }),
    holidays(iso2),
    Number.isFinite(lat) && Number.isFinite(lon) && (lat !== 0 || lon !== 0) ? climate(lat, lon, String(capital?.capitalCity ?? "")).catch(() => null) : Promise.resolve(null),
  ]);
  const data: CountryProfile = {
    iso2,
    indicators: indicators.data.get(iso3) ?? {},
    indicatorsPending: indicators.pending && !indicators.data.get(iso3),
    facts,
    economyFacts,
    neighbours: wd.neighbours,
    elections: wd.elections,
    holidays: hol,
    timezone: clim?.timezone ?? null,
    climate: clim ? { year: clim.year, months: clim.months, place: clim.place } : null,
  };
  if (cache.size > 300) cache.clear();
  if (!data.indicatorsPending) cache.set(iso2, { at: Date.now(), data });
  return data;
}

/* ---------------- Poglavja Wikipedije po področjih ---------------- */

export type Domain = "politics" | "foreign" | "military" | "society" | "information" | "infrastructure" | "energy" | "geography" | "climate";
const SECTIONS: Record<Domain, { sl: RegExp; en: RegExp; de: RegExp }> = {
  politics: { sl: /^(politika|politika in uprava|politična ureditev|državna ureditev|politični sistem)$/i, en: /^(politics|government and politics|governance and politics|politics and government|government)$/i, de: /^(politik|politisches system|staat und politik)$/i },
  foreign: { sl: /^(mednarodni odnosi|zunanja politika|zunanji odnosi)$/i, en: /^(foreign relations|international relations|foreign policy)$/i, de: /^(außenpolitik|internationale beziehungen)$/i },
  military: { sl: /^(vojska|oborožene sile|obramba|slovenska vojska)$/i, en: /^(military|armed forces|defence|defense)$/i, de: /^(militär|streitkräfte|verteidigung)$/i },
  society: { sl: /^(demografija|prebivalstvo|demografske značilnosti)$/i, en: /^(demographics|demography|population)$/i, de: /^(bevölkerung|demografie)$/i },
  information: { sl: /^(mediji|množični mediji|komunikacije)$/i, en: /^(media|mass media|internet and telecommunications|telecommunications|communications)$/i, de: /^(medien|kommunikation)$/i },
  infrastructure: { sl: /^(infrastruktura|promet)$/i, en: /^(infrastructure|transport|transportation)$/i, de: /^(infrastruktur|verkehr)$/i },
  energy: { sl: /^(energetika|energija)$/i, en: /^(energy|oil and natural gas)$/i, de: /^(energie|energieversorgung)$/i },
  geography: { sl: /^(geografija|zemljepis)$/i, en: /^(geography)$/i, de: /^(geographie|geografie)$/i },
  climate: { sl: /^(podnebje)$/i, en: /^(climate)$/i, de: /^(klima)$/i },
};
const sectionCache = new Map<string, { at: number; data: InfoText | null }>();

/** Poglavje v jeziku uporabnika; če ga ni, angleško. */
export async function getSection(iso2: string, domain: Domain, lang: string): Promise<InfoText | null> {
  const key = `${iso2}|${domain}|${lang}`;
  const had = sectionCache.get(key);
  if (had && Date.now() - had.at < 7 * DAY) return had.data;
  const id = (await wikidataIds()).get(iso2);
  if (!id) return null;
  const links = (await sitelinks([id.country]))[id.country] ?? {};
  const site = lang === "de" ? "dewiki" : lang === "en" ? "enwiki" : "slwiki";
  const l = site.slice(0, 2) as "sl" | "en" | "de";
  let data = links[site] ? await sectionText(l, links[site], SECTIONS[domain][l]).catch(() => null) : null;
  if (!data && l !== "en" && links.enwiki) data = await sectionText("en", links.enwiki, SECTIONS[domain].en).catch(() => null);
  if (sectionCache.size > 2000) sectionCache.clear();
  sectionCache.set(key, { at: Date.now(), data });
  return data;
}
