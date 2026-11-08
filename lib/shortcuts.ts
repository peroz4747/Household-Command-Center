import { getPcStatus, runPcAction } from "./pcControl";
import { getStatus, launchApp, launchBrowser, launchSpotify, resumeLast, togglePower } from "./tv";
import { SHORTCUT_STEPS, type ShortcutId, type StepKey, type StepResult } from "./shortcutDefs";

type Outcome = { status?: StepResult["status"]; note?: string } | void;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** TV po vklopu še nekaj sekund ne sprejema ukazov, zato zagon aplikacije ponovimo. */
async function retry(fn: () => Promise<unknown>, attempts = 3, delayMs = 4000): Promise<void> {
  for (let i = 1; ; i += 1) {
    try {
      await fn();
      return;
    } catch (e) {
      if (i >= attempts) throw e;
      await sleep(delayMs);
    }
  }
}

async function tvOn(): Promise<Outcome> {
  if ((await getStatus()).power === "on") return { status: "skipped", note: "alreadyOn" };
  await togglePower();
  const deadline = Date.now() + 25_000;
  while ((await getStatus()).power === "off") {
    if (Date.now() > deadline) throw new Error("unreachable");
    await sleep(2000);
  }
  await sleep(6000);
}

async function tvOff(): Promise<Outcome> {
  // Isti ukaz prižiga in ugaša, zato ga pošljemo le, če je TV zares prižgan.
  if ((await getStatus()).power !== "on") return { status: "skipped", note: "alreadyOff" };
  await togglePower();
}

async function pc(action: "wake" | "suspend" | "shutdown"): Promise<Outcome> {
  const { online } = await getPcStatus();
  if (action === "wake" && online) return { status: "skipped", note: "alreadyOn" };
  if (action !== "wake" && !online) return { status: "skipped", note: "alreadyOff" };
  await runPcAction(action);
}

const STEP_RUNNERS: Record<StepKey, () => Promise<Outcome>> = {
  tvOn,
  tvOff,
  pcWake: () => pc("wake"),
  pcSuspend: () => pc("suspend"),
  pcShutdown: () => pc("shutdown"),
  // Dashboard teče na strežniku: če se je dejanje sprožilo, strežnik že dela.
  server: async () => ({ status: "skipped", note: "serverRunning" }),
  spotify: async () => {
    const playlist = process.env.TV_MORNING_PLAYLIST;
    if (playlist) return void (await retry(() => launchSpotify(playlist)));
    await retry(() => launchApp("spotify"));
    return { note: "noPlaylist" };
  },
  browser: () => retry(() => launchBrowser(process.env.TV_BROWSER_URL ?? "https://dashboard.home/")),
  resume: async () => {
    let result = "none";
    await retry(async () => {
      result = await resumeLast();
    });
    if (result === "app") return { note: "resumeApp" };
    if (result === "none") return { status: "skipped", note: "resumeNone" };
  },
};

let running = false;

/** Izvede korake po vrsti; napaka enega koraka ne ustavi ostalih. Vrne null, če že teče drugo dejanje. */
export async function runShortcut(id: ShortcutId): Promise<StepResult[] | null> {
  if (running) return null;
  running = true;
  try {
    const results: StepResult[] = [];
    for (const key of SHORTCUT_STEPS[id]) {
      try {
        const outcome = await STEP_RUNNERS[key]();
        results.push({ key, status: outcome?.status ?? "ok", note: outcome?.note });
      } catch {
        results.push({ key, status: "error", note: "failed" });
      }
    }
    return results;
  } finally {
    running = false;
  }
}
