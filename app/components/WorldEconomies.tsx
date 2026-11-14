"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  FormControlLabel,
  InputAdornment,
  MenuItem,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TableSortLabel,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import { useI18n } from "../i18n";
import type { EconomiesData, Economy } from "../../lib/economies";

const UP = "#22c55e";
const DOWN = "#f87171";
const FLAT = "#94a3b8";
const BAR = "#3987e5"; // magnituda (BDP): en sam odtenek
const HOME = "SI";
const PAGE = 25;

type SortKey = "gdpUsd" | "gdpPerCapitaUsd" | "growthYear" | "qoq" | "yoyQ" | "name";

const REGIONS = [
  "Europe & Central Asia",
  "East Asia & Pacific",
  "North America",
  "Latin America & Caribbean",
  "Middle East, North Africa, Afghanistan & Pakistan",
  "South Asia",
  "Sub-Saharan Africa",
];

const flag = (iso2: string) => String.fromCodePoint(...[...iso2.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));

function Pct({ v, title }: { v: number | null; title?: string }) {
  const { locale } = useI18n();
  if (v === null) return <Box component="span" sx={{ color: "text.disabled" }}>–</Box>;
  const color = Math.abs(v) < 0.05 ? FLAT : v > 0 ? UP : DOWN;
  const text = `${v > 0.05 ? "▲ +" : v < -0.05 ? "▼ " : ""}${v.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
  const el = (
    <Box component="span" sx={{ color, fontWeight: 700 }}>
      {text}
    </Box>
  );
  return title ? <Tooltip title={title}>{el}</Tooltip> : el;
}

export default function WorldEconomies() {
  const { t, locale } = useI18n();
  const [data, setData] = useState<EconomiesData | null>(null);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState("");
  const [onlyQuarterly, setOnlyQuarterly] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "gdpUsd", dir: "desc" });
  const [all, setAll] = useState(false);

  useEffect(() => {
    fetch("/api/economies", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => (d.error ? setError(true) : setData(d)))
      .catch(() => setError(true));
  }, []);

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

  if (error) return null;

  const q = query.trim().toLowerCase();
  const filtered = (data?.items ?? [])
    .filter((e) => (!region || e.region === region) && (!onlyQuarterly || e.qoq !== null))
    .filter((e) => !q || nameOf(e).toLowerCase().includes(q) || e.name.toLowerCase().includes(q) || e.iso3.toLowerCase() === q)
    .sort((a, b) => {
      if (sort.key === "name") return (sort.dir === "asc" ? 1 : -1) * nameOf(a).localeCompare(nameOf(b), locale);
      const x = a[sort.key];
      const y = b[sort.key];
      if (x === null && y === null) return 0;
      if (x === null) return 1; // brez podatka vedno na konec
      if (y === null) return -1;
      return sort.dir === "asc" ? x - y : y - x;
    });
  const shown = all || q ? filtered : filtered.slice(0, PAGE);
  const home = filtered.find((e) => e.iso2 === HOME);
  const homeHidden = home && !shown.includes(home);
  const maxGdp = Math.max(1, ...(data?.items ?? []).map((e) => e.gdpUsd ?? 0));
  const si = data?.items.find((e) => e.iso2 === HOME);

  const money = (n: number | null, compact = true) =>
    n === null ? "–" : n.toLocaleString(locale, compact ? { notation: "compact", maximumFractionDigits: n >= 1e12 ? 2 : 1, style: "currency", currency: "USD" } : { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const head = (key: SortKey, label: string, align: "left" | "right" = "right", tip?: string) => (
    <TableCell align={align} sortDirection={sort.key === key ? sort.dir : false}>
      <Tooltip title={tip ?? ""}>
        <TableSortLabel active={sort.key === key} direction={sort.key === key ? sort.dir : "desc"} onClick={() => setSort({ key, dir: sort.key === key && sort.dir === "desc" ? "asc" : "desc" })}>
          {label}
        </TableSortLabel>
      </Tooltip>
    </TableCell>
  );
  const row = (e: Economy, pinned = false) => (
    <TableRow key={e.iso2 + (pinned ? "-pin" : "")} hover sx={e.iso2 === HOME ? { bgcolor: "rgba(57,135,229,0.12)" } : undefined}>
      <TableCell sx={{ color: "text.secondary", fontVariantNumeric: "tabular-nums" }}>{ranked.gdp.get(e.iso2) ?? "–"}</TableCell>
      <TableCell>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Box component="span" sx={{ fontSize: 18, lineHeight: 1 }}>
            {flag(e.iso2)}
          </Box>
          <Typography variant="body2" sx={{ fontWeight: e.iso2 === HOME ? 700 : 500 }}>
            {nameOf(e)}
          </Typography>
        </Box>
      </TableCell>
      <TableCell align="right" sx={{ minWidth: 150 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, justifyContent: "flex-end" }}>
          <Box sx={{ flex: 1, maxWidth: 80, height: 6, borderRadius: 3, bgcolor: "rgba(148,163,184,0.12)", overflow: "hidden" }}>
            <Box sx={{ width: `${Math.max(2, ((e.gdpUsd ?? 0) / maxGdp) * 100)}%`, height: "100%", bgcolor: BAR, borderRadius: 3 }} />
          </Box>
          <Typography variant="body2" sx={{ fontVariantNumeric: "tabular-nums", minWidth: 72 }}>
            {money(e.gdpUsd)}
          </Typography>
        </Box>
      </TableCell>
      <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>
        {money(e.gdpPerCapitaUsd, false)}
        {e.gdpPerCapitaUsd !== null && (
          <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.75 }}>
            #{ranked.pc.get(e.iso2)}
          </Typography>
        )}
      </TableCell>
      <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>
        <Pct v={e.growthYear} title={e.growthYearOf ? t("econ.yearOf", { year: e.growthYearOf }) : undefined} />
      </TableCell>
      <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>
        <Pct v={e.qoq} />
      </TableCell>
      <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>
        <Pct v={e.yoyQ} />
      </TableCell>
      <TableCell sx={{ color: "text.secondary", fontSize: 12 }}>{e.quarter ? `${e.quarter.replace("-", " ")}${e.quarterSource ? ` · ${e.quarterSource}` : ""}` : ""}</TableCell>
    </TableRow>
  );

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
            <Typography variant="caption" color="text.secondary">
              {t("econ.source", { year: data?.items.find((e) => e.gdpYear)?.gdpYear ?? "–" })}
            </Typography>
          </Box>
          {data && si && (
            <Box sx={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
              {[
                [t("econ.world"), money(data.worldGdpUsd)],
                [t("econ.siRank"), `#${ranked.gdp.get(HOME)} · ${money(si.gdpUsd)}`],
                [t("econ.siPc"), `#${ranked.pc.get(HOME)} · ${money(si.gdpPerCapitaUsd, false)}`],
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
                <Typography sx={{ fontWeight: 700 }}>
                  <Pct v={si.qoq} />
                </Typography>
              </Box>
            </Box>
          )}
        </Box>

        <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center", mb: 1 }}>
          <TextField
            size="small"
            placeholder={t("econ.search")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }}
            sx={{ minWidth: 220 }}
          />
          <TextField select size="small" label={t("econ.region")} value={region} onChange={(e) => setRegion(e.target.value)} sx={{ minWidth: 240 }}>
            <MenuItem value="">{t("econ.allRegions")}</MenuItem>
            {REGIONS.map((r) => (
              <MenuItem key={r} value={r}>
                {(t as unknown as (k: string) => string)(`econ.region.${REGIONS.indexOf(r)}`)}
              </MenuItem>
            ))}
          </TextField>
          <FormControlLabel control={<Switch checked={onlyQuarterly} onChange={(e) => setOnlyQuarterly(e.target.checked)} />} label={t("econ.onlyQuarterly")} />
        </Box>

        {!data ? (
          <Typography color="text.secondary">{t("common.loading")}</Typography>
        ) : (
          <>
            <Box sx={{ overflowX: "auto" }}>
              <Table size="small" sx={{ "& td, & th": { borderColor: "rgba(148,163,184,0.12)", whiteSpace: "nowrap" } }}>
                <TableHead>
                  <TableRow>
                    <TableCell>#</TableCell>
                    {head("name", t("econ.country"), "left")}
                    {head("gdpUsd", t("econ.gdp"), "right", t("econ.gdpTip"))}
                    {head("gdpPerCapitaUsd", t("econ.gdpPc"))}
                    {head("growthYear", t("econ.growthYear"), "right", t("econ.growthYearTip"))}
                    {head("qoq", t("econ.qoq"), "right", t("econ.qoqTip"))}
                    {head("yoyQ", t("econ.yoyQ"), "right", t("econ.yoyQTip"))}
                    <TableCell>{t("econ.quarter")}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {shown.map((e) => row(e))}
                  {homeHidden && (
                    <>
                      <TableRow>
                        <TableCell colSpan={8} sx={{ py: 0.25, textAlign: "center", color: "text.disabled" }}>
                          ⋯
                        </TableCell>
                      </TableRow>
                      {row(home!, true)}
                    </>
                  )}
                </TableBody>
              </Table>
            </Box>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mt: 1, gap: 2, flexWrap: "wrap" }}>
              <Typography variant="caption" color="text.secondary">
                {t("econ.note")}
              </Typography>
              {!q && filtered.length > PAGE && (
                <Button size="small" onClick={() => setAll(!all)}>
                  {all ? t("econ.showLess") : t("econ.showAll", { n: filtered.length })}
                </Button>
              )}
            </Box>
          </>
        )}
      </CardContent>
    </Card>
  );
}
