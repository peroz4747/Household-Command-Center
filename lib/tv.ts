// Samsung TV (Tizen) prek lokalnega API-ja: tipke daljinca in zagon aplikacij prek WebSocketa (port 8002),
// stanje prek REST (port 8001), prižiganje z Wake-on-LAN.
// Ob prvi povezavi TV vpraša "Dovoli"; žeton se shrani v data/tv.json.
import dgram from "node:dgram";
import WebSocket from "ws";
import storage from "./storage";

const HOST = process.env.TV_HOST ?? "192.168.1.2";
const MAC = process.env.TV_MAC ?? "74:6d:fa:c8:ff:5b";
const CLIENT_NAME = "Dashboard"; // žeton je vezan na to ime
const CONNECT_TIMEOUT_MS = 8000;
const NETFLIX_START_MS = 12_000;
const NETFLIX_PROFILE_MS = 8000;
const NETFLIX_NAV_MS = 1000;
const NETFLIX_TYPE_MS = 230;
const NETFLIX_DETAILS_MS = 3000;
const NETFLIX_SEARCH_CHARS = 12;
const HBO_START_MS = 14_000;
const HBO_PROFILE_MS = 9000;
const HBO_NAV_MS = 1200;
const HBO_KEYBOARD_MS = 3500;
const HBO_KEYBOARD = ["abcdef", "ghijkl", "mnopqr", "stuvwx", "yz0123", "456789"];
const NETFLIX_KEYBOARD = ["abcdef", "ghijkl", "mnopqr", "stuvwx", "yz1234", "567890"];

export const TV_APPS = {
  netflix: "3201907018807",
  youtube: "111299001912",
  hbomax: "3202301029760",
  jellyfin: "3202007021208",
  spotify: "3201606009684",
  browser: "3202010022079",
} as const;
export type TvApp = keyof typeof TV_APPS;

// Dovoljene tipke (KEY_* iz Samsungovega daljinca).
export const TV_KEYS = [
  "KEY_POWER",
  "KEY_VOLUP",
  "KEY_VOLDOWN",
  "KEY_MUTE",
  "KEY_UP",
  "KEY_DOWN",
  "KEY_LEFT",
  "KEY_RIGHT",
  "KEY_ENTER",
  "KEY_RETURN",
  "KEY_HOME",
  "KEY_CHUP",
  "KEY_CHDOWN",
  "KEY_SOURCE",
  "KEY_PLAY",
  "KEY_PAUSE",
] as const;
export type TvKey = (typeof TV_KEYS)[number];

export type TvStatus = { power: "on" | "standby" | "off"; name: string | null; paired: boolean };

type Stored = { token?: string; lastApp?: StreamingApp };
type StreamingApp = "netflix" | "hbomax";

async function readStored(): Promise<Stored> {
  const raw = await storage.readItems("tv");
  return raw && !Array.isArray(raw) ? (raw as Stored) : {};
}

async function visibleApp(): Promise<TvApp | null> {
  const entries = Object.entries(TV_APPS) as [TvApp, string][];
  const visible = await Promise.all(
    entries.map(async ([, id]) => {
      try {
        const res = await fetch(`http://${HOST}:8001/api/v2/applications/${id}`, {
          cache: "no-store",
          signal: AbortSignal.timeout(2000),
        });
        return ((await res.json()) as { visible?: boolean }).visible === true;
      } catch {
        return false;
      }
    }),
  );
  return entries[visible.indexOf(true)]?.[0] ?? null;
}

/** Zapomni si zadnjo pretočno aplikacijo. */
async function rememberApp(stored: Stored, app: TvApp | null): Promise<void> {
  if ((app !== "netflix" && app !== "hbomax") || stored.lastApp === app) return;
  await storage.writeItems("tv", { ...stored, lastApp: app });
}

