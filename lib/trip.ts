// Načrtovanje poti: pot OSRM, cene goriva.si, črpalke v tujini OSM (brez cen), zanimivosti Wikipedia, kraji Photon.
import storage from "./storage";
import { getCar } from "./car";
import { CAR_MANUAL } from "./carManual";
import { FUEL, getFuel } from "./fuel";

export type TripPlace = { label: string; lat: number; lon: number };
export type TripRequest = {
  from: TripPlace;
  to: TripPlace;
  via: TripPlace[];
  roundTrip: boolean;
  fuelPercent: number;
  reserveKm: number;
  lang: string;
};
export type TripStop = {
  kind: "start" | "via" | "dest" | "end" | "fuel";
  label: string; // pri "fuel" prazno, če v bližini ni znane črpalke
  address?: string;
  lat: number;
  lon: number;
  km: number;
  fuelPercent: number; // ob prihodu
  price?: number | null; // null = cena ni znana (tujina)
  liters?: number; // do polnega rezervoarja
  detourKm?: number;
  nearby?: string[];
};
export type PoiCategory = "castle" | "museum" | "nature" | "viewpoint" | "church" | "sight";
export type TripPoi = {
  title: string;
  description: string;
  category: PoiCategory;
  lat: number;
  lon: number;
  url: string;
  image: string | null;
  km: number; // položaj ob poti
  offRouteKm: number;
};
export type TripWarning = "lowStart" | "noStation" | "noPrice" | "poiUnavailable";
export type TripPlan = {
  distanceKm: number;
  durationMin: number;
  liters: number;
  cost: number | null;
  pricePerLiter: number | null;
  fullRangeKm: number;
  stops: TripStop[];
  destination: TripPoi[];
  along: TripPoi[];
  geometry: [number, number][];
  warnings: TripWarning[];
  mapsUrl: string;
  createdAt: string;
};
export type SavedTrip = { request: TripRequest; plan: TripPlan };

export class TripError extends Error {}

type Pt = { lat: number; lon: number };
type Route = { km: number; minutes: number; legs: number[]; coords: [number, number][]; cum: number[] };
type Vertex = Pt & { km: number };
type Station = Pt & { name: string; address: string; price: number | null };
type Picked = Station & { km: number; off?: number; detourKm?: number };

const UA = "HouseholdCommandCenter/1.0 (home dashboard)";
const OSRM = "https://router.project-osrm.org/route/v1/driving";
const PHOTON = "https://photon.komoot.io";
const PHOTON_STEP_KM = 5; // razmik točk za iskanje tujih črpalk
const PHOTON_RADIUS_KM = 3.5; // > CORRIDOR_KM in > pol razmika, da se krogi prekrivajo
const FOREIGN_MAX_POINTS = 30; // ~150 km nazaj od konca odseka
const FOREIGN_MAX_DETOURS = 8; // vsak preizkus ovinka je ena zahteva na OSRM
const NOT_LIQUID_FUEL = /metano|metan\b|\bcng\b|\blng\b|\bgpl\b|\blpg\b|autogas|erdgas|ricarica|charging|ladestation|supercharger|ionity|tesla|elektro/i;
const GORIVA = "https://goriva.si/api/v1/search/";
const STATIONS_MS = 60 * 60_000;
const CORRIDOR_KM = 2.5; // črpalka mora biti tako blizu poti
const WINDOW_KM = 150; // tankamo proti koncu dosega, ne po nepotrebnem zgodaj
const MIN_LEG_KM = 50; // rezervna izbira mora napredovati, sicer bi ponavljala isto črpalko
const MAX_DETOUR_KM = 7; // več kot to pomeni npr. črpalko na nasprotni strani avtoceste
const MIN_PRICE = 0.8; // goriva.si ima tudi lažne cene (0,001 €)
const FALLBACK_L_100 = 8;
const POI_STEP_KM = 40;
const POI_MAX_SAMPLES = 12; // Wikipedia hitro omeji število zahtev
const POI_RADIUS_M = 10_000; // največ, kar dovoli Wikipedia
const WIKI_CACHE_MS = 7 * 86_400_000;
const SAVE_KEY = "trip";
// Photon ne pozna slovenskih imen tujih mest.
const EXONYMS: Record<string, string> = {
  dunaj: "Wien",
  gradec: "Graz",
  celovec: "Klagenfurt",
  beljak: "Villach",
  trst: "Trieste",
  gorica: "Gorizia",
  benetke: "Venezia",
  rim: "Roma",
  firence: "Firenze",
  milano: "Milano",
  reka: "Rijeka",
  monakovo: "München",
  pariz: "Paris",
  praga: "Praha",
  budimpešta: "Budapest",
  carigrad: "Istanbul",
};

