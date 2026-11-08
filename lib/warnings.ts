// Vremenska opozorila ARSO prek MeteoAlarma; prikažejo se tista, ki veljajo za lokacijo doma.
export type WeatherWarning = { id: string; event: string; severity: "Moderate" | "Severe" | "Extreme"; area: string; onset: string | null; expires: string };

const FEED = "https://feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-slovenia";
const CACHE_MS = 15 * 60_000;
let cache: { at: number; items: WeatherWarning[] } | null = null;

function inside(lat: number, lon: number, polygon: string): boolean {
  const points = polygon.trim().split(/\s+/).map((p) => p.split(",").map(Number));
  let hit = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [ai, bi] = points[i];
    const [aj, bj] = points[j];
    if (bi > lon !== bj > lon && lat < ((aj - ai) * (lon - bi)) / (bj - bi) + ai) hit = !hit;
  }
  return hit;
}

export async function getWarnings(): Promise<WeatherWarning[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.items;
  const res = await fetch(FEED, { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const lat = Number(process.env.WEATHER_LAT ?? 46.5547);
  const lon = Number(process.env.WEATHER_LON ?? 15.6459);
  const tag = (block: string, name: string) => block.match(new RegExp(`<cap:${name}>([^<]*)<`))?.[1]?.trim() ?? "";
  const items: WeatherWarning[] = [];
  for (const block of (await res.text()).match(/<entry>[\s\S]*?<\/entry>/g) ?? []) {
    const severity = tag(block, "severity");
    const expires = tag(block, "expires");
    const polygon = tag(block, "polygon");
    const area = tag(block, "areaDesc");
    if (severity !== "Moderate" && severity !== "Severe" && severity !== "Extreme") continue;
    if (!expires || new Date(expires).getTime() < Date.now()) continue;
    if (polygon ? !inside(lat, lon, polygon) : !/north-east/i.test(area)) continue;
    items.push({ id: `${tag(block, "event")}-${expires}`, event: tag(block, "event"), severity, area, onset: tag(block, "onset") || null, expires });
  }
  cache = { at: Date.now(), items };
  return items;
}
