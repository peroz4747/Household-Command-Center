// Nastavitve obvestil (dashboard → Obvestila): katere vrste so vklopljene, ura jutranjega poročila in tihe ure.
// Med tihimi urami se nenujna obvestila zberejo in pošljejo skupaj, ko se tihe ure končajo.
import storage from "./storage";

export { NOTIFY_CATEGORIES, type NotifyCategory, type NotifySettings } from "./notifyCategories";
import { NOTIFY_CATEGORIES, type NotifyCategory, type NotifySettings } from "./notifyCategories";

export type DeferredNotification = { at: number; title: string; message: string };

const STORE = "notify-settings";
const DEFERRED = "notify-deferred";
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export const DEFAULT_NOTIFY_SETTINGS: NotifySettings = {
  enabled: Object.fromEntries(NOTIFY_CATEGORIES.map((c) => [c, true])) as Record<NotifyCategory, boolean>,
  morningAt: "05:00",
  quiet: { enabled: false, from: "22:00", to: "07:00", allowUrgent: true },
};

/** Popravi in dopolni (delne) nastavitve; neveljavne vrednosti nadomesti privzeta. */
export function normalizeNotifySettings(input: unknown): NotifySettings {
  const raw = (input && typeof input === "object" ? input : {}) as Partial<NotifySettings>;
  const d = DEFAULT_NOTIFY_SETTINGS;
  const time = (v: unknown, fallback: string) => (typeof v === "string" && TIME.test(v) ? v : fallback);
  const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);
  const enabledRaw = (raw.enabled ?? {}) as Partial<Record<NotifyCategory, unknown>>;
  const quietRaw = (raw.quiet ?? {}) as Partial<NotifySettings["quiet"]>;
  return {
    enabled: Object.fromEntries(NOTIFY_CATEGORIES.map((c) => [c, bool(enabledRaw[c], d.enabled[c])])) as Record<NotifyCategory, boolean>,
    morningAt: time(raw.morningAt, d.morningAt),
    quiet: {
      enabled: bool(quietRaw.enabled, d.quiet.enabled),
      from: time(quietRaw.from, d.quiet.from),
      to: time(quietRaw.to, d.quiet.to),
      allowUrgent: bool(quietRaw.allowUrgent, d.quiet.allowUrgent),
    },
  };
}

export async function getNotifySettings(): Promise<NotifySettings> {
  const raw = await storage.readItems(STORE).catch(() => null);
  return normalizeNotifySettings(Array.isArray(raw) ? null : raw);
}

export async function saveNotifySettings(input: unknown): Promise<NotifySettings> {
  const settings = normalizeNotifySettings(input);
  await storage.writeItems(STORE, settings);
  return settings;
}

export const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Ali so tihe ure (lahko čez polnoč, npr. 22:00–07:00). */
export function isQuiet(settings: NotifySettings, minutesNow: number): boolean {
  if (!settings.quiet.enabled) return false;
  const from = toMinutes(settings.quiet.from);
  const to = toMinutes(settings.quiet.to);
  if (from === to) return false;
  return from < to ? minutesNow >= from && minutesNow < to : minutesNow >= from || minutesNow < to;
}

export async function getDeferred(): Promise<DeferredNotification[]> {
  const raw = await storage.readItems(DEFERRED).catch(() => null);
  return Array.isArray(raw) ? (raw as DeferredNotification[]) : [];
}

export async function addDeferred(n: DeferredNotification): Promise<void> {
  const list = await getDeferred();
  list.push(n);
  await storage.writeItems(DEFERRED, list.slice(-50));
}

export const clearDeferred = () => storage.writeItems(DEFERRED, []);
