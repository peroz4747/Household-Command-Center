"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { LANG_COOKIE, LOCALES, translator, type Lang, type Translate } from "../lib/i18n";

type I18n = { lang: Lang; locale: string; t: Translate; setLang: (lang: Lang) => void };

const I18nContext = createContext<I18n | null>(null);

export function I18nProvider({ initialLang, children }: { initialLang: Lang; children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  const router = useRouter();

  const setLang = useCallback(
    (next: Lang) => {
      document.cookie = `${LANG_COOKIE}=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
      document.documentElement.lang = next;
      setLangState(next);
      // Strežniške komponente (glava, podatki na strani) se izrišejo znova v novem jeziku.
      router.refresh();
    },
    [router],
  );

  const value = useMemo(() => ({ lang, locale: LOCALES[lang], t: translator(lang), setLang }), [lang, setLang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider");
  return ctx;
}
