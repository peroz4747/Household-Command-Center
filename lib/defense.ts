// Obramba: oboroženi konflikti (UCDP, lib/data/conflicts.json), vojaška oprema (Wikipedija, po IISS
// Military Balance) in ocena odnosov med državami (konflikti + zavezništva + kratek seznam sovražnosti).
import conflictsData from "./data/conflicts.json";
import { ADVERSARIES, BLOCS, DEFENCE_TREATIES } from "./alliances";

export type Conflict = {
  id: number;
  location: string;
  sideA: string;
  sideB: string;
  sideA2: string;
  sideB2: string;
  a: string[]; // ISO2 vlad na strani A (vsa leta)
  b: string[];
  a2: string[]; // države, ki so s četami podprle stran A
  b2: string[];
  aNow: string[];
  bNow: string[];
  a2Now: string[];
  b2Now: string[];
  type: 1 | 2 | 3 | 4; // 1 zunajsistemski, 2 meddržavni, 3 notranji, 4 internacionalizirani notranji
  inc: 1 | 2 | 3; // 1 ozemlje, 2 oblast, 3 oboje
  territory: string;
  start: string;
  first: number;
  last: number;
  active: number; // število let z vsaj 25 žrtvami
  war: number; // let z vsaj 1000 žrtvami
  deaths: number; // žrtve v bojih od 1989 (UCDP najboljša ocena)
  deathsYears: [number, number] | null;
  recent: Record<string, number>;
  ongoing: boolean;
  byYear: { y: number; a: string[]; b: string[]; a2: string[]; b2: string[] }[]; // zadnjih 10 let
  outcome: number | null; // 1 mir. sporazum, 2 premirje, 3 zmaga strani A, 4 zmaga strani B, 5 nizka aktivnost, 6 akter preneha obstajati
  outcomeYear: number | null;
};

const DATA = conflictsData as unknown as { source: string; maxYear: number; conflicts: Conflict[] };
export const CONFLICT_SOURCE = DATA.source;
export const CONFLICT_MAX_YEAR = DATA.maxYear;
const RECENT_YEARS = 10;

const involved = (c: Conflict, iso: string): boolean => c.a.includes(iso) || c.b.includes(iso) || c.a2.includes(iso) || c.b2.includes(iso);

/** Trenutni konflikt države: "war", če je imel kateri od njenih trenutnih konfliktov v zadnjem letu ≥1000 žrtev. */
export function conflictStatus(iso: string): "war" | "conflict" | null {
  const now = DATA.conflicts.filter((c) => c.ongoing && (c.aNow.includes(iso) || c.bNow.includes(iso) || c.a2Now.includes(iso) || c.b2Now.includes(iso)));
  if (!now.length) return null;
  return now.some((c) => (c.recent[String(DATA.maxYear)] ?? 0) >= 1000) ? "war" : "conflict";
}

export function conflictsOf(iso: string): Conflict[] {
  return DATA.conflicts
    .filter((c) => involved(c, iso))
    .sort((x, y) => Number(y.ongoing) - Number(x.ongoing) || y.last - x.last || y.deaths - x.deaths);
}

/* ---------------- Odnosi ---------------- */

export type RelationLevel = -2 | -1 | 0 | 1 | 2; // temno rdeča … temno zelena
export type Relation = { iso2: string; level: RelationLevel; reasons: string[] };