/** Stanje: TV v stanju pripravljenosti še odgovarja na 8001 s PowerState "standby", ugasnjen pa ne. */
export async function getStatus(): Promise<TvStatus> {
  const stored = await readStored();
  const { token } = stored;
  try {
    const res = await fetch(`http://${HOST}:8001/api/v2/`, { cache: "no-store", signal: AbortSignal.timeout(2500) });
    const body: any = await res.json();
    const state = String(body?.device?.PowerState ?? "on").toLowerCase();
    // PowerState lahko javlja "standby", čeprav je TV prižgan. UPnP (vrata 9197) je odprt samo pri prižganem TV-ju,
    // tudi na HDMI viru, kjer ni vidne aplikacije.
    const [app, upnp] = await Promise.all([
      visibleApp(),
      fetch(`http://${HOST}:9197/dmr`, { cache: "no-store", signal: AbortSignal.timeout(2000) }).then((r) => r.ok, () => false),
    ]);
    await rememberApp(stored, app).catch(() => {});
    const on = state === "on" || upnp || app !== null;
    return {
      power: on ? "on" : "standby",
      name: body?.device?.name ? String(body.device.name).replace(/&quot;/g, '"') : null,
      paired: Boolean(token),
    };
  } catch {
    return { power: "off", name: null, paired: Boolean(token) };
  }
}

/** Odpre kanal daljinca, pošlje sporočila in ga zapre. Shrani nov žeton, če ga TV vrne. */
async function withRemote(messages: (object | number)[]): Promise<void> {
  const stored = await readStored();
  const params = new URLSearchParams({ name: Buffer.from(CLIENT_NAME).toString("base64") });
  if (stored.token) params.set("token", stored.token);
  const ws = new WebSocket(`wss://${HOST}:8002/api/v2/channels/samsung.remote.control?${params}`, {
    rejectUnauthorized: false, // TV ima samopodpisan certifikat; promet ostane v LAN-u
  });

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.terminate();
      reject(new Error("timeout"));
    }, CONNECT_TIMEOUT_MS);
    ws.on("message", async (raw) => {
      let msg: any;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (msg.event === "ms.channel.unauthorized") {
        clearTimeout(timer);
        ws.close();
        reject(new Error("unauthorized"));
      } else if (msg.event === "ms.channel.connect") {
        clearTimeout(timer);
        const token = msg.data?.token;
        if (token && token !== stored.token) await storage.writeItems("tv", { ...stored, token: String(token) });
        // Število pomeni premor v milisekundah med ukazi.
        for (const m of messages) {
          if (typeof m === "number") await new Promise((r) => setTimeout(r, m));
          else ws.send(JSON.stringify(m));
        }
        // Kratek premor, da TV prejme vse pred zaprtjem.
        setTimeout(() => {
          ws.close();
          resolve();
        }, 300);
      }
    });
    ws.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
  });
}

const keyMessage = (key: TvKey) => ({
  method: "ms.remote.control",
  params: { Cmd: "Click", DataOfCmd: key, Option: "false", TypeOfRemote: "SendRemoteKey" },
});

export async function sendKey(key: TvKey): Promise<void> {
  await withRemote([keyMessage(key)]);
}

/** TV ukaz ed.apps.launch prek WebSocketa tiho ignorira, zato aplikacije zaganjamo prek REST in preverimo, da so vidne. */
async function waitVisible(appId: string, timeoutMs = 12_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`http://${HOST}:8001/api/v2/applications/${appId}`, { cache: "no-store", signal: AbortSignal.timeout(3000) }).catch(() => null);
    if (res?.ok && ((await res.json()) as { visible?: boolean }).visible === true) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("not-launched");
}

