"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Box, CircularProgress, IconButton, Tooltip, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import PublicIcon from "@mui/icons-material/Public";
import PublicOffIcon from "@mui/icons-material/PublicOff";
import SpeedIcon from "@mui/icons-material/Speed";
import { useI18n } from "../i18n";

type Status = { online: boolean; latencyMs: number | null } | null;
type Speed = { downloadMbps: number; uploadMbps: number; pingMs: number };

const POLL_MS = 30_000;

/** Vrstica "Internet" v kartici Omrežje in energija: stanje povezave + gumb za meritev hitrosti. */
export default function InternetStatus() {
  const { t } = useI18n();
  const [status, setStatus] = useState<Status>(null);
  const [testing, setTesting] = useState(false);
  const [speed, setSpeed] = useState<Speed | null>(null);
  const [speedError, setSpeedError] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/internet", { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => alive && setStatus({ online: !!d.online, latencyMs: d.latencyMs ?? null }))
        // Če ne dosežemo niti dashboarda, stanja ne poznamo - ne kažemo napačnega "ni interneta".
        .catch(() => alive && setStatus(null));
    void load();
    const timer = setInterval(load, POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  const runTest = async () => {
    setTesting(true);
    setSpeedError(false);
    try {
      const res = await fetch("/api/internet/speedtest", { method: "POST" });
      if (!res.ok) throw new Error();
      setSpeed((await res.json()) as Speed);
    } catch {
      setSpeed(null);
      setSpeedError(true);
    } finally {
      setTesting(false);
    }
  };

  const offline = Boolean(status && !status.online);
  let subtitle: ReactNode;
  if (testing) subtitle = t("home.speedRunning");
  else if (speedError) subtitle = t("home.speedError");
  else if (speed)
    subtitle = (
      <>
        <Box component="span" sx={{ color: "success.main", fontWeight: 700 }}>
          ↓ {Math.round(speed.downloadMbps)}
        </Box>{" "}
        <Box component="span" sx={{ color: "info.main", fontWeight: 700 }}>
          ↑ {Math.round(speed.uploadMbps)}
        </Box>{" "}
        {t("home.speedRest", { ping: speed.pingMs })}
      </>
    );
  else if (!status) subtitle = t("home.internetChecking");
  else subtitle = status.online ? t("home.internetOnline", { ms: status.latencyMs ?? "?" }) : t("home.internetOffline");

  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        bgcolor: "rgba(148,163,184,0.05)",
        p: 2,
        borderRadius: 3,
      }}
    >
      <Tooltip title={t("home.internetTooltip")} placement="top">
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, minWidth: 0 }}>
          {!status ? <CircularProgress size={24} /> : status.online ? <PublicIcon color="success" /> : <PublicOffIcon color="error" />}
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontWeight: 700 }}>{t("home.internet")}</Typography>
            <Typography variant="body2" color={offline || speedError ? "error" : "text.secondary"} noWrap>
              {subtitle}
            </Typography>
          </Box>
        </Box>
      </Tooltip>
      <Tooltip title={t("home.speedTest")}>
        <span>
          <IconButton
            onClick={() => void runTest()}
            disabled={testing}
            aria-label={t("home.speedTest")}
            color="primary"
            sx={(theme) => ({
              bgcolor: alpha(theme.palette.primary.main, 0.12),
              "&:hover": { bgcolor: alpha(theme.palette.primary.main, 0.24) },
            })}
          >
            {testing ? <CircularProgress size={24} /> : <SpeedIcon />}
          </IconButton>
        </span>
      </Tooltip>
    </Box>
  );
}
