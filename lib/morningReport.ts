// Jutranje poročilo: vreme, koledar, gorivo, cenejša elektrika, opozorila in top 3 lokalne novice.
// Notifier ga ob 5:00 sestavi in shrani; obvestilo vodi na dashboard (?porocilo=YYYY-MM-DD), kjer se odpre v oknu.
import storage from "./storage";
import { calendarId, getGoogleCalendar } from "./googleCalendar";
import { getWarnings, type WeatherWarning } from "./warnings";
import { getFuel } from "./fuel";
import { dailyForecast } from "./forecast";
import { cheapDay, formatWindow } from "./cheapPower";
import { getNewsByTopics } from "./newsTop";
import { getCar } from "./car";
import { getInternetHistory } from "./internetHistory";
import { runHealthCheck } from "./server";
import { getMarkets } from "./markets";
import { getNotificationLog } from "./notifyLog";

export type MorningReport = {
  day: string;
  generatedAt: number;
  weather: { weathercode: number; low: number; high: number; precipitationChance: number | null; windMaxKmh: number } | null;
  events: { time: string | null; title: string }[] | null; // null = koledar ni dosegljiv
  fuel: { price: number; change: { diff: number; since: string } | null } | null;
  power: { flat: boolean; windows: string[] };
  warnings: { event: string; severity: WeatherWarning["severity"]; expires: string }[];
  news: { title: string; source: string; url: string; lead: string; alsoOn: string[]; published?: number }[];
  // Dodano 23. 11. 2026; starejša shranjena poročila teh polj nimajo.
  car?: {
    fuelPercent: number | null;
    rangeKm: number | null;
    locked: boolean | null;
    doorsOpen: boolean | null;
    windowsOpen: boolean | null;
    address: string | null;
    capturedAt: string | null;
    tyresWarning: boolean; // poletne gume v obdobju obvezne zimske opreme
  } | null;
  night?: {
    since: number;
    alerts: { at: number; title: string; message: string }[];
    outages: { from: number; to: number }[];
    speed: { downloadMbps: number | null; uploadMbps: number | null; pingMs: number | null; at: number } | null;
    health: { overall: string; issues: { label: string; status: string; detail: string }[] } | null;
  };
  sun?: { sunrise: string; sunset: string; daylightMin: number; changeMin: number | null } | null;
  air?: { aqi: number | null; pm10: number | null; pm25: number | null; pollen: { name: string; value: number }[] } | null; // name = ključ report.pollen.*
  markets?: { name: string; price: number; changePct: number | null; currency: string | null }[] | null;
};

const DAY = 86_400_000;
const KEEP_DAYS = 14;
const STORE = "morning-reports";

