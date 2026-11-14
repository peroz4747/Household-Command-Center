"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Box, Dialog, DialogContent, DialogTitle, IconButton, ToggleButton, ToggleButtonGroup, Typography, useMediaQuery, useTheme } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import ReportProblemOutlinedIcon from "@mui/icons-material/ReportProblemOutlined";
import { useI18n } from "../i18n";
import type { InternetHistory, SpeedSample } from "../../lib/internetHistory";

// Dashboard je vedno temen: barve iz referenčne palete za temno ozadje (rež 1 in 2).
const C = {
  down: "#3987e5",
  up: "#d95926",
  outage: "rgba(230,103,103,0.22)",
  outageEdge: "#e66767",
  grid: "rgba(148,163,184,0.14)",
  axis: "rgba(148,163,184,0.7)",
  text: "#c3c2b7",
};
const RANGES = { day: 86_400_000, week: 7 * 86_400_000, month: 30 * 86_400_000 } as const;
type Range = keyof typeof RANGES;
const H = 240;
const PAD = { top: 12, right: 12, bottom: 26, left: 44 };

function niceMax(v: number) {
  if (v <= 0) return 10;
  const p = 10 ** Math.floor(Math.log10(v));
  return Math.ceil(v / p / (v / p > 5 ? 2 : 1)) * p * (v / p > 5 ? 2 : 1);
}

