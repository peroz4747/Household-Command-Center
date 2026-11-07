"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert, Box, Button, CircularProgress, Collapse, Stack, Typography } from "@mui/material";
import PowerSettingsNewIcon from "@mui/icons-material/PowerSettingsNew";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorIcon from "@mui/icons-material/Error";
import { useI18n } from "../i18n";
import type { TankResult } from "../../lib/tankControl";

type State = TankResult & { available: boolean };

/** Gumb za varen izklop/vklop bazena tank (ustavi NAS + Jellyfin, zpool export / import, zažene nazaj). */
export default function TankControl({ imported, onDone }: { imported: boolean; onDone: () => void }) {
  const { t } = useI18n();
  const [state, setState] = useState<State | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    () =>
      fetch("/api/server/tank", { cache: "no-store" })
        .then((r) => r.json())
        .then((s: State) => {
          setState((prev) => {
            // Ob koncu postopka osveži podatke strežnika (bazen se pojavi/izgine).
            if (prev && (prev.status === "running" || prev.status === "pending") && (s.status === "done" || s.status === "error"))
              onDone();
            return s;
          });
        })
        .catch(() => {}),
    [onDone],
  );

  const busy = state?.status === "pending" || state?.status === "running";

  useEffect(() => {
    void load();
    const timer = setInterval(load, busy ? 1500 : 15_000);
    return () => clearInterval(timer);
  }, [load, busy]);

  const start = async () => {
    setConfirm(false);
    setError(null);
    const action = imported ? "export" : "import";
    const res = await fetch("/api/server/tank", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    }).catch(() => null);
    if (!res?.ok) setError(t("tank.err.request"));
    void load();
  };

  if (state && !state.available) return null; // mapa za zahteve ni priklopljena

  const showSteps = state && state.steps.length > 0 && (busy || (state.finishedAt && Date.now() / 1000 - state.finishedAt < 600));

  return (
    <Box sx={{ p: 1.5, borderRadius: "12px", border: "1px solid rgba(148,163,184,0.18)", bgcolor: "rgba(148,163,184,0.04)" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
        <Box sx={{ flex: 1, minWidth: 180 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {t("tank.title")}
          </Typography>
          <Typography variant="caption" color={imported ? "text.secondary" : "success.main"}>
            {busy
              ? state?.action === "export"
                ? t("tank.exporting")
                : t("tank.importing")
              : imported
                ? t("tank.online")
                : t("tank.offline")}
          </Typography>
        </Box>
        {!confirm ? (
          <Button
            size="small"
            variant={imported ? "outlined" : "contained"}
            color={imported ? "warning" : "success"}
            startIcon={busy ? <CircularProgress size={14} color="inherit" /> : <PowerSettingsNewIcon />}
            disabled={busy || !state}
            onClick={() => setConfirm(true)}
            sx={{ textTransform: "none", borderRadius: "8px" }}
          >
            {imported ? t("tank.btnExport") : t("tank.btnImport")}
          </Button>
        ) : (
          <Stack direction="row" spacing={1}>
            <Button size="small" onClick={() => setConfirm(false)} sx={{ textTransform: "none" }}>
              {t("tank.cancel")}
            </Button>
            <Button
              size="small"
              variant="contained"
              color={imported ? "warning" : "success"}
              onClick={() => void start()}
              sx={{ textTransform: "none", borderRadius: "8px" }}
            >
              {t("tank.confirm")}
            </Button>
          </Stack>
        )}
      </Box>

      <Collapse in={confirm}>
        <Alert severity={imported ? "warning" : "info"} sx={{ mt: 1.5, py: 0 }}>
          {imported ? t("tank.confirmExport") : t("tank.confirmImport")}
        </Alert>
      </Collapse>

      {error && (
        <Alert severity="error" sx={{ mt: 1.5, py: 0 }}>
          {error}
        </Alert>
      )}

      {showSteps && (
        <Stack spacing={0.5} sx={{ mt: 1.5 }}>
          {state!.steps.map((s, i) => (
            <Box key={i} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              {s.status === "running" ? (
                <CircularProgress size={14} />
              ) : s.status === "ok" ? (
                <CheckCircleIcon sx={{ fontSize: 16 }} color="success" />
              ) : (
                <ErrorIcon sx={{ fontSize: 16 }} color="error" />
              )}
              <Typography variant="caption">{s.label}</Typography>
            </Box>
          ))}
          {state!.status === "done" && state!.action === "export" && (
            <Alert severity="success" sx={{ mt: 1, py: 0 }}>
              {t("tank.safeToUnplug")}
            </Alert>
          )}
          {state!.status === "error" && (
            <Alert severity="error" sx={{ mt: 1, py: 0 }}>
              {state!.error}
            </Alert>
          )}
        </Stack>
      )}
    </Box>
  );
}
