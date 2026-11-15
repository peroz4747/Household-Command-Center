"use client";

// Grafi in številke za okno države (zavihka Gospodarstvo in Obramba).
import { useEffect, useRef, useState } from "react";
import { Box, Button, Typography } from "@mui/material";
import type { InfoText } from "../../lib/countryInfo";
import { useI18n } from "../i18n";

// Rast: statusni barvi (vedno s predznakom); raven: en sam modri odtenek.
const UP = "#22c55e";
const DOWN = "#f87171";
const LINE = "#3987e5";
const GRID = "rgba(148,163,184,0.14)";
const TEXT = "#c3c2b7";
const H = 170;

export function useWidth() {
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
export function GrowthBars({ points, labelEvery = 1 }: { points: { label: string; value: number; tip: string }[]; labelEvery?: number }) {
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
export function LevelLine({ points, format, color = LINE }: { points: { label: string; value: number }[]; format: (v: number) => string; color?: string }) {
  const { ref, width } = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  if (points.length < 2) return null;
  const pad = { top: 14, bottom: 22, left: 72, right: 10 };
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
            <text key={p.label} x={x(i)} y={H - 6} textAnchor={i === points.length - 1 ? "end" : i === 0 ? "start" : "middle"} fontSize={10} fill={TEXT}>
              {p.label}
            </text>
          ) : null,
        )}
        <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
        <circle cx={x(points.length - 1)} cy={y(points[points.length - 1].value)} r={4} fill={color} />
        {hp && (
          <>
            <line x1={x(hover!)} x2={x(hover!)} y1={pad.top} y2={pad.top + plotH} stroke="rgba(226,232,240,0.4)" strokeDasharray="3 3" />
            <circle cx={x(hover!)} cy={y(hp.value)} r={5} fill={color} stroke="#0f172a" strokeWidth={2} />
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

export function Figure({ label, value, sub }: { label: string; value: string; sub?: string }) {
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

const PREVIEW = 600;

export function InfoBlock({ heading, info }: { heading: string; info: InfoText }) {
  const { t, lang } = useI18n();
  const [more, setMore] = useState(false);
  const long = info.text.length > PREVIEW + 100;
  const shown = !long || more ? info.text : `${info.text.slice(0, info.text.lastIndexOf(" ", PREVIEW))} …`;
  return (
    <Box>
      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
        {heading}
        {info.lang !== lang && (
          <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1, fontWeight: 400 }}>
            {t("econ.info.otherLang", { lang: info.lang.toUpperCase() })}
          </Typography>
        )}
      </Typography>
      {shown.split(/\n{2,}/).map((para, i) => (
        <Typography key={i} variant="body2" sx={{ mb: 1, whiteSpace: "pre-line", lineHeight: 1.6, color: "text.secondary" }}>
          {para}
        </Typography>
      ))}
      <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
        {long && (
          <Button size="small" onClick={() => setMore(!more)} sx={{ px: 0, minWidth: 0 }}>
            {more ? t("econ.info.less") : t("econ.info.more")}
          </Button>
        )}
        <Button size="small" href={info.url} target="_blank" rel="noreferrer" sx={{ textTransform: "none" }}>
          {t("econ.info.source", { title: info.title })} ↗
        </Button>
      </Box>
    </Box>
  );
}
