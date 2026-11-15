// Borzni pregled iz Yahoo Finance (javni "chart" API, brez ključa). Seznam lahko povozi MARKET_SYMBOLS
// v .env (npr. "^GSPC=S&P 500,AAPL=Apple"). Cene so z zamikom borze (do ~15 min).
import { COUNTRY_MARKETS } from "./countryMarkets";

export type MarketRange = "1d" | "1mo" | "1y";
export type MarketQuote = {
  symbol: string;
  name: string;
  group: "index" | "commodity" | "fx" | "crypto" | "stock";
  price: number | null;
  previousClose: number | null; // zaprtje prejšnjega trgovalnega dne
  currency: string | null;
  open: boolean; // trg trenutno trguje (redna seja)
  points: [number, number][]; // [čas ms, vrednost] za izbrano obdobje
  rangeStart: number | null; // vrednost na začetku obdobja (za spremembo v obdobju)
  updatedAt: number | null;
};

const DEFAULTS: [string, string, MarketQuote["group"]][] = [
  ["^GSPC", "S&P 500", "index"],
  ["^IXIC", "Nasdaq", "index"],
  ["^DJI", "Dow Jones", "index"],
  ["^GDAXI", "DAX", "index"],
  ["^STOXX50E", "Euro Stoxx 50", "index"],
  ["^N225", "Nikkei 225", "index"],
  ["GC=F", "Zlato", "commodity"],
  ["BZ=F", "Nafta Brent", "commodity"],
  ["EURUSD=X", "EUR/USD", "fx"],
  ["BTC-EUR", "Bitcoin", "crypto"],
  ["AAPL", "Apple", "stock"],
  ["NVDA", "Nvidia", "stock"],
];

function symbols(): [string, string, MarketQuote["group"]][] {
  const env = process.env.MARKET_SYMBOLS?.trim();
  if (!env) return DEFAULTS;
  return env.split(",").map((pair) => {
    const [symbol, name] = pair.split("=").map((s) => s.trim());
    const known = DEFAULTS.find((d) => d[0] === symbol);
    return [symbol, name || known?.[1] || symbol, known?.[2] ?? "stock"];
  });
}

const INTERVAL: Record<MarketRange, string> = { "1d": "5m", "1mo": "1d", "1y": "1wk" };
const CACHE_MS: Record<MarketRange, number> = { "1d": 2 * 60_000, "1mo": 30 * 60_000, "1y": 6 * 3_600_000 };
const cache = new Map<string, { at: number; data: any }>();

async function chart(symbol: string, range: MarketRange): Promise<any> {
  const key = `${symbol}|${range}`;
  const had = cache.get(key);
  if (had && Date.now() - had.at < CACHE_MS[range]) return had.data;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${INTERVAL[range]}`;
  const res = await fetch(url, { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`yahoo HTTP ${res.status}`);
  const data = (await res.json())?.chart?.result?.[0];
  if (!data) throw new Error("no data");
  if (cache.size > 300) cache.clear();
  cache.set(key, { at: Date.now(), data });
  return data;
}

function series(data: any): [number, number][] {
  const ts: number[] = data?.timestamp ?? [];
  const close: (number | null)[] = data?.indicators?.quote?.[0]?.close ?? [];
  return ts.flatMap((t, i) => (close[i] == null ? [] : [[t * 1000, close[i] as number] as [number, number]]));
}

async function quote(symbol: string, name: string, group: MarketQuote["group"], range: MarketRange): Promise<MarketQuote> {
  try {
    // Dnevni podatki vedno (cena, včerajšnje zaprtje, ali trg trguje); daljše obdobje le za graf.
    const day = await chart(symbol, "1d");
    const meta = day.meta ?? {};
    const long = range === "1d" ? day : await chart(symbol, range);
    const points = series(long);
    const now = Date.now() / 1000;
    const regular = meta.currentTradingPeriod?.regular;
    return {
      symbol,
      name,
      group,
      price: meta.regularMarketPrice ?? points.at(-1)?.[1] ?? null,
      previousClose: meta.chartPreviousClose ?? meta.previousClose ?? null,
      currency: meta.currency ?? null,
      open: group === "crypto" || Boolean(regular && now >= regular.start && now < regular.end),
      points,
      rangeStart: range === "1d" ? (meta.chartPreviousClose ?? null) : (long.meta?.chartPreviousClose ?? points[0]?.[1] ?? null),
      updatedAt: meta.regularMarketTime ? meta.regularMarketTime * 1000 : null,
    };
  } catch {
    return { symbol, name, group, price: null, previousClose: null, currency: null, open: false, points: [], rangeStart: null, updatedAt: null };
  }
}

export async function getMarkets(range: MarketRange): Promise<MarketQuote[]> {
  return getQuotes(symbols(), range);
}

/** Trg države: indeksi, največja podjetja in tečaj EUR do lokalne valute (če ni evro). */
export async function getCountryMarket(iso2: string, range: MarketRange): Promise<MarketQuote[]> {
  const m = COUNTRY_MARKETS[iso2];
  if (!m) return [];
  const list: [string, string, MarketQuote["group"]][] = [...m.indices.map(([s, n]) => [s, n, "index"] as [string, string, MarketQuote["group"]]), ...m.stocks.map(([s, n]) => [s, n, "stock"] as [string, string, MarketQuote["group"]])];
  const quotes = await getQuotes(list, range);
  // Valuta indeksa = valuta države (pri ^PX Yahoo navaja USD, zato raje prvo delnico, če obstaja).
  const cur = (quotes.find((q) => q.group === "stock" && q.currency)?.currency ?? quotes.find((q) => q.currency)?.currency ?? "").toUpperCase();
  if (cur && cur !== "EUR" && /^[A-Z]{3}$/.test(cur)) {
    const [fx] = await getQuotes([[`EUR${cur}=X`, `EUR/${cur}`, "fx"]], range);
    if (fx.price !== null) quotes.push(fx);
  }
  return quotes;
}

export async function getQuotes(list: [string, string, MarketQuote["group"]][], range: MarketRange): Promise<MarketQuote[]> {
  const out: MarketQuote[] = new Array(list.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (next < list.length) {
        const i = next++;
        out[i] = await quote(list[i][0], list[i][1], list[i][2], range);
      }
    }),
  );
  return out;
}
