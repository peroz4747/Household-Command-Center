// Obvestila na telefon prek ntfy (NTFY_TOPIC v .env). Preverjanje teče vsakih 5 minut.
// Pošiljamo samo povzetke; lokacije avta ali drugih občutljivih podatkov ne pošiljamo.
import fs from "node:fs/promises";
import net from "node:net";
import storage from "./storage";
import { CAR_MANUAL } from "./carManual";
import { calendarId, getGoogleCalendar } from "./googleCalendar";
import { getCar, refreshCar } from "./car";
import { getPcStatus } from "./pcControl";
import { getServerDetails } from "./server";
import { getStatus as getTvStatus } from "./tv";
import { getWarnings, type WeatherWarning } from "./warnings";
import { getFuel } from "./fuel";
import { getFuelAlert } from "./fuelAlert";
import { getNetworkOverview } from "./network";
import { getTankControl } from "./tankControl";
import { dailyForecast } from "./forecast";
import { cheapDay, formatWindow } from "./cheapPower";
import { recordOutage } from "./internetHistory";
import { translator } from "./i18n";
import type { MessageKey } from "./i18n";

type State = {
  sent?: Record<string, number>;
  internetDownSince?: number | null;
  running?: string[]; // gostje in Docker kontejnerji, ki so ob zadnjem preverjanju tekli
  stoppedAlerted?: string[]; // ustavljeni, o katerih smo že poslali obvestilo
  poolsAlerted?: string[];
};

const CPU_HOT = 85; // °C
const DISK_HOT: Record<string, number> = { hdd: 55, ssd: 70, nvme: 75 };
const FULL_PCT = 90;
const MORNING_HOUR = 7;
const sl = translator("sl");

const TICK_MS = 5 * 60_000;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const DASHBOARD_URL = "https://dashboard.home/";

export async function sendNotification(title: string, message: string, priority = 3, click = DASHBOARD_URL): Promise<boolean> {
  const topic = process.env.NTFY_TOPIC;
  if (!topic) return false;
  const res = await fetch(process.env.NTFY_URL ?? "https://ntfy.sh/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
    body: JSON.stringify({ topic, title, message, priority, click }),
  }).catch(() => null);
  return Boolean(res?.ok);
}

function localClock(date: Date) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Ljubljana", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })
      .formatToParts(date)
      .map((x) => [x.type, x.value]),
  );
  return { hour: Number(p.hour) % 24, minute: Number(p.minute), day: `${p.year}-${p.month}-${p.day}` };
}

function internetUp(): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "1.1.1.1", port: 443 });
    const done = (ok: boolean) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(4000, () => done(false));
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
  });
}

