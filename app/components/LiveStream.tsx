"use client";

import { useEffect, useRef, useState } from "react";
import { Box, Typography } from "@mui/material";
import { useI18n } from "../i18n";

const RETRY_MS = 15_000;

/**
 * Javna spletna kamera v živo (HLS s CDN-ja WhatsUpCams), samodejno in brez zvoka.
 * Chrome HLS predvaja prek hls.js, Safari in Samsung TV ga znata sama.
 */
export default function LiveStream({ name, title }: { name: string; title: string }) {
  const { t } = useI18n();
  const ref = useRef<HTMLVideoElement>(null);
  const [poster, setPoster] = useState<string | undefined>(undefined);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    let hls: import("hls.js").default | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const start = async () => {
      setFailed(false);
      try {
        const res = await fetch(`/api/webcam?name=${encodeURIComponent(name)}`, { cache: "no-store" });
        const data = await res.json();
        if (!res.ok || !data.hls) throw new Error("no stream");
        if (cancelled) return;
        if (data.snapshot) setPoster(data.snapshot);
        const { default: Hls } = await import("hls.js");
        if (cancelled) return;
        if (Hls.isSupported()) {
          hls = new Hls({ liveSyncDurationCount: 3, lowLatencyMode: false });
          hls.on(Hls.Events.ERROR, (_, err) => {
            if (!err.fatal) return;
            hls?.destroy();
            hls = null;
            setFailed(true);
            retry = setTimeout(() => void start(), RETRY_MS);
          });
          hls.loadSource(data.hls);
          hls.attachMedia(video);
        } else {
          video.src = data.hls;
        }
        await video.play().catch(() => {});
      } catch {
        if (cancelled) return;
        setFailed(true);
        retry = setTimeout(() => void start(), RETRY_MS);
      }
    };
    void start();

    // Skrit zavihek: ustavi prenos, ob vrnitvi skoči na živo.
    const onVisible = () => {
      if (document.hidden) video.pause();
      else {
        if (hls && hls.liveSyncPosition) video.currentTime = hls.liveSyncPosition;
        void video.play().catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      if (retry) clearTimeout(retry);
      hls?.destroy();
      video.removeAttribute("src");
      video.load();
    };
  }, [name]);

  return (
    <Box sx={{ position: "absolute", inset: 0, bgcolor: "#000" }}>
      <video ref={ref} muted autoPlay playsInline poster={poster} aria-label={title} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      {failed && (
        <Typography variant="caption" sx={{ position: "absolute", left: 12, bottom: 10, px: 1, py: 0.25, borderRadius: 1, bgcolor: "rgba(0,0,0,0.6)" }}>
          {t("camera.reconnecting")}
        </Typography>
      )}
    </Box>
  );
}
