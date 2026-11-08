import { createSocket } from "node:dgram";
import { connect } from "node:net";
import { execFile } from "node:child_process";
import { access } from "node:fs/promises";

/*
 * Vklop/izklop računalnika z dashboarda.
 *  - vklop: Wake-on-LAN magic packet (UDP broadcast). Kontejner mora teči z network_mode: host,
 *    sicer broadcast ne pride iz Dockerjevega bridge omrežja v domače omrežje.
 *  - izklop/spanje: SSH z omejenim ključem; na računalniku ključ dovoli samo skripto hcc-power
 *    (glej docs/pc-power.md), ki zna le "poweroff" in "suspend".
 *  - stanje: ali se računalnik odzove na SSH portu.
 */

const PC_NAME = process.env.PC_NAME ?? "Računalnik";
const PC_MAC = process.env.PC_MAC ?? "";
const PC_HOST = process.env.PC_HOST ?? "";
const PC_WOL_BROADCAST = process.env.PC_WOL_BROADCAST ?? "255.255.255.255";
const PC_WOL_PORT = Number(process.env.PC_WOL_PORT ?? 9);
const PC_SSH_USER = process.env.PC_SSH_USER ?? "";
const PC_SSH_PORT = Number(process.env.PC_SSH_PORT ?? 22);
const PC_SSH_KEY = process.env.PC_SSH_KEY ?? "/app/secrets/pc_key";
const KNOWN_HOSTS = process.env.PC_KNOWN_HOSTS ?? "/app/data/pc_known_hosts";

const MAC_RE = /^([0-9a-f]{2}[:-]){5}[0-9a-f]{2}$/i;

export type PcAction = "wake" | "shutdown" | "suspend";
export type PcStatus = {
  configured: boolean;
  name: string;
  online: boolean;
  canWake: boolean;
  canShutdown: boolean;
};

const canWake = () => MAC_RE.test(PC_MAC);
const hasSsh = () => Boolean(PC_HOST && PC_SSH_USER);

/** Ali je SSH port odprt (= računalnik prižgan). */
function portOpen(host: string, port: number, timeoutMs = 1500): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host, port });
    const done = (ok: boolean) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs, () => done(false));
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
  });
}

export async function getPcStatus(): Promise<PcStatus> {
  let keyOk = false;
  if (hasSsh()) keyOk = await access(PC_SSH_KEY).then(() => true, () => false);
  return {
    configured: canWake() || Boolean(PC_HOST),
    name: PC_NAME,
    online: PC_HOST ? await portOpen(PC_HOST, PC_SSH_PORT) : false,
    canWake: canWake(),
    canShutdown: hasSsh() && keyOk,
  };
}

function magicPacket(mac: string): Buffer {
  const bytes = Buffer.from(mac.replace(/[:-]/g, ""), "hex");
  const packet = Buffer.alloc(6 + 16 * 6, 0xff);
  for (let i = 0; i < 16; i++) bytes.copy(packet, 6 + i * 6);
  return packet;
}

async function wake(): Promise<void> {
  if (!canWake()) throw new Error("PC_MAC ni nastavljen ali ni veljaven MAC naslov.");
  const packet = magicPacket(PC_MAC);
  const socket = createSocket("udp4");
  try {
    await new Promise<void>((resolve, reject) => {
      socket.once("error", reject);
      socket.bind(() => {
        socket.setBroadcast(true);
        resolve();
      });
    });
    // Nekaj ponovitev, ker je UDP brez potrditve.
    for (let i = 0; i < 3; i++) {
      await new Promise<void>((resolve, reject) =>
        socket.send(packet, PC_WOL_PORT, PC_WOL_BROADCAST, (err) => (err ? reject(err) : resolve())),
      );
    }
  } finally {
    socket.close();
  }
}

function sshCommand(command: "poweroff" | "suspend"): Promise<void> {
  if (!hasSsh()) throw new Error("PC_HOST ali PC_SSH_USER ni nastavljen.");
  const args = [
    "-i", PC_SSH_KEY,
    "-p", String(PC_SSH_PORT),
    "-o", "BatchMode=yes",
    "-o", "ConnectTimeout=5",
    "-o", "StrictHostKeyChecking=accept-new",
    "-o", `UserKnownHostsFile=${KNOWN_HOSTS}`,
    `${PC_SSH_USER}@${PC_HOST}`,
    command,
  ];
  return new Promise((resolve, reject) => {
    execFile("ssh", args, { timeout: 15_000 }, (err, _stdout, stderr) => {
      if (!err) return resolve();
      // Ob izklopu/spanju se povezava lahko prekine, preden ssh dobi izhodno kodo.
      const killed = (err as { killed?: boolean }).killed;
      const msg = String(stderr).trim();
      if (killed || /closed by remote host|Connection reset|Broken pipe/i.test(msg)) return resolve();
      reject(new Error(msg || err.message));
    });
  });
}

export async function runPcAction(action: PcAction): Promise<void> {
  if (action === "wake") return wake();
  return sshCommand(action === "shutdown" ? "poweroff" : "suspend");
}
