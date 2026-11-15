// Napotene sile in izgube države v konfliktu iz infoboxa članka o vojni na angleški Wikipediji.
// Članek najdemo prek Wikidata: vojne (Q198), kjer je država udeleženka (P710) in se čas ujema z njeno
// udeležbo po UCDP. Podatki so besedilni (kot v infoboxu), z navedbo vira.
import { decode, getJson, pageUrl, wikidataIds } from "./countryInfo";

export type WarDetails = {
  title: string;
  url: string;
  strength: string | null; // stolpec strani, na kateri je bila država
  casualties: string | null;
  units: string | null;
  countryLines: string[]; // vrstice, ki izrecno omenjajo državo (npr. "Slovenia: 2 killed")
  ownColumn: boolean; // stolpec je države same (ne skupni stolpec koalicije, ki jo je podpirala)
};
type War = { title: string; start: number | null; end: number | null; label: string };

const CACHE_MS = 7 * 86_400_000;
const warsCache = new Map<string, { at: number; wars: War[] }>();
const detailCache = new Map<string, { at: number; data: WarDetails | null }>();

export async function warsOf(iso2: string): Promise<War[]> {
  const had = warsCache.get(iso2);
  if (had && Date.now() - had.at < CACHE_MS) return had.wars;
  const id = (await wikidataIds()).get(iso2);
  if (!id) return [];
  const q = `SELECT DISTINCT ?wLabel ?start ?end ?article WHERE {
    ?w wdt:P710 wd:${id.country}; wdt:P31/wdt:P279* wd:Q198.
    OPTIONAL { ?w wdt:P580 ?start } OPTIONAL { ?w wdt:P582 ?end }
    ?article schema:about ?w; schema:isPartOf <https://en.wikipedia.org/>.
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
  } LIMIT 200`;
  const body = await getJson(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(q)}`);
  const year = (v?: string) => (v ? Number(String(v).replace(/^\+/, "").slice(0, 4)) || null : null);
  const wars: War[] = (body?.results?.bindings ?? []).map((b: any) => ({
    title: decodeURIComponent(String(b.article.value).split("/wiki/")[1] ?? "").replace(/_/g, " "),
    start: year(b.start?.value),
    end: year(b.end?.value),
    label: String(b.wLabel?.value ?? ""),
  }));
  warsCache.set(iso2, { at: Date.now(), wars });
  return wars;
}

/** Vojna, ki se najbolj ujema z obdobjem udeležbe in krajem konflikta. */
function pickWar(wars: War[], from: number, to: number, words: string[]): War | null {
  let best: { w: War; score: number } | null = null;
  for (const w of wars) {
    if (!w.start) continue;
    const end = w.end ?? 9999;
    const overlap = Math.min(end, to) - Math.max(w.start, from);
    if (overlap < 0) continue;
    // Splošne "vojne" (npr. vojna proti terorizmu) brez ujemanja kraja zavrnemo.
    // Primerjava začetkov besed: "Ukraine" ~ "Russo-Ukrainian", "Russia" ~ "Russo".
    const label = w.label.toLowerCase();
    const hits = words.filter((x) => x.length > 3 && label.includes(x.toLowerCase().slice(0, 4))).length;
    if (!hits) continue;
    const score = hits * 100 - Math.abs(w.start - from) * 3 - Math.abs((w.end ?? to) - to);
    if (!best || score > best.score) best = { w, score };
  }
  return best?.w ?? null;
}

/** Vrstica <tr> od položaja naprej, s štetjem ugnezdenih tabel. */
function balanced(html: string, from: number, open: string, close: string): string | null {
  const start = html.indexOf(open, from);
  if (start < 0) return null;
  let depth = 0;
  const re = new RegExp(`${open}[\\s>]|${close}`, "g");
  re.lastIndex = start;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    depth += m[0].startsWith(close) ? -1 : 1;
    if (depth === 0) return html.slice(start, m.index + close.length);
  }
  return null;
}

function cells(row: string): string[] {
  const out: string[] = [];
  let i = 0;
  for (;;) {
    const td = balanced(row, i, "<td", "</td>");
    if (!td) break;
    out.push(td);
    i = row.indexOf(td, i) + td.length;
  }
  return out;
}

const clean = (h: string) =>
  decode(
    h
      .replace(/<sup[\s\S]*?<\/sup>/g, "")
      .replace(/<style[\s\S]*?<\/style>/g, "")
      .replace(/<br\s*\/?>|<\/li>|<\/p>|<\/tr>/g, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/[  ]/g, " ")
    .replace(/\[[^\]]{1,6}\]/g, "")
    .replace(/[ \t]+/g, " ")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n");

function section(html: string, header: RegExp): string[] | null {
  const heads = [...html.matchAll(/<th[^>]*colspan="2"[^>]*>([\s\S]*?)<\/th>\s*<\/tr>/g)];
  const h = heads.find((m) => header.test(clean(m[1])));
  if (!h) return null;
  const row = balanced(html, h.index! + h[0].length, "<tr", "</tr>");
  return row ? cells(row).map(clean) : null;
}

const trimText = (s: string | undefined, max = 700) => (!s ? null : s.length > max ? `${s.slice(0, max).replace(/\s\S*$/, "")} …` : s);

export async function getWarDetails(
  iso2: string,
  conflict: { id: number; location: string; sideA: string; sideB: string; side: "A" | "B"; from: number; to: number; primaries: string[] },
): Promise<WarDetails | null> {
  const key = `${iso2}|${conflict.id}`;
  const had = detailCache.get(key);
  if (had && Date.now() - had.at < CACHE_MS) return had.data;
  const words = [conflict.location, conflict.sideA, conflict.sideB]
    .join(" ")
    .replace(/Government of|\(.*?\)/g, " ")
    .split(/[\s,]+/)
    .filter(Boolean);
  // Podpornice (npr. Slovenija v Afganistanu) v Wikidata niso udeleženke vojne: članek poiščemo prek glavnih strani.
  let war = pickWar(await warsOf(iso2), conflict.from, conflict.to, words);
  let own = Boolean(war);
  for (const other of conflict.primaries.filter((x) => x !== iso2).slice(0, 6)) {
    if (war) break;
    war = pickWar(await warsOf(other).catch(() => []), conflict.from, conflict.to, words);
  }
  let data: WarDetails | null = null;
  if (war) {
    const body = await getJson(`https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(war.title)}&prop=text&section=0&format=json&formatversion=2&redirects=1`);
    const html = String(body?.parse?.text ?? "");
    const infobox = html.slice(html.indexOf("infobox"));
    const belligerents = section(infobox, /^Belligerents$/i) ?? [];
    const strength = section(infobox, /^Strength$/i) ?? [];
    const casualties = section(infobox, /^Casualties and losses$/i) ?? [];
    const units = section(infobox, /^Units involved$/i) ?? [];
    // Stolpec države: po imenu v vrstici udeležencev, sicer po strani iz UCDP.
    const en = new Intl.DisplayNames(["en"], { type: "region" }).of(iso2) ?? iso2;
    const names = [en, en.replace(/^United States$/, "United States"), iso2 === "RU" ? "Russia" : "", iso2 === "US" ? "United States" : ""].filter(Boolean);
    let col = belligerents.findIndex((b) => names.some((n) => b.split("\n")[0].includes(n)));
    own = own && col >= 0;
    if (col < 0) col = belligerents.findIndex((b) => names.some((n) => b.includes(n)));
    if (col < 0) col = conflict.side === "A" ? 0 : 1;
    const all = [...strength, ...casualties].join("\n").split("\n");
    const countryLines = [...new Set(all.filter((l) => names.some((n) => l.includes(n)) && /\d/.test(l)))].slice(0, 6);
    data = {
      title: String(body?.parse?.title ?? war.title),
      url: pageUrl("en", String(body?.parse?.title ?? war.title)),
      strength: trimText(strength[col]),
      casualties: trimText(casualties[col]),
      units: trimText(units[col], 300),
      countryLines,
      ownColumn: own,
    };
    if (!data.strength && !data.casualties) data = null;
  }
  if (detailCache.size > 2000) detailCache.clear();
  detailCache.set(key, { at: Date.now(), data });
  return data;
}
