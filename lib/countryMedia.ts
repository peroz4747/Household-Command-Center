// Glavni mediji države in njihove zadnje novice. Seznam medijev: Wikidata (časopisi, spletni časopisi,
// tiskovne agencije, RTV hiše z državo P17), razvrščeni po številu Wikipedijinih člankov o mediju
// (približek pomembnosti). Za Slovenijo, ki je Wikidata ne pokrije dobro, je seznam ročen.
// Novice: RSS vir iz Wikidata (P1019), samodejno odkrit na naslovnici ali na običajnih poteh;
// če ga ni, Google News omejen na domeno medija.
import { wikidataIds } from "./countryInfo";

export type Story = { title: string; link: string; date: string | null };
export type Outlet = { name: string; site: string | null; kind: string; feed: string | null; feedSource: "wikidata" | "site" | "google" | null; stories: Story[] };

const UA = { "User-Agent": "Mozilla/5.0 (HouseholdCommandCenter; home dashboard)" };
const TOP = 5;
const LIST_MS = 7 * 86_400_000;
const STORIES_MS = 30 * 60_000;

// Slovenija: največji mediji po dosegu (Wikidata nima 24ur, N1, Siola).
const MANUAL: Record<string, { name: string; site: string; feed: string; kind: string }[]> = {
  SI: [
    { name: "24ur", site: "https://www.24ur.com/", feed: "https://www.24ur.com/rss", kind: "televizija in portal" },
    { name: "RTV Slovenija", site: "https://www.rtvslo.si/", feed: "https://img.rtvslo.si/feeds/00.xml", kind: "javna RTV" },
    { name: "Delo", site: "https://www.delo.si/", feed: "https://www.delo.si/rss", kind: "dnevnik" },
    { name: "N1 Slovenija", site: "https://n1info.si/", feed: "https://n1info.si/feed/", kind: "portal" },
    { name: "Siol.net", site: "https://siol.net/", feed: "https://siol.net/feeds/latest", kind: "portal" },
  ],
};

// Vrste medijev v Wikidata (P31): časopis, dnevni časopis, spletni časopis, novičarska spletna stran,
// tiskovna agencija, televizijski kanal, javna RTV, radiodifuzijska družba.
const TYPES = ["Q11032", "Q1110794", "Q1153191", "Q17232649", "Q192283", "Q2001305", "Q1126006", "Q15265344"];
const listCache = new Map<string, { at: number; list: Omit<Outlet, "stories">[] }>();
const storyCache = new Map<string, { at: number; stories: Story[] }>();

const host = (u: string | null) => {
  try {
    return u ? new URL(u).hostname.replace(/^www\./, "") : null;
  } catch {
    return null;
  }
};

async function fetchText(url: string, max = 600_000): Promise<string | null> {
  const res = await fetch(url, { cache: "no-store", headers: UA, redirect: "follow", signal: AbortSignal.timeout(9000) }).catch(() => null);
  if (!res?.ok) return null;
  return (await res.text().catch(() => "")).slice(0, max);
}

const isFeed = (xml: string | null) => !!xml && /<(rss|feed|rdf:RDF)[\s>]/i.test(xml.slice(0, 3000));

