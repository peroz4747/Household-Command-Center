import { readFile } from "node:fs/promises";
import { PVE_NODE, pveConfigured, pveGet } from "./proxmox";

/* ---------------- Tipi ---------------- */

export type StorageUsage = { name: string; type: string; used: number; total: number; percent: number };
export type DiskInfo = {
  device: string;
  model: string;
  type: string; // ssd | hdd | nvme | ...
  size: number;
  health: string;
  temp?: number;
};
export type CpuTemp = { label: string; temp: number };
export type TaskEntry = {
  upid: string;
  type: string;
  id: string;
  user: string;
  start: number;
  end?: number;
  status?: string; // undefined = še teče
};

export type ServerDetails = {
  node: string;
  online: boolean;
  uptime: number;
  pveVersion: string;
  kernel: string;
  cpu: { percent: number; cores: number; model: string; loadavg: number[] };
  memory: { used: number; total: number; percent: number };
  swap: { used: number; total: number; percent: number };
  storages: StorageUsage[];
  pools: (StorageUsage & { health: string })[];
  disks: DiskInfo[];
  cpuTemps: CpuTemp[] | null; // null = podatki s hosta niso na voljo
  tasks: TaskEntry[];
  errors: string[];
  generatedAt: string;
};

export type CheckStatus = "ok" | "info" | "warn" | "fail" | "skip";
export type HealthCheck = { label: string; status: CheckStatus; detail: string };
export type HealthReport = { overall: CheckStatus; checks: HealthCheck[]; generatedAt: string };

/* ---------------- Proxmox odgovori ---------------- */

type PveNodeStatus = {
  uptime: number;
  cpu: number;
  loadavg: string[];
  pveversion: string;
  kversion: string;
  cpuinfo: { cpus: number; model: string };
  memory: { used: number; total: number };
  swap: { used: number; total: number };
};
type PveStorage = { storage: string; type: string; used?: number; total?: number; active?: number; enabled?: number };
type PveZfsPool = { name: string; health: string; alloc: number; size: number };
type PveDisk = { devpath: string; model?: string; type: string; size: number; health?: string };
type PveSmart = {
  health?: string;
  type?: string;
  text?: string;
  attributes?: { id: string | number; name: string; raw: string }[];
};
type PveTask = {
  upid: string;
  type: string;
  id: string;
  user: string;
  starttime: number;
  endtime?: number;
  status?: string;
};
type PveResource = { type: string; vmid?: number; name?: string; status: string; template?: number };

/* ---------------- Pomožne ---------------- */

const pct = (used: number, total: number) => (total > 0 ? (used / total) * 100 : 0);

// Podatki, ki jih zapiše timer na hostu (CPU temperature, pokvarjene systemd enote).
const HOST_STATUS_FILE = process.env.HOST_STATUS_FILE ?? "/host-status/status.json";
const HOST_STATUS_MAX_AGE_S = 180;

type HostStatus = { generatedAt: number; cpuTemps: CpuTemp[]; failedUnits: string[] };

async function readHostStatus(): Promise<HostStatus | null> {
  try {
    const data = JSON.parse(await readFile(HOST_STATUS_FILE, "utf8")) as HostStatus;
    if (Date.now() / 1000 - data.generatedAt > HOST_STATUS_MAX_AGE_S) return null;
    return data;
  } catch {
    return null;
  }
}

function smartTemp(smart: PveSmart): number | undefined {
  // ATA: atribut 194 (Temperature_Celsius) ali 190 (Airflow_Temperature_Cel)
  const attr =
    smart.attributes?.find((a) => Number(a.id) === 194) ??
    smart.attributes?.find((a) => Number(a.id) === 190) ??
    smart.attributes?.find((a) => /temperature/i.test(a.name));
  if (attr) {
    const n = parseInt(attr.raw, 10);
    if (Number.isFinite(n)) return n;
  }
  // NVMe: besedilni izpis "Temperature: 35 Celsius"
  const m = smart.text && /Temperature:\s+(\d+)\s*Celsius/i.exec(smart.text);
  return m ? Number(m[1]) : undefined;
}

// SMART branje požene smartctl na hostu, zato rezultat hranimo 60 s.
const SMART_TTL_MS = 60_000;
const smartCache = new Map<string, { at: number; value: PveSmart }>();

async function smartFor(devpath: string): Promise<PveSmart | null> {
  const hit = smartCache.get(devpath);
  if (hit && Date.now() - hit.at < SMART_TTL_MS) return hit.value;
  try {
    const value = await pveGet<PveSmart>(`/nodes/${PVE_NODE}/disks/smart?disk=${encodeURIComponent(devpath)}`);
    smartCache.set(devpath, { at: Date.now(), value });
    return value;
  } catch {
    return null;
  }
}