/** Ocena odnosov države do vseh drugih (le nenevtralni). Pravila so opisana v uporabniškem vmesniku. */
export function relationsOf(iso: string, allIso: string[]): Relation[] {
  const score = new Map<string, { war: boolean; hostile: string[]; friendly: string[]; ally: string[] }>();
  const get = (o: string) => {
    let r = score.get(o);
    if (!r) score.set(o, (r = { war: false, hostile: [], friendly: [], ally: [] }));
    return r;
  };
  const label = (c: Conflict) => `${c.location} (${c.first}–${c.ongoing ? "" : c.last})`;
  for (const c of DATA.conflicts) {
    for (const yr of c.byYear) {
      if (yr.y < DATA.maxYear - RECENT_YEARS + 1) continue;
      const sideA = [...yr.a, ...yr.a2];
      const sideB = [...yr.b, ...yr.b2];
      const mine = sideA.includes(iso) ? "A" : sideB.includes(iso) ? "B" : null;
      if (!mine) continue;
      const [same, other] = mine === "A" ? [sideA, sideB] : [sideB, sideA];
      const current = c.ongoing && yr.y === DATA.maxYear;
      for (const o of other) {
        if (o === iso) continue;
        const r = get(o);
        // Vojna: v zadnjem letu sta obe vladi glavni strani (ne le podpornici).
        if (current && [...yr.a, ...yr.b].includes(o) && [...yr.a, ...yr.b].includes(iso)) r.war = true;
        if (!r.hostile.includes(label(c))) r.hostile.push(label(c));
      }
      // Na isti strani le v trenutni meddržavni vojni (koalicija proti državi). Pri notranjih konfliktih
      // vlado proti upornikom pogosto podpirajo tudi tekmeci (npr. Francija in Rusija v Srednjeafriški republiki).
      if (current && c.type === 2) for (const o of same) if (o !== iso && !get(o).friendly.includes(label(c))) get(o).friendly.push(label(c));
    }
  }
  for (const bloc of BLOCS) {
    if (!bloc.members.includes(iso)) continue;
    for (const o of bloc.members) if (o !== iso) (bloc.kind === "military" ? get(o).ally : get(o).friendly).push(bloc.name);
  }
  for (const [x, y, why] of DEFENCE_TREATIES) if (x === iso || y === iso) get(x === iso ? y : x).ally.push(why);
  for (const [x, y, why] of ADVERSARIES) if (x === iso || y === iso) get(x === iso ? y : x).hostile.push(why);

  const out: Relation[] = [];
  for (const o of allIso) {
    const r = score.get(o);
    if (!r || o === iso) continue;
    // Spopad prevlada nad članstvom v istem bloku (npr. Armenija–Azerbajdžan sta oba v SND).
    const level: RelationLevel = r.war ? -2 : r.hostile.length ? -1 : r.ally.length ? 2 : r.friendly.length ? 1 : 0;
    if (level === 0) continue;
    const reasons = level < 0 ? r.hostile : [...r.ally, ...r.friendly];
    out.push({ iso2: o, level, reasons: [...new Set(reasons)].slice(0, 4) });
  }
  return out.sort((x, y) => x.level - y.level);
}

/* ---------------- Oprema (Wikipedija) ---------------- */

export type Equipment = {
  budgetBn: number | null;
  tanks: number | null;
  carriers: number | null;
  amphibious: number | null;
  cruisers: number | null;
  destroyers: number | null;
  frigates: number | null;
  corvettes: number | null;
  nuclearSubs: number | null;
  subs: number | null;
  combatAircraft: number | null;
  attackHelicopters: number | null;
  nuclearWeapons: number | null;
};

const EQUIP_URL = "https://en.wikipedia.org/w/api.php?action=parse&page=List_of_countries_by_level_of_military_equipment&prop=text&format=json&formatversion=2";
export const EQUIP_SOURCE = "https://en.wikipedia.org/wiki/List_of_countries_by_level_of_military_equipment";
const EQUIP_MS = 7 * 86_400_000;
let equipCache: { at: number; map: Map<string, Equipment> } | null = null;

