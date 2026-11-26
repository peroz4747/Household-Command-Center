// Obvestila na telefon prek ntfy (NTFY_TOPIC v .env). Preverjanje teče vsakih 5 minut.
// Pošiljamo samo povzetke; lokacije avta ali drugih občutljivih podatkov ne pošiljamo.
import fs from "node:fs/promises";
import net from "node:net";
import storage from "./storage";
import { CAR_MANUAL } from "./carManual";
import { calendarId, getGoogleCalendar } from "./googleCalendar";
import { getCar, refreshCar } from "./car";
import { getPcStatus } from "./pcControl";
import { getServerDetails, type TempSensor } from "./server";
import { pveGet } from "./proxmox";
import { getStatus as getTvStatus } from "./tv";
import { getWarnings } from "./warnings";
import { getFuel } from "./fuel";
import { getFuelAlert } from "./fuelAlert";
import { getNetworkOverview } from "./network";
import { getTankControl } from "./tankControl";
import { dailyForecast } from "./forecast";
import { recordOutage } from "./internetHistory";
import { saveMorningReport } from "./morningReport";
import { logNotification } from "./notifyLog";
import { addDeferred, clearDeferred, getDeferred, getNotifySettings, isQuiet, toMinutes, type NotifyCategory } from "./notifySettings";

type State = {
  sent?: Record<string, number>;
  internetDownSince?: number | null;
  running?: string[]; // gostje in Docker kontejnerji, ki so ob zadnjem preverjanju tekli
  stoppedAlerted?: string[]; // ustavljeni, o katerih smo že poslali obvestilo
  poolsAlerted?: string[];
  hotAlerted?: string[]; // senzorji, o katerih pregrevanju smo poslali obvestilo
};

const DASHBOARD_URL = "https://dashboard.home/";
// Meje pregrevanja po vrsti senzorja (°C); za neznane senzorje meja gonilnika - 5 °C ali 80 °C.
const SENSOR_HOT: Record<string, number> = { coretemp: 85, k10temp: 85, zenpower: 85, acpitz: 80, pch: 85, nvme: 75, drivetemp: 55, amdgpu: 90 };
const sensorLimit = (s: TempSensor) => SENSOR_HOT[s.chip.replace(/_.*$/, "")] ?? (s.max ? s.max - 5 : 80);
// Kritično: blizu meje, pri kateri se strojna oprema sama izklopi.
const sensorCritical = (s: TempSensor) => (s.crit ? s.crit - 5 : sensorLimit(s) + 10);
const SENSOR_NAME: Record<string, string> = { coretemp: "Procesor", k10temp: "Procesor", acpitz: "Matična plošča (ACPI)", nvme: "NVMe disk", drivetemp: "Disk", pch: "Čipovje" };
const PVE_URL = "https://192.168.1.10:8006/";
const HOT_ACTIONS: NtfyAction[] = [
  { action: "view", label: "Dashboard", url: DASHBOARD_URL },
  { action: "view", label: "Proxmox", url: PVE_URL },
];

/** Najbolj obremenjeni gostje (za navodila v obvestilu o pregrevanju). */
async function topGuests(): Promise<string> {
  const list = await pveGet<{ type: string; vmid: number; name?: string; status: string; cpu?: number; maxcpu?: number }[]>("/cluster/resources?type=vm").catch(() => []);
  return list
    .filter((g) => g.status === "running" && (g.cpu ?? 0) > 0.05)
    .sort((a, b) => (b.cpu ?? 0) * (b.maxcpu ?? 1) - (a.cpu ?? 0) * (a.maxcpu ?? 1))
    .slice(0, 3)
    .map((g) => `${g.type === "lxc" ? "CT" : "VM"} ${g.vmid} ${g.name ?? ""} ${Math.round((g.cpu ?? 0) * 100)} %`)
    .join(", ");
}

