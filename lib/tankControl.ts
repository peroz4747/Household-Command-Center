// Varen izklop/vklop ZFS bazena "tank" prek hosta.
// Dashboard le zapiše zahtevo v skupno mapo; na Proxmox hostu jo hcc-tank-control.path/.service
// (skripta /usr/local/bin/hcc-tank-control) izvede s fiksnimi ukazi in zapiše napredek v result.json.
import { randomUUID } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";

const DIR = process.env.HOST_CONTROL_DIR ?? "/host-control";

export type TankAction = "export" | "import";
export type TankStep = { label: string; status: "running" | "ok" | "error"; output?: string };
export type TankResult = {
  action: TankAction | null;
  id: string | null;
  status: "idle" | "pending" | "running" | "done" | "error";
  steps: TankStep[];
  error: string | null;
  startedAt: number | null;
  finishedAt: number | null;
};

type Request = { action: TankAction; id: string; at: number };

async function readJson<T>(name: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(`${DIR}/${name}`, "utf8")) as T;
  } catch {
    return null;
  }
}

/** Stanje zadnje zahteve; "pending", če host zahteve še ni prevzel (v ~2 min jo zavrže). */
export async function getTankControl(): Promise<TankResult & { available: boolean }> {
  const [req, res] = await Promise.all([readJson<Request>("request.json"), readJson<TankResult>("result.json")]);
  const idle: TankResult = { action: null, id: null, status: "idle", steps: [], error: null, startedAt: null, finishedAt: null };
  const available = await stat(DIR).then(
    (s) => s.isDirectory(),
    () => false,
  );
  if (req && (!res || res.id !== req.id) && Date.now() / 1000 - req.at < 120) {
    return { ...idle, action: req.action, id: req.id, status: "pending", available };
  }
  return { ...(res ?? idle), available };
}

export async function requestTank(action: TankAction): Promise<string> {
  const current = await getTankControl();
  if (current.status === "pending" || current.status === "running") throw new Error("busy");
  const req: Request = { action, id: randomUUID(), at: Math.floor(Date.now() / 1000) };
  // Neposreden zapis (ne rename): systemd PathChanged se sproži ob zaprtju datoteke po pisanju.
  await writeFile(`${DIR}/request.json`, JSON.stringify(req));
  return req.id;
}
