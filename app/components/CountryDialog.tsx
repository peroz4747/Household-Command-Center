"use client";

import { useEffect, useRef, useState } from "react";
import { Box, Dialog, DialogContent, DialogTitle, IconButton, ToggleButton, ToggleButtonGroup, Typography, useMediaQuery, useTheme } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { useI18n } from "../i18n";
import type { CountryDetail, Economy } from "../../lib/economies";
import type { MarketQuote, MarketRange } from "../../lib/markets";
import { COUNTRY_MARKETS } from "../../lib/countryMarkets";
import { SloveniaMarket, Tile } from "./MarketOverview";

// Rast: statusni barvi (vedno s predznakom); raven (BDP na prebivalca): en sam modri odtenek.
const UP = "#22c55e";
const DOWN = "#f87171";
const LINE = "#3987e5";
const GRID = "rgba(148,163,184,0.14)";
const TEXT = "#c3c2b7";
const H = 170;

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(500);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}

/** Stolpci okoli ničle (rast v %): zeleno navzgor, rdeče navzdol, vrednost ob premiku miške. */
function GrowthBars({ points, labelEvery = 1 }: { points: { label: string; value: number; tip: string }[]; labelEvery?: number }) {
  const { locale } = useI18n();
  const { ref, width } = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  if (!points.length) return null;
  const pad = { top: 14, bottom: 22, left: 34, right: 6 };
  const max = Math.max(1, ...points.map((p) => Math.abs(p.value)));
  const lo = Math.min(0, ...points.map((p) => p.value));
  const hi = Math.max(0, ...points.map((p) => p.value));
  const span = Math.max(hi - lo, max * 0.2);
  const plotH = H - pad.top - pad.bottom;
  const y = (v: number) => pad.top + ((hi - v) / span) * plotH;
  const step = (width - pad.left - pad.right) / points.length;
  const bw = Math.max(3, Math.min(28, step - 2));
  const ticks = [lo, 0, hi].filter((v, i, a) => a.indexOf(v) === i);
  const fmt = (v: number) => `${v > 0 ? "+" : ""}${v.toLocaleString(locale, { maximumFractionDigits: 1 })} %`;
  return (
    <Box ref={ref} sx={{ position: "relative" }}>
      <svg width={width} height={H} style={{ display: "block" }} onPointerLeave={() => setHover(null)}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={pad.left} x2={width - pad.right} y1={y(v)} y2={y(v)} stroke={v === 0 ? "rgba(148,163,184,0.45)" : GRID} />
            <text x={pad.left - 4} y={y(v) + 4} textAnchor="end" fontSize={10} fill={TEXT}>
              {v === 0 ? "0" : `${v > 0 ? "+" : ""}${v.toFixed(0)}`}
            </text>
          </g>
        ))}
        {points.map((p, i) => {
          const x = pad.left + i * step + (step - bw) / 2;
          const top = Math.min(y(p.value), y(0));
          const h = Math.max(1.5, Math.abs(y(p.value) - y(0)));
          return (
            <g key={p.label} onPointerEnter={() => setHover(i)}>
              <rect x={pad.left + i * step} y={pad.top} width={step} height={plotH} fill="transparent" />
              <rect x={x} y={top} width={bw} height={h} rx={2} fill={p.value >= 0 ? UP : DOWN} opacity={hover === null || hover === i ? 1 : 0.45} />
              {i % labelEvery === 0 && (
                <text x={x + bw / 2} y={H - 6} textAnchor="middle" fontSize={10} fill={TEXT}>
                  {p.label}
                </text>
              )}
            </g>
          );
        })}
        {/* Neposredna oznaka zadnje vrednosti */}
        {hover === null && (() => {
          const p = points[points.length - 1];
          const x = pad.left + (points.length - 1) * step + step / 2;
          return (
            <text x={Math.min(x, width - 30)} y={p.value >= 0 ? y(p.value) - 4 : y(p.value) + 12} textAnchor="middle" fontSize={11} fontWeight={700} fill="#e2e8f0">
              {fmt(p.value)}
            </text>
          );
        })()}
      </svg>
      {hover !== null && (
        <Box sx={{ position: "absolute", top: 0, left: Math.min(Math.max(pad.left + hover * step - 40, 0), width - 150), px: 1, py: 0.5, borderRadius: 1, bgcolor: "rgba(15,23,42,0.95)", border: "1px solid rgba(148,163,184,0.25)", pointerEvents: "none" }}>
          <Typography variant="caption" sx={{ display: "block", fontWeight: 700 }}>
            {points[hover].tip}
          </Typography>
        </Box>
      )}
    </Box>
  );
}

