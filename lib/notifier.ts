// Obvestila na telefon prek ntfy (NTFY_TOPIC v .env). Preverjanje teče vsakih 5 minut.
// Pošiljamo samo povzetke; lokacije avta ali drugih občutljivih podatkov ne pošiljamo.
import fs from "node:fs/promises";
import net from "node:net";
import storage from "./storage";
import { CAR_MANUAL } from "./carManual";
import { calendarId, getGoogleCalendar } from "./googleCalendar";
import { refreshCar } from "./car";
import { getPcStatus } from "./pcControl";
import { getServerDetails } from "./server";
import { getStatus as getTvStatus } from "./tv";
import { getWarnings } from "./warnings";

type State = { sent?: Record<string, number>; internetDownSince?: number | null };

const TICK_MS = 5 * 60_000;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const DASHBOARD_URL = "https://dashboard.home/";

export async function sendNotification(title: string, message: string, priority = 3): Promise<boolean> {
  const topic = process.env.NTFY_TOPIC;
  if (!topic) return false;
  const res = await fetch(process.env.NTFY_URL ?? "https://ntfy.sh/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
    body: JSON.stringify({ topic, title, message, priority, click: DASHBOARD_URL }),
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
    for (const pool of details.pools) {
      if (pool.health !== "ONLINE") await once(`pool:${pool.name}:${pool.health}`, 6 * HOUR, "Težava z ZFS bazenom", `Bazen ${pool.name} je v stanju ${pool.health}.`, 5);
    }
    for (const disk of details.disks) {
      if (disk.health && !["PASSED", "OK", "UNKNOWN"].includes(disk.health.toUpperCase())) {
        await once(`disk:${disk.device}:${disk.health}`, DAY, "Težava z diskom", `${disk.model} (${disk.device}): ${disk.health}.`, 5);
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
    if (await internetUp()) {
      if (state.internetDownSince) {
        const minutes = Math.round((now - state.internetDownSince) / 60_000);
        if (minutes >= 5) await sendNotification("Internet spet deluje", `Povezava ni delovala približno ${minutes} min.`);
        state.internetDownSince = null;
      }
    } else if (!state.internetDownSince) state.internetDownSince = now;
  });

  await section(async () => {
    for (const warning of await getWarnings()) {
      if (warning.severity !== "Moderate") await once(`warn:${warning.id}`, DAY, "Vremensko opozorilo", `${warning.event} (${warning.severity}) do ${new Date(warning.expires).toLocaleString("sl-SI", { timeZone: "Europe/Ljubljana" })}.`, 4);
    }
  });

  for (const [key, at] of Object.entries(sent)) if (now - at > 14 * DAY) delete sent[key];
  await storage.writeItems("notify", { ...state, sent });
}

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