async function tick(): Promise<void> {
  const raw = await storage.readItems("notify");
  const state: State = raw && !Array.isArray(raw) ? raw : {};
  const sent = state.sent ?? {};
  const now = Date.now();
  const once = async (key: string, ttl: number, title: string, message: string, priority = 3) => {
    if (sent[key] && now - sent[key] < ttl) return;
    if (await sendNotification(title, message, priority)) sent[key] = now;
  };
  const section = async (fn: () => Promise<void>) => fn().catch(() => {});
  const clock = localClock(new Date(now));

  await section(async () => {
    const details = await getServerDetails();
    const badPools = new Set(state.poolsAlerted ?? []);
    for (const pool of details.pools) {
      if (pool.health !== "ONLINE") {
        await once(`pool:${pool.name}:${pool.health}`, 6 * HOUR, "Težava z ZFS bazenom", `Bazen ${pool.name} je v stanju ${pool.health}. Na dashboardu ga lahko varno izklopiš in znova vklopiš.`, 5);
        badPools.add(pool.name);
      } else if (badPools.delete(pool.name)) {
        await sendNotification("ZFS bazen spet deluje", `Bazen ${pool.name} je znova ONLINE.`);
      }
    }
    state.poolsAlerted = [...badPools];
    for (const disk of details.disks) {
      if (disk.health && !["PASSED", "OK", "UNKNOWN"].includes(disk.health.toUpperCase())) {
        await once(`disk:${disk.device}:${disk.health}`, DAY, "Težava z diskom", `${disk.model} (${disk.device}): ${disk.health}.`, 5);
      }
      const limit = DISK_HOT[disk.type] ?? DISK_HOT.ssd;
      if (disk.temp !== undefined && disk.temp >= limit) {
        await once(`disktemp:${disk.device}`, 6 * HOUR, "Disk se pregreva", `${disk.model} (${disk.device}) ima ${disk.temp} °C (meja ${limit} °C).`, 4);
      }
    }
    const cpuMax = details.cpuTemps?.length ? Math.max(...details.cpuTemps.map((t) => t.temp)) : null;
    if (cpuMax !== null && cpuMax >= CPU_HOT) await once("cputemp", 3 * HOUR, "Strežnik se pregreva", `Procesor ima ${cpuMax.toFixed(0)} °C (meja ${CPU_HOT} °C).`, 4);
    for (const s of [...details.storages, ...details.pools]) {
      if (s.percent >= FULL_PCT) {
        const step = Math.floor(s.percent / 5) * 5; // novo obvestilo pri vsakih dodatnih 5 %
        await once(`full:${s.name}:${step}`, 3 * DAY, "Zmanjkuje prostora", `${s.name} je zaseden ${s.percent.toFixed(0)} %.`, 4);
      }
    }
    const status = JSON.parse(await fs.readFile("/host-status/status.json", "utf8")) as { failedUnits?: string[] };
    if (status.failedUnits?.length) await once(`units:${status.failedUnits.join(",")}`, 12 * HOUR, "Storitev ne deluje", status.failedUnits.join(", "), 4);
  });

  await section(async () => {
    const today = Date.parse(`${clock.day}T00:00:00Z`);
    const deadlines: [string, string][] = [
      ["Zavarovanje", CAR_MANUAL.insurance],
      ["Registracija", CAR_MANUAL.registration],
      ["Vinjeta", CAR_MANUAL.vignette],
      ["Servis", CAR_MANUAL.service.date],
      ["Care Connect", CAR_MANUAL.careConnect],
    ];
    for (const [name, date] of deadlines) {
      const days = Math.round((Date.parse(`${date}T00:00:00Z`) - today) / DAY);
      if (days === 30 || days === 7 || days === 1) await once(`deadline:${name}:${date}:${days}`, 3 * DAY, `Rok: ${name}`, `${name} poteče čez ${days} dni (${date}).`);
    }
  });

  await section(async () => {
    const { data } = await getGoogleCalendar().events.list({
      calendarId,
      timeMin: new Date(now).toISOString(),
      timeMax: new Date(now + 30 * 60_000).toISOString(),
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 10,
    });
    for (const event of data.items ?? []) {
      const start = event.start?.dateTime;
      if (!start) continue;
      const minutes = Math.max(1, Math.round((new Date(start).getTime() - now) / 60_000));
      await once(`cal:${event.id}:${start}`, 2 * HOUR, "Dogodek v koledarju", `Čez ${minutes} min: ${event.summary ?? "dogodek"}`);
    }
  });

  if ((clock.hour === 23 && clock.minute >= 30) || clock.hour < 5) {
    await section(async () => {
      if ((await getPcStatus()).online) await once("night:pc", 10 * HOUR, "Prenosnik je še prižgan", "Prenosnik ponoči še vedno dela.");
    });
    await section(async () => {
      if ((await getTvStatus()).power === "on") await once("night:tv", 10 * HOUR, "Televizor je še prižgan", "Televizor ponoči še vedno dela.");
    });
  }

  if (clock.hour === 22 && (!sent["car:checked"] || now - sent["car:checked"] > 20 * HOUR)) {
    // Škoda API ima omejitev 20 klicev na uro, zato avto preverimo samo enkrat na večer.
    sent["car:checked"] = now;
    await section(async () => {
      if ((await refreshCar()).live?.locked === false) await once("car:unlocked", 20 * HOUR, "Avto ni zaklenjen", "Avto je zvečer odklenjen.", 4);
    });
  }

  await section(async () => {
    // Ustavljeni gostje in kontejnerji: obvestilo le ob prehodu "teče" → "ne teče".
    const overview = await getNetworkOverview();
    if (overview.errors.length) return; // ob delnih podatkih ne sklepamo, da se je kaj ustavilo
    const guests = overview.items.filter((i) => i.kind !== "node");
    const runningNow = guests.filter((i) => i.status === "running").map((i) => i.id);
    const tank = await getTankControl().catch(() => null);
    // Ob namernem izklopu bazena tank dashboard sam ustavi kontejnerje, ki ga uporabljajo.
    const tankWork = tank && tank.action === "export" && tank.status !== "error" && (!tank.finishedAt || now / 1000 - tank.finishedAt < 3600);
    const alerted = new Set(state.stoppedAlerted ?? []);
    if (state.running) {
      for (const id of state.running) {
        const g = guests.find((x) => x.id === id);
        if (runningNow.includes(id) || alerted.has(id) || tankWork) continue;
        const label = g ? `${g.name} (${g.kind === "docker" ? "Docker" : g.id.replace(/^.*\//, "CT/VM ")})` : id;
        await sendNotification("Kontejner se je ustavil", `${label} ne teče več${g ? ` (stanje: ${g.status})` : " (ni ga več na seznamu)"}.`, 4);
        alerted.add(id);
      }
    }
    for (const id of [...alerted]) {
      if (!runningNow.includes(id)) continue;
      alerted.delete(id);
      const g = guests.find((x) => x.id === id);
      await sendNotification("Kontejner spet teče", `${g?.name ?? id} je znova zagnan.`);
    }
    state.running = runningNow;
    state.stoppedAlerted = [...alerted];
  });

  await section(async () => {
    const { below } = await getFuelAlert();
    if (below === null) return;
    const fuel = await getFuel();
    const best = fuel.cheapest && fuel.cheapest.price < fuel.price ? fuel.cheapest : null;
    const price = Math.min(fuel.price, best?.price ?? Infinity);
    if (price > below) return;
    const where = best && best.price <= below ? ` Najceneje: ${best.name}, ${best.price.toFixed(3)} €.` : "";
    await once(`fuel:${below}:${price}`, 7 * DAY, "Bencin je pod tvojo mejo", `95: ${fuel.price.toFixed(3)} €/l (meja ${below.toFixed(3)} €).${where}`);
  });

  if (clock.hour >= 9 && clock.hour < 21) {
    await section(async () => {
      const [, month, dayOfMonth] = clock.day.split("-").map(Number);
      const { tyres } = await getCar();
      const year = clock.day.slice(0, 4);
      // Zimska oprema je obvezna od 15. 11. do 15. 3.
      if (tyres.mounted === "summer" && (month === 10 ? dayOfMonth >= 25 : month === 11 || month === 12 || month <= 3)) {
        const late = (month === 11 && dayOfMonth >= 15) || month === 12 || month <= 3;
        const week = Math.floor(Date.parse(clock.day) / (7 * DAY));
        await once(
          `tyres:winter:${year}:${late ? `w${week}` : month === 10 ? "oct" : dayOfMonth >= 8 ? "b" : "a"}`,
          5 * DAY,
          "Čas za zimske gume",
          late ? "Zimska oprema je obvezna od 15. 11., na avtu pa so po zapisu na dashboardu še letne gume." : "Zimska oprema bo obvezna od 15. 11. Na avtu so še letne gume.",
          late ? 4 : 3,
        );
      }
      if (tyres.mounted === "winter" && ((month === 3 && dayOfMonth >= 20) || month === 4)) {
        const week = Math.floor(Date.parse(clock.day) / (7 * DAY));
        const days = await dailyForecast(Number(process.env.WEATHER_LAT ?? 46.5547), Number(process.env.WEATHER_LON ?? 15.6459)).catch(() => []);
        const warm = days.slice(0, 7).length >= 5 && days.slice(0, 7).every((d) => d.low >= 3 && d.high >= 12);
        if (warm) await once(`tyres:summer:${year}:w${week}`, 6 * DAY, "Čas za letne gume", "Naslednji teden bo toplo (jutra nad 3 °C). Zimske gume lahko zamenjaš z letnimi.");
      }
    });
  }

  if (clock.hour === MORNING_HOUR && !sent[`morning:${clock.day}`]) {
    await section(async () => {
      const text = await morningSummary(clock.day);
      if (await sendNotification("Dobro jutro", text)) sent[`morning:${clock.day}`] = now;
    });
  }

  await section(async () => {
    if (await internetUp()) {
      if (state.internetDownSince) {
        const minutes = Math.round((now - state.internetDownSince) / 60_000);
        await recordOutage(state.internetDownSince, now).catch(() => {});
        if (minutes >= 5) await sendNotification("Internet spet deluje", `Povezava ni delovala približno ${minutes} min.`);
        state.internetDownSince = null;
      }
    } else if (!state.internetDownSince) state.internetDownSince = now;
  });

  await section(async () => {
    for (const warning of await getWarnings()) {
      if (warning.severity !== "Moderate" || STORM_ICE.test(warning.event)) await once(`warn:${warning.id}`, DAY, "Vremensko opozorilo", `${warning.event} (${warning.severity}) do ${new Date(warning.expires).toLocaleString("sl-SI", { timeZone: "Europe/Ljubljana" })}.`, 4);
    }
  });

  for (const [key, at] of Object.entries(sent)) if (now - at > 14 * DAY) delete sent[key];
  await storage.writeItems("notify", { ...state, sent });
}