async function openApp(appId: string): Promise<void> {
  const res = await fetch(`http://${HOST}:8001/api/v2/applications/${appId}`, { method: "POST", cache: "no-store", signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error("not-launched");
  await waitVisible(appId);
}

export async function launchApp(app: TvApp): Promise<void> {
  await openApp(TV_APPS[app]);
}

/** Besedilo za iskanje: brez strešic in ločil, le začetek naslova. */
function searchText(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, NETFLIX_SEARCH_CHARS)
    .trim();
}

/** Tipke za vnos besedila na Netflixovi tipkovnici; začne na "a", konča na prvem zadetku. Vrstica 0 sta presledek in brisanje. */
function netflixTypingKeys(title: string): TvKey[] {
  const text = searchText(title);
  const keys: TvKey[] = [];
  let row = 1;
  let col = 0;
  const go = (toRow: number, toCol: number) => {
    for (; col > toCol; col -= 1) keys.push("KEY_LEFT");
    for (; col < toCol; col += 1) keys.push("KEY_RIGHT");
    for (; row > toRow; row -= 1) keys.push("KEY_UP");
    for (; row < toRow; row += 1) keys.push("KEY_DOWN");
  };
  for (const ch of text) {
    if (ch === " ") {
      go(row, 0);
      go(0, 0);
      // Dol s presledka ne pristane na "a", zato se poravnamo levo.
      keys.push("KEY_ENTER", "KEY_DOWN", "KEY_LEFT");
      row = 1;
      col = 0;
      continue;
    }
    const target = NETFLIX_KEYBOARD.findIndex((line) => line.includes(ch));
    go(target + 1, NETFLIX_KEYBOARD[target].indexOf(ch));
    keys.push("KEY_ENTER");
  }
  go(1, 5);
  keys.push("KEY_RIGHT");
  return keys;
}

/**
 * Netflix na tem TV-ju ne sprejme neposrednega naslova, zato ga poišče kot uporabnik. Začetek mora biti znan: aplikacijo
 * zapremo in odpremo, da se pokaže izbira profila. Pot je usklajena z zaslonom; ob spremembi Netflixovega menija jo je treba popraviti.
 */
async function playOnNetflix(title: string): Promise<void> {
  const id = TV_APPS.netflix;
  await fetch(`http://${HOST}:8001/api/v2/applications/${id}`, { method: "DELETE", cache: "no-store", signal: AbortSignal.timeout(8000) }).catch(() => null);
  await new Promise((r) => setTimeout(r, 3000));
  await openApp(id);
  await new Promise((r) => setTimeout(r, NETFLIX_START_MS));
  const nav: TvKey[] = ["KEY_UP", "KEY_UP", "KEY_UP", "KEY_LEFT", "KEY_DOWN"];
  await withRemote([
    keyMessage("KEY_ENTER"),
    NETFLIX_PROFILE_MS,
    ...nav.flatMap((key) => [keyMessage(key), NETFLIX_NAV_MS]),
    ...netflixTypingKeys(title).flatMap((key) => [keyMessage(key), NETFLIX_TYPE_MS]),
    1500,
    keyMessage("KEY_ENTER"),
    NETFLIX_DETAILS_MS,
    keyMessage("KEY_ENTER"),
  ]);
}

/** Tipke za vnos na tipkovnici HBO Max; začne na "a", presledek je pod tretjim stolpcem, konča na prvem zadetku. */
function hboTypingKeys(title: string): TvKey[] {
  const keys: TvKey[] = [];
  let row = 0;
  let col = 0;
  const go = (toRow: number, toCol: number) => {
    for (; col > toCol; col -= 1) keys.push("KEY_LEFT");
    for (; col < toCol; col += 1) keys.push("KEY_RIGHT");
    for (; row > toRow; row -= 1) keys.push("KEY_UP");
    for (; row < toRow; row += 1) keys.push("KEY_DOWN");
  };
  for (const ch of searchText(title)) {
    if (ch === " ") {
      go(5, 2);
      keys.push("KEY_DOWN", "KEY_ENTER", "KEY_UP");
      continue;
    }
    const target = HBO_KEYBOARD.findIndex((line) => line.includes(ch));
    go(target, HBO_KEYBOARD[target].indexOf(ch));
    keys.push("KEY_ENTER");
  }
  go(0, 5);
  keys.push("KEY_RIGHT");
  return keys;
}

/** HBO Max prav tako ne sprejme naslova: po zagonu izberemo profil, odpremo iskanje in zaženemo prvi zadetek. */
async function playOnHbo(title: string): Promise<void> {
  const id = TV_APPS.hbomax;
  await fetch(`http://${HOST}:8001/api/v2/applications/${id}`, { method: "DELETE", cache: "no-store", signal: AbortSignal.timeout(8000) }).catch(() => null);
  await new Promise((r) => setTimeout(r, 3000));
  await openApp(id);
  await new Promise((r) => setTimeout(r, HBO_START_MS));
  await withRemote([
    keyMessage("KEY_ENTER"),
    HBO_PROFILE_MS,
    keyMessage("KEY_LEFT"),
    HBO_NAV_MS,
    keyMessage("KEY_UP"),
    HBO_NAV_MS,
    keyMessage("KEY_ENTER"),
    HBO_KEYBOARD_MS,
    ...hboTypingKeys(title).flatMap((key) => [keyMessage(key), NETFLIX_TYPE_MS]),
    1500,
    keyMessage("KEY_ENTER"),
    NETFLIX_DETAILS_MS,
    keyMessage("KEY_ENTER"),
  ]);
}

let macroRunning = false;

/**
 * Odpre naslov iz kataloga lib/tvPicks.ts: poišče ga v aplikaciji in zažene.
 * Vrne null, če URL ni podprt.
 */
export async function launchTitle(url: string, title: string): Promise<"title" | null> {
  const netflix = /^https:\/\/www\.netflix\.com\/title\//.test(url);
  if (!netflix && !/^https:\/\/play\.hbomax\.com\//.test(url)) return null;
  if (macroRunning) throw new Error("busy");
  macroRunning = true;
  try {
    if (netflix) await playOnNetflix(title);
    else await playOnHbo(title);
  } finally {
    macroRunning = false;
  }
  await storage.writeItems("tv", { ...(await readStored()), lastApp: netflix ? "netflix" : "hbomax" });
  return "title";
}

/** Brskalnik odpre domačo stran; naslova mu TV ne dovoli poslati. */
export async function launchBrowser(): Promise<void> {
  await openApp(TV_APPS.browser);
}

/** Odpre zadnjo pretočno aplikacijo. TV ne sporoča, kaj se je nazadnje predvajalo; če je predvajalnik ostal odprt, ga KEY_PLAY nadaljuje. */
export async function resumeLast(): Promise<"app" | "none"> {
  const { lastApp } = await readStored();
  if (!lastApp) return "none";
  await launchApp(lastApp);
  await new Promise((r) => setTimeout(r, 4000));
  await sendKey("KEY_PLAY");
  return "app";
}

/**
 * Wake-on-LAN: čarobni paket na naslov TV-ja in na broadcast.
 * Iz Docker omrežja broadcast ne pride v LAN; neposreden naslov deluje, če gostitelj pozna MAC TV-ja
 * (stalni ARP zapis v CT 101), sicer le kratek čas po izklopu.
 */
export async function wake(): Promise<void> {
  const mac = Buffer.from(MAC.replace(/[^0-9a-f]/gi, ""), "hex");
  if (mac.length !== 6) throw new Error("bad TV_MAC");
  const packet = Buffer.concat([Buffer.alloc(6, 0xff), ...Array.from({ length: 16 }, () => mac)]);
  const sock = dgram.createSocket("udp4");
  await new Promise<void>((resolve) => sock.bind(() => resolve()));
  sock.setBroadcast(true);
  const send = (addr: string, port: number) =>
    new Promise<void>((resolve) => sock.send(packet, port, addr, () => resolve()));
  const broadcast = HOST.replace(/\.\d+$/, ".255");
  for (let i = 0; i < 3; i += 1) {
    await send(HOST, 9);
    await send(broadcast, 9);
  }
  sock.close();
}

/**
 * Vklop/izklop. TV v pripravljenosti ("standby") ostane v omrežju in se prižge s KEY_POWER
 * (WoL ga v tem stanju ne zbudi - preizkušeno na QN90F). WoL je le rezerva, ko se TV sploh ne odziva.
 */
export async function togglePower(): Promise<"off" | "waking"> {
  const status = await getStatus();
  if (status.power === "on") {
    await sendKey("KEY_POWER");
    return "off";
  }
  if (status.power === "standby") {
    try {
      await sendKey("KEY_POWER");
      return "waking";
    } catch {
      /* API se ni odzval - poskusi še WoL */
    }
  }
  await wake();
  return "waking";
}
