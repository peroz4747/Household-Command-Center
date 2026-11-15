"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Box, ListSubheader, MenuItem, TextField, Typography } from "@mui/material";
import { useI18n } from "../i18n";
import type { Economy } from "../../lib/economies";

// 3D globus (globe.gl na three.js): države obarvane po izbranem kazalniku, vrtenje z miško, klik odpre državo.
// Gospodarstvo: od rdeče (nizko / padec) prek rumene do zelene (visoko / rast), kot je želel uporabnik.
// Obramba: en vijoličen odtenek (več ni ne dobro ne slabo); konflikti: rdeči odtenki.
export type GlobeMetric = "gdpPerCapitaUsd" | "gdpUsd" | "growthYear" | "qoq" | "milPct" | "milUsd" | "armedForces" | "conflict";
const ECONOMY: GlobeMetric[] = ["gdpPerCapitaUsd", "gdpUsd", "growthYear", "qoq"];
const DEFENSE: GlobeMetric[] = ["conflict", "milPct", "milUsd", "armedForces"];

const NO_DATA = "#243041";
const OCEAN = "#0b1a33";
const RED = "#dc2626";
const YELLOW = "#eab308";
const GREEN = "#16a34a";
const MIL: [string, string] = ["#3b2a66", "#c4b5fd"];
const WAR = "#b91c1c";
const MINOR = "#f87171";
const PEACE = "#334155";
const CLAMP: Record<"growthYear" | "qoq", number> = { growthYear: 6, qoq: 1.5 };

type Feature = { type: "Feature"; properties: { iso2: string; name: string }; geometry: unknown };