const toRad = (d: number) => (d * Math.PI) / 180;
function distance(a: Pt, b: Pt): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 12_742 * Math.asin(Math.sqrt(h));
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

/* ---------------- Pot ---------------- */

async function getRoute(points: Pt[]): Promise<Route> {
  const path = points.map((p) => `${p.lon.toFixed(6)},${p.lat.toFixed(6)}`).join(";");
  let body: any;
  try {
    const res = await fetch(`${OSRM}/${path}?overview=full&geometries=geojson`, {
      cache: "no-store",
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(30_000),
    });
    body = await res.json();
  } catch {
    throw new TripError("routing");
  }
  const r = body?.routes?.[0];
  if (!r) throw new TripError(body?.code === "NoRoute" ? "no-route" : "routing");
  const coords: [number, number][] = r.geometry.coordinates.map((c: [number, number]) => [c[1], c[0]]);
  const raw = [0];
  for (let i = 1; i < coords.length; i += 1) {
    raw.push(raw[i - 1] + distance({ lat: coords[i - 1][0], lon: coords[i - 1][1] }, { lat: coords[i][0], lon: coords[i][1] }));
  }
  const km = r.distance / 1000;
  const scale = raw[raw.length - 1] > 0 ? km / raw[raw.length - 1] : 1;
  return {
    km,
    minutes: r.duration / 60,
    legs: r.legs.map((l: { distance: number }) => l.distance / 1000),
    coords,
    cum: raw.map((v) => v * scale),
  };
}

function pointAt(route: Route, km: number): Pt {
  const i = route.cum.findIndex((v) => v >= km);
  const [lat, lon] = route.coords[i < 0 ? route.coords.length - 1 : i];
  return { lat, lon };
}

/** Oglišča poti na približno enakih razmakih: hitrejše iskanje bližine in lažji zemljevid. */
function thin(route: Route, stepKm: number): Vertex[] {
  const out: Vertex[] = [];
  let last = -Infinity;
  route.coords.forEach(([lat, lon], i) => {
    if (route.cum[i] - last >= stepKm || i === route.coords.length - 1) {
      out.push({ lat, lon, km: route.cum[i] });
      last = route.cum[i];
    }
  });
  return out;
}


function nearest(verts: Vertex[], p: Pt): { km: number; off: number } | null {
  let best: { km: number; off: number } | null = null;
  for (const v of verts) {
    const off = distance(v, p);
    if (!best || off < best.off) best = { km: v.km, off };
  }
  return best;
}

/* ---------------- Črpalke ---------------- */

let stationsCache: { at: number; items: Station[] } | null = null;

async function gorivaPage(page: number): Promise<any> {
  const res = await fetch(`${GORIVA}?page=${page}`, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`goriva.si HTTP ${res.status}`);
  return res.json();
}

