// Zgodovina države: pregled (uvod članka "Zgodovina …" prek Wikidata P2184), obdobja (podpoglavja poglavja
// o zgodovini v članku o državi) in časovni trak ključnih dogodkov (Wikidata P793; nastanek države je v
// infoboxu, ki ga ima že profil). Vir besedil: Wikipedija (CC BY-SA), v jeziku uporabnika ali angleško.
import { decode, getJson, pageUrl, sitelinks, wiki, wikidataIds, type InfoText } from "./countryInfo";

export type Period = { title: string; text: string };
export type HistoryEvent = { date: string; label: string };
export type CountryHistory = {
  overview: InfoText | null;
  periods: Period[];
  periodsSource: { lang: string; url: string; title: string } | null;
  events: HistoryEvent[];
};

const CACHE_MS = 7 * 86_400_000;
const PERIOD_CHARS = 1400;
const OVERVIEW_CHARS = 3500;
const cache = new Map<string, { at: number; data: CountryHistory }>();
const HISTORY = { sl: /^zgodovina$/i, en: /^history$/i, de: /^geschichte$/i } as const;

function trimTo(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf(".\n"));
  return `${cut.slice(0, end > max / 3 ? end + 1 : max).trim()} …`;
}

function htmlToText(html: string): string {
  return decode(
    html
      .replace(/<(sup|table|style|figure)[\s\S]*?<\/\1>/g, "")
      .replace(/<div class="[^"]*(thumb|hatnote|navbox|reflist|gallery|shortdescription)[^"]*"[\s\S]*?<\/div>/g, "")
      .replace(/<span class="mw-editsection[\s\S]*?<\/span>\s*<\/span>/g, "")
      .replace(/<li>/g, "\n• ")
      .replace(/<\/(p|ul|ol)>/g, "\n\n")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/\[(uredi|uredi kodo|edit|Bearbeiten)( \| uredi kodo| \| Quelltext bearbeiten)?\]/g, "")
    .replace(/^\s*(Glavni članek|Main articles?|See also|Glej tudi|Further information|Hauptartikel|Siehe auch):.*$/gm, "")
    .replace(/\[\d+\]|\[[a-z]\]|\[note \d+\]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Podpoglavja poglavja o zgodovini (če jih je vsaj 3). */
async function periods(lang: "sl" | "en" | "de", title: string): Promise<{ list: Period[]; url: string; title: string } | null> {
  const s = await wiki(lang, { action: "parse", page: title, prop: "sections", redirects: "1" });
  const sections: any[] = s?.parse?.sections ?? [];
  const i = sections.findIndex((x) => HISTORY[lang].test(String(x.line).replace(/<[^>]+>/g, "").trim()));
  if (i < 0) return null;
  const level = Number(sections[i].toclevel);
  const subs = [];
  for (let j = i + 1; j < sections.length && Number(sections[j].toclevel) > level; j += 1) if (Number(sections[j].toclevel) === level + 1) subs.push(sections[j]);
  if (subs.length < 3) return null;
  // Celotno poglavje v enem klicu, nato razrez po naslovih podpoglavij (h3).
  const t = await wiki(lang, { action: "parse", page: s.parse.title, section: String(sections[i].index), prop: "text", disabletoc: "1" });
  const html = String(t?.parse?.text ?? "");
  const parts = html.split(/<h3[^>]*>/);
  const list: Period[] = [];
  for (const part of parts.slice(1)) {
    const end = part.indexOf("</h3>");
    const heading = decode(part.slice(0, end).replace(/<[^>]+>/g, "")).replace(/\[.*?\]/g, "").trim();
    const text = htmlToText(part.slice(end + 5));
    // Podnaslovi (h4) ostanejo kot prva vrstica; naslov obdobja ne ponavljamo.
    const body = text.startsWith(heading) ? text.slice(heading.length).trim() : text;
    if (heading && body.length > 60) list.push({ title: heading, text: trimTo(body, PERIOD_CHARS) });
  }
  return list.length >= 3 ? { list, url: `${pageUrl(lang, s.parse.title)}#${encodeURIComponent(String(sections[i].anchor ?? ""))}`, title: s.parse.title } : null;
}

async function overview(lang: "sl" | "en" | "de", title: string): Promise<InfoText | null> {
  const body = await wiki(lang, { action: "query", prop: "extracts", exintro: "1", explaintext: "1", titles: title, redirects: "1" });
  const page = body?.query?.pages?.[0];
  const text = String(page?.extract ?? "").trim();
  return text.length > 150 ? { text: trimTo(text, OVERVIEW_CHARS), url: pageUrl(lang, page.title), lang, title: page.title } : null;
}

async function events(qid: string): Promise<HistoryEvent[]> {
  const query = `SELECT ?evLabel ?date WHERE {
    wd:${qid} p:P793 ?st. ?st ps:P793 ?ev.
    OPTIONAL { ?st pq:P585 ?d1 } OPTIONAL { ?st pq:P580 ?d2 } OPTIONAL { ?ev wdt:P585 ?d3 } OPTIONAL { ?ev wdt:P580 ?d4 }
    BIND(COALESCE(?d1, ?d2, ?d3, ?d4) AS ?date) FILTER(BOUND(?date))
    SERVICE wikibase:label { bd:serviceParam wikibase:language "sl,en". }
  } ORDER BY ?date LIMIT 60`;
  const body = await getJson(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`);
  const seen = new Set<string>();
  return (body?.results?.bindings ?? [])
    .map((b: any) => ({ date: String(b.date.value).replace(/^\+/, "").slice(0, 10), label: String(b.evLabel.value) }))
    .filter((e: HistoryEvent) => !/^Q\d+$/.test(e.label) && !seen.has(e.label) && seen.add(e.label));
}

export async function getHistory(iso2: string, lang: string): Promise<CountryHistory> {
  const key = `${iso2}|${lang}`;
  const had = cache.get(key);
  if (had && Date.now() - had.at < CACHE_MS) return had.data;
  const id = (await wikidataIds()).get(iso2);
  if (!id) return { overview: null, periods: [], periodsSource: null, events: [] };
  const claims = await getJson(`https://www.wikidata.org/w/api.php?action=wbgetclaims&entity=${id.country}&property=P2184&format=json`).catch(() => null);
  const historyQid: string | undefined = claims?.claims?.P2184?.[0]?.mainsnak?.datavalue?.value?.id;
  const links = await sitelinks([id.country, ...(historyQid ? [historyQid] : [])]);
  const site = lang === "de" ? "dewiki" : lang === "en" ? "enwiki" : "slwiki";
  const l = site.slice(0, 2) as "sl" | "en" | "de";
  const country = links[id.country] ?? {};
  const hist = historyQid ? (links[historyQid] ?? {}) : {};

  const [ov, per, ev] = await Promise.all([
    (async () => (hist[site] ? await overview(l, hist[site]).catch(() => null) : null) ?? (hist.enwiki ? await overview("en", hist.enwiki).catch(() => null) : null))(),
    (async () => (country[site] ? await periods(l, country[site]).catch(() => null) : null) ?? (country.enwiki && l !== "en" ? await periods("en", country.enwiki).catch(() => null) : null))(),
    events(id.country).catch(() => []),
  ]);
  const data: CountryHistory = {
    overview: ov,
    periods: per?.list ?? [],
    periodsSource: per ? { lang: new URL(per.url).hostname.slice(0, 2), url: per.url, title: per.title } : null,
    events: ev,
  };
  if (cache.size > 500) cache.clear();
  if (ov || per) cache.set(key, { at: Date.now(), data });
  return data;
}
