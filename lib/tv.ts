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

type Stored = { token?: string };

async function readStored(): Promise<Stored> {
  const raw = await storage.readItems("tv");
  return raw && !Array.isArray(raw) ? (raw as Stored) : {};
}

/** Stanje: TV v stanju pripravljenosti še odgovarja na 8001 s PowerState "standby", ugasnjen pa ne. */
export async function getStatus(): Promise<TvStatus> {
  const { token } = await readStored();
  try {
    const res = await fetch(`http://${HOST}:8001/api/v2/`, { cache: "no-store", signal: AbortSignal.timeout(2500) });
    const body: any = await res.json();
    const state = String(body?.device?.PowerState ?? "on").toLowerCase();
    return {
      power: state === "on" ? "on" : "standby",
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
