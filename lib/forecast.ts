// Dnevna napoved Open-Meteo za poljubno točko (jutranji povzetek, vreme na cilju poti).
export type DailyForecast = {
  date: string; // YYYY-MM-DD (lokalni čas kraja)
  high: number;
  low: number;
  weathercode: number;
  precipitationMm: number;
  precipitationChance: number | null; // %
  windMaxKmh: number;
};

const FORECAST_DAYS = 16; // največ, kar ponudi Open-Meteo
const CACHE_MS = 30 * 60_000;
const cache = new Map<string, { at: number; days: DailyForecast[] }>();

export async function dailyForecast(lat: number, lon: number): Promise<DailyForecast[]> {
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const had = cache.get(key);
  if (had && Date.now() - had.at < CACHE_MS) return had.days;
  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    daily: "temperature_2m_max,temperature_2m_min,weathercode,precipitation_sum,precipitation_probability_max,wind_speed_10m_max",
    timezone: "auto",
    forecast_days: String(FORECAST_DAYS),
  });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`open-meteo HTTP ${res.status}`);
  const d: any = (await res.json()).daily;
  const days: DailyForecast[] = (d?.time ?? []).map((date: string, i: number) => ({
    date,
    high: d.temperature_2m_max[i],
    low: d.temperature_2m_min[i],
    weathercode: d.weathercode[i],
    precipitationMm: d.precipitation_sum?.[i] ?? 0,
    precipitationChance: d.precipitation_probability_max?.[i] ?? null,
    windMaxKmh: d.wind_speed_10m_max?.[i] ?? 0,
  }));
  if (cache.size > 200) cache.clear();
  cache.set(key, { at: Date.now(), days });
  return days;
}
