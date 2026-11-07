"use client";

import { useCallback, useEffect, useState } from "react";
import { Box, IconButton, Tooltip, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import TvIcon from "@mui/icons-material/Tv";
import SettingsRemoteIcon from "@mui/icons-material/SettingsRemote";
import { useI18n } from "../i18n";
import TvRemoteDialog from "./TvRemote";
import type { TvStatus } from "../../lib/tv";

/** Vrstica "Televizor" v kartici Omrežje in energija: stanje + gumb, ki odpre daljinec. */
export default function TvStatusRow() {
  const { t } = useI18n();
  const [status, setStatus] = useState<TvStatus | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(
    () =>
      fetch("/api/tv", { cache: "no-store" })
        .then((r) => r.json())
        .then(setStatus)
        .catch(() => setStatus(null)),
    [],
  );

  useEffect(() => {
    void load();
    // Ko je daljinec odprt, osvežuj pogosteje.
    const timer = setInterval(load, open ? 5_000 : 30_000);
    return () => clearInterval(timer);
  }, [load, open]);

  const on = status?.power === "on";
  const subtitle = !status ? "…" : on ? t("tv.on") : status.power === "standby" ? t("tv.standby") : t("tv.off");

  return (
    <>
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
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, minWidth: 0 }}>
          <TvIcon color={on ? "success" : "disabled"} />
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontWeight: 700 }}>{t("tv.overline")}</Typography>
            <Typography variant="body2" color="text.secondary" noWrap>
              {subtitle}
            </Typography>
          </Box>
        </Box>
        <Tooltip title={t("tv.openRemote")}>
          <IconButton
            onClick={() => setOpen(true)}
            aria-label={t("tv.openRemote")}
            color="primary"
            sx={(theme) => ({
              bgcolor: alpha(theme.palette.primary.main, 0.12),
              "&:hover": { bgcolor: alpha(theme.palette.primary.main, 0.24) },
            })}
          >
            <SettingsRemoteIcon />
          </IconButton>
        </Tooltip>
      </Box>
      <TvRemoteDialog
        open={open}
        onClose={() => setOpen(false)}
        status={status}
        onChanged={(ms) => {
          // Stanje po vklopu/izklopu: preveri večkrat, ker TV potrebuje nekaj sekund.
          setTimeout(load, ms);
          setTimeout(load, ms + 4000);
        }}
      />
    </>
  );
}