/** Črta ravni (BDP na prebivalca) skozi leta. */
function LevelLine({ points, format }: { points: { label: string; value: number }[]; format: (v: number) => string }) {
  const { ref, width } = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  if (points.length < 2) return null;
  const pad = { top: 14, bottom: 22, left: 52, right: 10 };
  const min = Math.min(...points.map((p) => p.value));
  const max = Math.max(...points.map((p) => p.value));
  const lo = min - (max - min) * 0.08;
  const hi = max + (max - min) * 0.08 || max + 1;
  const plotW = width - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;
  const x = (i: number) => pad.left + (i / (points.length - 1)) * plotW;
  const y = (v: number) => pad.top + ((hi - v) / (hi - lo)) * plotH;
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join("");
  const every = Math.ceil(points.length / 6);
  const hp = hover !== null ? points[hover] : null;
  return (
    <Box ref={ref} sx={{ position: "relative" }}>
      <svg
        width={width}
        height={H}
        style={{ display: "block", touchAction: "pan-y" }}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setHover(Math.max(0, Math.min(points.length - 1, Math.round(((e.clientX - r.left - pad.left) / plotW) * (points.length - 1)))));
        }}
        onPointerLeave={() => setHover(null)}
      >
        {[lo, (lo + hi) / 2, hi].map((v) => (
          <g key={v}>
            <line x1={pad.left} x2={width - pad.right} y1={y(v)} y2={y(v)} stroke={GRID} />
            <text x={pad.left - 4} y={y(v) + 4} textAnchor="end" fontSize={10} fill={TEXT}>
              {format(v)}
            </text>
          </g>
        ))}
        {points.map((p, i) =>
          i % every === 0 || i === points.length - 1 ? (
            <text key={p.label} x={x(i)} y={H - 6} textAnchor="middle" fontSize={10} fill={TEXT}>
              {p.label}
            </text>
          ) : null,
        )}
        <path d={d} fill="none" stroke={LINE} strokeWidth={2} strokeLinejoin="round" />
        <circle cx={x(points.length - 1)} cy={y(points[points.length - 1].value)} r={4} fill={LINE} />
        {hp && (
          <>
            <line x1={x(hover!)} x2={x(hover!)} y1={pad.top} y2={pad.top + plotH} stroke="rgba(226,232,240,0.4)" strokeDasharray="3 3" />
            <circle cx={x(hover!)} cy={y(hp.value)} r={5} fill={LINE} stroke="#0f172a" strokeWidth={2} />
          </>
        )}
      </svg>
      {hp && (
        <Box sx={{ position: "absolute", top: 0, left: Math.min(Math.max(x(hover!) - 50, 0), width - 130), px: 1, py: 0.5, borderRadius: 1, bgcolor: "rgba(15,23,42,0.95)", border: "1px solid rgba(148,163,184,0.25)", pointerEvents: "none" }}>
          <Typography variant="caption" sx={{ display: "block", fontWeight: 700 }}>
            {hp.label}: {format(hp.value)}
          </Typography>
        </Box>
      )}
    </Box>
  );
}

