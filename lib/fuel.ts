// Cena bencina 95 v okolici doma iz goriva.si (javni API, cene vseh črpalk v Sloveniji).
// Regulirana cena se spremeni ob torkih; hranimo dnevno zgodovino, da pokažemo zadnjo spremembo.
import storage from "./storage";

const API = "https://goriva.si/api/v1/search/";
export const FUEL = "95";
const RADIUS_M = Number(process.env.FUEL_RADIUS_M ?? 5000);
const REFRESH_MS = 60 * 60_000;
const MAX_PAGES = 5;
const TZ = "Europe/Ljubljana";

export type FuelStation = { name: string; address: string; price: number; distanceKm: number };

export type FuelData = {
  fuel: string;
  price: number; // najpogostejša cena v okolici (regulirana cena)
  cheapest: FuelStation | null; // najcenejša črpalka, če je cenejša od najpogostejše
  stations: number;
  change: { from: number; to: number; since: string } | null; // zadnja sprememba najpogostejše cene
  fetchedAt: string;
};

type Stored = { data?: FuelData; history?: Record<string, number> };

const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: TZ });

async function fetchStations(): Promise<FuelStation[]> {
  const lat = process.env.WEATHER_LAT ?? "46.5547";
  const lon = process.env.WEATHER_LON ?? "15.6459";
  let url: string | null = `${API}?${new URLSearchParams({ position: `${lat},${lon}`, radius: String(RADIUS_M) })}`;
  const out: FuelStation[] = [];
  for (let page = 0; url && page < MAX_PAGES; page += 1) {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`goriva.si HTTP ${res.status}`);
    const body: any = await res.json();
    for (const r of body?.results ?? []) {
      const price = Number(r?.prices?.[FUEL]);
      if (!Number.isFinite(price) || price <= 0) continue;
      out.push({ name: String(r.name), address: String(r.address ?? ""), price, distanceKm: Number(r.distance) / 1000 });
    }
    url = body?.next ?? null;
  }
  return out;
}

/** Najpogostejša cena (pri enakem številu nižja). */
function mode(prices: number[]): number {
  const counts = new Map<number, number>();
  for (const p of prices) counts.set(p, (counts.get(p) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
}

let inFlight: Promise<FuelData> | null = null;

export async function getFuel(): Promise<FuelData> {
  const raw = await storage.readItems("fuel");
  const stored: Stored = raw && !Array.isArray(raw) ? (raw as Stored) : {};
  if (stored.data && Date.now() - Date.parse(stored.data.fetchedAt) < REFRESH_MS) return stored.data;

  inFlight ??= (async () => {
    try {
      const stations = await fetchStations();
      if (!stations.length) throw new Error("no stations");
      const price = mode(stations.map((s) => s.price));
      const cheapest = [...stations].sort((a, b) => a.price - b.price || a.distanceKm - b.distanceKm)[0];

      // Dnevna zgodovina (največ ~1 leto) in zadnja sprememba cene.
      const history = { ...(stored.history ?? {}), [today()]: price };
      const days = Object.keys(history).sort().slice(-400);
      const trimmed = Object.fromEntries(days.map((d) => [d, history[d]]));
      let change: FuelData["change"] = null;
      for (let i = days.length - 1; i > 0; i -= 1) {
        if (trimmed[days[i]] !== trimmed[days[i - 1]]) {
          change = { from: trimmed[days[i - 1]], to: trimmed[days[i]], since: days[i] };
          break;
        }
      }

      const data: FuelData = {
        fuel: FUEL,
        price,
        cheapest: cheapest && cheapest.price < price ? cheapest : null,
        stations: stations.length,
        change,
        fetchedAt: new Date().toISOString(),
      };
      await storage.writeItems("fuel", { data, history: trimmed });
      return data;
    } finally {
      inFlight = null;
    }
  })();
  try {
    return await inFlight;
  } catch (e) {
    if (stored.data) return stored.data; // ob napaki pokaži zadnje znane cene
    throw e;
  }
}