const toTask = (t: PveTask): TaskEntry => ({
  upid: t.upid,
  type: t.type,
  id: t.id,
  user: t.user,
  start: t.starttime,
  end: t.endtime,
  status: t.status,
});

/* ---------------- Podrobnosti serverja ---------------- */

export async function getServerDetails(): Promise<ServerDetails> {
  if (!pveConfigured) throw new Error("Proxmox ni nastavljen (PVE_API_URL, PVE_TOKEN_ID, PVE_TOKEN_SECRET).");

  const errors: string[] = [];
  const soft = <T>(p: Promise<T>, fallback: T): Promise<T> =>
    p.catch((e: Error) => {
      errors.push(e.message);
      return fallback;
    });

  const [status, storages, pools, disks, tasks, host] = await Promise.all([
    pveGet<PveNodeStatus>(`/nodes/${PVE_NODE}/status`),
    soft(pveGet<PveStorage[]>(`/nodes/${PVE_NODE}/storage`), []),
    soft(pveGet<PveZfsPool[]>(`/nodes/${PVE_NODE}/disks/zfs`), []),
    soft(pveGet<PveDisk[]>(`/nodes/${PVE_NODE}/disks/list`), []),
    soft(pveGet<PveTask[]>(`/nodes/${PVE_NODE}/tasks?limit=50`), []),
    readHostStatus(),
  ]);

  const diskInfo = await Promise.all(
    disks.map(async (d): Promise<DiskInfo> => {
      const smart = await smartFor(d.devpath);
      return {
        device: d.devpath,
        model: (d.model ?? "").replace(/_/g, " "),
        type: d.type,
        size: d.size,
        health: smart?.health ?? d.health ?? "UNKNOWN",
        temp: smart ? smartTemp(smart) : undefined,
      };
    })
  );

  return {
    node: PVE_NODE,
    online: true,
    uptime: status.uptime,
    pveVersion: status.pveversion,
    kernel: status.kversion.split(" ").slice(0, 2).join(" "),
    cpu: {
      percent: status.cpu * 100,
      cores: status.cpuinfo.cpus,
      model: status.cpuinfo.model,
      loadavg: status.loadavg.map(Number),
    },
    memory: { ...status.memory, percent: pct(status.memory.used, status.memory.total) },
    swap: { ...status.swap, percent: pct(status.swap.used, status.swap.total) },
    storages: storages
      .filter((s) => s.active && s.enabled !== 0 && s.total)
      .map((s) => ({ name: s.storage, type: s.type, used: s.used ?? 0, total: s.total!, percent: pct(s.used ?? 0, s.total!) }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    pools: pools.map((p) => ({
      name: p.name,
      type: "zfs",
      used: p.alloc,
      total: p.size,
      percent: pct(p.alloc, p.size),
      health: p.health,
    })),
    disks: diskInfo.sort((a, b) => a.device.localeCompare(b.device)),
    cpuTemps: host?.cpuTemps ?? null,
    tasks: tasks.map(toTask),
    errors,
    generatedAt: new Date().toISOString(),
  };
}

/* ---------------- Dnevnik posameznega taska ---------------- */

const UPID_RE = /^UPID:[\w.-]+:[0-9A-Fa-f]{8}:[0-9A-Fa-f]{8,}:[0-9A-Fa-f]{8}:[\w-]*:[^/\s]*:[^/\s]+:$/;

export async function getTaskLog(upid: string): Promise<string[]> {
  if (!UPID_RE.test(upid)) throw new Error("Neveljaven UPID");
  const lines = await pveGet<{ n: number; t: string }[]>(
    `/nodes/${PVE_NODE}/tasks/${encodeURIComponent(upid)}/log?limit=1000`
  );
  return lines.map((l) => l.t);
}

/* ---------------- Health check ---------------- */

const fmtPct = (n: number) => `${n.toFixed(0)} %`;

function threshold(value: number, warn: number, fail: number): CheckStatus {
  if (value >= fail) return "fail";
  if (value >= warn) return "warn";
  return "ok";
}

const rank: Record<CheckStatus, number> = { skip: 0, ok: 1, info: 1, warn: 2, fail: 3 };
const worst = (list: CheckStatus[]) =>
  list.reduce<CheckStatus>((acc, s) => (rank[s] > rank[acc] ? s : acc), "ok");

export async function runHealthCheck(): Promise<HealthReport> {
  const checks: HealthCheck[] = [];

  let d: ServerDetails;
  try {
    d = await getServerDetails();
  } catch (e) {
    return {
      overall: "fail",
      checks: [{ label: "Proxmox API", status: "fail", detail: (e as Error).message }],
      generatedAt: new Date().toISOString(),
    };
  }
  checks.push({ label: "Proxmox API", status: "ok", detail: `${d.node} online, ${d.pveVersion}` });

  const since = Math.floor(Date.now() / 1000) - 24 * 3600;
  const [resources, failedTasks, updates, host] = await Promise.all([
    pveGet<PveResource[]>("/cluster/resources?type=vm").catch(() => null),
    pveGet<PveTask[]>(`/nodes/${PVE_NODE}/tasks?errors=1&since=${since}&limit=100`).catch(() => null),
    pveGet<unknown[]>(`/nodes/${PVE_NODE}/apt/update`).catch(() => null),
    readHostStatus(),
  ]);

  // CPU in RAM
  checks.push({
    label: "CPU usage",
    status: threshold(d.cpu.percent, 80, 95),
    detail: `${fmtPct(d.cpu.percent)} · load ${d.cpu.loadavg.map((l) => l.toFixed(2)).join(" / ")} (${d.cpu.cores} threads)`,
  });
  checks.push({
    label: "Memory usage",
    status: threshold(d.memory.percent, 85, 95),
    detail: fmtPct(d.memory.percent),
  });

  // Storage in ZFS
  for (const s of d.storages) {
    checks.push({ label: `Storage ${s.name}`, status: threshold(s.percent, 80, 90), detail: `${fmtPct(s.percent)} used` });
  }
  for (const p of d.pools) {
    const healthy = p.health === "ONLINE";
    checks.push({
      label: `ZFS pool ${p.name}`,
      status: healthy ? threshold(p.percent, 80, 90) : "fail",
      detail: `${p.health} · ${fmtPct(p.percent)} used`,
    });
  }

  // Diski: SMART in temperatura
  for (const disk of d.disks) {
    const smartOk = disk.health === "PASSED" || disk.health === "OK";
    checks.push({
      label: `SMART ${disk.device}`,
      status: smartOk ? "ok" : disk.health === "UNKNOWN" ? "warn" : "fail",
      detail: `${disk.health} · ${disk.model}`,
    });
    if (disk.temp !== undefined) {
      // Vrteči diski so občutljivejši na toploto kot SSD/NVMe.
      const [warn, fail] = disk.type === "ssd" || disk.type === "nvme" ? [60, 70] : [50, 55];
      checks.push({ label: `Temperature ${disk.device}`, status: threshold(disk.temp, warn, fail), detail: `${disk.temp} °C` });
    }
  }

  // CPU temperatura (s hosta)
  if (d.cpuTemps?.length) {
    const max = Math.max(...d.cpuTemps.map((t) => t.temp));
    checks.push({ label: "CPU temperature", status: threshold(max, 80, 90), detail: `max ${max.toFixed(0)} °C` });
  } else {
    checks.push({ label: "CPU temperature", status: "skip", detail: "Host sensor data not available" });
  }

  // Gostje
  if (resources) {
    const guests = resources.filter((r) => !r.template);
    const stopped = guests.filter((r) => r.status !== "running");
    checks.push({
      label: "Guests",
      status: stopped.length ? "warn" : "ok",
      detail: stopped.length
        ? `Not running: ${stopped.map((g) => `${g.vmid} ${g.name ?? ""}`.trim()).join(", ")}`
        : `All ${guests.length} running`,
    });
  } else {
    checks.push({ label: "Guests", status: "warn", detail: "Unable to list guests" });
  }

  // Napake v taskih zadnjih 24 h
  if (failedTasks) {
    checks.push({
      label: "Failed tasks (24 h)",
      status: failedTasks.length ? "warn" : "ok",
      detail: failedTasks.length
        ? failedTasks
            .slice(0, 5)
            .map((t) => `${t.type}${t.id ? ` ${t.id}` : ""}: ${t.status}`)
            .join("; ")
        : "None",
    });
  }

  // Systemd enote na hostu
  if (host) {
    checks.push({
      label: "Host services (systemd)",
      status: host.failedUnits.length ? "fail" : "ok",
      detail: host.failedUnits.length ? `Failed: ${host.failedUnits.join(", ")}` : "No failed units",
    });
  } else {
    checks.push({ label: "Host services (systemd)", status: "skip", detail: "Host status data not available" });
  }

  // Posodobitve
  if (updates) {
    checks.push({
      label: "Package updates",
      status: updates.length ? "info" : "ok",
      detail: updates.length ? `${updates.length} packages can be upgraded` : "Up to date",
    });
  } else {
    checks.push({ label: "Package updates", status: "skip", detail: "Unable to read update list" });
  }

  if (d.errors.length) {
    checks.push({ label: "Partial data", status: "warn", detail: d.errors.join("; ") });
  }

  return { overall: worst(checks.map((c) => c.status)), checks, generatedAt: new Date().toISOString() };
}
