// Kamere, ki objavljajo le slike (DARS: nova slika ~1x na minuto). Strežnik jih preverja vsakih 15 s
// s pogojno zahtevo (304, brez prenosa, če ni nove) in hrani zadnji 2 uri slik v pomnilniku,
// da jih dashboard lahko pokaže takoj in predvaja kot časovni zamik.
export type SnapCam = { url: string; label: string };
export type Frame = { at: number; jpeg: Buffer }; // at = Last-Modified (ms)

export const SNAP_CAMS: Record<string, SnapCam> = {
  trzaska: { url: "https://kamere.dars.si/kamere/drsi_vgrc/Maribor1_Mrb1_0001.jpg", label: "DARS · Maribor, Tržaška" },
};

const POLL_MS = 15_000;
const KEEP_MS = 2 * 3_600_000;
// Na globalThis: instrumentation in API pot sta v Next.js lahko ločena modula, stanje pa mora biti eno.
const g = globalThis as typeof globalThis & { __snapCams?: { frames: Map<string, Frame[]>; lastModified: Map<string, string>; started: boolean } };
g.__snapCams ??= { frames: new Map(), lastModified: new Map(), started: false };
const { frames, lastModified } = g.__snapCams;

async function poll(id: string, cam: SnapCam): Promise<void> {
  const headers: Record<string, string> = { "User-Agent": "Mozilla/5.0 (HouseholdCommandCenter)" };
  const lm = lastModified.get(id);
  if (lm) headers["If-Modified-Since"] = lm;
  const res = await fetch(`${cam.url}?dt=${Date.now()}`, { cache: "no-store", headers, signal: AbortSignal.timeout(10_000) });
  if (res.status === 304 || !res.ok) return;
  const jpeg = Buffer.from(await res.arrayBuffer());
  const modified = res.headers.get("last-modified");
  const at = modified ? Date.parse(modified) : Date.now();
  const list = frames.get(id) ?? [];
  if (list.at(-1)?.at === at || jpeg.length < 1000) return;
  if (modified) lastModified.set(id, modified);
  list.push({ at, jpeg });
  const cutoff = Date.now() - KEEP_MS;
  frames.set(id, list.filter((f) => f.at >= cutoff));
}

export function getFrames(id: string): Frame[] {
  return frames.get(id) ?? [];
}

export function startSnapCams(): void {
  if (g.__snapCams!.started) return;
  g.__snapCams!.started = true;
  const tick = () => {
    for (const [id, cam] of Object.entries(SNAP_CAMS)) void poll(id, cam).catch(() => {});
  };
  tick();
  setInterval(tick, POLL_MS);
}
