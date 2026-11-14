"use client";

import { useEffect, useRef, useState } from "react";
import { Box, Card, CardContent, Link, Tab, Table, TableBody, TableCell, TableHead, TableRow, Tabs, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from "@mui/material";
import { useI18n } from "../i18n";
import type { MarketQuote, MarketRange } from "../../lib/markets";
import type { LjseData } from "../../lib/ljse";

// Rast/padec: statusni barvi, vedno skupaj s puščico in predznakom (ne le barva).
const UP = "#22c55e";
const DOWN = "#f87171";
const FLAT = "#94a3b8";
const POLL_MS = 2 * 60_000;
const W = 220;
const H = 56;

const tzOf = (q: MarketQuote) => (q.group === "index" && q.symbol === "^N225" ? "Asia/Tokyo" : undefined);

function Sparkline({ q, range, color, onHover }: { q: MarketQuote; range: MarketRange; color: string; onHover: (p: [number, number] | null) => void }) {
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const pts = q.points;
  if (pts.length < 2) return <Box sx={{ height: H }} />;
  const values = pts.map((p) => p[1]);
  const base = q.rangeStart;
  const min = Math.min(...values, base ?? Infinity);
  const max = Math.max(...values, base ?? -Infinity);
  const t0 = pts[0][0];
  const t1 = pts[pts.length - 1][0];
  // Pri 1 dnevu os X pokriva cel trgovalni dan, da je vidno, koliko seje je že minilo.
  const span = Math.max(1, t1 - t0);
  const x = (t: number) => ((t - t0) / span) * (W - 4) + 2;
  const y = (v: number) => H - 4 - ((v - min) / Math.max(1e-9, max - min)) * (H - 8);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join("");
  const area = `${d}L${x(t1).toFixed(1)},${H}L${x(t0).toFixed(1)},${H}Z`;
  const move = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const t = t0 + ((e.clientX - rect.left) / rect.width) * span;
    let best = 0;
    for (let i = 1; i < pts.length; i += 1) if (Math.abs(pts[i][0] - t) < Math.abs(pts[best][0] - t)) best = i;
    setHover(best);
    onHover(pts[best]);
  };
  const hp = hover !== null ? pts[hover] : null;
  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      width="100%"
      height={H}
      onPointerMove={move}
      onPointerLeave={() => {
        setHover(null);
        onHover(null);
      }}
      style={{ display: "block", touchAction: "pan-y", cursor: "crosshair" }}
      aria-hidden
      data-range={range}
    >
      <defs>
        <linearGradient id={`g-${q.symbol.replace(/\W/g, "")}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.25" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {base !== null && <line x1={0} x2={W} y1={y(base)} y2={y(base)} stroke="rgba(148,163,184,0.35)" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />}
      <path d={area} fill={`url(#g-${q.symbol.replace(/\W/g, "")})`} />
      <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      {hp && <line x1={x(hp[0])} x2={x(hp[0])} y1={0} y2={H} stroke="rgba(226,232,240,0.5)" vectorEffect="non-scaling-stroke" />}
    </svg>
  );
}

function Tile({ q, range }: { q: MarketQuote; range: MarketRange }) {
  const { t, locale } = useI18n();
  const [hover, setHover] = useState<[number, number] | null>(null);
  const tr = t as unknown as (key: string) => string;
  const nameKey = `markets.name.${q.symbol}`;
  const name = tr(nameKey) === nameKey ? q.name : tr(nameKey);
  const decimals = q.group === "fx" ? 4 : (q.price ?? 0) >= 1000 ? 0 : 2;
  const fmt = (n: number) => n.toLocaleString(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  // Sprememba: pri 1 dnevu glede na včerajšnje zaprtje, sicer glede na začetek obdobja.
  const ref = range === "1d" ? q.previousClose : q.rangeStart;
  const shown = hover?.[1] ?? q.price;
  const pct = shown !== null && ref ? ((shown - ref) / ref) * 100 : null;
  const color = pct === null || Math.abs(pct) < 0.005 ? FLAT : pct > 0 ? UP : DOWN;
  const cur = q.currency === "EUR" ? " €" : q.currency === "USD" && q.group !== "fx" ? " $" : q.currency === "JPY" ? " ¥" : "";
  const when = hover
    ? new Date(hover[0]).toLocaleString(locale, range === "1d" ? { hour: "2-digit", minute: "2-digit", timeZone: tzOf(q) } : { day: "numeric", month: "numeric", year: range === "1y" ? "2-digit" : undefined })
    : null;

  return (
    <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: "rgba(148,163,184,0.06)", border: "1px solid rgba(148,163,184,0.1)", minWidth: 0 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 1 }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
          {name}
        </Typography>
        <Tooltip title={q.open ? t("markets.openTip") : t("markets.closedTip")}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, flexShrink: 0 }}>
            <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: q.open ? UP : "rgba(148,163,184,0.5)" }} />
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>
              {q.open ? t("markets.open") : t("markets.closed")}
            </Typography>
          </Box>
        </Tooltip>
      </Box>
      <Box sx={{ display: "flex", alignItems: "baseline", gap: 1, mt: 0.5, flexWrap: "wrap" }}>
        <Typography sx={{ fontWeight: 700, fontSize: 18, fontVariantNumeric: "tabular-nums" }}>{shown !== null ? `${fmt(shown)}${cur}` : "–"}</Typography>
        {pct !== null && (
          <Typography variant="caption" sx={{ color, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
            {pct > 0.005 ? "▲ +" : pct < -0.005 ? "▼ " : ""}
            {pct.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %
          </Typography>
        )}
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", fontSize: 10, minHeight: 15 }}>
        {when ?? t(`markets.vs.${range}`)}
      </Typography>
      <Box sx={{ mt: 0.5 }}>
        <Sparkline q={q} range={range} color={color} onHover={setHover} />
      </Box>
    </Box>
  );
}

function WorldMarkets({ range }: { range: MarketRange }) {
  const { t } = useI18n();
  const [items, setItems] = useState<MarketQuote[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch(`/api/markets?range=${range}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => {
          if (!alive) return;
          setItems(d.items ?? []);
          setError(false);
        })
        .catch(() => alive && setError(true));
    void load();
    const id = setInterval(load, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [range]);

  if (error && !items) return <Typography color="error">{t("markets.error")}</Typography>;
  if (!items) return <Typography color="text.secondary">{t("common.loading")}</Typography>;
  return (
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, 1fr)", sm: "repeat(3, 1fr)", md: "repeat(4, 1fr)", lg: "repeat(6, 1fr)" }, gap: 1.5 }}>
      {items.map((q) => (
        <Tile key={q.symbol} q={q} range={range} />
      ))}
    </Box>
  );
}

/** Ljubljanska borza trguje ob delavnikih 9:15–15:30 (neprekinjeno trgovanje). */
function ljseOpen(now: Date): boolean {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Ljubljana", weekday: "short", hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(now).map((x) => [x.type, x.value]),
  );
  const minutes = Number(p.hour) * 60 + Number(p.minute);
  return !["Sat", "Sun"].includes(p.weekday) && minutes >= 9 * 60 + 15 && minutes < 15 * 60 + 30;
}

function SloveniaMarket() {
  const { t, locale } = useI18n();
  const [data, setData] = useState<LjseData | null>(null);
  const [error, setError] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/markets/si", { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => {
          if (!alive) return;
          if (d.error) throw new Error();
          setData(d);
          setError(false);
          setNow(new Date());
        })
        .catch(() => alive && setError(true));
    void load();
    const id = setInterval(load, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  if (error && !data) return <Typography color="error">{t("markets.error")}</Typography>;
  if (!data) return <Typography color="text.secondary">{t("common.loading")}</Typography>;
  const open = ljseOpen(now);
  const quotes: MarketQuote[] = data.indices.map((i) => {
    const prev = i.value !== null && i.changePct !== null ? i.value / (1 + i.changePct / 100) : null;
    return { symbol: i.isin, name: i.name, group: "index", price: i.value, previousClose: prev, currency: null, open, points: i.moves, rangeStart: prev, updatedAt: i.moves.at(-1)?.[0] ?? null };
  });
  const eur = (n: number) => n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: n < 10 ? 4 : 2 });
  return (
    <Box>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(3, 1fr)" }, gap: 1.5, mb: 2 }}>
        {quotes.map((q) => (
          <Tile key={q.symbol} q={q} range="1d" />
        ))}
      </Box>
      <Box sx={{ overflowX: "auto" }}>
        <Table size="small" sx={{ "& td, & th": { borderColor: "rgba(148,163,184,0.12)", whiteSpace: "nowrap" } }}>
          <TableHead>
            <TableRow>
              <TableCell>{t("markets.si.company")}</TableCell>
              <TableCell>{t("markets.si.segment")}</TableCell>
              <TableCell align="right">{t("markets.si.price")}</TableCell>
              <TableCell align="right">{t("markets.si.change")}</TableCell>
              <TableCell align="right">{t("markets.si.turnover")}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {data.shares.map((s) => {
              const pct = s.changePct;
              const color = pct === null || Math.abs(pct) < 0.005 ? FLAT : pct > 0 ? UP : DOWN;
              return (
                <TableRow key={s.isin} hover>
                  <TableCell>
                    <Link href={`https://ljse.si/si/papir/310?isin=${s.isin}`} target="_blank" rel="noreferrer" underline="hover" color="inherit" sx={{ fontWeight: 600 }}>
                      {s.name}
                    </Link>
                    <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                      {s.symbol}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" color="text.secondary">
                      {s.segment === "A" ? t("markets.si.prime") : t("markets.si.standard")}
                    </Typography>
                  </TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                    {s.price !== null ? `${eur(s.price)} €` : s.prevClose !== null ? (
                      <Tooltip title={t("markets.si.noTradeTip")}>
                        <Box component="span" sx={{ color: "text.secondary", fontWeight: 400 }}>
                          {eur(s.prevClose)} €
                        </Box>
                      </Tooltip>
                    ) : (
                      "–"
                    )}
                  </TableCell>
                  <TableCell align="right" sx={{ color, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                    {pct === null ? (
                      <Typography component="span" variant="caption" color="text.secondary">
                        {t("markets.si.noTrade")}
                      </Typography>
                    ) : (
                      `${pct > 0.005 ? "▲ +" : pct < -0.005 ? "▼ " : ""}${pct.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`
                    )}
                  </TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums", color: "text.secondary" }}>
                    {s.turnover !== null ? `${Math.round(s.turnover).toLocaleString(locale)} €` : "–"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
        {t("markets.si.note", { time: data.timestamp ? new Date(data.timestamp).toLocaleString(locale, { weekday: "short", hour: "2-digit", minute: "2-digit" }) : "–" })}
      </Typography>
    </Box>
  );
}

export default function MarketOverview() {
  const { t } = useI18n();
  const [tab, setTab] = useState<"world" | "si">("world");
  const [range, setRange] = useState<MarketRange>("1d");

  return (
    <Card>
      <CardContent>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 2, flexWrap: "wrap", mb: 1 }}>
          <Box>
            <Typography variant="subtitle2" color="secondary">
              {t("markets.overline")}
            </Typography>
            <Typography variant="h6" sx={{ mt: 1, fontWeight: 700 }}>
              {t("markets.title")}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {tab === "world" ? t("markets.source") : t("markets.si.source")}
            </Typography>
          </Box>
          {tab === "world" && (
            <ToggleButtonGroup size="small" exclusive value={range} onChange={(_, v) => v && setRange(v)}>
              <ToggleButton value="1d">{t("markets.range.1d")}</ToggleButton>
              <ToggleButton value="1mo">{t("markets.range.1mo")}</ToggleButton>
              <ToggleButton value="1y">{t("markets.range.1y")}</ToggleButton>
            </ToggleButtonGroup>
          )}
        </Box>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2, minHeight: 36, "& .MuiTab-root": { minHeight: 36 } }}>
          <Tab value="world" label={t("markets.tab.world")} />
          <Tab value="si" label={t("markets.tab.si")} />
        </Tabs>
        {tab === "world" ? <WorldMarkets range={range} /> : <SloveniaMarket />}
      </CardContent>
    </Card>
  );
}
