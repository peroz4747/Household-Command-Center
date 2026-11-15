"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Box, MenuItem, TextField, Typography } from "@mui/material";
import { useI18n } from "../i18n";
import type { Economy } from "../../lib/economies";

// 3D globus (globe.gl na three.js): države obarvane po izbranem kazalniku, vrtenje z miško, klik odpre državo.
// Barve: raven (BDP) = en moder odtenek od temnega do svetlega (logaritemsko); rast = oranžna (padec)
// – siva (0) – modra (rast), ker rdeče-zelena ni berljiva za del ljudi z barvno slepoto.
export type GlobeMetric = "gdpPerCapitaUsd" | "gdpUsd" | "growthYear" | "qoq";

const NO_DATA = "#243041";
const OCEAN = "#0b1a33";
const SEQ: [string, string] = ["#173a66", "#a7d8ff"];
const NEG = "#e8743b";
const MID = "#64748b";
const POS = "#3987e5";
const CLAMP: Record<"growthYear" | "qoq", number> = { growthYear: 6, qoq: 1.5 };

type Feature = { type: "Feature"; properties: { iso2: string; name: string }; geometry: unknown };

const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
function mix(a: string, b: string, t: number) {
  const [x, y] = [hex(a), hex(b)];
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * Math.max(0, Math.min(1, t)))).join(",")})`;
}

export default function WorldGlobe({ items, onSelect }: { items: Economy[]; onSelect: (e: Economy) => void }) {
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
    const vals = items.map((e) => e[metric]).filter((v): v is number => v !== null && v > 0);
    return { min: Math.log10(Math.min(...vals)), max: Math.log10(Math.max(...vals)) };
  }, [items, metric]);

  const colorOf = (v: number | null): string => {
    if (v === null) return NO_DATA;
    if (metric === "growthYear" || metric === "qoq") {
      const c = CLAMP[metric];
      return v >= 0 ? mix(MID, POS, v / c) : mix(MID, NEG, -v / c);
    }
    return v > 0 ? mix(SEQ[0], SEQ[1], (Math.log10(v) - range.min) / Math.max(0.01, range.max - range.min)) : NO_DATA;
  };

  const fmt = (v: number | null) => {
    if (v === null) return t("econ.globe.noData");
    if (metric === "growthYear" || metric === "qoq") return `${v > 0 ? "+" : ""}${v.toLocaleString(locale, { maximumFractionDigits: 1 })} %`;
    return v.toLocaleString(locale, { style: "currency", currency: "USD", notation: metric === "gdpUsd" ? "compact" : "standard", maximumFractionDigits: metric === "gdpUsd" ? 1 : 0 });
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
    const valueOf = (f: Feature) => byIso.get(f.properties.iso2)?.[metric] ?? null;
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
        <b>${esc(name)}</b><br/>${esc(t(`econ.globe.metric.${metric}`))}: <b>${esc(fmt(valueOf(f)))}</b>${e ? `<br/><span style="color:#94a3b8">${esc(t("econ.globe.click"))}</span>` : ""}</div>`;
    };
    g.polygonCapColor((f: Feature) => (f === hovered ? "#f8fafc" : colorOf(valueOf(f))))
      .polygonAltitude((f: Feature) => (f === hovered ? 0.03 : 0.008))
      .polygonLabel(label)
      .onPolygonHover((f: Feature | null) => {
        hovered = f;
        ref.current!.style.cursor = f && byIso.has(f.properties.iso2) ? "pointer" : "grab";
        g.polygonCapColor(g.polygonCapColor()).polygonAltitude(g.polygonAltitude());
      })
      .onPolygonClick((f: Feature) => {
        const e = byIso.get(f.properties.iso2);
        if (e) onSelect(e);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metric, byIso, features, locale]);

  const diverging = metric === "growthYear" || metric === "qoq";
  const legendStops = diverging ? `linear-gradient(90deg, ${NEG}, ${MID}, ${POS})` : `linear-gradient(90deg, ${SEQ[0]}, ${SEQ[1]})`;
  const legendLabels = diverging
    ? [fmt(-CLAMP[metric as "qoq"]), "0 %", fmt(CLAMP[metric as "qoq"])]
    : [fmt(10 ** range.min), fmt(10 ** ((range.min + range.max) / 2)), fmt(10 ** range.max)];

  return (
    <Box>
      <Box sx={{ display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap", mb: 1 }}>
        <TextField select size="small" label={t("econ.globe.colorBy")} value={metric} onChange={(e) => setMetric(e.target.value as GlobeMetric)} sx={{ minWidth: 240 }}>
          {(["gdpPerCapitaUsd", "gdpUsd", "growthYear", "qoq"] as GlobeMetric[]).map((m) => (
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
