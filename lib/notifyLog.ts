// Dnevnik poslanih opozoril (3 dni) za razdelek "Ponoči" v jutranjem poročilu.
import storage from "./storage";

export type LoggedNotification = { at: number; title: string; message: string };

const KEEP_MS = 3 * 86_400_000;

export async function getNotificationLog(): Promise<LoggedNotification[]> {
  const raw = await storage.readItems("notify-log").catch(() => null);
  return Array.isArray(raw) ? (raw as LoggedNotification[]) : [];
}

export async function logNotification(title: string, message: string): Promise<void> {
  const now = Date.now();
  const log = (await getNotificationLog()).filter((n) => now - n.at < KEEP_MS);
  log.push({ at: now, title, message: message.split("\n")[0].slice(0, 200) });
  await storage.writeItems("notify-log", log);
}
