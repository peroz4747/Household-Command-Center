// Opis države in njenega gospodarstva z Wikipedije (CC BY-SA). Izvozno okno (izvoznookno.si) v robots.txt
// prepoveduje samodejno branje, zato besedil od tam ne prevzemamo.
// Slovenščina: uvod članka o državi + poglavje "Gospodarstvo"; če ga ni, uvod angleškega članka "Economy of …".
export type InfoText = { text: string; url: string; lang: string; title: string };
export type CountryInfo = { intro: InfoText | null; economy: InfoText | null };

const UA = { "User-Agent": "HouseholdCommandCenter/1.0 (home dashboard; https://github.com/peroz4747)" };
const CACHE_MS = 7 * 86_400_000;
const MAX_CHARS = 1600;
const cache = new Map<string, { at: number; data: CountryInfo }>();
let ids: { at: number; map: Map<string, { country: string; economy: string | null }> } | null = null;

async function getJson(url: string): Promise<any> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const res = await fetch(url, { cache: "no-store", headers: UA, signal: AbortSignal.timeout(20_000) });
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }
  throw new Error("rate limited");
}

/** ISO2 → Wikidata (država in "gospodarstvo države"), ena poizvedba SPARQL za vse države. */
async function wikidataIds() {
  if (ids && Date.now() - ids.at < 30 * 86_400_000) return ids.map;
  const query = `SELECT ?iso ?c ?econ WHERE { ?c wdt:P297 ?iso. ?c wdt:P31/wdt:P279* wd:Q6256. OPTIONAL { ?c wdt:P8744 ?econ } }`;
  const body = await getJson(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`);
  const map = new Map<string, { country: string; economy: string | null }>();
  for (const b of body?.results?.bindings ?? []) {
    const iso = String(b.iso.value).toUpperCase();
    const country = String(b.c.value).split("/").pop()!;
    const economy = b.econ ? String(b.econ.value).split("/").pop()! : null;
    const had = map.get(iso);
    if (!had || (!had.economy && economy)) map.set(iso, { country, economy });
  }
  ids = { at: Date.now(), map };
  return map;
}

async function sitelinks(qids: string[]): Promise<Record<string, Record<string, string>>> {
  const body = await getJson(`https://www.wikidata.org/w/api.php?${new URLSearchParams({ action: "wbgetentities", ids: qids.join("|"), props: "sitelinks", sitefilter: "slwiki|enwiki|dewiki", format: "json" })}`);
  const out: Record<string, Record<string, string>> = {};
  for (const [q, e] of Object.entries<any>(body?.entities ?? {})) out[q] = Object.fromEntries(Object.entries<any>(e.sitelinks ?? {}).map(([k, v]) => [k, v.title]));
  return out;
}

const wiki = (lang: string, params: Record<string, string>) => getJson(`https://${lang}.wikipedia.org/w/api.php?${new URLSearchParams({ format: "json", formatversion: "2", ...params })}`);
const pageUrl = (lang: string, title: string) => `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;

/** Skrajša na celo poved do MAX_CHARS. */
function trim(text: string): string {
  const t = text.replace(/\n{3,}/g, "\n\n").trim();
  if (t.length <= MAX_CHARS) return t;
  const cut = t.slice(0, MAX_CHARS);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf(".\n"));
  return `${cut.slice(0, end > 400 ? end + 1 : MAX_CHARS).trim()} …`;
}

async function intro(lang: string, title: string): Promise<InfoText | null> {
  const body = await wiki(lang, { action: "query", prop: "extracts", exintro: "1", explaintext: "1", titles: title, redirects: "1" });
  const page = body?.query?.pages?.[0];
  const text = String(page?.extract ?? "").trim();
  return text.length > 80 ? { text: trim(text), url: pageUrl(lang, page.title), lang, title: page.title } : null;
}

const decode = (s: string) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

/** Poglavje "Gospodarstvo" slovenskega članka (brez tabel, slik, sklicev in povezav na urejanje). */
async function economySection(title: string): Promise<InfoText | null> {
  const s = await wiki("sl", { action: "parse", page: title, prop: "sections", redirects: "1" });
  const sec = (s?.parse?.sections ?? []).find((x: any) => /^(gospodarstvo|ekonomija)$/i.test(String(x.line).replace(/<[^>]+>/g, "").trim()));
  if (!sec) return null;
  const t = await wiki("sl", { action: "parse", page: s.parse.title, section: String(sec.index), prop: "text", disabletoc: "1" });
  const html = String(t?.parse?.text ?? "");
  const text = decode(
    html
      .replace(/<(sup|table|style|figure|h\d)[\s\S]*?<\/\1>/g, "")
      .replace(/<div class="[^"]*(thumb|hatnote|navbox|reflist|mw-heading)[^"]*"[\s\S]*?<\/div>/g, "")
      .replace(/<span class="mw-editsection[\s\S]*?<\/span>\s*<\/span>/g, "")
      .replace(/<li>/g, "\n• ")
      .replace(/<\/(p|ul|ol)>/g, "\n\n")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/\[(uredi|uredi kodo)( \| uredi kodo)?\]/g, "")
    .replace(/^\s*Glavni članek:.*$/gm, "")
    .replace(/\[\d+\]/g, "")
    .trim();
  return text.length > 80 ? { text: trim(text), url: `${pageUrl("sl", s.parse.title)}#${encodeURIComponent(String(sec.anchor ?? "Gospodarstvo"))}`, lang: "sl", title: s.parse.title } : null;
}

export async function getCountryInfo(iso2: string, lang: string): Promise<CountryInfo> {
  const key = `${iso2}|${lang}`;
  const had = cache.get(key);
  if (had && Date.now() - had.at < CACHE_MS) return had.data;
  const id = (await wikidataIds()).get(iso2);
  if (!id) return { intro: null, economy: null };
  const links = await sitelinks([id.country, ...(id.economy ? [id.economy] : [])]);
  const country = links[id.country] ?? {};
  const econ = id.economy ? (links[id.economy] ?? {}) : {};
  const site = lang === "de" ? "dewiki" : lang === "en" ? "enwiki" : "slwiki";
  const wlang = site.slice(0, 2);

  const introText = country[site] ? await intro(wlang, country[site]).catch(() => null) : null;
  let economy: InfoText | null = null;
  if (wlang === "sl" && country.slwiki) economy = await economySection(country.slwiki).catch(() => null);
  if (!economy && econ[site]) economy = await intro(wlang, econ[site]).catch(() => null);
  if (!economy && econ.enwiki) economy = await intro("en", econ.enwiki).catch(() => null);

  const data: CountryInfo = {
    intro: introText ?? (country.enwiki ? await intro("en", country.enwiki).catch(() => null) : null),
    economy,
  };
  if (cache.size > 500) cache.clear();
  cache.set(key, { at: Date.now(), data });
  return data;
}