function Chart({ history, range }: { history: InternetHistory; range: Range }) {
  const { t, locale } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [hover, setHover] = useState<SpeedSample | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const [now] = useState(() => Date.now()); // dialog je odprt kratek čas; čas odprtja zadošča
  const from = now - RANGES[range];
  const samples = history.speed.filter((s) => s.at >= from);
  const outages = history.outages.filter((o) => o.to >= from);
  const ok = samples.filter((s) => s.downloadMbps !== null);
  const yMax = niceMax(Math.max(10, ...ok.map((s) => Math.max(s.downloadMbps ?? 0, s.uploadMbps ?? 0))));
  const plotW = Math.max(100, width - PAD.left - PAD.right);
  const plotH = H - PAD.top - PAD.bottom;
  const x = (at: number) => PAD.left + ((at - from) / (now - from)) * plotW;
  const y = (v: number) => PAD.top + plotH - (v / yMax) * plotH;

  // Črta se pretrga pri neuspeli meritvi ali razmiku > 3 h (strežnik ni tekel).
  const path = (key: "downloadMbps" | "uploadMbps") => {
    let d = "";
    let prev: SpeedSample | null = null;
    for (const s of samples) {
      const v = s[key];
      if (v === null) {
        prev = null;
        continue;
      }
      d += `${!prev || s.at - prev.at > 3 * 3_600_000 ? "M" : "L"}${x(s.at).toFixed(1)},${y(v).toFixed(1)}`;
      prev = s;
    }
    return d;
  };

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * yMax);
  const xTicks = useMemo(() => {
    const out: number[] = [];
    const step = range === "day" ? 6 * 3_600_000 : range === "week" ? 86_400_000 : 5 * 86_400_000;
    const start = new Date(from);
    start.setMinutes(0, 0, 0);
    if (range !== "day") start.setHours(0);
    for (let t0 = start.getTime() + step; t0 < now; t0 += step) out.push(t0);
    return out;
  }, [from, now, range]);
  const fmtX = (ms: number) =>
    range === "day" ? new Date(ms).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }) : new Date(ms).toLocaleDateString(locale, { day: "numeric", month: "numeric" });

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const at = from + ((e.clientX - rect.left - PAD.left) / plotW) * (now - from);
    let best: SpeedSample | null = null;
    for (const s of samples) if (!best || Math.abs(s.at - at) < Math.abs(best.at - at)) best = s;
    setHover(best && Math.abs(best.at - at) < (now - from) / 20 ? best : null);
  };

  const fail = samples.length - ok.length;
  const avg = (key: "downloadMbps" | "uploadMbps") => (ok.length ? Math.round(ok.reduce((a, s) => a + (s[key] ?? 0), 0) / ok.length) : null);
  const minDown = ok.length ? Math.round(Math.min(...ok.map((s) => s.downloadMbps!))) : null;
  const outageMin = Math.round(outages.reduce((a, o) => a + (Math.min(o.to, now) - Math.max(o.from, from)), 0) / 60_000);

  return (
    <Box>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(4, 1fr)" }, gap: 2, mb: 2 }}>
        {[
          [t("net.avgDown"), avg("downloadMbps") !== null ? `${avg("downloadMbps")} Mbps` : "–"],
          [t("net.minDown"), minDown !== null ? `${minDown} Mbps` : "–"],
          [t("net.avgUp"), avg("uploadMbps") !== null ? `${avg("uploadMbps")} Mbps` : "–"],
          [t("net.outages"), t("net.outageSummary", { n: outages.length, min: outageMin })],
        ].map(([label, value]) => (
          <Box key={label}>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
              {label}
            </Typography>
            <Typography sx={{ fontWeight: 700, fontSize: 18 }}>{value}</Typography>
          </Box>
        ))}
      </Box>
      <Box sx={{ display: "flex", gap: 2, mb: 1, flexWrap: "wrap" }}>
        {[
          [C.down, t("net.download")],
          [C.up, t("net.upload")],
        ].map(([color, label]) => (
          <Box key={label} sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
            <Box sx={{ width: 14, height: 2, bgcolor: color, borderRadius: 1 }} />
            <Typography variant="caption" color="text.secondary">
              {label}
            </Typography>
          </Box>
        ))}
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
          <Box sx={{ width: 14, height: 10, bgcolor: C.outage, borderLeft: `2px solid ${C.outageEdge}` }} />
          <Typography variant="caption" color="text.secondary">
            {t("net.outage")}
          </Typography>
        </Box>
      </Box>
      <Box ref={ref} sx={{ position: "relative" }}>
        <svg width={width} height={H} onPointerMove={onMove} onPointerLeave={() => setHover(null)} style={{ display: "block", touchAction: "pan-y" }} role="img" aria-label={t("net.chartAria")}>
          {ticks.map((v) => (
            <g key={v}>
              <line x1={PAD.left} x2={PAD.left + plotW} y1={y(v)} y2={y(v)} stroke={C.grid} />
              <text x={PAD.left - 6} y={y(v) + 4} textAnchor="end" fontSize={11} fill={C.text}>
                {Math.round(v)}
              </text>
            </g>
          ))}
          <text x={PAD.left - 6} y={PAD.top - 2} textAnchor="end" fontSize={10} fill={C.axis}>
            Mbps
          </text>
          {xTicks.map((ms) => (
            <text key={ms} x={x(ms)} y={H - 8} textAnchor="middle" fontSize={11} fill={C.text}>
              {fmtX(ms)}
            </text>
          ))}
          {outages.map((o) => {
            const x1 = x(Math.max(o.from, from));
            const x2 = Math.max(x1 + 2, x(Math.min(o.to, now)));
            return (
              <g key={o.from}>
                <rect x={x1} y={PAD.top} width={x2 - x1} height={plotH} fill={C.outage} />
                <line x1={x1} x2={x1} y1={PAD.top} y2={PAD.top + plotH} stroke={C.outageEdge} strokeWidth={2} />
              </g>
            );
          })}
          <path d={path("uploadMbps")} fill="none" stroke={C.up} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          <path d={path("downloadMbps")} fill="none" stroke={C.down} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {samples.length <= 60 &&
            ok.map((s) => <circle key={s.at} cx={x(s.at)} cy={y(s.downloadMbps!)} r={2.5} fill={C.down} />)}
          {samples
            .filter((s) => s.downloadMbps === null)
            .map((s) => (
              <text key={s.at} x={x(s.at)} y={PAD.top + plotH - 4} textAnchor="middle" fontSize={11} fill={C.outageEdge}>
                ×
              </text>
            ))}
          {hover && (
            <g pointerEvents="none">
              <line x1={x(hover.at)} x2={x(hover.at)} y1={PAD.top} y2={PAD.top + plotH} stroke={C.axis} strokeDasharray="3 3" />
              {hover.downloadMbps !== null && <circle cx={x(hover.at)} cy={y(hover.downloadMbps)} r={5} fill={C.down} stroke="#0f172a" strokeWidth={2} />}
              {hover.uploadMbps !== null && <circle cx={x(hover.at)} cy={y(hover.uploadMbps)} r={5} fill={C.up} stroke="#0f172a" strokeWidth={2} />}
            </g>
          )}
        </svg>
        {hover && (
          <Box
            sx={{
              position: "absolute",
              top: 4,
              left: Math.min(Math.max(x(hover.at) + 10, 0), width - 170),
              width: 160,
              p: 1,
              borderRadius: 1,
              bgcolor: "rgba(15,23,42,0.95)",
              border: "1px solid rgba(148,163,184,0.25)",
              pointerEvents: "none",
            }}
          >
            <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
              {new Date(hover.at).toLocaleString(locale, { weekday: "short", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" })}
            </Typography>
            {hover.downloadMbps === null ? (
              <Typography variant="caption" sx={{ display: "block", fontWeight: 600 }}>
                {t("net.failed")}
              </Typography>
            ) : (
              <>
                <Typography variant="caption" sx={{ display: "block" }}>
                  ↓ <b>{Math.round(hover.downloadMbps)}</b> · ↑ <b>{Math.round(hover.uploadMbps ?? 0)}</b> Mbps
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                  {t("net.ping", { n: hover.pingMs ?? "–" })}
                </Typography>
              </>
            )}
          </Box>
        )}
      </Box>
      {!samples.length && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          {t("net.noData")}
        </Typography>
      )}
      {fail > 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
          {t("net.failedCount", { n: fail })}
        </Typography>
      )}
      {outages.length > 0 && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="overline" color="text.secondary">
            {t("net.outageList")}
          </Typography>
          {[...outages].reverse().slice(0, 10).map((o) => (
            <Box key={o.from} sx={{ display: "flex", gap: 1, alignItems: "center", py: 0.25 }}>
              <ReportProblemOutlinedIcon sx={{ fontSize: 16, color: C.outageEdge }} />
              <Typography variant="body2">
                {new Date(o.from).toLocaleString(locale, { weekday: "short", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" })} ·{" "}
                {t("net.minutes", { n: Math.max(1, Math.round((o.to - o.from) / 60_000)) })}
              </Typography>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

export default function InternetHistoryDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("md"));
  const [history, setHistory] = useState<InternetHistory | null>(null);
  const [range, setRange] = useState<Range>("week");

  useEffect(() => {
    fetch("/api/internet/history", { cache: "no-store" })
      .then((r) => r.json())
      .then(setHistory)
      .catch(() => setHistory({ speed: [], outages: [] }));
  }, []);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md" fullScreen={fullScreen}>
      <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", pr: 1.5, gap: 1 }}>
        {t("net.historyTitle")}
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <ToggleButtonGroup size="small" exclusive value={range} onChange={(_, v) => v && setRange(v)}>
            <ToggleButton value="day">{t("net.range.day")}</ToggleButton>
            <ToggleButton value="week">{t("net.range.week")}</ToggleButton>
            <ToggleButton value="month">{t("net.range.month")}</ToggleButton>
          </ToggleButtonGroup>
          <IconButton onClick={onClose} aria-label={t("common.close")}>
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>
      <DialogContent>
        {history ? <Chart history={history} range={range} /> : <Typography color="text.secondary">{t("common.loading")}</Typography>}
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 2 }}>
          {t("net.historyNote")}
        </Typography>
      </DialogContent>
    </Dialog>
  );
}
