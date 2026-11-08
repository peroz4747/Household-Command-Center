// Definicije hitrih dejanj, skupne strežniku in vmesniku.
export const SHORTCUT_STEPS = {
  morning: ["tvOn", "spotify", "pcWake", "server"],
  leaving: ["tvOff", "pcSuspend"],
  arriving: ["pcWake", "tvOn", "browser"],
  dinner: ["tvOn", "resume"],
  sleep: ["tvOff", "pcShutdown"],
} as const;

export type ShortcutId = keyof typeof SHORTCUT_STEPS;
export type StepKey = (typeof SHORTCUT_STEPS)[ShortcutId][number];
export type StepResult = { key: StepKey; status: "ok" | "skipped" | "error"; note?: string };
