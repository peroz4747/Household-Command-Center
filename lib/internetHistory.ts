// Zgodovina interneta: meritev hitrosti vsako uro (Ookla CLI) in izpadi (zazna jih notifier vsakih 5 min).
// Shranjeno v data/internet-history.json, zadnjih 60 dni - za graf, ko kličeš ponudnika.
import { execFile } from "node:child_process";
import storage from "./storage";

export type SpeedSample = { at: number; downloadMbps: number | null; uploadMbps: number | null; pingMs: number | null; server?: string | null };
export type Outage = { from: number; to: number };
export type InternetHistory = { speed: SpeedSample[]; outages: Outage[] };

const KEEP_MS = 60 * 86_400_000;
const HOUR = 3_600_000;
const NAME = "internet-history";

const toMbps = (bytesPerSecond: number) => Math.round((bytesPerSecond * 8) / 10_000) / 100;

export async function getInternetHistory(): Promise<InternetHistory> {
  const raw = await storage.readItems(NAME);
  const h = raw && !Array.isArray(raw) ? (raw as Partial<InternetHistory>) : {};
  return { speed: h.speed ?? [], outages: h.outages ?? [] };
}

// Zapisi iz meritev in notifierja se ne smejo prekrivati (beri-spremeni-zapiši).
let queue: Promise<unknown> = Promise.resolve();
function update(fn: (h: InternetHistory) => void): Promise<void> {
  const job = queue.then(async () => {
    const h = await getInternetHistory();
    fn(h);
    const cutoff = Date.now() - KEEP_MS;
    h.speed = h.speed.filter((s) => s.at >= cutoff);
    h.outages = h.outages.filter((o) => o.to >= cutoff);
    await storage.writeItems(NAME, h);
  });
  queue = job.catch(() => {});
  return job;
}

export const recordOutage = (from: number, to: number) => update((h) => void h.outages.push({ from, to }));

let running: Promise<SpeedSample> | null = null;

/** Ookla Speedtest CLI: traja ~30 s in za ta čas zapolni povezavo. Vzporedna zahteva počaka na isto meritev. */
export function runSpeedtest(): Promise<SpeedSample> {
  running ??= (async () => {
    let sample: SpeedSample;
    try {
      const stdout = await new Promise<string>((resolve, reject) =>
        execFile("speedtest", ["--accept-license", "--accept-gdpr", "--format=json"], { timeout: 120_000, maxBuffer: 1024 * 1024 }, (err, out) =>
          err ? reject(err) : resolve(out),
        ),
      );
      const result = JSON.parse(stdout.trim().split("\n").at(-1) ?? "");
      if (result.type !== "result") throw new Error("no result");
      sample = {
        at: Date.now(),
        downloadMbps: toMbps(result.download.bandwidth),
        uploadMbps: toMbps(result.upload.bandwidth),
        pingMs: Math.round(result.ping.latency),
        server: result.server?.name ?? null,
      };
    } catch {
      sample = { at: Date.now(), downloadMbps: null, uploadMbps: null, pingMs: null };
    }
    await update((h) => void h.speed.push(sample)).catch(() => {});
    return sample;
  })().finally(() => (running = null));
  return running;
}

export function startSpeedCollector(): void {
  const tick = async () => {
    const { speed } = await getInternetHistory().catch(() => ({ speed: [] as SpeedSample[] }));
    const last = speed.at(-1)?.at ?? 0;
    if (Date.now() - last > 50 * 60_000) await runSpeedtest().catch(() => {});
  };
  setTimeout(() => void tick(), 10 * 60_000);
  setInterval(() => void tick(), HOUR);
}