function hotSteps(critical: boolean, top: string, disk = false): string {
  const steps = [
    `1. Prek Tailscala odpri dashboard (gumb spodaj) → stanje strežnika: preveri obremenitev in temperature.`,
    top ? `2. Najbolj obremenjeni: ${top}. V Proxmoxu (gumb spodaj) izberi gosta → Shutdown, če ga ne rabiš.` : `2. V Proxmoxu (gumb spodaj) ustavi kontejnerje ali VM-je, ki jih ta čas ne rabiš.`,
    disk ? `3. Če gre za USB disk ZFS bazena: dashboard → ZFS bazen tank → Varno izklopi, nato ga lahko ugasneš.` : `3. Počakaj 10–15 min in preveri, ali temperatura pada (dobil boš obvestilo, ko bo spet normalna).`,
    critical
      ? `4. NUJNO: če ne pada, dashboard → Napajanje strežnika → Ugasni. Pozor: ugasne se tudi Tailscale in DNS, prižgeš ga lahko le doma ali z urnikom.`
      : `4. Če se segreva naprej (dobil boš nujno obvestilo), strežnik ugasni: dashboard → Napajanje strežnika → Ugasni.`,
    `Doma: preveri ventilatorje, prah in zračenje okoli strežnika.`,
  ];
  return steps.join("\n");
}
// HDD v USB ohišju v mirovanju ~45 °C; opozorilo prej, nujno pri 63 °C (varna meja diskov je 60 °C).
const DISK_HOT: Record<string, number> = { hdd: 50, ssd: 70, nvme: 75 };
const DISK_CRIT: Record<string, number> = { hdd: 63, ssd: 78, nvme: 83 };
const FULL_PCT = 90;
const MORNING_TITLE = "Dobro jutro";

const TICK_MS = 5 * 60_000;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

type NtfyAction = { action: "view"; label: string; url: string; clear?: boolean };

/**
 * Pošlje obvestilo. Z navedeno vrsto (category) veljajo nastavitve obvestil: izklopljena vrsta se ne pošlje,
 * med tihimi urami se nenujno obvestilo shrani in pošlje v povzetku po koncu tihih ur. Vrne true, ko je obdelano.
 */
