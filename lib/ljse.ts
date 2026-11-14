// Ljubljanska borza: indeksi z dnevnim gibanjem in najaktivnejše delnice (podatki z domače strani ljse.si),
// cene vseh delnic (/api/MarketPrices) in imena izdajateljev (stran papirja, shranjena 7 dni).
export type LjseIndex = { isin: string; name: string; value: number | null; changePct: number | null; moves: [number, number][] };
export type LjseShare = {
  symbol: string;
  isin: string;
  name: string;
  segment: "A" | "B"; // A = prva kotacija, B = standardna kotacija
  price: number | null; // zadnji tečaj danes (null = danes ni bilo posla)
  prevClose: number | null;
  changePct: number | null;
  turnover: number | null; // EUR, le za najaktivnejše
};
export type LjseData = { timestamp: string | null; indices: LjseIndex[]; shares: LjseShare[] };

const BASE = "https://ljse.si";
const UA = { "User-Agent": "Mozilla/5.0 (HouseholdCommandCenter)" };
const CACHE_MS = 5 * 60_000;
const NAME_MS = 7 * 86_400_000;
let cache: { at: number; data: LjseData } | null = null;
const names = new Map<string, { at: number; name: string }>();

const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
// Časi na borzi so lokalni (Ljubljana); pretvorimo jih v ms, ne glede na časovni pas strežnika.
function ljTime(s: string): number {
  for (const off of ["+01:00", "+02:00"]) {
    const t = Date.parse(`${s.replace(" ", "T")}${off}`);
    const h = Number(new Date(t).toLocaleString("en-GB", { timeZone: "Europe/Ljubljana", hour: "numeric", hourCycle: "h23" }));
    if (h === Number(s.slice(11, 13))) return t;
  }
  return Date.parse(`${s.replace(" ", "T")}Z`);
}

async function issuerName(isin: string, symbol: string): Promise<string> {
  const had = names.get(isin);
  if (had && Date.now() - had.at < NAME_MS) return had.name;
  try {
    const res = await fetch(`${BASE}/si/papir/310?isin=${encodeURIComponent(isin)}`, { cache: "no-store", headers: UA, signal: AbortSignal.timeout(10_000) });
    const m = (await res.text()).match(/"name":"([^"]{2,80})"/);
    const name = m ? m[1] : symbol;
    names.set(isin, { at: Date.now(), name });
    return name;
  } catch {
    return had?.name ?? symbol;
  }
}

/** Besedilo JSON objekta, ki se začne na `start` (štejemo oklepaje, nize preskočimo). */
function balancedObject(text: string, start: number): string {
  const from = text.indexOf("{", start);
  let depth = 0;
  let inString = false;
  for (let i = from; i < text.length; i += 1) {
    const c = text[i];
    if (inString) {
      if (c === "\\") i += 1;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === "{") depth += 1;
    else if (c === "}" && --depth === 0) return text.slice(from, i + 1);
  }
  throw new Error("unbalanced");
}

export async function getLjse(): Promise<LjseData> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.data;
  const [home, prices] = await Promise.all([
    fetch(`${BASE}/`, { cache: "no-store", headers: UA, signal: AbortSignal.timeout(15_000) }).then((r) => r.text()),
    fetch(`${BASE}/api/MarketPrices`, { cache: "no-store", headers: UA, signal: AbortSignal.timeout(15_000) }).then((r) => r.json() as Promise<any[]>),
  ]);
  const marker = "this.WebHomeData = ";
  const i = home.indexOf(marker);
  let web: any = {};
  if (i >= 0) {
    try {
      web = JSON.parse(balancedObject(home, i + marker.length));
    } catch {
      web = {};
    }
  }
  const indices: LjseIndex[] = (web.indices ?? []).map((x: any) => ({
    isin: String(x.isin),
    name: String(x.name),
    value: num(x.last_value),
    changePct: num(x.change_prev_close_percentage),
    moves: (x.moves ?? []).map((m: any) => [ljTime(String(m.x)), Number(m.y)] as [number, number]).filter((m: [number, number]) => Number.isFinite(m[0]) && Number.isFinite(m[1])),
  }));
  const turnover = new Map<string, number>((web.top?.turnover ?? []).map((x: any) => [String(x.isin), Number(x.turnover)]));
  const list = (prices ?? []).filter((p) => p.security_type_code === "ORD-SHARE" || p.security_type_code === "PREF-SHARE");
  const shares: LjseShare[] = await Promise.all(
    list.map(async (p) => {
      const price = num(p.last_price);
      const prevClose = num(p.prev_close_price);
      return {
        symbol: String(p.symbol),
        isin: String(p.isin),
        name: await issuerName(String(p.isin), String(p.symbol)),
        segment: p.market_segment_id === "A" ? "A" : "B",
        price,
        prevClose,
        changePct: price !== null && prevClose ? ((price - prevClose) / prevClose) * 100 : null, // brez posla danes: brez spremembe
        turnover: turnover.get(String(p.isin)) ?? null,
      } satisfies LjseShare;
    }),
  );
  shares.sort((a, b) => (a.segment === b.segment ? (b.turnover ?? 0) - (a.turnover ?? 0) || a.name.localeCompare(b.name, "sl") : a.segment === "A" ? -1 : 1));
  const data: LjseData = { timestamp: web.timestamp ?? null, indices, shares };
  cache = { at: Date.now(), data };
  return data;
}
