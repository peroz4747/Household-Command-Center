import sl, { type MessageKey } from "./sl";
import en from "./en";
import de from "./de";

export type { MessageKey };
export type Lang = "sl" | "en" | "de";

export const LANGS: Lang[] = ["sl", "en", "de"];
export const DEFAULT_LANG: Lang = "sl";
export const LANG_COOKIE = "lang";

// Oznake za Intl (datumi, števila).
export const LOCALES: Record<Lang, string> = { sl: "sl-SI", en: "en-GB", de: "de-AT" };

const dictionaries: Record<Lang, Record<MessageKey, string>> = { sl, en, de };

export const isLang = (v: unknown): v is Lang => typeof v === "string" && (LANGS as string[]).includes(v);

export type Vars = Record<string, string | number>;
export type Translate = (key: MessageKey, vars?: Vars) => string;

export function translate(lang: Lang, key: MessageKey, vars?: Vars): string {
  const text = dictionaries[lang][key] ?? sl[key] ?? key;
  return vars ? text.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m)) : text;
}

export const translator =
  (lang: Lang): Translate =>
  (key, vars) =>
    translate(lang, key, vars);

/** Jezik iz vrednosti piškotka (ali privzeti). */
export const langFromCookie = (value: string | undefined | null): Lang => (isLang(value) ? value : DEFAULT_LANG);