const addDaysIso = (day: string, n: number) => new Date(Date.parse(`${day}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const ljHour = (t: number) => Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Ljubljana", hour: "2-digit", hour12: false }).format(new Date(t))) % 24;
export const ljToday = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Ljubljana" });

/** Polnoč v Ljubljani za dan YYYY-MM-DD (strežnik teče v UTC). */
function ljMidnight(day: string): number {
  for (const offset of ["+01:00", "+02:00"]) {
    const t = Date.parse(`${day}T00:00:00${offset}`);
    if (ljHour(t) === 0) return t;
  }
  return Date.parse(`${day}T00:00:00Z`);
}

/** Top 3 lokalne novice zadnjih 24 ur: najprej zgodbe, ki jih je pokrilo več redakcij, nato najnovejše. */
async function localNews(): Promise<MorningReport["news"]> {
  const { items } = await getNewsByTopics("24h", ["maribor"]);
  return items
    .map((item, i) => ({ item, i }))
    .sort((a, b) => b.item.alsoOn.length - a.item.alsoOn.length || a.i - b.i)
    .slice(0, 3)
    .map(({ item }) => ({ title: item.title, source: item.category, url: item.url, lead: item.lead, alsoOn: item.alsoOn, published: item.published }));
}

/** Obdobje obvezne zimske opreme: 15. 11. – 15. 3. */
const winterGear = (day: string) => {
  const md = day.slice(5);
  return md >= "11-15" || md <= "03-15";
};

async function carStatus(day: string): Promise<MorningReport["car"]> {
  const car = await getCar();
  const tyresWarning = winterGear(day) && car.tyres.mounted === "summer";
  const live = car.live;
  if (!live) return tyresWarning ? { fuelPercent: null, rangeKm: null, locked: null, doorsOpen: null, windowsOpen: null, address: null, capturedAt: null, tyresWarning } : null;
  return {
    fuelPercent: live.fuelPercent,
    rangeKm: live.rangeKm,
    locked: live.locked,
    doorsOpen: live.doorsOpen,
    windowsOpen: live.windowsOpen,
    address: live.parking.address,
    capturedAt: live.capturedAt,
    tyresWarning,
  };
}

/** Ponoči: od 20:00 prejšnjega dne. Poslana opozorila, izpadi interneta, zadnji speedtest in trenutni pregled strežnika. */
async function nightStatus(day: string): Promise<NonNullable<MorningReport["night"]>> {
  const since = ljMidnight(day) - 4 * 3_600_000;
  const [log, history, health] = await Promise.all([
    getNotificationLog().catch(() => []),
    getInternetHistory().catch(() => null),
    Promise.race([runHealthCheck("sl"), new Promise<null>((r) => setTimeout(() => r(null), 45_000))]).catch(() => null),
  ]);
  const last = history?.speed.filter((s) => s.downloadMbps !== null).at(-1) ?? null;
  return {
    since,
    alerts: log.filter((n) => n.at >= since),
    outages: (history?.outages ?? []).filter((o) => o.to >= since),
    speed: last && { downloadMbps: last.downloadMbps, uploadMbps: last.uploadMbps, pingMs: last.pingMs, at: last.at },
    health: health && {
      overall: health.overall,
      issues: health.checks.filter((c) => c.status === "warn" || c.status === "fail").map((c) => ({ label: c.label, status: c.status, detail: c.detail })),
    },
  };
}

const OM = { signal: () => AbortSignal.timeout(20_000), cache: "no-store" as const };

async function sunTimes(day: string, lat: number, lon: number): Promise<MorningReport["sun"]> {
  const q = new URLSearchParams({ latitude: String(lat), longitude: String(lon), daily: "sunrise,sunset,daylight_duration", timezone: "Europe/Ljubljana", start_date: addDaysIso(day, -1), end_date: day });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${q}`, { cache: OM.cache, signal: OM.signal() });
  if (!res.ok) return null;
  const d = (await res.json()).daily as { sunrise: string[]; sunset: string[]; daylight_duration: number[] };
  const i = d.sunrise.length - 1;
  if (i < 0) return null;
  return {
    sunrise: d.sunrise[i].slice(11, 16),
    sunset: d.sunset[i].slice(11, 16),
    daylightMin: Math.round(d.daylight_duration[i] / 60),
    changeMin: i > 0 ? Math.round((d.daylight_duration[i] - d.daylight_duration[i - 1]) / 60) : null,
  };
}

const POLLEN: [string, string][] = [
  ["alder_pollen", "alder"],
  ["birch_pollen", "birch"],
  ["grass_pollen", "grass"],
  ["mugwort_pollen", "mugwort"],
  ["olive_pollen", "olive"],
  ["ragweed_pollen", "ragweed"],
];