const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
function mix(a: string, b: string, t: number) {
  const [x, y] = [hex(a), hex(b)];
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * Math.max(0, Math.min(1, t)))).join(",")})`;
}

export default function WorldGlobe({ items, onSelect }: { items: Economy[]; onSelect: (e: Economy, tab?: "economy" | "defense") => void }) {
  const { t: tt, locale } = useI18n();
  const t = tt as unknown as (key: string, vars?: Record<string, string | number>) => string;
  const ref = useRef<HTMLDivElement>(null);
  const globe = useRef<any>(null);
  const [metric, setMetric] = useState<GlobeMetric>("gdpPerCapitaUsd");
  const [features, setFeatures] = useState<Feature[] | null>(null);
  const [failed, setFailed] = useState(false);
  const byIso = useMemo(() => new Map(items.map((e) => [e.iso2, e])), [items]);
  const names = useMemo(() => {
    try {
      return new Intl.DisplayNames([locale], { type: "region" });
    } catch {
      return null;
    }
  }, [locale]);

  // Razpon za logaritemsko lestvico ravni.
  const range = useMemo(() => {
    if (metric === "conflict") return { min: 0, max: 1, log: false };
    const vals = items.map((e) => e[metric]).filter((v): v is number => v !== null && v > 0);
    // % BDP za obrambo linearno (ozek razpon), zneski in osebje logaritemsko.
    const log = metric !== "milPct";
    const f = (v: number) => (log ? Math.log10(v) : v);
    return { min: f(Math.min(...vals)), max: metric === "milPct" ? Math.min(6, Math.max(...vals)) : f(Math.max(...vals)), log };
  }, [items, metric]);

  const valueOf = (e: Economy | undefined): number | null => {
    if (!e) return null;
    if (metric === "conflict") return e.conflict === "war" ? 2 : e.conflict ? 1 : 0;
    return e[metric];
  };

  const ramp = (t: number) => (t < 0.5 ? mix(RED, YELLOW, t * 2) : mix(YELLOW, GREEN, (t - 0.5) * 2));

  const colorOf = (v: number | null): string => {
    if (v === null) return NO_DATA;
    if (metric === "conflict") return v === 2 ? WAR : v === 1 ? MINOR : PEACE;
    if (metric === "growthYear" || metric === "qoq") {
      const c = CLAMP[metric];
      return ramp(0.5 + Math.max(-1, Math.min(1, v / c)) / 2);
    }
    if (v <= 0) return NO_DATA;
    const t = ((range.log ? Math.log10(v) : v) - range.min) / Math.max(0.01, range.max - range.min);
    return DEFENSE.includes(metric) ? mix(MIL[0], MIL[1], t) : ramp(Math.max(0, Math.min(1, t)));
  };

  const fmt = (v: number | null) => {
    if (v === null) return t("econ.globe.noData");
    if (metric === "conflict") return v === 2 ? t("econ.conflict.war") : v === 1 ? t("econ.conflict.minor") : t("econ.conflict.none");
    if (metric === "growthYear" || metric === "qoq") return `${v > 0 ? "+" : ""}${v.toLocaleString(locale, { maximumFractionDigits: 1 })} %`;
    if (metric === "milPct") return `${v.toLocaleString(locale, { maximumFractionDigits: 1 })} %`;
    if (metric === "armedForces") return v.toLocaleString(locale, { notation: "compact", maximumFractionDigits: 1 });
    const compact = metric === "gdpUsd" || metric === "milUsd";
    return v.toLocaleString(locale, { style: "currency", currency: "USD", notation: compact ? "compact" : "standard", maximumFractionDigits: compact ? 1 : 0 });
  };

  // Meje držav (Natural Earth 1:110m, poenostavljene; public/data/world.geojson).
  useEffect(() => {
    fetch("/data/world.geojson")
      .then((r) => r.json())
      .then((d) => setFeatures(d.features))
      .catch(() => setFailed(true));
  }, []);

  // Globus ustvarimo enkrat; barve in oznake osvežimo ob menjavi kazalnika.
  useEffect(() => {
    const el = ref.current;
    if (!el || !features) return;
    let cancelled = false;
    let ro: ResizeObserver | null = null;
    void Promise.all([import("globe.gl"), import("three")])
      .then(([{ default: Globe }, THREE]) => {
        if (cancelled) return;
        const g = new (Globe as any)(el, { animateIn: true });
        g.backgroundColor("rgba(0,0,0,0)")
          .showAtmosphere(true)
          .atmosphereColor("#3987e5")
          .atmosphereAltitude(0.16)
          .polygonsData(features)
          .polygonSideColor(() => "rgba(15,23,42,0.7)")
          .polygonStrokeColor(() => "rgba(8,15,30,0.9)")
          .polygonAltitude(0.008)
          .polygonsTransitionDuration(250)
          .width(el.clientWidth)
          .height(el.clientHeight);
        (g.globeMaterial() as InstanceType<typeof THREE.MeshPhongMaterial>).color = new THREE.Color(OCEAN);
        g.pointOfView({ lat: 44, lng: 15, altitude: 1.6 }, 0);
        const controls = g.controls();
        controls.autoRotate = true;
        controls.autoRotateSpeed = 0.35;
        controls.enableZoom = true;
        // Ob prvem dotiku se samodejno vrtenje ustavi.
        el.addEventListener("pointerdown", () => (controls.autoRotate = false), { once: true });
        ro = new ResizeObserver(() => g.width(el.clientWidth).height(el.clientHeight));
        ro.observe(el);
        globe.current = g;
        setFeatures((f) => (f ? [...f] : f)); // sproži prvo barvanje
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      ro?.disconnect();
      const g = globe.current;
      globe.current = null;
      try {
        g?.pauseAnimation?.();
        g?.renderer?.().dispose();
        g?._destructor?.();
      } catch {
        /* že odstranjeno */
      }
      el.innerHTML = "";
    };
    // Globus naj nastane le enkrat, ko so meje naložene.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [features === null]);

  useEffect(() => {
    const g = globe.current;
    if (!g) return;
    let hovered: Feature | null = null;
    const valueAt = (f: Feature) => valueOf(byIso.get(f.properties.iso2));
    const label = (f: Feature) => {
      const e = byIso.get(f.properties.iso2);
      let name = f.properties.name;
      try {
        name = names?.of(f.properties.iso2) ?? name;
      } catch {
        /* neznana koda */
      }
      const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
      return `<div style="background:rgba(15,23,42,.95);border:1px solid rgba(148,163,184,.3);border-radius:6px;padding:6px 8px;font:12px system-ui;color:#e2e8f0">
        <b>${esc(name)}</b><br/>${esc(t(`econ.globe.metric.${metric}`))}: <b>${esc(fmt(valueAt(f)))}</b>${e ? `<br/><span style="color:#94a3b8">${esc(t("econ.globe.click"))}</span>` : ""}</div>`;
    };
    g.polygonCapColor((f: Feature) => (f === hovered ? "#f8fafc" : colorOf(valueAt(f))))
      .polygonAltitude((f: Feature) => (f === hovered ? 0.03 : 0.008))
      .polygonLabel(label)
      .onPolygonHover((f: Feature | null) => {
        hovered = f;
        ref.current!.style.cursor = f && byIso.has(f.properties.iso2) ? "pointer" : "grab";
        g.polygonCapColor(g.polygonCapColor()).polygonAltitude(g.polygonAltitude());
      })
      .onPolygonClick((f: Feature) => {
        const e = byIso.get(f.properties.iso2);
        if (e) onSelect(e, DEFENSE.includes(metric) ? "defense" : "economy");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metric, byIso, features, locale]);

  const diverging = metric === "growthYear" || metric === "qoq";
  const back = (x: number) => (range.log ? 10 ** x : x);
  const legendStops =
    metric === "conflict"
      ? `linear-gradient(90deg, ${PEACE} 0 33%, ${MINOR} 33% 66%, ${WAR} 66%)`
      : DEFENSE.includes(metric)
        ? `linear-gradient(90deg, ${MIL[0]}, ${MIL[1]})`
        : `linear-gradient(90deg, ${RED}, ${YELLOW}, ${GREEN})`;
  const legendLabels =
    metric === "conflict"
      ? [fmt(0), fmt(1), fmt(2)]
      : diverging
        ? [fmt(-CLAMP[metric as "qoq"]), "0 %", fmt(CLAMP[metric as "qoq"])]
        : [fmt(back(range.min)), fmt(back((range.min + range.max) / 2)), `${fmt(back(range.max))}${metric === "milPct" ? "+" : ""}`];

  return (
    <Box>
      <Box sx={{ display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap", mb: 1 }}>
        <TextField select size="small" label={t("econ.globe.colorBy")} value={metric} onChange={(e) => setMetric(e.target.value as GlobeMetric)} sx={{ minWidth: 240 }}>
          <ListSubheader>{t("econ.tab.economy")}</ListSubheader>
          {ECONOMY.map((m) => (
            <MenuItem key={m} value={m}>
              {t(`econ.globe.metric.${m}`)}
            </MenuItem>
          ))}
          <ListSubheader>{t("econ.tab.defense")}</ListSubheader>
          {DEFENSE.map((m) => (
            <MenuItem key={m} value={m}>
              {t(`econ.globe.metric.${m}`)}
            </MenuItem>
          ))}
        </TextField>
        <Box sx={{ flex: 1, minWidth: 220, maxWidth: 420 }}>
          <Box sx={{ height: 10, borderRadius: 5, background: legendStops }} />
          <Box sx={{ display: "flex", justifyContent: "space-between", mt: 0.5 }}>
            {legendLabels.map((l, i) => (
              <Typography key={i} variant="caption" color="text.secondary" sx={{ fontVariantNumeric: "tabular-nums" }}>
                {l}
              </Typography>
            ))}
          </Box>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
          <Box sx={{ width: 14, height: 10, borderRadius: 1, bgcolor: NO_DATA, border: "1px solid rgba(148,163,184,0.3)" }} />
          <Typography variant="caption" color="text.secondary">
            {t("econ.globe.noData")}
          </Typography>
        </Box>
      </Box>
      <Box sx={{ position: "relative", height: { xs: 420, md: 620 }, borderRadius: 2, overflow: "hidden", bgcolor: "#050b16", cursor: "grab" }}>
        <Box ref={ref} sx={{ position: "absolute", inset: 0 }} />
        {(failed || !features) && (
          <Typography color={failed ? "error" : "text.secondary"} sx={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)" }}>
            {failed ? t("econ.globe.error") : t("common.loading")}
          </Typography>
        )}
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
        {t("econ.globe.hint")}
      </Typography>
    </Box>
  );
}
