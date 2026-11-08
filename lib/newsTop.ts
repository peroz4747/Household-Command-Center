// Top novice: 24ur.com objavlja le trenutnih 5 najbolj branih, zato jih beležimo vsako uro in seštevamo točke
// (1. mesto 5 točk ... 5. mesto 1 točka). Naslovi RTV SLO in N1 povedo, ali je zgodbo pokrila tudi druga redakcija.
// Primerjava zgodb temelji na ujemanju besed, zato ni popolna.
import storage from "./storage";
import { TOPIC_WORDS, type NewsTopic } from "./newsTopics";

export type NewsWindow = "24h" | "7d";
export type TopItem = { url: string; title: string; category: string; lead: string; alsoOn: string[]; related: number; published?: number };

type Hit = { at: number; pts: number };
type Article = { url: string; title: string; category: string; firstSeen: number; lead?: string; leadTried?: boolean; hits: Hit[]; score?: number; lastSeen?: number };
type Headline = { source: string; title: string; at: number; summary?: string };
type Stored = {
  since?: number;
  lastCollectedAt?: number;
  lastHeadlinesAt?: number;
  articles?: Record<string, Article>;
  headlines?: Record<string, Headline>;
};

const HOME_URL = "https://www.24ur.com/";
const FEEDS = [
  { source: "RTV SLO", url: "https://img.rtvslo.si/feeds/00.xml" },
  { source: "N1", url: "https://n1info.si/feed/" },
  { source: "24ur", url: "https://www.24ur.com/rss" },
  { source: "Večer", url: "https://vecer.com/rss" },
  { source: "Maribor24", url: "https://maribor24.si/feed" },
];
// Le ti viri štejejo kot druga redakcija pri točkah; 24ur je vir lestvice, lokalni viri pokrivajo drugačne teme.
const RANKING_SOURCES = new Set(["RTV SLO", "N1"]);
const UA = { "User-Agent": "Mozilla/5.0" };
const COLLECT_MS = 60 * 60_000;
const MIN_GAP_MS = 55 * 60_000;
const WEEK_MS = 7 * 86_400_000;
const WINDOWS: Record<NewsWindow, number> = { "24h": 86_400_000, "7d": WEEK_MS };
const RESULT_COUNT = 10;
const MAX_PER_CATEGORY = 3;
const SOURCE_BOOST = 0.25;
const TOPIC_RESULT_COUNT = 20;

const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();