/** Kakovost zraka čez dan (7–22 h): največji evropski indeks (EAQI) in delci; cvetni prah, kadar ga je kaj (zrna/m³). */
async function airQuality(day: string, lat: number, lon: number): Promise<MorningReport["air"]> {
  const q = new URLSearchParams({ latitude: String(lat), longitude: String(lon), hourly: ["european_aqi", "pm10", "pm2_5", ...POLLEN.map((p) => p[0])].join(","), timezone: "Europe/Ljubljana", start_date: day, end_date: day });
  const res = await fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?${q}`, { cache: OM.cache, signal: OM.signal() });
  if (!res.ok) return null;
  const h = (await res.json()).hourly as Record<string, (number | null)[]> & { time: string[] };
  const daytime = (key: string) => {
    const values = (h[key] ?? []).filter((v, i): v is number => v !== null && Number(h.time[i].slice(11, 13)) >= 7 && Number(h.time[i].slice(11, 13)) <= 22);
    return values.length ? Math.max(...values) : null;
  };
  const round = (v: number | null) => (v === null ? null : Math.round(v));
  const pollen = POLLEN.map(([key, name]) => ({ name, value: Math.round(daytime(key) ?? 0) })).filter((p) => p.value >= 10);
  return { aqi: round(daytime("european_aqi")), pm10: round(daytime("pm10")), pm25: round(daytime("pm2_5")), pollen };
}

/** Borze: indeksi, delnice in tečaji (zlato, nafta in bitcoin so na željo uporabnika izpuščeni). */
async function marketSummary(): Promise<MorningReport["markets"]> {
  const quotes = await getMarkets("1d");
  return quotes
    .filter((q) => (q.group === "index" || q.group === "stock" || q.group === "fx") && q.price !== null)
    .map((q) => ({
      name: q.name,
      price: q.price!,
      changePct: q.previousClose ? ((q.price! - q.previousClose) / q.previousClose) * 100 : null,
      currency: q.currency,
    }));
}

export async function buildMorningReport(day: string): Promise<MorningReport> {
  const lat = Number(process.env.WEATHER_LAT ?? 46.5547);
  const lon = Number(process.env.WEATHER_LON ?? 15.6459);
  const fmt = new Intl.DateTimeFormat("sl-SI", { timeZone: "Europe/Ljubljana", hour: "2-digit", minute: "2-digit" });
  const extras = Promise.all([
    carStatus(day).catch(() => null),
    nightStatus(day),
    sunTimes(day, lat, lon).catch(() => null),
    airQuality(day, lat, lon).catch(() => null),
    marketSummary().catch(() => null),
  ]);
  const [weather, events, fuel, warnings, news] = await Promise.all([
    dailyForecast(lat, lon).then((d) => d.find((x) => x.date === day) ?? null).catch(() => null),
    getGoogleCalendar()
      .events.list({
        calendarId,
        timeMin: new Date(ljMidnight(day)).toISOString(),
        timeMax: new Date(ljMidnight(addDaysIso(day, 1))).toISOString(),
        singleEvents: true,
        orderBy: "startTime",
        maxResults: 8,
        timeZone: "Europe/Ljubljana",
      })
      .then((r) => (r.data.items ?? []).map((e) => ({ time: e.start?.dateTime ? fmt.format(new Date(e.start.dateTime)) : null, title: e.summary ?? "" })))
      .catch(() => null),
    getFuel().catch(() => null),
    getWarnings().catch(() => [] as WeatherWarning[]),
    localNews().catch(() => []),
  ]);
  const [car, night, sun, air, markets] = await extras;
  const cheap = cheapDay(day);
  const flat = cheap.windows.length === 1 && cheap.windows[0].from === 0 && cheap.windows[0].to === 24;
  return {
    day,
    generatedAt: Date.now(),
    weather: weather && { weathercode: weather.weathercode, low: weather.low, high: weather.high, precipitationChance: weather.precipitationChance, windMaxKmh: weather.windMaxKmh },
    events,
    fuel: fuel && {
      price: fuel.price,
      change: fuel.change && fuel.change.since >= addDaysIso(day, -7) ? { diff: fuel.change.to - fuel.change.from, since: fuel.change.since } : null,
    },
    power: { flat, windows: flat ? [] : cheap.windows.map(formatWindow) },
    warnings: warnings.slice(0, 5).map((w) => ({ event: w.event, severity: w.severity, expires: w.expires })),
    news,
    car,
    night,
    sun,
    air,
    markets,
  };
}

async function readAll(): Promise<Record<string, MorningReport>> {
  const raw = await storage.readItems(STORE).catch(() => null);
  return raw && !Array.isArray(raw) ? (raw as Record<string, MorningReport>) : {};
}

/** Sestavi in shrani poročilo za dan (ob pošiljanju obvestila). */
export async function saveMorningReport(day: string): Promise<MorningReport> {
  const report = await buildMorningReport(day);
  const all = await readAll();
  all[day] = report;
  for (const key of Object.keys(all)) if (key < addDaysIso(day, -KEEP_DAYS)) delete all[key];
  await storage.writeItems(STORE, all);
  return report;
}

/** Shranjeno poročilo za dan; za danes brez shranjenega (pred 5:00 ali ob napaki) ga sestavi sproti. */
export async function getMorningReport(day: string): Promise<MorningReport | null> {
  const stored = (await readAll())[day];
  if (stored) return stored;
  return day === ljToday() ? buildMorningReport(day) : null;
}
