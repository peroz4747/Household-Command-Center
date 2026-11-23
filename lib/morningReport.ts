// Jutranje poročilo: vreme, koledar, gorivo, cenejša elektrika, opozorila in top 3 lokalne novice.
// Notifier ga ob 5:00 sestavi in shrani; obvestilo vodi na dashboard (?porocilo=YYYY-MM-DD), kjer se odpre v oknu.
import storage from "./storage";
import { calendarId, getGoogleCalendar } from "./googleCalendar";
import { getWarnings, type WeatherWarning } from "./warnings";
import { getFuel } from "./fuel";
import { dailyForecast } from "./forecast";
import { cheapDay, formatWindow } from "./cheapPower";
import { getNewsByTopics } from "./newsTop";

export type MorningReport = {
  day: string;
  generatedAt: number;
  weather: { weathercode: number; low: number; high: number; precipitationChance: number | null; windMaxKmh: number } | null;
  events: { time: string | null; title: string }[] | null; // null = koledar ni dosegljiv
  fuel: { price: number; change: { diff: number; since: string } | null } | null;
  power: { flat: boolean; windows: string[] };
  warnings: { event: string; severity: WeatherWarning["severity"]; expires: string }[];
  news: { title: string; source: string; url: string; lead: string; alsoOn: string[]; published?: number }[];
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

export async function buildMorningReport(day: string): Promise<MorningReport> {
  const lat = Number(process.env.WEATHER_LAT ?? 46.5547);
  const lon = Number(process.env.WEATHER_LON ?? 15.6459);
  const fmt = new Intl.DateTimeFormat("sl-SI", { timeZone: "Europe/Ljubljana", hour: "2-digit", minute: "2-digit" });
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
