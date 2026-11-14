"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { Box, Dialog, DialogContent, DialogTitle, IconButton, Link, Tab, Tabs, Typography, useMediaQuery, useTheme } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import PauseIcon from "@mui/icons-material/Pause";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import { useI18n } from "../i18n";

// Radar: RainViewer (zadnji 2 uri, animacija na zemljevidu okoli Maribora) in ARSO (uradna animacija za Slovenijo).
const HOME: [number, number] = [46.5547, 15.6459];
const ARSO_GIF = "https://meteo.arso.gov.si/uploads/probase/www/observ/radar/si0-rm-anim.gif";
const RAINVIEWER = "https://api.rainviewer.com/public/weather-maps.json";
const FRAME_MS = 700;

type Frame = { time: number; path: string };

function RainMap() {
  const { t, locale } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const [frames, setFrames] = useState<Frame[]>([]);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [error, setError] = useState(false);
  const layers = useRef<import("leaflet").TileLayer[]>([]);

  useEffect(() => {
    let map: import("leaflet").Map | null = null;
    let cancelled = false;
    const resize = new ResizeObserver(() => map?.invalidateSize());
    if (ref.current) resize.observe(ref.current);
    void Promise.all([import("leaflet"), fetch(RAINVIEWER).then((r) => r.json())])
      .then(([L, data]) => {
        if (cancelled || !ref.current) return;
        const past: Frame[] = data?.radar?.past ?? [];
        if (!past.length) throw new Error("no frames");
        map = L.map(ref.current, { scrollWheelZoom: true, zoomControl: true }).setView(HOME, 8);
        L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
          maxZoom: 12,
          subdomains: "abcd",
          attribution: "&copy; OpenStreetMap, &copy; CARTO, radar &copy; RainViewer",
        }).addTo(map);
        // Vse slike naložimo vnaprej (prosojne), animacija le menja prosojnost - brez utripanja.
        layers.current = past.map((f) =>
          L.tileLayer(`${data.host}${f.path}/256/{z}/{x}/{y}/2/1_1.png`, { maxNativeZoom: 7, maxZoom: 12, opacity: 0, zIndex: 10 }).addTo(map!),
        );
        L.circleMarker(HOME, { radius: 5, color: "#f8fafc", weight: 2, fillColor: "#38bdf8", fillOpacity: 1 }).bindTooltip(t("radar.home")).addTo(map);
        setFrames(past);
        setIndex(past.length - 1);
      })
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
      resize.disconnect();
      map?.remove();
      layers.current = [];
    };
  }, [t]);

  useEffect(() => {
    layers.current.forEach((l, i) => l.setOpacity(i === index ? 0.8 : 0));
  }, [index, frames]);

  useEffect(() => {
    if (!playing || frames.length < 2) return;
    // Na zadnji (najnovejši) sliki se ustavi malo dlje.
    const timer = setTimeout(() => setIndex((i) => (i + 1) % frames.length), index === frames.length - 1 ? FRAME_MS * 3 : FRAME_MS);
    return () => clearTimeout(timer);
  }, [playing, index, frames.length]);

  const frame = frames[index];
  return (
    <Box>
      <Box ref={ref} sx={{ height: { xs: "60vh", md: 480 }, borderRadius: 1, overflow: "hidden", isolation: "isolate", bgcolor: "#0f172a" }} />
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 1 }}>
        <IconButton size="small" onClick={() => setPlaying(!playing)} aria-label={playing ? t("radar.pause") : t("radar.play")} disabled={frames.length < 2}>
          {playing ? <PauseIcon fontSize="small" /> : <PlayArrowIcon fontSize="small" />}
        </IconButton>
        <Typography variant="body2" sx={{ fontVariantNumeric: "tabular-nums" }}>
          {error ? t("radar.error") : frame ? new Date(frame.time * 1000).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }) : t("common.loading")}
        </Typography>
        {frames.length > 0 && (
          <Box sx={{ flex: 1, display: "flex", gap: "2px", ml: 1 }}>
            {frames.map((f, i) => (
              <Box
                key={f.time}
                onClick={() => {
                  setPlaying(false);
                  setIndex(i);
                }}
                sx={{ flex: 1, height: 6, borderRadius: 1, cursor: "pointer", bgcolor: i === index ? "secondary.main" : "rgba(148,163,184,0.3)" }}
              />
            ))}
          </Box>
        )}
      </Box>
    </Box>
  );
}

function ArsoRadar() {
  const { t } = useI18n();
  // Slika se na ARSO osveži vsakih 5 minut; ob odprtju vzamemo svežo.
  const [src] = useState(() => `${ARSO_GIF}?t=${Math.floor(Date.now() / 300_000)}`);
  return (
    <Box sx={{ textAlign: "center" }}>
      <Box component="img" src={src} alt={t("radar.arso")} sx={{ maxWidth: "100%", maxHeight: { xs: "60vh", md: 520 }, borderRadius: 1, bgcolor: "#fff" }} />
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
        {t("radar.arsoNote")}{" "}
        <Link href="https://meteo.arso.gov.si/met/sl/weather/observ/radar/" target="_blank" rel="noreferrer">
          meteo.arso.gov.si
        </Link>
      </Typography>
    </Box>
  );
}

export default function RadarDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("md"));
  const [tab, setTab] = useState(0);
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md" fullScreen={fullScreen}>
      <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", pr: 1.5 }}>
        {t("radar.title")}
        <IconButton onClick={onClose} aria-label={t("common.close")}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
          <Tab label={t("radar.tabMap")} />
          <Tab label={t("radar.tabArso")} />
        </Tabs>
        {tab === 0 ? <RainMap /> : <ArsoRadar />}
      </DialogContent>
    </Dialog>
  );
}
