"use client";

import { useEffect, useRef, useState } from "react";
import { Box, Button, Typography } from "@mui/material";
import HistoryIcon from "@mui/icons-material/History";
import SensorsIcon from "@mui/icons-material/Sensors";
import { useI18n } from "../i18n";

// Kamera, ki objavlja le slike (DARS, ~1 na minuto): "V živo" pokaže vsako novo sliko z mehkim
// prehodom, "Zadnja ura" pa shranjene slike predvaja kot časovni zamik (strežnik hrani 2 uri).
const POLL_MS = 5_000;
const TIMELAPSE_FPS = 6;
const TIMELAPSE_MS = 3_600_000;
const TZ = "Europe/Ljubljana";

export default function SnapshotCam({ cam, title }: { cam: string; title: string }) {
  const { t, locale } = useI18n();
  const [frames, setFrames] = useState<number[]>([]);
  const [mode, setMode] = useState<"live" | "timelapse">("live");
  const [index, setIndex] = useState(0);
  // Dve plasti za mehak prehod: nova slika se naloži v ozadju in šele nato prikaže.
  const [layers, setLayers] = useState<{ a: string | null; b: string | null; top: "a" | "b" }>({ a: null, b: null, top: "a" });
  const [now, setNow] = useState(() => Date.now());
  const shown = useRef<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch(`/api/snapcam?cam=${encodeURIComponent(cam)}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => alive && d && setFrames(d.frames ?? []))
        .catch(() => {});
    void load();
    const id = setInterval(() => {
      void load();
      setNow(Date.now());
    }, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [cam]);

  const timelapse = frames.filter((at) => at >= (frames.at(-1) ?? 0) - TIMELAPSE_MS);
  const current = mode === "live" ? frames.at(-1) : timelapse[index % Math.max(1, timelapse.length)];
  const src = current ? `/api/snapcam?cam=${encodeURIComponent(cam)}&frame=${current}` : null;

  useEffect(() => {
    if (!src || src === shown.current) return;
    const img = new Image();
    img.onload = () => {
      shown.current = src;
      setLayers((l) => (l.top === "a" ? { ...l, b: src, top: "b" } : { ...l, a: src, top: "a" }));
    };
    img.src = src;
  }, [src]);

  useEffect(() => {
    if (mode !== "timelapse" || timelapse.length < 2) return;
    const id = setTimeout(() => setIndex((i) => (i + 1) % timelapse.length), index === timelapse.length - 1 ? 1500 : 1000 / TIMELAPSE_FPS);
    return () => clearTimeout(id);
  }, [mode, index, timelapse.length]);

  const fade = mode === "live" ? "opacity 1.2s ease" : "none";
  const age = current ? Math.max(0, Math.round((now - current) / 1000)) : null;
  const time = current ? new Date(current).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", timeZone: TZ }) : "";

  return (
    <Box sx={{ position: "absolute", inset: 0, bgcolor: "#000" }}>
      {(["a", "b"] as const).map((k) =>
        layers[k] ? (
          <Box
            key={k}
            component="img"
            src={layers[k]!}
            alt={title}
            sx={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: layers.top === k ? 1 : 0, transition: fade }}
          />
        ) : null,
      )}
      {!frames.length && (
        <Typography variant="body2" color="text.secondary" sx={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)" }}>
          {t("common.loading")}
        </Typography>
      )}
      <Box sx={{ position: "absolute", left: 12, right: 12, bottom: 10, display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
        <Typography variant="caption" sx={{ px: 1, py: 0.25, borderRadius: 1, bgcolor: "rgba(0,0,0,0.6)", fontVariantNumeric: "tabular-nums" }}>
          {mode === "live"
            ? age !== null
              ? t("camera.snapAge", { time, s: age < 120 ? `${age} s` : `${Math.round(age / 60)} min` })
              : ""
            : t("camera.timelapseAt", { time, n: (index % Math.max(1, timelapse.length)) + 1, total: timelapse.length })}
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Button
          size="small"
          variant="contained"
          color={mode === "live" ? "inherit" : "error"}
          startIcon={mode === "live" ? <HistoryIcon /> : <SensorsIcon />}
          disabled={mode === "live" && timelapse.length < 2}
          onClick={() => {
            setIndex(0);
            setMode(mode === "live" ? "timelapse" : "live");
          }}
          sx={{ bgcolor: mode === "live" ? "rgba(0,0,0,0.6)" : undefined, color: "#fff", textTransform: "none", py: 0.25 }}
        >
          {mode === "live" ? t("camera.timelapse") : t("camera.backLive")}
        </Button>
      </Box>
    </Box>
  );
}
