"use client";

import type { ReactNode } from "react";
import { ToggleButton, ToggleButtonGroup } from "@mui/material";
import { LANGS, type Lang } from "../../lib/i18n";
import { useI18n } from "../i18n";

// Zastavice kot SVG (emoji zastavic Windows ne prikaže). Razmerje 3:2, poenostavljene za majhno velikost.
const FLAGS: Record<Lang, ReactNode> = {
  sl: (
    <svg viewBox="0 0 30 20" aria-hidden>
      <rect width="30" height="20" fill="#fff" />
      <rect y="6.67" width="30" height="6.67" fill="#0000ff" />
      <rect y="13.33" width="30" height="6.67" fill="#ff0000" />
      {/* grb: modri ščit z rdečo obrobo in belim Triglavom */}
      <path d="M6 3.2h6v5.2c0 2.4-1.5 3.6-3 4.3-1.5-.7-3-1.9-3-4.3z" fill="#0000ff" stroke="#ff0000" strokeWidth=".7" />
      <path d="M6.6 9.4 8 7.3l1 1.2 1-1.2 1.4 2.1z" fill="#fff" />
    </svg>
  ),
  en: (
    <svg viewBox="0 0 60 40" aria-hidden>
      <clipPath id="uk-clip">
        <path d="M0 0h60v40H0z" />
      </clipPath>
      <g clipPath="url(#uk-clip)">
        <path d="M0 0h60v40H0z" fill="#012169" />
        <path d="M0 0l60 40M60 0L0 40" stroke="#fff" strokeWidth="8" />
        <path d="M0 0l60 40M60 0L0 40" stroke="#c8102e" strokeWidth="3" />
        <path d="M30 0v40M0 20h60" stroke="#fff" strokeWidth="12" />
        <path d="M30 0v40M0 20h60" stroke="#c8102e" strokeWidth="7" />
      </g>
    </svg>
  ),
  de: (
    <svg viewBox="0 0 30 20" aria-hidden>
      <rect width="30" height="6.67" fill="#000" />
      <rect y="6.67" width="30" height="6.67" fill="#dd0000" />
      <rect y="13.33" width="30" height="6.67" fill="#ffce00" />
    </svg>
  ),
};

export default function LanguageSwitcher() {
  const { lang, setLang, t } = useI18n();
  return (
    <ToggleButtonGroup
      size="small"
      exclusive
      value={lang}
      onChange={(_, v: Lang | null) => v && setLang(v)}
      aria-label={t("lang.choose")}
      sx={{
        gap: 0.5,
        "& .MuiToggleButton-root": {
          p: 0.5,
          border: "1px solid transparent !important",
          borderRadius: "8px !important",
          opacity: 0.45,
          transition: "opacity .15s, border-color .15s",
          "&:hover": { opacity: 0.85 },
          "&.Mui-selected": { opacity: 1, borderColor: "rgba(148,163,184,0.4) !important", bgcolor: "rgba(148,163,184,0.12)" },
        },
        "& svg": { width: 27, height: 18, display: "block", borderRadius: "3px", boxShadow: "0 0 0 1px rgba(0,0,0,0.25)" },
      }}
    >
      {LANGS.map((l) => (
        <ToggleButton key={l} value={l} title={t(`lang.${l}`)} aria-label={t(`lang.${l}`)}>
          {FLAGS[l]}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}
