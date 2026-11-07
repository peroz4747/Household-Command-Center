// Izklop/ponovni zagon strežnika in urnik delovanja.
// Dashboard zapiše zahtevo ali urnik v skupno mapo; na hostu ju izvede /usr/local/bin/hcc-power
// (zahteve prek hcc-tank-control.path, urnik vsako minuto prek hcc-power-schedule.timer).
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { getTankControl } from "./tankControl";

const DIR = process.env.HOST_CONTROL_DIR ?? "/host-control";

export type PowerSchedule = { enabled: boolean; days: number[]; on: string; off: string }; // days: 0 = ponedeljek
export type PowerState = {
  scheduleActive: boolean;
  nextOff: string | null; // lokalni ISO čas
  nextOn: string | null;
  lastShutdown?: { at: string; command: string; reason: string };
  lastWakeSet?: string | null;
  generatedAt: number;
};

export const DEFAULT_SCHEDULE: PowerSchedule = { enabled: false, days: [0, 1, 2, 3, 4, 5, 6], on: "07:00", off: "23:30" };
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

async function readJson<T>(name: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(`${DIR}/${name}`, "utf8")) as T;
  } catch {
    return null;
  }
}

export async function getPower() {
  const [schedule, state] = await Promise.all([readJson<PowerSchedule>("schedule.json"), readJson<PowerState>("power.json")]);
  // power.json osveži host vsako minuto; starejši pomeni, da časovnik na hostu ne teče.
  const hostOk = !!state && Date.now() / 1000 - state.generatedAt < 180;
  return { schedule: schedule ?? DEFAULT_SCHEDULE, state, hostOk };
}

export function validateSchedule(s: any): PowerSchedule | null {
  if (!s || typeof s !== "object") return null;
  const raw: unknown[] = Array.isArray(s.days) ? [...new Set<unknown>(s.days)] : [];
  const days = raw.filter((d): d is number => typeof d === "number" && Number.isInteger(d) && d >= 0 && d <= 6);
  if (typeof s.on !== "string" || typeof s.off !== "string" || !HHMM.test(s.on) || !HHMM.test(s.off)) return null;
  if (s.enabled && (!days.length || s.on >= s.off)) return null;
  return { enabled: Boolean(s.enabled), days: days.sort((x, y) => x - y), on: s.on, off: s.off };
}

export async function saveSchedule(s: PowerSchedule) {
  await writeFile(`${DIR}/schedule.json`, JSON.stringify(s));
}

export async function requestPower(action: "shutdown" | "reboot") {
  const current = await getTankControl();
  if (current.status === "pending" || current.status === "running") throw new Error("busy");
  const req = { action, id: randomUUID(), at: Math.floor(Date.now() / 1000) };
  await writeFile(`${DIR}/request.json`, JSON.stringify(req));
  return req.id;
}