/** RSS na naslovnici (<link rel="alternate">) ali na običajni poti. */
async function discoverFeed(site: string): Promise<string | null> {
  const html = await fetchText(site, 400_000);
  if (html) {
    for (const m of html.matchAll(/<link[^>]+type=["']application\/(?:rss|atom)\+xml["'][^>]*>/gi)) {
      const href = m[0].match(/href=["']([^"']+)["']/i)?.[1];
      if (href) return new URL(href.replace(/&amp;/g, "&"), site).toString();
    }
  }
  for (const path of ["/rss", "/feed/", "/rss.xml", "/feeds/latest.rss", "/feed", "/rss/", "/index.rss"]) {
    const url = new URL(path, site).toString();
    if (isFeed(await fetchText(url, 5000))) return url;
  }
  return null;
}

async function topOutlets(iso2: string): Promise<Omit<Outlet, "stories">[]> {
  const had = listCache.get(iso2);
  if (had && Date.now() - had.at < LIST_MS) return had.list;
  let list: Omit<Outlet, "stories">[] = [];
  if (MANUAL[iso2]) {
    list = MANUAL[iso2].map((m) => ({ name: m.name, site: m.site, kind: m.kind, feed: m.feed, feedSource: "site" as const }));
  } else {
    const id = (await wikidataIds()).get(iso2);
    if (!id) return [];
    const query = `SELECT ?m ?mLabel ?typeLabel ?site ?feed ?links WHERE {
      VALUES ?type { ${TYPES.map((t) => `wd:${t}`).join(" ")} }
      ?m wdt:P31 ?type; wdt:P17 wd:${id.country}; wikibase:sitelinks ?links.
      FILTER NOT EXISTS { ?m wdt:P576 ?end }
      OPTIONAL { ?m wdt:P856 ?site } OPTIONAL { ?m wdt:P1019 ?feed }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "sl,en". }
    } ORDER BY DESC(?links) LIMIT 40`;
    // Pri velikih državah (npr. ZDA) poizvedba traja dlje; dovolimo 50 s in en ponovni poskus.
    const sparql = () =>
      fetch(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`, { cache: "no-store", headers: { "User-Agent": "HouseholdCommandCenter/1.0 (home dashboard)" }, signal: AbortSignal.timeout(50_000) }).then((r) =>
        r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)),
      );
    const body = await sparql().catch(() => sparql());
    const seen = new Set<string>();
    for (const b of body?.results?.bindings ?? []) {
      const site = b.site?.value ?? null;
      const key = host(site) ?? String(b.m.value);
      // En medij je lahko v Wikidata večkrat (npr. časopis in spletni časopis z isto domeno).
      const name = String(b.mLabel.value).toLowerCase();
      if (!site || seen.has(key) || seen.has(name)) continue;
      seen.add(key);
      seen.add(name);
      list.push({ name: String(b.mLabel.value), site, kind: String(b.typeLabel?.value ?? ""), feed: b.feed?.value ?? null, feedSource: b.feed ? "wikidata" : null });
    }
    // RSS za prvih nekaj medijev iščemo vzporedno (zaporedno je prvo odprtje trajalo 20 s in več).
    const out = list.slice(0, TOP);
    await Promise.all(
      out.map(async (o) => {
        if (o.feed || !o.site) return;
        const feed = await discoverFeed(o.site).catch(() => null);
        if (feed) Object.assign(o, { feed, feedSource: "site" });
      }),
    );
    list = out;
  }
  listCache.set(iso2, { at: Date.now(), list });
  return list;
}

const decodeXml = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

function parseFeed(xml: string, limit: number): Story[] {
  const items = xml.match(/<(item|entry)[\s>][\s\S]*?<\/\1>/g) ?? [];
  return items.slice(0, limit).flatMap((it): Story[] => {
    const title = decodeXml(it.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1] ?? "");
    const link = decodeXml(it.match(/<link[^>]*>([\s\S]*?)<\/link>/)?.[1] ?? "") || it.match(/<link[^>]*href=["']([^"']+)["']/)?.[1] || "";
    const date = decodeXml(it.match(/<(pubDate|updated|published|dc:date)>([\s\S]*?)<\/\1>/)?.[2] ?? "") || null;
    return title && link ? [{ title, link, date: date && !Number.isNaN(Date.parse(date)) ? new Date(date).toISOString() : null }] : [];
  });
}

export async function storiesFor(o: Omit<Outlet, "stories">, iso2: string, lang: string): Promise<{ stories: Story[]; source: Outlet["feedSource"] }> {
  const key = o.feed ?? `g:${host(o.site)}`;
  const had = storyCache.get(key);
  if (had && Date.now() - had.at < STORIES_MS) return { stories: had.stories, source: o.feed ? o.feedSource : "google" };
  let stories: Story[] = [];
  let source = o.feedSource;
  if (o.feed) {
    const xml = await fetchText(o.feed);
    if (isFeed(xml)) stories = parseFeed(xml!, 5);
  }
  // Vir iz Wikidata je lahko zastarel: poiščemo trenutnega na strani medija.
  if (!stories.length && o.feedSource === "wikidata" && o.site) {
    const feed = await discoverFeed(o.site).catch(() => null);
    const xml = feed ? await fetchText(feed) : null;
    if (isFeed(xml)) {
      stories = parseFeed(xml!, 5);
      source = "site";
    }
  }
  if (!stories.length && host(o.site)) {
    // Google News za domeno medija (deluje tudi, kadar medij RSS nima ali ga skriva).
    // Izdaja mora biti veljavna kombinacija jezika in države; filter site: deluje v vsaki, zato splošna.
    void lang;
    void iso2;
    const url = `https://news.google.com/rss/search?${new URLSearchParams({ q: `site:${host(o.site)} when:3d`, hl: "en-US", gl: "US", ceid: "US:en" })}`;
    const xml = await fetchText(url);
    if (isFeed(xml)) {
      // Google naslovu doda " - Ime medija"; odstranimo.
      stories = parseFeed(xml!, 5).map((s) => ({ ...s, title: s.title.replace(/\s+-\s+[^-]+$/, "") }));
      source = "google";
    }
  }
  storyCache.set(key, { at: Date.now(), stories });
  if (storyCache.size > 1000) storyCache.clear();
  return { stories, source };
}

export async function getMedia(iso2: string, lang: string): Promise<Outlet[]> {
  const list = await topOutlets(iso2);
  return Promise.all(
    list.map(async (o) => {
      const { stories, source } = await storiesFor(o, iso2, lang).catch(() => ({ stories: [] as Story[], source: o.feedSource }));
      return { ...o, feedSource: stories.length ? source : null, stories };
    }),
  );
}