async function slovenianStations(): Promise<Station[]> {
  if (stationsCache && Date.now() - stationsCache.at < STATIONS_MS) return stationsCache.items;
  try {
    const first = await gorivaPage(1);
    const size = first.results?.length || 1;
    const pages = Array.from({ length: Math.max(0, Math.ceil(first.count / size) - 1) }, (_, i) => i + 2);
    const rest = await mapLimit(pages, 4, gorivaPage);
    const items: Station[] = [];
    for (const body of [first, ...rest]) {
      for (const r of body.results ?? []) {
        const price = Number(r?.prices?.[FUEL]);
        const lat = Number(r?.lat);
        const lon = Number(r?.lng);
        if (!Number.isFinite(price) || price < MIN_PRICE || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
        items.push({ name: String(r.name), address: String(r.address ?? ""), lat, lon, price });
      }
    }
    stationsCache = { at: Date.now(), items };
    return items;
  } catch (e) {
    if (stationsCache) return stationsCache.items;
    throw e;
  }
}

const photonFuelCache = new Map<string, { at: number; items: Station[] }>();

/** Črpalke OSM okoli ene točke (Photon reverse z oznako amenity=fuel, ~1 s). */
async function photonFuel(p: Pt): Promise<Station[]> {
  const key = `${p.lat.toFixed(2)},${p.lon.toFixed(2)}`;
  const had = photonFuelCache.get(key);
  if (had && Date.now() - had.at < WIKI_CACHE_MS) return had.items;
  const params = new URLSearchParams({ lat: p.lat.toFixed(5), lon: p.lon.toFixed(5), radius: String(PHOTON_RADIUS_KM), limit: "20", osm_tag: "amenity:fuel" });
  const get = () => fetch(`${PHOTON}/reverse?${params}`, { cache: "no-store", headers: { "User-Agent": UA }, signal: AbortSignal.timeout(10_000) });
  let res = await get();
  if (res.status === 503 || res.status === 429) {
    await new Promise((r) => setTimeout(r, 1500));
    res = await get();
  }
  if (!res.ok) throw new Error(`photon HTTP ${res.status}`);
  const body: any = await res.json();
  const items = (body.features ?? []).flatMap((f: any): Station[] => {
    const pr = f.properties ?? {};
    const name = String(pr.name ?? "");
    const [lon, lat] = f.geometry?.coordinates ?? [];
    if (!name || NOT_LIQUID_FUEL.test(name) || typeof lat !== "number" || typeof lon !== "number") return [];
    return [{ name, address: [pr.street, pr.city].filter(Boolean).join(", "), lat, lon, price: null }];
  });
  if (photonFuelCache.size > 5000) photonFuelCache.clear();
  photonFuelCache.set(key, { at: Date.now(), items });
  return items;
}

/** Dodatni kilometri za zavoj do črpalke: vožnja od 5 km pred njo do 5 km za njo, skozi črpalko. */
async function detourKm(route: Route, s: Station, km: number): Promise<number | null> {
  const a = Math.max(0, km - 5);
  const b = Math.min(route.km, km + 5);
  try {
    const via = await getRoute([pointAt(route, a), s, pointAt(route, b)]);
    return Math.max(0, via.km - (b - a));
  } catch {
    return null;
  }
}

async function chooseFrom(route: Route, list: Picked[], latest: boolean): Promise<Picked | null> {
  const sorted = [...list].sort((x, y) => (latest ? 0 : (x.price ?? 99) - (y.price ?? 99)) || y.km - x.km).slice(0, 4);
  let fallback: Picked | null = null;
  for (const c of sorted) {
    const detour = await detourKm(route, c, c.km);
    if (detour === null) {
      fallback ??= c;
      continue;
    }
    if (detour <= MAX_DETOUR_KM) return { ...c, detourKm: detour };
  }
  return fallback;
}

function inCorridor(stations: Station[], verts: Vertex[]): Picked[] {
  return stations.flatMap((s) => {
    const n = nearest(verts, s);
    return n && n.off <= CORRIDOR_KM ? [{ ...s, km: n.km, off: n.off }] : [];
  });
}

/**
 * Črpalka v tujini (OSM, brez cen): odsek pregledujemo od konca proti začetku in vzamemo prvo črpalko
 * tik ob poti z majhnim ovinkom (tankamo čim kasneje). Javni Photon dovoli le zaporedne zahteve (~1 s),
 * zato ne iščemo po celem odseku. Prej Overpass za cel odsek: večinoma preobremenjen ali potekel,
 * izračun je trajal do 5 minut in na koncu ni našel nobene črpalke.
 */
async function pickForeign(route: Route, window: Vertex[], domestic: Station[]): Promise<Picked | null> {
  const points: Vertex[] = [];
  for (const v of [...window].reverse()) {
    if (domestic.some((s) => distance(s, v) < 20)) continue; // tam so slovenske črpalke s cenami
    if (!points.length || distance(points[points.length - 1], v) >= PHOTON_STEP_KM) points.push(v);
  }
  const tried = new Set<string>();
  let fallback: Picked | null = null;
  let checks = 0;
  for (const p of points.slice(0, FOREIGN_MAX_POINTS)) {
    const found = await photonFuel(p).catch(() => [] as Station[]);
    const candidates = inCorridor(found, window)
      .filter((c) => !tried.has(c.name + c.km.toFixed(1)))
      .sort((a, b) => (a.off ?? 0) - (b.off ?? 0)) // najprej črpalke neposredno ob cesti (počivališča)
      .slice(0, 2);
    for (const c of candidates) {
      if (checks >= FOREIGN_MAX_DETOURS) return fallback;
      checks += 1;
      tried.add(c.name + c.km.toFixed(1));
      const detour = await detourKm(route, c, c.km);
      if (detour === null) fallback ??= c;
      else if (detour <= MAX_DETOUR_KM) return { ...c, detourKm: detour };
    }
  }
  return fallback;
}

async function pickStation(route: Route, verts: Vertex[], domestic: Station[], from: number, to: number, latest = false): Promise<Picked | null> {
  const window = verts.filter((v) => v.km >= from && v.km <= to);
  if (!window.length) return null;
  const local = inCorridor(domestic, window);
  const chosen = local.length ? await chooseFrom(route, local, latest) : null;
  return chosen ?? pickForeign(route, window, domestic);
}

/* ---------------- Zanimivosti ---------------- */

const words = (s: string) => new RegExp(`(?<!\\p{L})(?:${s})(?!\\p{L})`, "iu");

const CATEGORIES: [PoiCategory, RegExp][] = [
  ["museum", words("muzej\\p{L}*|museum|museo|musei|galerij\\p{L}*|gallery|galerie|galleria")],
  ["castle", words("grad|gradu|grajsk\\p{L}*|dvorec|dvorca|castle|palace|palača|palazzo|castello|schloss|burg|burgruine|fortress|trdnjav\\p{L}*|utrdb\\p{L}*|festung|ruševin\\p{L}*|ruins")],
  ["church", words("cerkev|cerkve|katedral\\p{L}*|bazilik\\p{L}*|romarsk\\p{L}*|samostan\\p{L}*|kartuzij\\p{L}*|church|cathedral|basilica|monastery|abbey|duomo|chiesa|\\p{L}*kirche|kloster|stift")],
  ["viewpoint", words("razgledišče|razglednik|razgledni stolp|viewpoint|observation tower|aussichts\\p{L}*")],
  ["nature", words("slap|slapovi|waterfall|cascata|\\p{L}*wasserfall|jama|jame|cave|caves|grotta|\\p{L}*höhle|jezero|lake|lago|\\p{L}*see|soteska|korita|gorge|canyon|kanjon|\\p{L}*klamm|otok|island|insel|narodni park|national park|nationalpark|krajinski park|regijski park|nature park|naturpark|naravni rezervat|nature reserve|botanič\\p{L}* vrt|botanical garden")],
  ["sight", words("spomenik\\p{L}*|monument|memorial|denkmal|staro mestno jedro|old town|old city|city walls|walls of|altstadt|amfiteater|amphitheat\\p{L}*|rimsk\\p{L}*|arheološk\\p{L}*|archaeological|unesco|znamenitost\\p{L}*|tourist attraction|živalski vrt|zoo|akvarij|aquarium")],
];
const EXCLUDED = words("stadion\\p{L}*|stadium|šol\\p{L}*|school|univerz\\p{L}*|university|fakultet\\p{L}*|bolnišnic\\p{L}*|hospital|železnišk\\p{L}*|railway|postaj\\p{L}*|station|letališč\\p{L}*|airport|hotel|avtocest\\p{L}*|motorway|predor|tunnel|nogomet\\p{L}*|football|klub|club|podjetje|company|ulica|street|pokopališče|cemetery|album|film|scuola|schule|brand|blagovn\\p{L}*|azienda|unternehmen|headquarters|embassy|veleposlaništ\\p{L}*|botschaft|ambasciata|ministr\\p{L}*|office building|bürogebäude");
const PLACE_DESCRIPTION = /^(?:\p{L}+\s){0,3}(?:naselje|vas|mesto|občina|kraj|municipality|village|town|city|settlement|gemeinde|stadt|dorf|ortschaft|ortsteil|stadtteil|bezirk|comune|frazione)(?!\p{L})/iu;

function classify(title: string, description: string, extract: string): PoiCategory | null {
  if (/^(?:mestna )?občina\s/iu.test(title) || PLACE_DESCRIPTION.test(description)) return null;
  const head = `${title} ${description}`;
  if (EXCLUDED.test(head)) return null;
  const text = description ? head : `${head} ${extract}`;
  return CATEGORIES.find(([, rx]) => rx.test(text))?.[0] ?? null;
}

type WikiHit = Pt & { key: string; lang: string; title: string; description: string; hasExtract: boolean; category: PoiCategory; url: string; image: string | null; weight: number };

async function wikiAround(lang: string, p: Pt): Promise<WikiHit[]> {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    generator: "geosearch",
    ggscoord: `${p.lat.toFixed(5)}|${p.lon.toFixed(5)}`,
    ggsradius: String(POI_RADIUS_M),
    // 20 najbližjih člankov v mestu pokrije le nekaj ulic (v Rimu ni bilo Koloseja), zato več kandidatov.
    ggslimit: "50",
    prop: "description|extracts|pageimages|info|pageprops|coordinates|pageviews",
    exintro: "1",
    explaintext: "1",
    exsentences: "2",
    exlimit: "20", // več ne dovoli; izbranim brez povzetka ga dodamo kasneje (addExtracts)
    piprop: "thumbnail",
    pithumbsize: "320",
    pilimit: "50",
    ppprop: "wikibase_item",
    colimit: "50",
    pvipdays: "30",
  });
  let res = await wikiFetch(lang, params);
  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, Math.min(Number(res.headers.get("retry-after")) || 3, 8) * 1000));
    res = await wikiFetch(lang, params);
  }
  if (!res.ok) throw new Error(`wikipedia HTTP ${res.status}`);
  const body: any = await res.json();
  return Object.values(body?.query?.pages ?? {}).flatMap((pg: any): WikiHit[] => {
    const coord = pg.coordinates?.[0];
    if (!coord) return [];
    const description = String(pg.description ?? "");
    const extract = String(pg.extract ?? "");
    const category = classify(pg.title, description, extract);
    if (!category) return [];
    const views = Object.values(pg.pageviews ?? {}).reduce((sum: number, v) => sum + (Number(v) || 0), 0);
    return [
      {
        key: pg.pageprops?.wikibase_item ?? `${lang}:${pg.title}`,
        lang,
        title: pg.title,
        description: (extract || description).slice(0, 220),
        hasExtract: Boolean(extract),
        category,
        lat: coord.lat,
        lon: coord.lon,
        url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(String(pg.title).replace(/ /g, "_"))}`,
        image: pg.thumbnail?.source ?? null,
        // Ogledi v zadnjih 30 dneh ≈ kako znan je kraj; dolžina članka le, če ogledov ni (dolgi so tudi članki o pisarnah).
        weight: views || Number(pg.length ?? 0) / 50,
      },
    ];
  });
}

const wikiFetch = (lang: string, params: URLSearchParams) =>
  fetch(`https://${lang}.wikipedia.org/w/api.php?${params}`, { cache: "no-store", headers: { "User-Agent": UA }, signal: AbortSignal.timeout(12_000) });

const wikiCache = new Map<string, { at: number; hits: WikiHit[] }>();

/** Ponovni izračun iste poti ne sme znova obremeniti Wikipedie (hitro vrne 429). */
async function cachedWiki(lang: string, p: Pt): Promise<WikiHit[]> {
  const key = `${lang}:${p.lat.toFixed(2)}|${p.lon.toFixed(2)}`;
  const had = wikiCache.get(key);
  if (had && Date.now() - had.at < WIKI_CACHE_MS) return had.hits;
  const hits = await wikiAround(lang, p);
  if (wikiCache.size > 2000) wikiCache.clear();
  wikiCache.set(key, { at: Date.now(), hits });
  return hits;
}

const inSlovenia = (p: Pt) => p.lat > 45.42 && p.lat < 46.88 && p.lon > 13.37 && p.lon < 16.61;

/** V Sloveniji jezik vmesnika; v tujini je angleška (ali nemška) Wikipedia veliko bolj popolna od slovenske. */
async function wikiMany(lang: string, points: Pt[]): Promise<WikiHit[]> {
  const jobs = points.map((p) => ({ p, l: inSlovenia(p) || lang === "de" ? lang : "en" }));
  // 3 hkrati: zaporedno je trajalo ~50 s; ob 429 wikiAround počaka in poskusi znova.
  const results = await mapLimit(jobs, 3, ({ l, p }) => cachedWiki(l, p).catch(() => null));
  if (results.every((r) => r === null)) throw new Error("wikipedia");
  const seen = new Map<string, WikiHit>();
  for (const hit of results.flatMap((r) => r ?? [])) if (!seen.has(hit.key)) seen.set(hit.key, hit);
  return [...seen.values()];
}

/** Kratki povzetki za izbrane kraje, ki ga pri prvem iskanju niso dobili (Wikipedia ga vrne le za 20 člankov). */
async function addExtracts(hits: WikiHit[]): Promise<void> {
  const byLang = new Map<string, WikiHit[]>();
  for (const h of hits) if (!h.hasExtract) byLang.set(h.lang, [...(byLang.get(h.lang) ?? []), h]);
  await Promise.all(
    [...byLang].map(async ([lang, list]) => {
      const params = new URLSearchParams({
        action: "query",
        format: "json",
        prop: "extracts",
        exintro: "1",
        explaintext: "1",
        exsentences: "2",
        exlimit: "20",
        titles: list.slice(0, 20).map((h) => h.title).join("|"),
      });
      const res = await wikiFetch(lang, params);
      if (!res.ok) return;
      const body: any = await res.json();
      for (const pg of Object.values(body?.query?.pages ?? {}) as any[]) {
        const hit = list.find((h) => h.title === pg.title);
        if (hit && pg.extract) Object.assign(hit, { description: String(pg.extract).slice(0, 220), hasExtract: true }); // ostane tudi v predpomnilniku
      }
    }),
  );
}

/** Najbolj znani kraji; ob poti največ 2 na 30 km, sicer bi eno mesto (npr. Orvieto) zasedlo ves seznam. */
async function rankPois(hits: WikiHit[], limit: number, verts: Vertex[], spread: boolean): Promise<TripPoi[]> {
  const perCategory = new Map<PoiCategory, number>();
  const perStretch = new Map<number, number>();
  const picked: { hit: WikiHit; km: number; off: number }[] = [];
  for (const h of [...hits].sort((a, b) => b.weight * (b.image ? 1.5 : 1) - a.weight * (a.image ? 1.5 : 1))) {
    if (picked.length >= limit) break;
    const n = nearest(verts, h);
    const stretch = Math.floor((n?.km ?? 0) / 30);
    const inCategory = perCategory.get(h.category) ?? 0;
    if (inCategory >= (h.category === "church" ? 3 : 5)) continue;
    if (spread && (perStretch.get(stretch) ?? 0) >= 2) continue;
    perCategory.set(h.category, inCategory + 1);
    perStretch.set(stretch, (perStretch.get(stretch) ?? 0) + 1);
    picked.push({ hit: h, km: n?.km ?? 0, off: n?.off ?? 0 });
  }
  await addExtracts(picked.map((p) => p.hit)).catch(() => {});
  return picked.map(({ hit: { title, description, category, lat, lon, url, image }, km, off }) => ({
    title,
    description,
    category,
    lat,
    lon,
    url,
    image,
    km: Math.round(km),
    offRouteKm: Math.round(off * 10) / 10,
  }));
}

async function findPois(lang: string, verts: Vertex[], routeKm: number, target: Pt, targetKm: number) {
  const offset = 0.11; // približno 12 km; območje okoli cilja je širše od enega iskanja
  const lonOffset = offset / Math.cos(toRad(target.lat));
  const around = [
    target,
    { lat: target.lat + offset, lon: target.lon },
    { lat: target.lat - offset, lon: target.lon },
    { lat: target.lat, lon: target.lon + lonOffset },
    { lat: target.lat, lon: target.lon - lonOffset },
  ];
  const step = Math.max(POI_STEP_KM, routeKm / POI_MAX_SAMPLES);
  const samples: Vertex[] = [];
  for (let km = step / 2; km < routeKm; km += step) {
    const v = verts.reduce((best, c) => (Math.abs(c.km - km) < Math.abs(best.km - km) ? c : best));
    if (distance(v, target) > 15) samples.push(v);
  }
  const [destHits, routeHits] = await Promise.all([wikiMany(lang, around), samples.length ? wikiMany(lang, samples) : Promise.resolve([])]);
  const destination = (await rankPois(destHits.filter((h) => distance(h, target) <= 25), 12, verts, false)).map((p) => ({ ...p, km: Math.round(targetKm) }));
  const taken = new Set(destination.map((p) => p.url));
  const along = (await rankPois(routeHits.filter((h) => !taken.has(h.url) && (nearest(verts, h)?.off ?? 99) <= 10), 15, verts, true)).sort((a, b) => a.km - b.km);
  return { destination, along };
}

/* ---------------- Načrt ---------------- */

export async function planTrip(req: TripRequest): Promise<TripPlan> {
  const warnings = new Set<TripWarning>();
  const tank = CAR_MANUAL.tankLiters;
  const live = await getCar().then((c) => c.live, () => null);
  const fullRange = live?.rangeKm && live.fuelPercent && live.fuelPercent >= 5 ? live.rangeKm / (live.fuelPercent / 100) : (tank / FALLBACK_L_100) * 100;
  const startRange = (req.fuelPercent / 100) * fullRange;
  if (startRange < req.reserveKm) warnings.add("lowStart");

  const waypoints: (TripPlace & { kind: TripStop["kind"] })[] = [
    { ...req.from, kind: "start" },
    ...req.via.map((p) => ({ ...p, kind: "via" as const })),
    { ...req.to, kind: "dest" },
    ...(req.roundTrip ? [{ ...req.from, kind: "end" as const }] : []),
  ];
  const base = await getRoute(waypoints);
  const verts = thin(base, 0.25);
  const domestic = await slovenianStations().catch(() => [] as Station[]);

  // Kje tankati: najcenejša črpalka v zadnjem delu dosega; tako se ustavimo čim manjkrat.
  const fuelStops: (Picked & { found: boolean })[] = [];
  let pos = 0;
  let range = startRange;
  for (let guard = 0; pos + range - req.reserveKm < base.km && guard < 15; guard += 1) {
    let reach = pos + range - req.reserveKm;
    if (reach <= pos + 1) reach = pos + Math.max(range, 20);
    reach = Math.min(reach, base.km);
    const lo = Math.max(pos, reach - WINDOW_KM);
    const picked = (await pickStation(base, verts, domestic, lo, reach)) ?? (lo > pos + MIN_LEG_KM ? await pickStation(base, verts, domestic, pos + MIN_LEG_KM, lo, true) : null);
    if (picked) {
      fuelStops.push({ ...picked, found: true });
      if (picked.price === null) warnings.add("noPrice");
      pos = Math.max(picked.km, pos + 1);
    } else {
      warnings.add("noStation");
      fuelStops.push({ ...pointAt(base, reach), name: "", address: "", price: null, km: reach, found: false });
      pos = reach;
    }
    range = fullRange;
  }

  // Končna pot skozi črpalke: pravi kilometri, čas in zemljevid.
  let waypointKm = 0;
  const sequence = waypoints.map((w, i) => {
    if (i > 0) waypointKm += base.legs[i - 1];
    return { ...w, baseKm: waypointKm } as (typeof waypoints)[number] & { baseKm: number; station?: Picked & { found: boolean } };
  });
  for (const f of fuelStops) {
    sequence.push({ label: f.name, lat: f.lat, lon: f.lon, kind: "fuel", baseKm: f.km, station: f });
  }
  sequence.sort((a, b) => a.baseKm - b.baseKm || (a.kind === "fuel" ? 1 : 0) - (b.kind === "fuel" ? 1 : 0));

  const final = fuelStops.length ? await getRoute(sequence) : base;
  const finalVerts = final === base ? verts : thin(final, 0.25);
  let km = 0;
  let left = startRange;
  const stops: TripStop[] = sequence.map((w, i) => {
    if (i > 0) {
      km += final.legs[i - 1];
      left -= final.legs[i - 1];
    }
    const pct = Math.max(0, Math.round((left / fullRange) * 100));
    const stop: TripStop = { kind: w.kind, label: w.label, lat: w.lat, lon: w.lon, km: Math.round(km), fuelPercent: pct };
    if (w.kind === "fuel" && w.station) {
      stop.address = w.station.address;
      stop.price = w.station.price;
      stop.liters = Math.round(((100 - pct) / 100) * tank);
      if (w.station.detourKm !== undefined) stop.detourKm = Math.round(w.station.detourKm * 10) / 10;
      left = fullRange;
    }
    return stop;
  });

  const target = stops.find((s) => s.kind === "dest")!;
  let pois: { destination: TripPoi[]; along: TripPoi[] } = { destination: [], along: [] };
  try {
    pois = await findPois(req.lang, finalVerts, final.km, target, target.km);
  } catch {
    warnings.add("poiUnavailable");
  }
  for (const s of stops) {
    if (s.kind === "fuel") s.nearby = pois.along.filter((p) => Math.abs(p.km - s.km) <= 12 && p.offRouteKm <= 6).slice(0, 2).map((p) => p.title);
  }

  const pricePerLiter = await getFuel().then((f) => f.price, () => null);
  const liters = (final.km / fullRange) * tank;
  const via = stops.slice(1, -1).filter((s) => s.kind !== "fuel" || s.label);
  const coord = (p: Pt) => `${p.lat.toFixed(6)},${p.lon.toFixed(6)}`;
  const last = stops[stops.length - 1];
  const mapsUrl = `https://www.google.com/maps/dir/?${new URLSearchParams({
    api: "1",
    origin: coord(stops[0]),
    destination: coord(last),
    travelmode: "driving",
    ...(via.length ? { waypoints: via.map(coord).join("|") } : {}),
  })}`;

  const step = Math.max(1, Math.ceil(final.coords.length / 1500));
  const plan: TripPlan = {
    distanceKm: Math.round(final.km),
    durationMin: Math.round(final.minutes),
    liters: Math.round(liters),
    cost: pricePerLiter === null ? null : Math.round(liters * pricePerLiter),
    pricePerLiter,
    fullRangeKm: Math.round(fullRange),
    stops,
    destination: pois.destination,
    along: pois.along,
    geometry: final.coords.filter((_, i) => i % step === 0 || i === final.coords.length - 1),
    warnings: [...warnings],
    mapsUrl,
    createdAt: new Date().toISOString(),
  };
  await storage.writeItems(SAVE_KEY, { request: req, plan } satisfies SavedTrip);
  return plan;
}

export async function lastTrip(): Promise<SavedTrip | null> {
  const raw = await storage.readItems(SAVE_KEY);
  return raw && !Array.isArray(raw) ? (raw as SavedTrip) : null;
}

export async function searchPlaces(q: string, lang: string): Promise<TripPlace[]> {
  const params = new URLSearchParams({
    q: EXONYMS[q.toLowerCase()] ?? q,
    limit: "6",
    lat: process.env.WEATHER_LAT ?? "46.5547",
    lon: process.env.WEATHER_LON ?? "15.6459",
    ...(lang === "en" || lang === "de" ? { lang } : {}),
  });
  const res = await fetch(`https://photon.komoot.io/api/?${params}`, { cache: "no-store", headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error("photon");
  const body: any = await res.json();
  const seen = new Set<string>();
  return (body.features ?? []).flatMap((f: any): TripPlace[] => {
    const p = f.properties ?? {};
    const street = p.street ? `${p.street}${p.housenumber ? ` ${p.housenumber}` : ""}` : null;
    const label = [...new Set([p.name, street, p.city, p.country].filter(Boolean))].join(", ");
    if (!label || seen.has(label)) return [];
    seen.add(label);
    return [{ label, lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0] }];
  });
}
