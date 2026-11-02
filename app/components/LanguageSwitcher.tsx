"use client";

import { ToggleButton, ToggleButtonGroup } from "@mui/material";
import { LANGS, type Lang } from "../../lib/i18n";
import { useI18n } from "../i18n";

export default function LanguageSwitcher() {
  const { lang, setLang, t } = useI18n();
  return (
    <ToggleButtonGroup
      size="small"
      exclusive
      value={lang}
      onChange={(_, v: Lang | null) => v && setLang(v)}
      aria-label={t("lang.choose")}
      sx={{ "& .MuiToggleButton-root": { px: 1.25, py: 0.25, fontSize: 12, fontWeight: 700, borderRadius: 99 } }}
    >
      {LANGS.map((l) => (
        <ToggleButton key={l} value={l} title={t(`lang.${l}`)} aria-label={t(`lang.${l}`)}>
          {l.toUpperCase()}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}
