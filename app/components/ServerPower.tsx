"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import PowerSettingsNewIcon from "@mui/icons-material/PowerSettingsNew";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import CloseIcon from "@mui/icons-material/Close";
import ScheduleIcon from "@mui/icons-material/Schedule";
import { useI18n } from "../i18n";
import type { PowerSchedule, PowerState } from "../../lib/serverPower";

type Power = { schedule: PowerSchedule; state: PowerState | null; hostOk: boolean };

export default function ServerPower() {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const [power, setPower] = useState<Power | null>(null);
  const [draft, setDraft] = useState<PowerSchedule | null>(null);
  const [confirm, setConfirm] = useState<"shutdown" | "reboot" | null>(null);
  const [sent, setSent] = useState<"shutdown" | "reboot" | null>(null);
  const [msg, setMsg] = useState<{ severity: "success" | "error"; text: string } | null>(null);

  const load = useCallback(
    () =>
      fetch("/api/server/power", { cache: "no-store" })
        .then((r) => r.json())
        .then((p: Power) => {
          setPower(p);
          setDraft((d) => d ?? p.schedule);
        })
        .catch(() => {}),
    [],
  );

  useEffect(() => {
    if (!open) return;
    setDraft(null);
    setMsg(null);
    void load();
  }, [open, load]);

  const dayNames = Array.from({ length: 7 }, (_, i) =>
    new Date(2024, 0, 1 + i).toLocaleDateString(locale, { weekday: "short" }).replace(/\.$/, ""),
  ); // 1. 1. 2024 je ponedeljek
  const fmt = (iso: string | null | undefined) =>
    iso
      ? new Date(iso).toLocaleString(locale, { weekday: "short", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" })
      : "–";

  const sendPower = async (action: "shutdown" | "reboot") => {
    setConfirm(null);
    const res = await fetch("/api/server/power", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    }).catch(() => null);
    if (res?.ok) setSent(action);
    else setMsg({ severity: "error", text: t("power.err.request") });
  };

  const save = async () => {
    if (!draft) return;
    const res = await fetch("/api/server/power", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    }).catch(() => null);
    if (res?.ok) {
      setMsg({ severity: "success", text: t("power.saved") });
      // Host preračuna naslednji izklop/vklop ob naslednji minuti.
      setTimeout(load, 65_000);
      void load();
    } else setMsg({ severity: "error", text: t("power.err.schedule") });
  };

  const invalid = !!draft?.enabled && (!draft.days.length || draft.on >= draft.off);
  const dirty = !!draft && !!power && JSON.stringify(draft) !== JSON.stringify(power.schedule);

  return (
    <>
      <Tooltip title={t("power.title")}>
        <IconButton
          onClick={() => setOpen(true)}
          aria-label={t("power.title")}
          size="small"
          sx={{ border: "1px solid rgba(148,163,184,0.3)", color: "text.secondary", "&:hover": { color: "#ef4444" } }}
        >
          <PowerSettingsNewIcon fontSize="small" />
        </IconButton>
      </Tooltip>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        maxWidth="xs"
        fullWidth
        slotProps={{ paper: { sx: { borderRadius: "20px" } } }}
      >
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", pb: 1 }}>
          {t("power.title")}
          <IconButton size="small" onClick={() => setOpen(false)} aria-label={t("common.close")}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          {sent ? (
            <Alert severity="info" sx={{ mt: 1 }}>
              {sent === "shutdown" ? t("power.shuttingDown") : t("power.rebooting")}
            </Alert>
          ) : (
            <>
              {/* Takojšen izklop / ponovni zagon */}
              <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                <Button
                  fullWidth
                  variant={confirm === "shutdown" ? "contained" : "outlined"}
                  color="error"
                  startIcon={<PowerSettingsNewIcon />}
                  onClick={() => (confirm === "shutdown" ? void sendPower("shutdown") : setConfirm("shutdown"))}
                  sx={{ textTransform: "none", borderRadius: "10px" }}
                >
                  {confirm === "shutdown" ? t("power.confirmShutdown") : t("power.shutdown")}
                </Button>
                <Button
                  fullWidth
                  variant={confirm === "reboot" ? "contained" : "outlined"}
                  color="warning"
                  startIcon={<RestartAltIcon />}
                  onClick={() => (confirm === "reboot" ? void sendPower("reboot") : setConfirm("reboot"))}
                  sx={{ textTransform: "none", borderRadius: "10px" }}
                >
                  {confirm === "reboot" ? t("power.confirmReboot") : t("power.reboot")}
                </Button>
              </Stack>
              {confirm && (
                <Alert severity="warning" sx={{ mt: 1.5 }} onClose={() => setConfirm(null)}>
                  {t("power.warning")}
                </Alert>
              )}

              <Divider sx={{ my: 2.5 }} />

              {/* Urnik */}
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <ScheduleIcon color="action" />
                <Typography sx={{ fontWeight: 600, flex: 1 }}>{t("power.schedule")}</Typography>
                <Switch
                  checked={!!draft?.enabled}
                  onChange={(e) => draft && setDraft({ ...draft, enabled: e.target.checked })}
                  disabled={!draft}
                />
              </Box>
              <Typography variant="caption" color="text.secondary">
                {t("power.scheduleHelp")}
              </Typography>

              {draft && (
                <Box sx={{ opacity: draft.enabled ? 1 : 0.5, mt: 1.5 }}>
                  <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                    {dayNames.map((name, i) => {
                      const on = draft.days.includes(i);
                      return (
                        <Chip
                          key={i}
                          label={name}
                          size="small"
                          color={on ? "primary" : "default"}
                          variant={on ? "filled" : "outlined"}
                          onClick={() =>
                            setDraft({ ...draft, days: on ? draft.days.filter((d) => d !== i) : [...draft.days, i].sort() })
                          }
                          sx={{ minWidth: 42, borderRadius: "8px" }}
                        />
                      );
                    })}
                  </Box>
                  <Stack direction="row" spacing={1.5} sx={{ mt: 2 }}>
                    <TextField
                      label={t("power.on")}
                      type="time"
                      size="small"
                      value={draft.on}
                      onChange={(e) => setDraft({ ...draft, on: e.target.value })}
                      slotProps={{ inputLabel: { shrink: true } }}
                      fullWidth
                    />
                    <TextField
                      label={t("power.off")}
                      type="time"
                      size="small"
                      value={draft.off}
                      onChange={(e) => setDraft({ ...draft, off: e.target.value })}
                      slotProps={{ inputLabel: { shrink: true } }}
                      fullWidth
                    />
                  </Stack>
                  {invalid && (
                    <Typography variant="caption" color="error" sx={{ display: "block", mt: 1 }}>
                      {t("power.invalid")}
                    </Typography>
                  )}
                </Box>
              )}

              {power?.state?.scheduleActive && (
                <Box sx={{ mt: 2, p: 1.5, borderRadius: "10px", bgcolor: "rgba(148,163,184,0.06)" }}>
                  <Typography variant="caption" sx={{ display: "block" }}>
                    {t("power.nextOff")}: <b>{fmt(power.state.nextOff)}</b>
                  </Typography>
                  <Typography variant="caption" sx={{ display: "block" }}>
                    {t("power.nextOn")}: <b>{fmt(power.state.nextOn)}</b>
                  </Typography>
                </Box>
              )}
              {power && !power.hostOk && (
                <Alert severity="warning" sx={{ mt: 2 }}>
                  {t("power.err.host")}
                </Alert>
              )}
              {msg && (
                <Alert severity={msg.severity} sx={{ mt: 2 }}>
                  {msg.text}
                </Alert>
              )}

              <Button
                fullWidth
                variant="contained"
                onClick={() => void save()}
                disabled={!dirty || invalid}
                sx={{ mt: 2, textTransform: "none", borderRadius: "10px" }}
              >
                {t("power.save")}
              </Button>
              <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1.5 }}>
                {t("power.rtcNote")}
              </Typography>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