export async function sendNotification(title: string, message: string, priority = 3, click = DASHBOARD_URL, actions?: NtfyAction[], category?: NotifyCategory): Promise<boolean> {
  const topic = process.env.NTFY_TOPIC;
  if (!topic) return false;
  if (category) {
    const settings = await getNotifySettings();
    if (!settings.enabled[category]) {
      if (category !== "morning") await logNotification(title, message).catch(() => {});
      return true;
    }
    const clock = localClock(new Date());
    const urgent = priority >= 5 && settings.quiet.allowUrgent;
    if (category !== "morning" && !urgent && isQuiet(settings, clock.hour * 60 + clock.minute)) {
      await addDeferred({ at: Date.now(), title, message: message.split("\n")[0].slice(0, 200) });
      await logNotification(title, message).catch(() => {});
      return true;
    }
  }
  const res = await fetch(process.env.NTFY_URL ?? "https://ntfy.sh/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
    body: JSON.stringify({ topic, title, message, priority, click, ...(actions?.length ? { actions } : {}) }),
  }).catch(() => null);
  // Beležimo le opozorila (ne jutranjega poročila, povzetka tihih ur ali ročno poslanih stvari, npr. izletov).
  if (res?.ok && category && category !== "morning") await logNotification(title, message).catch(() => {});
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
  const once = async (category: NotifyCategory, key: string, ttl: number, title: string, message: string, priority = 3, actions?: NtfyAction[]) => {
    if (sent[key] && now - sent[key] < ttl) return;
    if (await sendNotification(title, message, priority, DASHBOARD_URL, actions, category)) sent[key] = now;
  };
  const notify = (category: NotifyCategory, title: string, message: string, priority = 3) => sendNotification(title, message, priority, DASHBOARD_URL, undefined, category);
  const section = async (fn: () => Promise<void>) => fn().catch(() => {});
  const clock = localClock(new Date(now));
  const settings = await getNotifySettings();

  // Po koncu tihih ur pošljemo povzetek obvestil, ki so se zbrala.
  if (!isQuiet(settings, clock.hour * 60 + clock.minute)) {
    await section(async () => {
      const deferred = await getDeferred();
      if (!deferred.length) return;
      const fmt = new Intl.DateTimeFormat("sl-SI", { timeZone: "Europe/Ljubljana", hour: "2-digit", minute: "2-digit" });
      const lines = deferred.slice(-10).map((n) => `${fmt.format(new Date(n.at))} ${n.title}: ${n.message}`);
      if (deferred.length > 10) lines.unshift(`… in še ${deferred.length - 10} starejših`);
      if (await sendNotification(`Med tihimi urami (${deferred.length})`, lines.join("\n"))) await clearDeferred();
    });
  }

  await section(async () => {
    const details = await getServerDetails();
    const badPools = new Set(state.poolsAlerted ?? []);
    for (const pool of details.pools) {
      if (pool.health !== "ONLINE") {
        await once("storage", `pool:${pool.name}:${pool.health}`, 6 * HOUR, "Težava z ZFS bazenom", `Bazen ${pool.name} je v stanju ${pool.health}. Na dashboardu ga lahko varno izklopiš in znova vklopiš.`, 5);
        badPools.add(pool.name);
      } else if (badPools.delete(pool.name)) {
        await notify("storage", "ZFS bazen spet deluje", `Bazen ${pool.name} je znova ONLINE.`);
      }
    }
    state.poolsAlerted = [...badPools];
    const hot = new Set(state.hotAlerted ?? []);
    for (const disk of details.disks) {
      if (disk.health && !["PASSED", "OK", "UNKNOWN"].includes(disk.health.toUpperCase())) {
        await once("storage", `disk:${disk.device}:${disk.health}`, DAY, "Težava z diskom", `${disk.model} (${disk.device}): ${disk.health}.`, 5);
      }
      const limit = DISK_HOT[disk.type] ?? DISK_HOT.ssd;
      const diskKey = `disk:${disk.device}`;
      if (disk.temp !== undefined && disk.temp >= limit) {
        const critical = disk.temp >= (DISK_CRIT[disk.type] ?? limit + 8);
        await once(
          "serverTemp",
          `disktemp:${disk.device}:${critical ? "crit" : "hot"}`,
          critical ? HOUR : 6 * HOUR,
          critical ? "NUJNO: disk se močno pregreva" : "Disk se pregreva",
          `${disk.model} (${disk.device}) ima ${disk.temp} °C (meja ${limit} °C).\n\nKaj narediti na daljavo:\n${hotSteps(critical, await topGuests(), true)}`,
          critical ? 5 : 4,
          HOT_ACTIONS,
        );
        hot.add(diskKey);
      } else if (disk.temp !== undefined && disk.temp < limit - 3 && hot.delete(diskKey)) {
        await notify("serverTemp", "Temperatura diska je spet normalna", `${disk.model} (${disk.device}): ${disk.temp} °C.`);
      }
    }
    // Vsi senzorji hosta; po čipu obvestimo o najbolj vročem (npr. ne 6× za vsako jedro posebej).
    const sensors: TempSensor[] = details.sensors ?? (details.cpuTemps ?? []).map((t) => ({ chip: "coretemp", label: t.label, temp: t.temp, max: null, crit: null }));
    const chips = new Map<string, TempSensor>();
    for (const x of sensors) if (!chips.has(x.chip) || x.temp - sensorLimit(x) > chips.get(x.chip)!.temp - sensorLimit(chips.get(x.chip)!)) chips.set(x.chip, x);
    for (const [chip, x] of chips) {
      const key = `sensor:${chip}`;
      const limit = sensorLimit(x);
      if (x.temp >= limit) {
        const critical = x.temp >= sensorCritical(x);
        const name = `${SENSOR_NAME[chip.replace(/_.*$/, "")] ?? chip} (${x.label})`;
        await once(
          "serverTemp",
          `${key}:${critical ? "crit" : "hot"}`,
          critical ? HOUR : 3 * HOUR,
          critical ? "NUJNO: strežnik se močno pregreva" : "Strežnik se pregreva",
          `${name}: ${x.temp.toFixed(0)} °C (meja ${limit.toFixed(0)} °C${x.crit ? `, izklop pri ${x.crit.toFixed(0)} °C` : ""}).\nObremenitev CPU: ${details.cpu.percent.toFixed(0)} %.\n\nKaj narediti na daljavo:\n${hotSteps(critical, await topGuests())}`,
          critical ? 5 : 4,
          HOT_ACTIONS,
        );
        hot.add(key);
      } else if (x.temp < limit - 5 && hot.delete(key)) {
        await notify("serverTemp", "Temperatura strežnika je spet normalna", `${SENSOR_NAME[chip] ?? chip}: ${x.temp.toFixed(0)} °C.`);
      }
    }
    state.hotAlerted = [...hot];
    for (const s of [...details.storages, ...details.pools]) {
      if (s.percent >= FULL_PCT) {
        const step = Math.floor(s.percent / 5) * 5; // novo obvestilo pri vsakih dodatnih 5 %
        await once("storage", `full:${s.name}:${step}`, 3 * DAY, "Zmanjkuje prostora", `${s.name} je zaseden ${s.percent.toFixed(0)} %.`, 4);
      }
    }
    const status = JSON.parse(await fs.readFile("/host-status/status.json", "utf8")) as { failedUnits?: string[] };
    if (status.failedUnits?.length) await once("services", `units:${status.failedUnits.join(",")}`, 12 * HOUR, "Storitev ne deluje", status.failedUnits.join(", "), 4);
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
      if (days === 30 || days === 7 || days === 1) await once("deadlines", `deadline:${name}:${date}:${days}`, 3 * DAY, `Rok: ${name}`, `${name} poteče čez ${days} dni (${date}).`);
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
      await once("calendar", `cal:${event.id}:${start}`, 2 * HOUR, "Dogodek v koledarju", `Čez ${minutes} min: ${event.summary ?? "dogodek"}`);
    }
  });

  if ((clock.hour === 23 && clock.minute >= 30) || clock.hour < 5) {
    await section(async () => {
      if ((await getPcStatus()).online) await once("devicesNight", "night:pc", 10 * HOUR, "Prenosnik je še prižgan", "Prenosnik ponoči še vedno dela.");
    });
    await section(async () => {
      if ((await getTvStatus()).power === "on") await once("devicesNight", "night:tv", 10 * HOUR, "Televizor je še prižgan", "Televizor ponoči še vedno dela.");
    });
  }

  if (clock.hour === 22 && (!sent["car:checked"] || now - sent["car:checked"] > 20 * HOUR)) {
    // Škoda API ima omejitev 20 klicev na uro, zato avto preverimo samo enkrat na večer.
    sent["car:checked"] = now;
    await section(async () => {
      if ((await refreshCar()).live?.locked === false) await once("car", "car:unlocked", 20 * HOUR, "Avto ni zaklenjen", "Avto je zvečer odklenjen.", 4);
    });
  }

  await section(async () => {
    // Ustavljeni gostje in kontejnerji: obvestilo le ob prehodu "teče" → "ne teče".
    const overview = await getNetworkOverview();
    if (overview.errors.length) return; // ob delnih podatkih ne sklepamo, da se je kaj ustavilo
    // Docker kontejner ob vsaki posodobitvi dobi nov ID, zato ga prepoznamo po imenu.
    const keyOf = (i: (typeof overview.items)[number]) => (i.kind === "docker" ? `docker:${i.name}` : i.id);
    const guests = overview.items.filter((i) => i.kind !== "node").map((i) => ({ ...i, id: keyOf(i) }));
    const runningNow = guests.filter((i) => i.status === "running").map((i) => i.id);
    const tank = await getTankControl().catch(() => null);
    // Ob namernem izklopu bazena tank dashboard sam ustavi kontejnerje, ki ga uporabljajo.
    const tankWork = tank && tank.action === "export" && tank.status !== "error" && (!tank.finishedAt || now / 1000 - tank.finishedAt < 3600);
    // Obvestila za gostje, ki jih ni več na seznamu (odstranjeni, stari ključi), pozabimo.
    const alerted = new Set((state.stoppedAlerted ?? []).filter((id) => guests.some((g) => g.id === id)));
    if (state.running) {
      for (const id of state.running.filter((r) => !r.startsWith("docker/"))) {
        const g = guests.find((x) => x.id === id);
        if (runningNow.includes(id) || alerted.has(id) || tankWork) continue;
        const label = g ? `${g.name} (${g.kind === "docker" ? "Docker" : g.id.replace(/^.*\//, "CT/VM ")})` : id;
        await notify("services", "Kontejner se je ustavil", `${label} ne teče več${g ? ` (stanje: ${g.status})` : " (ni ga več na seznamu)"}.`, 4);
        alerted.add(id);
      }
    }
    for (const id of [...alerted]) {
      if (!runningNow.includes(id)) continue;
      alerted.delete(id);
      const g = guests.find((x) => x.id === id);
      await notify("services", "Kontejner spet teče", `${g?.name ?? id} je znova zagnan.`);
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
    await once("fuel", `fuel:${below}:${price}`, 7 * DAY, "Bencin je pod tvojo mejo", `95: ${fuel.price.toFixed(3)} €/l (meja ${below.toFixed(3)} €).${where}`);
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
          "tyres",
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
        if (warm) await once("tyres", `tyres:summer:${year}:w${week}`, 6 * DAY, "Čas za letne gume", "Naslednji teden bo toplo (jutra nad 3 °C). Zimske gume lahko zamenjaš z letnimi.");
      }
    });
  }

  // Jutranje poročilo ob nastavljeni uri (zamuda do ene ure, npr. po ponovnem zagonu, je še v redu).
  const minutesNow = clock.hour * 60 + clock.minute;
  const morningAt = toMinutes(settings.morningAt);
  if (minutesNow >= morningAt && minutesNow < morningAt + 60 && !sent[`morning:${clock.day}`]) {
    await section(async () => {
      if (!settings.enabled.morning) return void (sent[`morning:${clock.day}`] = now);
      await saveMorningReport(clock.day);
      if (await sendNotification(MORNING_TITLE, "Vaše jutranje poročilo je pripravljeno.", 3, `${DASHBOARD_URL}?porocilo=${clock.day}`, undefined, "morning")) sent[`morning:${clock.day}`] = now;
    });
  }

  await section(async () => {
    if (await internetUp()) {
      if (state.internetDownSince) {
        const minutes = Math.round((now - state.internetDownSince) / 60_000);
        await recordOutage(state.internetDownSince, now).catch(() => {});
        if (minutes >= 5) await notify("internet", "Internet spet deluje", `Povezava ni delovala približno ${minutes} min.`);
        state.internetDownSince = null;
      }
    } else if (!state.internetDownSince) state.internetDownSince = now;
  });

  await section(async () => {
    for (const warning of await getWarnings()) {
      if (warning.severity !== "Moderate" || STORM_ICE.test(warning.event)) await once("weather", `warn:${warning.id}`, DAY, "Vremensko opozorilo", `${warning.event} (${warning.severity}) do ${new Date(warning.expires).toLocaleString("sl-SI", { timeZone: "Europe/Ljubljana" })}.`, 4);
    }
  });

  for (const [key, at] of Object.entries(sent)) if (now - at > 14 * DAY) delete sent[key];
  await storage.writeItems("notify", { ...state, sent });
}

// Neurje, veter, sneg in poledica: o teh obvestimo že pri zmerni stopnji (rumeno opozorilo).
const STORM_ICE = /thunder|storm|wind|snow|ice/i;

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