function Figure({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Box sx={{ p: 1.25, borderRadius: 2, bgcolor: "rgba(148,163,184,0.06)" }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
        {label}
      </Typography>
      <Typography sx={{ fontWeight: 700, fontSize: 17, fontVariantNumeric: "tabular-nums" }}>{value}</Typography>
      {sub && (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", fontSize: 11 }}>
          {sub}
        </Typography>
      )}
    </Box>
  );
}

function CountryMarket({ iso2 }: { iso2: string }) {
  const { t } = useI18n();
  const [range, setRange] = useState<MarketRange>("1d");
  // Podatki skupaj z obdobjem, za katero so: ob menjavi obdobja se pokaže nalaganje brez dodatnega stanja.
  const [loaded, setLoaded] = useState<{ key: string; items: MarketQuote[] } | null>(null);
  const key = `${iso2}|${range}`;
  const items = loaded?.key === key ? loaded.items : null;
  useEffect(() => {
    let alive = true;
    fetch(`/api/markets?country=${iso2}&range=${range}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => alive && setLoaded({ key: `${iso2}|${range}`, items: d.items ?? [] }))
      .catch(() => alive && setLoaded({ key: `${iso2}|${range}`, items: [] }));
    return () => {
      alive = false;
    };
  }, [iso2, range]);
  return (
    <Box>
      <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 1 }}>
        <ToggleButtonGroup size="small" exclusive value={range} onChange={(_, v) => v && setRange(v)}>
          <ToggleButton value="1d">{t("markets.range.1d")}</ToggleButton>
          <ToggleButton value="1mo">{t("markets.range.1mo")}</ToggleButton>
          <ToggleButton value="1y">{t("markets.range.1y")}</ToggleButton>
        </ToggleButtonGroup>
      </Box>
      {!items ? (
        <Typography color="text.secondary">{t("common.loading")}</Typography>
      ) : (
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(3, 1fr)", md: "repeat(4, 1fr)" }, gap: 1.5 }}>
          {items.map((q) => (
            <Tile key={q.symbol} q={q} range={range} />
          ))}
        </Box>
      )}
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
        {t("markets.source")}
      </Typography>
    </Box>
  );
}

export default function CountryDialog({ economy, name, ranks, onClose }: { economy: Economy; name: string; ranks: { gdp?: number; pc?: number }; onClose: () => void }) {
  const { t, locale } = useI18n();
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("md"));
  const [detail, setDetail] = useState<CountryDetail | null>(null);
  const [failed, setFailed] = useState(false);
  const tr = t as unknown as (k: string) => string;

  useEffect(() => {
    fetch(`/api/economies/country?iso3=${economy.iso3}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setDetail)
      .catch(() => setFailed(true));
  }, [economy.iso3]);

  const money = (n: number | null | undefined, compact = true) =>
    n == null ? "–" : n.toLocaleString(locale, compact ? { notation: "compact", maximumFractionDigits: n >= 1e12 ? 2 : 1, style: "currency", currency: "USD" } : { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const pct = (n: number | null | undefined, sign = true) => (n == null ? "–" : `${sign && n > 0 ? "+" : ""}${n.toLocaleString(locale, { maximumFractionDigits: 1, minimumFractionDigits: 1 })} %`);
  const people = (n: number | null | undefined) => (n == null ? "–" : n.toLocaleString(locale, { notation: "compact", maximumFractionDigits: 1 }));
  const income = detail?.incomeLevel ? tr(`econ.income.${detail.incomeLevel}`) : "";
  const hasMarket = economy.iso2 === "SI" || Boolean(COUNTRY_MARKETS[economy.iso2]);

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="lg" fullScreen={fullScreen}>
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1.5, pr: 1.5 }}>
        <Box component="img" src={`https://flagcdn.com/w80/${economy.iso2.toLowerCase()}.png`} alt="" sx={{ width: 36, height: 24, objectFit: "cover", borderRadius: "3px", boxShadow: "0 0 0 1px rgba(148,163,184,0.3)" }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
            {name}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {[detail?.capital, income && !income.startsWith("econ.") ? income : null].filter(Boolean).join(" · ")}
          </Typography>
        </Box>
        <IconButton onClick={onClose} aria-label={t("common.close")}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(4, 1fr)" }, gap: 1.25 }}>
          <Figure label={t("econ.gdp")} value={money(economy.gdpUsd)} sub={[economy.gdpYear, ranks.gdp ? `#${ranks.gdp}` : null].filter(Boolean).join(" · ")} />
          <Figure label={t("econ.gdpPc")} value={money(economy.gdpPerCapitaUsd, false)} sub={ranks.pc ? `#${ranks.pc}` : undefined} />
          <Figure label={t("econ.growthYear")} value={pct(economy.growthYear)} sub={economy.growthYearOf ?? undefined} />
          <Figure label={t("econ.qoq")} value={pct(economy.qoq)} sub={economy.quarter ? `${economy.quarter.replace("-", " ")} · y/y ${pct(economy.yoyQ)}` : t("econ.noQuarterly")} />
          <Figure label={t("econ.population")} value={people(detail?.population?.value)} sub={detail?.population?.year} />
          <Figure label={t("econ.inflation")} value={pct(detail?.inflation?.value, false)} sub={detail?.inflation?.year} />
          <Figure label={t("econ.unemployment")} value={pct(detail?.unemployment?.value, false)} sub={detail?.unemployment?.year} />
          <Figure label={t("econ.exports")} value={pct(detail?.exports?.value, false)} sub={detail?.exports?.year} />
        </Box>

        {failed && <Typography color="error">{t("econ.detailError")}</Typography>}
        {!detail && !failed && <Typography color="text.secondary">{t("common.loading")}</Typography>}
        {detail && (
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 3 }}>
            <Box>
              <Typography variant="overline" color="text.secondary">
                {t("econ.chart.quarters")}
              </Typography>
              {detail.quarters.length ? (
                <GrowthBars
                  labelEvery={2}
                  points={detail.quarters
                    .filter((q) => q.qoq !== null)
                    .map((q) => ({
                      label: q.quarter.replace(/^\d\d(\d\d)-Q/, "$1 Q"),
                      value: q.qoq!,
                      tip: `${q.quarter.replace("-", " ")}: q/q ${pct(q.qoq)} · y/y ${pct(q.yoy)}`,
                    }))}
                />
              ) : (
                <Typography variant="body2" color="text.secondary">
                  {t("econ.noQuarterly")}
                </Typography>
              )}
            </Box>
            <Box>
              <Typography variant="overline" color="text.secondary">
                {t("econ.chart.growth")}
              </Typography>
              <GrowthBars
                labelEvery={Math.ceil(detail.growth.length / 7)}
                points={detail.growth.map((g) => ({ label: g.year, value: g.value, tip: `${g.year}: ${pct(g.value)}` }))}
              />
            </Box>
            <Box>
              <Typography variant="overline" color="text.secondary">
                {t("econ.chart.perCapita")}
              </Typography>
              <LevelLine points={detail.gdpPerCapita.map((p) => ({ label: p.year, value: p.value }))} format={(v) => money(v)} />
            </Box>
            <Box>
              <Typography variant="overline" color="text.secondary">
                {t("econ.chart.gdp")}
              </Typography>
              <LevelLine points={detail.gdp.map((p) => ({ label: p.year, value: p.value }))} format={(v) => money(v)} />
            </Box>
          </Box>
        )}

        <Box>
          <Typography variant="overline" color="text.secondary" sx={{ display: "block", mb: 1 }}>
            {t("econ.market")}
          </Typography>
          {economy.iso2 === "SI" ? <SloveniaMarket /> : hasMarket ? <CountryMarket iso2={economy.iso2} /> : <Typography color="text.secondary">{t("econ.noMarket")}</Typography>}
        </Box>
        <Typography variant="caption" color="text.secondary">
          {t("econ.detailSource")}
        </Typography>
      </DialogContent>
    </Dialog>
  );
}
