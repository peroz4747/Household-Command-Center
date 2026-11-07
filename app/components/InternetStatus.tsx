"use client";

import { useEffect, useState } from "react";
import { Box, CircularProgress, Tooltip, Typography } from "@mui/material";
import PublicIcon from "@mui/icons-material/Public";
import PublicOffIcon from "@mui/icons-material/PublicOff";
import { useI18n } from "../i18n";

type Status = { online: boolean; latencyMs: number | null } | null;

const POLL_MS = 30_000;

/** Vrstica "Internet" v kartici Omrežje in energija - dejansko preverjanje povezave. */
export default function InternetStatus() {
  const { t } = useI18n();
  const [status, setStatus] = useState<Status>(null);

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

  const subtitle = !status
    ? t("home.internetChecking")
    : status.online
      ? t("home.internetOnline", { ms: status.latencyMs ?? "?" })
      : t("home.internetOffline");

  return (
    <Tooltip title={t("home.internetTooltip")} placement="top">
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
        <Box>
          <Typography sx={{ fontWeight: 700 }}>{t("home.internet")}</Typography>
          <Typography variant="body2" color={status && !status.online ? "error" : "text.secondary"}>
            {subtitle}
          </Typography>
        </Box>
        {!status ? (
          <CircularProgress size={20} />
        ) : status.online ? (
          <PublicIcon color="success" />
        ) : (
          <PublicOffIcon color="error" />
        )}
      </Box>
    </Tooltip>
  );
}