async function get(url: string, timeoutMs = 20_000): Promise<string> {
  const res = await fetch(url, { cache: "no-store", headers: UA, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function readStored(): Promise<Stored> {
  const raw = await storage.readItems("news-top");
  if (!raw || Array.isArray(raw)) return {};
  const stored = raw as Stored;
  // Stara oblika: skupne točke brez časov.
  for (const a of Object.values(stored.articles ?? {})) {
    if (!a.hits) a.hits = [{ at: a.lastSeen ?? a.firstSeen, pts: a.score ?? 0 }];
  }
  return stored;
}

function parseMostViewed(html: string) {
  const start = html.indexOf("most-viewed-articles");
  if (start < 0) return [];
  return html
    .slice(start, start + 20_000)
    .split("<a ")
    .filter((part) => part.includes("most-viewed__link"))
    .map((part) => ({
      url: part.match(/href="?([^\s">]+)/)?.[1] ?? "",
      category: decode(part.match(/<span class="label[^>]*>([^<]+)<\/span>/)?.[1] ?? ""),
      title: decode(part.match(/<h2[^>]*>([^<]+)<\/h2>/)?.[1] ?? ""),
    }))
    .filter((a) => a.url.startsWith("/") && a.title)
    .slice(0, 5);
}

function parseLead(html: string): string {
  for (const re of [
    /<meta[^>]*(?:property|name)=["']?og:description["']?[^>]*content=(?:"([^"]*)"|'([^']*)')/i,
    /<meta[^>]*content=(?:"([^"]*)"|'([^']*)')[^>]*(?:property|name)=["']?og:description/i,
    /<meta[^>]*name=["']?description["']?[^>]*content=(?:"([^"]*)"|'([^']*)')/i,
  ]) {
    const m = html.match(re);
    const text = m && (m[1] ?? m[2]);
    if (text) return decode(text).slice(0, 320);
  }
  return "";
}

async function collectHeadlines(stored: Stored, now: number): Promise<void> {
  const headlines = { ...(stored.headlines ?? {}) };
  for (const feed of FEEDS) {
    try {
      const xml = await get(feed.url);
      for (const block of xml.match(/<item[\s\S]*?<\/item>/g) ?? []) {
        const title = decode(block.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? "");
        const link = decode(block.match(/<link>([\s\S]*?)<\/link>/i)?.[1] ?? "");
        if (!title || !link || headlines[link]) continue;
        const published = Date.parse(block.match(/<pubDate>([^<]+)<\/pubDate>/i)?.[1] ?? "");
        const summary = decode(block.match(/<description>([\s\S]*?)<\/description>/i)?.[1] ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
        headlines[link] = { source: feed.source, title, at: Number.isNaN(published) ? now : Math.min(published, now), summary: summary.length >= 30 ? summary.slice(0, 260) : undefined };
      }
    } catch {
      // vir bo poskusen ob naslednji meritvi
    }
  }
  for (const [k, h] of Object.entries(headlines)) if (now - h.at >= WEEK_MS) delete headlines[k];
  stored.headlines = headlines;
  stored.lastHeadlinesAt = now;
}

async function collectMostViewed(stored: Stored, now: number): Promise<void> {
  const list = parseMostViewed(await get(HOME_URL));
  if (list.length === 0) return;
  const articles = stored.articles ?? {};
  list.forEach((a, i) => {
    const url = `https://www.24ur.com${a.url}`;
    const prev = articles[url];
    articles[url] = { ...prev, url, title: a.title, category: a.category, firstSeen: prev?.firstSeen ?? now, hits: [...(prev?.hits ?? []), { at: now, pts: 5 - i }] };
  });
  stored.articles = articles;
  stored.since ??= now;
  stored.lastCollectedAt = now;
}

async function fillLeads(stored: Stored): Promise<void> {
  const missing = Object.values(stored.articles ?? {}).filter((a) => !a.lead && !a.leadTried).slice(0, 12);
  for (const a of missing) {
    try {
      a.lead = parseLead(await get(a.url, 10_000));
    } catch {
      /* brez uvoda */
    }
    a.leadTried = true;
  }
}

let collecting = false;

/** Zabeleži lestvico in naslove, če je od zadnje meritve minilo dovolj časa, ter dopolni manjkajoče uvode. */
export async function collectNewsTop(): Promise<void> {
  if (collecting) return;
  collecting = true;
  try {
    const stored = await readStored();
    const now = Date.now();
    const due = (at?: number) => !at || now - at >= MIN_GAP_MS;
    if (due(stored.lastCollectedAt)) await collectMostViewed(stored, now).catch(() => {});
    if (due(stored.lastHeadlinesAt)) await collectHeadlines(stored, now);
    for (const [k, a] of Object.entries(stored.articles ?? {})) {
      a.hits = a.hits.filter((h) => now - h.at < WEEK_MS);
      if (a.hits.length === 0) delete stored.articles![k];
    }
    await fillLeads(stored);
    await storage.writeItems("news-top", stored);
  } catch {
    // poskusimo ob naslednji meritvi
  } finally {
    collecting = false;
  }
}

export function startNewsTopCollector(): void {
  void collectNewsTop();
  setInterval(() => void collectNewsTop(), COLLECT_MS);
}

/* ---------------- Primerjava zgodb ---------------- */

const STOP = new Set("kako tudi zaradi danes bodo lahko nekaj prvi novi proti kjer kdaj pred leta leto sloven mesto drzav rekli pravi kateri ljudi".split(" "));

/** Grobe besedne osnove (prvih 5 črk), da se ujamejo sklanjatve: Krakovu/Krakova. */
function stems(text: string): Set<string> {
  const words = text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().match(/[a-z]{4,}/g) ?? [];
  return new Set(words.map((w) => w.slice(0, 5)).filter((w) => !STOP.has(w)));
}

const shared = (a: Set<string>, b: Set<string>) => [...a].filter((w) => b.has(w)).length;

type Scored = { a: Article; score: number; title: Set<string>; all: Set<string> };

function sameStory(x: Scored, y: Scored): boolean {
  if (shared(x.title, y.title) >= 3) return true;
  return x.a.category === y.a.category && Boolean(x.a.lead && y.a.lead) && shared(x.all, y.all) >= 5;
}

export async function getNewsTop(window: NewsWindow): Promise<{ items: TopItem[]; since: number | null }> {
  const { articles, headlines, since } = await readStored();
  const now = Date.now();
  const scored: Scored[] = Object.values(articles ?? {})
    .map((a) => ({
      a,
      score: a.hits.filter((h) => now - h.at < WINDOWS[window]).reduce((sum, h) => sum + h.pts, 0),
      title: stems(a.title),
      all: stems(`${a.title} ${a.lead ?? ""}`),
    }))
    .filter((s) => s.score > 0)
    .sort((x, y) => y.score - x.score);

  const groups: { rep: Scored; score: number; related: number; titles: Set<string>[] }[] = [];
  for (const s of scored) {
    const group = groups.find((g) => sameStory(g.rep, s));
    if (group) {
      group.score += s.score;
      group.related += 1;
      group.titles.push(s.title);
    } else groups.push({ rep: s, score: s.score, related: 0, titles: [s.title] });
  }

  const others = Object.values(headlines ?? {})
    .filter((h) => RANKING_SOURCES.has(h.source) && now - h.at < WINDOWS[window])
    .map((h) => ({ source: h.source, title: stems(h.title) }));

  const ranked = groups
    .map((g) => {
      const alsoOn = [...new Set(others.filter((o) => g.titles.some((t) => shared(o.title, t) >= 3)).map((o) => o.source))];
      return { ...g, alsoOn, final: g.score * (1 + SOURCE_BOOST * alsoOn.length) };
    })
    .sort((x, y) => y.final - x.final);

  // Največ 3 na rubriko; ostale pridejo na vrsto samo, če je seznam sicer prekratek.
  const counts = new Map<string, number>();
  const picked: typeof ranked = [];
  const overflow: typeof ranked = [];
  for (const g of ranked) {
    const n = counts.get(g.rep.a.category) ?? 0;
    if (n < MAX_PER_CATEGORY) {
      counts.set(g.rep.a.category, n + 1);
      picked.push(g);
    } else overflow.push(g);
  }
  const items = [...picked, ...overflow].slice(0, RESULT_COUNT).map((g) => ({
    url: g.rep.a.url,
    title: g.rep.a.title,
    category: g.rep.a.category,
    lead: g.rep.a.lead ?? "",
    alsoOn: g.alsoOn,
    related: g.related,
  }));
  return { items, since: since ?? null };
}

const plainWords = (text: string) =>
  text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().match(/[a-z]+/g) ?? [];

function matchesTopic(titleWords: string[], summaryWords: string[], topic: NewsTopic): boolean {
  const { prefixes, exact, inSummary } = TOPIC_WORDS[topic];
  return (inSummary ? [...titleWords, ...summaryWords] : titleWords).some((w) => prefixes.some((p) => w.startsWith(p)) || exact?.includes(w));
}

/** Najnovejše novice o izbranih temah iz vseh virov; ista zgodba iz več virov se pokaže enkrat. */
export async function getNewsByTopics(window: NewsWindow, topics: NewsTopic[]): Promise<{ items: TopItem[]; since: number | null }> {
  const { headlines, since } = await readStored();
  const now = Date.now();
  const matches = Object.entries(headlines ?? {})
    .map(([url, h]) => ({ url, h, titleWords: plainWords(h.title), summaryWords: plainWords(h.summary ?? ""), title: stems(h.title) }))
    .filter((x) => now - x.h.at < WINDOWS[window] && topics.some((t) => matchesTopic(x.titleWords, x.summaryWords, t)))
    .sort((a, b) => b.h.at - a.h.at);

  const groups: { rep: (typeof matches)[number]; sources: Set<string> }[] = [];
  for (const m of matches) {
    const group = groups.find((g) => shared(g.rep.title, m.title) >= 3);
    if (group) group.sources.add(m.h.source);
    else groups.push({ rep: m, sources: new Set([m.h.source]) });
  }
  const items = groups.slice(0, TOPIC_RESULT_COUNT).map(({ rep, sources }) => ({
    url: rep.url,
    title: rep.h.title,
    category: rep.h.source,
    lead: rep.h.summary ?? "",
    alsoOn: [...sources].filter((source) => source !== rep.h.source),
    related: 0,
    published: rep.h.at,
  }));
  return { items, since: since ?? null };
}
