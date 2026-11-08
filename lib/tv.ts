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

export const TV_APPS = {
  netflix: "3201907018807",
  youtube: "111299001912",
  hbomax: "3202301029760",
  jellyfin: "3202007021208",
  spotify: "3201606009684",
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

type Stored = { token?: string; lastApp?: StreamingApp; lastTitle?: string };
type StreamingApp = "netflix" | "hbomax";

const titleApp = (url: string): StreamingApp => (url.includes("netflix.com") ? "netflix" : "hbomax");

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

/** Zapomni si zadnjo pretočno aplikacijo; naslov velja le, dokler se ne preklopi na drugo aplikacijo. */
async function rememberApp(stored: Stored, app: TvApp | null): Promise<void> {
  if ((app !== "netflix" && app !== "hbomax") || stored.lastApp === app) return;
  const lastTitle = stored.lastTitle && titleApp(stored.lastTitle) === app ? stored.lastTitle : undefined;
  await storage.writeItems("tv", { ...stored, lastApp: app, lastTitle });
}

/** Stanje: TV v stanju pripravljenosti še odgovarja na 8001 s PowerState "standby", ugasnjen pa ne. */
export async function getStatus(): Promise<TvStatus> {
  const stored = await readStored();
  const { token } = stored;
  try {
    const res = await fetch(`http://${HOST}:8001/api/v2/`, { cache: "no-store", signal: AbortSignal.timeout(2500) });
    const body: any = await res.json();
    const state = String(body?.device?.PowerState ?? "on").toLowerCase();
    // PowerState lahko javlja "standby", čeprav je TV prižgan - vidna aplikacija je zanesljiv znak, da dela.
    const app = await visibleApp();
    await rememberApp(stored, app).catch(() => {});
    const on = state === "on" || app !== null;
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
async function withRemote(messages: object[]): Promise<void> {
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
        for (const m of messages) ws.send(JSON.stringify(m));
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

export async function launchApp(app: TvApp): Promise<void> {
  await withRemote([
    {
      method: "ms.channel.emit",
      params: { event: "ed.apps.launch", to: "host", data: { appId: TV_APPS[app], action_type: "DEEP_LINK" } },
    },
  ]);
}

/**
 * Odpre naslov v aplikaciji iz spletnega URL-ja (iz kataloga lib/tvPicks.ts). Vrne false, če URL ni podprt.
 * Obliki metaTag sta nepreverjeni: Samsung ju ne dokumentira. Če se naslov ne odpre, se odpre le aplikacija.
 */
export async function launchTitle(url: string): Promise<boolean> {
  const netflix = url.match(/^https:\/\/www\.netflix\.com\/title\/(\d+)/);
  const hbo = url.match(/^https:\/\/play\.hbomax\.com\/[a-z/-]+\/[0-9a-f-]{36}(?:\/[0-9a-f-]{36})?/);
  if (!netflix && !hbo) return false;
  const data = netflix
    ? { appId: TV_APPS.netflix, metaTag: `m=https://www.netflix.com/title/${netflix[1]}&source_type=4` }
    : { appId: TV_APPS.hbomax, metaTag: hbo![0] };
  await launch(data.appId, "DEEP_LINK", data.metaTag);
  await storage.writeItems("tv", { ...(await readStored()), lastApp: titleApp(url), lastTitle: url });
  return true;
}

function launch(appId: string, actionType: "DEEP_LINK" | "NATIVE_LAUNCH", metaTag: string): Promise<void> {
  return withRemote([
    { method: "ms.channel.emit", params: { event: "ed.apps.launch", to: "host", data: { appId, action_type: actionType, metaTag } } },
  ]);
}

/** Spotify s seznamom predvajanja; sprejme povezavo open.spotify.com ali spotify:playlist:ID. */
export function launchSpotify(playlist: string): Promise<void> {
  const id = playlist.match(/playlist[/:]([A-Za-z0-9]+)/)?.[1];
  return launch(TV_APPS.spotify, "DEEP_LINK", id ? `spotify:playlist:${id}` : "");
}

export function launchBrowser(url: string): Promise<void> {
  return launch("org.tizen.browser", "NATIVE_LAUNCH", url);
}

/**
 * Nadaljuje zadnji naslov, poslan z dashboarda (odpre ga in potrdi privzeti gumb), sicer odpre zadnjo pretočno aplikacijo.
 * TV ne sporoča, kaj se je nazadnje predvajalo, zato naslovov, zagnanih na samem TV-ju, ne poznamo.
 */
export async function resumeLast(): Promise<"title" | "app" | "none"> {
  const { lastApp, lastTitle } = await readStored();
  if (lastTitle && (await launchTitle(lastTitle))) {
    await new Promise((r) => setTimeout(r, 8000));
    await sendKey("KEY_ENTER");
    return "title";
  }
  if (lastApp) {
    await launchApp(lastApp);
    return "app";
  }
  return "none";
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
