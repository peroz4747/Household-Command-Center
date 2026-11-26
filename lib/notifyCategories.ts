// Vrste obvestil in oblika nastavitev; brez strežniških odvisnosti, da jih lahko uporablja tudi vmesnik.
export const NOTIFY_CATEGORIES = ["morning", "serverTemp", "storage", "services", "internet", "weather", "calendar", "car", "deadlines", "tyres", "fuel", "devicesNight"] as const;
export type NotifyCategory = (typeof NOTIFY_CATEGORIES)[number];

export type NotifySettings = {
  enabled: Record<NotifyCategory, boolean>;
  morningAt: string; // HH:MM
  quiet: { enabled: boolean; from: string; to: string; allowUrgent: boolean };
};