// Neurje, veter, sneg in poledica: o teh obvestimo že pri zmerni stopnji (rumeno opozorilo).
const STORM_ICE = /thunder|storm|wind|snow|ice/i;

const severityLabel: Record<WeatherWarning["severity"], string> = { Moderate: "rumeno", Severe: "oranžno", Extreme: "rdeče" };

/** Jutranji povzetek: vreme, koledar, gorivo, cenejša elektrika in opozorila. */
async function morningSummary(day: string): Promise<string> {
  const lines: string[] = [];
  const lat = Number(process.env.WEATHER_LAT ?? 46.5547);
  const lon = Number(process.env.WEATHER_LON ?? 15.6459);
  const [weather, events, fuel, warnings] = await Promise.all([
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
      .then((r) => r.data.items ?? [])
      .catch(() => null),
    getFuel().catch(() => null),
    getWarnings().catch(() => []),
  ]);
  if (weather) {
    const key = `weather.code.${weather.weathercode}` as MessageKey;
    const desc = sl(key) === key ? "" : `${sl(key)}, `;
    const rain = weather.precipitationChance !== null && weather.precipitationChance >= 30 ? `, dež ${weather.precipitationChance} %` : "";
    lines.push(`🌤 ${desc}${Math.round(weather.low)}–${Math.round(weather.high)} °C${rain}`);
  }
  if (events) {
    const fmt = new Intl.DateTimeFormat("sl-SI", { timeZone: "Europe/Ljubljana", hour: "2-digit", minute: "2-digit" });
    const list = events.slice(0, 5).map((e) => `${e.start?.dateTime ? fmt.format(new Date(e.start.dateTime)) : "ves dan"} ${e.summary ?? "dogodek"}`);
    lines.push(list.length ? `📅 ${list.join("; ")}` : "📅 Danes ni dogodkov.");
  }
  if (fuel) {
    const change = fuel.change && fuel.change.since >= addDaysIso(day, -7) ? ` (${fuel.change.to > fuel.change.from ? "+" : ""}${(fuel.change.to - fuel.change.from).toFixed(3)} od ${fuel.change.since.slice(8, 10)}. ${fuel.change.since.slice(5, 7)}.)` : "";
    lines.push(`⛽ 95: ${fuel.price.toFixed(3)} €/l${change}`);
  }
  const cheap = cheapDay(day);
  const flat = cheap.windows.length === 1 && cheap.windows[0].from === 0 && cheap.windows[0].to === 24;
  lines.push(flat ? "⚡ Elektrika je danes ves dan približno enako poceni (nizka tarifa)." : `⚡ Najcenejša elektrika: ${cheap.windows.map(formatWindow).join(", ")}`);
  for (const w of warnings.slice(0, 3)) lines.push(`⚠️ ${w.event} (${severityLabel[w.severity]}) do ${new Date(w.expires).toLocaleString("sl-SI", { timeZone: "Europe/Ljubljana", weekday: "short", hour: "2-digit", minute: "2-digit" })}`);
  return lines.join("\n");
}

/** Polnoč v Ljubljani za dan YYYY-MM-DD (strežnik teče v UTC). */
function ljMidnight(day: string): number {
  for (const offset of ["+01:00", "+02:00"]) {
    const t = Date.parse(`${day}T00:00:00${offset}`);
    if (localClock(new Date(t)).hour === 0) return t;
  }
  return Date.parse(`${day}T00:00:00Z`);
}

const addDaysIso = (day: string, n: number) => new Date(Date.parse(`${day}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);

let running = false;
const safeTick = async () => {
  if (running || !process.env.NTFY_TOPIC) return;
  running = true;
  await tick().catch(() => {});
  running = false;
};

export function startNotifier(): void {
  setTimeout(() => void safeTick(), 60_000);
  setInterval(() => void safeTick(), TICK_MS);
}