// Imena v tabeli Wikipedije, ki se razlikujejo od angleških imen v Intl.
const NAME_ALIASES: Record<string, string> = {
  "democratic republic of the congo": "CD",
  "dr congo": "CD",
  "republic of the congo": "CG",
  "congo": "CG",
  "ivory coast": "CI",
  "côte d'ivoire": "CI",
  "czech republic": "CZ",
  "turkey": "TR",
  "east timor": "TL",
  "north korea": "KP",
  "south korea": "KR",
  "russia": "RU",
  "taiwan": "TW",
  "republic of china": "TW",
  "people's republic of china": "CN",
  "china": "CN",
  "iran": "IR",
  "syria": "SY",
  "vietnam": "VN",
  "laos": "LA",
  "bolivia": "BO",
  "venezuela": "VE",
  "tanzania": "TZ",
  "moldova": "MD",
  "eswatini": "SZ",
  "swaziland": "SZ",
  "myanmar": "MM",
  "burma": "MM",
  "cape verde": "CV",
  "the gambia": "GM",
  "gambia": "GM",
  "the bahamas": "BS",
  "bahamas": "BS",
  "brunei": "BN",
  "united states": "US",
  "united kingdom": "GB",
  "palestine": "PS",
  "kosovo": "XK",
  "north macedonia": "MK",
  "bosnia and herzegovina": "BA",
  "micronesia": "FM",
  "vatican city": "VA",
};

let englishNames: Map<string, string> | null = null;
function isoFromName(raw: string): string | null {
  const name = raw.replace(/\(.*?\)|\[.*?\]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
  if (NAME_ALIASES[name]) return NAME_ALIASES[name];
  if (!englishNames) {
    englishNames = new Map();
    const dn = new Intl.DisplayNames(["en"], { type: "region" });
    for (let a = 65; a <= 90; a += 1)
      for (let b = 65; b <= 90; b += 1) {
        const code = String.fromCharCode(a, b);
        try {
          const n = dn.of(code);
          if (n && n !== code) englishNames.set(n.toLowerCase(), code);
        } catch {
          /* neveljavna koda */
        }
      }
  }
  return englishNames.get(name) ?? null;
}

const decode = (s: string) =>
  s
    .replace(/<[^>]+>/g, "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
const toNum = (s: string | undefined) => {
  if (!s) return null;
  const m = s.replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
};

async function loadEquipment(): Promise<Map<string, Equipment>> {
  if (equipCache && Date.now() - equipCache.at < EQUIP_MS) return equipCache.map;
  const res = await fetch(EQUIP_URL, { cache: "no-store", headers: { "User-Agent": "HouseholdCommandCenter/1.0 (home dashboard)" }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`wikipedia HTTP ${res.status}`);
  const html: string = (await res.json())?.parse?.text ?? "";
  const table = html.match(/<table[^>]*wikitable[^>]*>[\s\S]*?<\/table>/)?.[0] ?? "";
  const map = new Map<string, Equipment>();
  for (const row of table.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) ?? []) {
    const cells = (row.match(/<t[hd][^>]*>[\s\S]*?<\/t[hd]>/g) ?? []).map(decode);
    if (cells.length < 14) continue;
    const iso = isoFromName(cells[0]);
    if (!iso) continue;
    // Proračun je v tabeli razdeljen na dve celici (cele milijarde in decimalke s sortirnim ključem).
    const [whole, frac] = [cells[1], cells[2]];
    const budget = toNum(`${whole}${frac.startsWith(".") ? frac.split(" ")[0] : ""}`);
    const v = cells.slice(3).map(toNum);
    map.set(iso, {
      budgetBn: budget,
      tanks: v[0],
      carriers: v[1],
      amphibious: v[2],
      cruisers: v[3],
      destroyers: v[4],
      frigates: v[5],
      corvettes: v[6],
      nuclearSubs: v[7],
      subs: v[8],
      combatAircraft: v[9],
      attackHelicopters: v[10],
      nuclearWeapons: v[11],
    });
  }
  if (map.size < 50) throw new Error("equipment table changed");
  equipCache = { at: Date.now(), map };
  return map;
}

export async function equipmentOf(iso: string): Promise<Equipment | null> {
  try {
    return (await loadEquipment()).get(iso) ?? null;
  } catch {
    return equipCache?.map.get(iso) ?? null;
  }
}

export const membershipsOf = (iso: string) => BLOCS.filter((b) => b.members.includes(iso)).map((b) => ({ id: b.id, name: b.name, kind: b.kind }));
