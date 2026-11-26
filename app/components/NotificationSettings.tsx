"use client";

// Nastavitve obvestil na telefon (ntfy): katere vrste so vklopljene, ura jutranjega poročila in tihe ure.
import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  IconButton,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import NotificationsIcon from "@mui/icons-material/Notifications";
import { useI18n } from "../i18n";
import { NOTIFY_CATEGORIES, type NotifyCategory, type NotifySettings } from "../../lib/notifyCategories";
import type { MessageKey } from "../../lib/i18n";

type Status = { kind: "saved" | "tested" | "error"; at: number } | null;

export default function NotificationSettings() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<NotifySettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  const show = () => {
    setOpen(true);
    setStatus(null);
    setSettings(null);
    fetch("/api/notify-settings", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(setSettings)
      .catch(() => setStatus({ kind: "error", at: Date.now() }));
  };

  const save = async () => {
    if (!settings) return;
    setBusy(true);
    try {
      const r = await fetch("/api/notify-settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings) });
      if (!r.ok) throw new Error(String(r.status));
      setSettings(await r.json());
      setStatus({ kind: "saved", at: Date.now() });
    } catch {
      setStatus({ kind: "error", at: Date.now() });
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setBusy(true);
    const r = await fetch("/api/notify-settings/test", { method: "POST" }).catch(() => null);
    setStatus({ kind: r?.ok ? "tested" : "error", at: Date.now() });
    setBusy(false);
  };

  const toggle = (c: NotifyCategory) => setSettings((s) => s && { ...s, enabled: { ...s.enabled, [c]: !s.enabled[c] } });
  const setQuiet = (patch: Partial<NotifySettings["quiet"]>) => setSettings((s) => s && { ...s, quiet: { ...s.quiet, ...patch } });

  return (
    <>
      <Tooltip title={t("notif.open")}>
        <IconButton size="small" aria-label={t("notif.open")} onClick={show}>
          <NotificationsIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm" scroll="paper">
        <DialogTitle sx={{ pr: 6 }}>
          {t("notif.title")}
          <IconButton aria-label="close" onClick={() => setOpen(false)} sx={{ position: "absolute", right: 8, top: 8 }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {!settings && !status && (
            <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
              <CircularProgress size={28} />
            </Box>
          )}
          {settings && (
            <Stack spacing={2}>
              <Box>
                <Typography variant="overline" color="secondary">
                  {t("notif.morning")}
                </Typography>
                <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
                  <FormControlLabel control={<Switch checked={settings.enabled.morning} onChange={() => toggle("morning")} />} label={t("notif.cat.morning")} />
                  <TextField
                    type="time"
                    size="small"
                    label={t("notif.morningAt")}
                    value={settings.morningAt}
                    disabled={!settings.enabled.morning}
                    onChange={(e) => e.target.value && setSettings({ ...settings, morningAt: e.target.value })}
                    slotProps={{ inputLabel: { shrink: true }, htmlInput: { step: 300 } }}
                    sx={{ width: 130 }}
                  />
                </Box>
              </Box>

              <Divider />

              <Box>
                <Typography variant="overline" color="secondary">
                  {t("notif.quiet")}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  {t("notif.quietHelp")}
                </Typography>
                <FormControlLabel control={<Switch checked={settings.quiet.enabled} onChange={() => setQuiet({ enabled: !settings.quiet.enabled })} />} label={t("notif.quietOn")} />
                <Box sx={{ display: "flex", gap: 2, mt: 1, flexWrap: "wrap" }}>
                  {(["from", "to"] as const).map((k) => (
                    <TextField
                      key={k}
                      type="time"
                      size="small"
                      label={t(k === "from" ? "notif.quietFrom" : "notif.quietTo")}
                      value={settings.quiet[k]}
                      disabled={!settings.quiet.enabled}
                      onChange={(e) => e.target.value && setQuiet({ [k]: e.target.value })}
                      slotProps={{ inputLabel: { shrink: true }, htmlInput: { step: 300 } }}
                      sx={{ width: 130 }}
                    />
                  ))}
                </Box>
                <FormControlLabel
                  sx={{ mt: 1 }}
                  disabled={!settings.quiet.enabled}
                  control={<Switch checked={settings.quiet.allowUrgent} onChange={() => setQuiet({ allowUrgent: !settings.quiet.allowUrgent })} />}
                  label={t("notif.allowUrgent")}
                />
              </Box>

              <Divider />

              <Box>
                <Typography variant="overline" color="secondary">
                  {t("notif.types")}
                </Typography>
                <Stack>
                  {NOTIFY_CATEGORIES.filter((c) => c !== "morning").map((c) => (
                    <FormControlLabel
                      key={c}
                      sx={{ alignItems: "flex-start", my: 0.5 }}
                      control={<Switch checked={settings.enabled[c]} onChange={() => toggle(c)} />}
                      label={
                        <Box sx={{ pt: 0.75 }}>
                          <Typography>{t(`notif.cat.${c}` as MessageKey)}</Typography>
                          <Typography variant="body2" color="text.secondary">
                            {t(`notif.desc.${c}` as MessageKey)}
                          </Typography>
                        </Box>
                      }
                    />
                  ))}
                </Stack>
              </Box>
            </Stack>
          )}
          {status && (
            <Alert severity={status.kind === "error" ? "error" : "success"} sx={{ mt: 2 }}>
              {t(status.kind === "saved" ? "notif.saved" : status.kind === "tested" ? "notif.tested" : "notif.error")}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={test} disabled={busy}>
            {t("notif.test")}
          </Button>
          <Button variant="contained" onClick={save} disabled={busy || !settings}>
            {t("notif.save")}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
