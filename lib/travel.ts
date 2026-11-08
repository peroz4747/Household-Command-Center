// Čas odhoda do naslednjega dogodka z lokacijo. Geokodiranje: OpenStreetMap Nominatim, pot: javni OSRM (brez prometa).
import { calendarId, getGoogleCalendar } from "./googleCalendar";

export type TravelHint = { title: string; start: string; location: string; minutes: number; leaveAt: string };

const UA = "HouseholdCommandCenter/1.0 (home dashboard)";
const LOOKAHEAD_MS = 24 * 3_600_000;
const CACHE_MS = 30 * 60_000;
const BUFFER_MIN = 5;
const geocoded = new Map<string, { lat: number; lon: number } | null>();
let cache: { at: number; item: TravelHint | null } | null = null;

async function geocode(place: string) {
  if (geocoded.has(place)) return geocoded.get(place)!;
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=si,at,hr,it,hu&q=${encodeURIComponent(place)}`;
  const res = await fetch(url, { cache: "no-store", headers: { "User-Agent": UA }, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error("geocode");
  const hit = ((await res.json()) as { lat: string; lon: string }[])[0];
  const point = hit ? { lat: Number(hit.lat), lon: Number(hit.lon) } : null;
  geocoded.set(place, point);
  return point;
}

export async function getTravelHint(): Promise<TravelHint | null> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.item;
  const now = new Date();
  const { data } = await getGoogleCalendar().events.list({
    calendarId,
    timeMin: now.toISOString(),
    timeMax: new Date(now.getTime() + LOOKAHEAD_MS).toISOString(),
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 20,
  });
  let item: TravelHint | null = null;
  for (const event of data.items ?? []) {
    const start = event.start?.dateTime;
    if (!start || !event.location) continue;
    const point = await geocode(event.location);
    if (!point) continue;
    const home = `${process.env.WEATHER_LON ?? 15.6459},${process.env.WEATHER_LAT ?? 46.5547}`;
    const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${home};${point.lon},${point.lat}?overview=false`, {
      cache: "no-store",
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) break;
    const seconds = ((await res.json()) as { routes?: { duration: number }[] }).routes?.[0]?.duration;
    if (seconds === undefined) break;
    const minutes = Math.ceil(seconds / 60);
    item = {
      title: event.summary ?? "",
      start,
      location: event.location,
      minutes,
      leaveAt: new Date(new Date(start).getTime() - (minutes + BUFFER_MIN) * 60_000).toISOString(),
    };
    break;
  }
  cache = { at: Date.now(), item };
  return item;
}
