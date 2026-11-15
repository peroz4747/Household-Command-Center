"use client";

import { useEffect, useMemo, useState } from "react";
import { Autocomplete, Box, Card, CardContent, InputAdornment, TextField, Typography } from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import dynamic from "next/dynamic";
import { useI18n } from "../i18n";
import type { EconomiesData, Economy } from "../../lib/economies";
import CountryDialog, { type TabId } from "./CountryDialog";

// Svetovni pregled: globus držav; klik ali iskanje odpre profil države po okviru PMESII-PT.
// three.js je velik, zato se globus naloži šele v brskalniku.
const WorldGlobe = dynamic(() => import("./WorldGlobe"), { ssr: false });

const UP = "#22c55e";
const DOWN = "#f87171";
const HOME = "SI";

export default function WorldEconomies() {
  const { t, locale } = useI18n();
  const [data, setData] = useState<EconomiesData | null>(null);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState<Economy | null>(null);
  const [openTab, setOpenTab] = useState<TabId>("politics");

  useEffect(() => {
    fetch("/api/economies", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => (d.error ? setError(true) : setData(d)))
      .catch(() => setError(true));
  }, []);

  const show = (e: Economy, tab: TabId = "politics") => {
    setOpenTab(tab);
    setOpen(e);
  };

  const names = useMemo(() => {
    try {
      return new Intl.DisplayNames([locale], { type: "region" });
    } catch {
      return null;
    }
  }, [locale]);
  const nameOf = (e: Economy) => {
    try {
      return names?.of(e.iso2) ?? e.name;
    } catch {
      return e.name;
    }
  };

  const ranked = useMemo(() => {
    const byGdp = [...(data?.items ?? [])].filter((e) => e.gdpUsd !== null).sort((a, b) => b.gdpUsd! - a.gdpUsd!);
    const byPc = [...(data?.items ?? [])].filter((e) => e.gdpPerCapitaUsd !== null).sort((a, b) => b.gdpPerCapitaUsd! - a.gdpPerCapitaUsd!);
    return { gdp: new Map(byGdp.map((e, i) => [e.iso2, i + 1])), pc: new Map(byPc.map((e, i) => [e.iso2, i + 1])) };
  }, [data]);

  const sorted = useMemo(() => [...(data?.items ?? [])].sort((a, b) => nameOf(a).localeCompare(nameOf(b), locale)), [data, locale]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return null;

  const money = (n: number | null, compact = true) =>
    n === null ? "–" : n.toLocaleString(locale, compact ? { notation: "compact", maximumFractionDigits: n >= 1e12 ? 2 : 1, style: "currency", currency: "USD" } : { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const si = data?.items.find((e) => e.iso2 === HOME);
  const wars = data?.items.filter((e) => e.conflict === "war").length ?? 0;

  return (
    <Card>
      <CardContent>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 2, flexWrap: "wrap", mb: 2 }}>
          <Box>
            <Typography variant="subtitle2" color="secondary">
              {t("econ.overline")}
            </Typography>
            <Typography variant="h6" sx={{ mt: 1, fontWeight: 700 }}>
              {t("econ.title")}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
              {t("econ.clickHint")}
            </Typography>
          </Box>
          {data && si && (
            <Box sx={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
              {[
                [t("econ.world"), money(data.worldGdpUsd)],
                [t("econ.siRank"), `#${ranked.gdp.get(HOME)} · ${money(si.gdpUsd)}`],
                [t("econ.siPc"), `#${ranked.pc.get(HOME)} · ${money(si.gdpPerCapitaUsd, false)}`],
                [t("econ.warsNow"), String(wars)],
              ].map(([label, value]) => (
                <Box key={label}>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                    {label}
                  </Typography>
                  <Typography sx={{ fontWeight: 700 }}>{value}</Typography>
                </Box>
              ))}
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                  {t("econ.siQuarter", { q: si.quarter?.replace("-", " ") ?? "–" })}
                </Typography>
                <Typography sx={{ fontWeight: 700, color: (si.qoq ?? 0) >= 0 ? UP : DOWN }}>
                  {si.qoq === null ? "–" : `${si.qoq > 0 ? "▲ +" : "▼ "}${si.qoq.toLocaleString(locale, { maximumFractionDigits: 1 })} %`}
                </Typography>
              </Box>
            </Box>
          )}
        </Box>

        <Autocomplete
          size="small"
          options={sorted}
          getOptionLabel={(e) => nameOf(e)}
          onChange={(_, e) => e && show(e)}
          value={null}
          blurOnSelect
          sx={{ maxWidth: 360, mb: 1.5 }}
          renderOption={(props, e) => (
            <Box component="li" {...props} key={e.iso2} sx={{ display: "flex", gap: 1, alignItems: "center" }}>
              <Box component="img" src={`https://flagcdn.com/w40/${e.iso2.toLowerCase()}.png`} alt="" loading="lazy" sx={{ width: 20, height: 14, objectFit: "cover", borderRadius: "2px" }} />
              {nameOf(e)}
            </Box>
          )}
          renderInput={(params) => (
            <TextField
              {...params}
              placeholder={t("econ.search")}
              slotProps={{ input: { ...params.InputProps, startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }}
            />
          )}
        />

        {data ? <WorldGlobe items={data.items} onSelect={(e, tab) => show(e, tab === "defense" ? "military" : tab === "economy" ? "economy" : "politics")} /> : <Typography color="text.secondary">{t("common.loading")}</Typography>}

        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
          {t("pm.sources")}
        </Typography>
      </CardContent>
      {open && (
        <CountryDialog
          key={open.iso2}
          economy={open}
          name={nameOf(open)}
          ranks={{ gdp: ranked.gdp.get(open.iso2), pc: ranked.pc.get(open.iso2) }}
          items={data?.items ?? []}
          onOpen={(e, tab) => show(e, tab)}
          initialTab={openTab}
          onClose={() => setOpen(null)}
        />
      )}
    </Card>
  );
}
