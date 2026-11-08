"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import LaptopIcon from "@mui/icons-material/Laptop";
import PowerSettingsNewIcon from "@mui/icons-material/PowerSettingsNew";
import BedtimeIcon from "@mui/icons-material/Bedtime";
import {
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Snackbar,
  Alert,
} from "@mui/material";
import type { PcAction, PcStatus } from "../../lib/pcControl";
import { useI18n } from "../i18n";

const REFRESH_MS = 30_000;
const PENDING_POLL_MS = 3_000;
const PENDING_TIMEOUT_MS = 3 * 60_000;

type Pending = { action: PcAction; since: number } | null;

export default function PcPower() {
  const { t } = useI18n();
  const [status, setStatus] = useState<PcStatus | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [confirm, setConfirm] = useState<PcAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pendingRef = useRef<Pending>(null);
  pendingRef.current = pending;

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/pc", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as PcStatus;
      setStatus(data);
      // Čakanje je končano, ko se stanje spremeni v pričakovano (ali po časovni omejitvi).
      const p = pendingRef.current;
      if (p) {
        const reached = p.action === "wake" ? data.online : !data.online;
        if (reached) setPending(null);
        else if (Date.now() - p.since > PENDING_TIMEOUT_MS) {
          setPending(null);
          setError(t(p.action === "wake" ? "pc.wakeTimeout" : "pc.offTimeout"));
        }
      }
    } catch {
      // ob napaki obdržimo zadnje znano stanje
    }
  }, [t]);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), pending ? PENDING_POLL_MS : REFRESH_MS);
    return () => clearInterval(id);
  }, [load, pending]);

  const run = async (action: PcAction) => {
    setAnchor(null);
    setConfirm(null);
    try {
      const res = await fetch("/api/pc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setPending({ action, since: Date.now() });
    } catch (e) {
      setError(t("pc.actionError", { error: (e as Error).message }));
    }
  };

  if (!status?.configured) return null;

  let label: string;
  let color: "success" | "default" | "warning";
  if (pending) {
    label = t(pending.action === "wake" ? "pc.waking" : pending.action === "suspend" ? "pc.suspending" : "pc.shuttingDown");
    color = "warning";
  } else {
    label = t(status.online ? "pc.on" : "pc.off");
    color = status.online ? "success" : "default";
  }

  return (
    <>
      <Chip
        icon={pending ? <CircularProgress size={14} color="inherit" /> : <LaptopIcon />}
        label={`${status.name} · ${label}`}
        color={color}
        variant={status.online || pending ? "filled" : "outlined"}
        title={t("pc.chipTitle")}
        onClick={(e) => setAnchor(e.currentTarget)}
        clickable
      />

      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        <MenuItem disabled={!status.canWake || status.online || Boolean(pending)} onClick={() => void run("wake")}>
          <ListItemIcon>
            <PowerSettingsNewIcon fontSize="small" color="success" />
          </ListItemIcon>
          <ListItemText primary={t("pc.wake")} secondary={!status.canWake ? t("pc.noMac") : undefined} />
        </MenuItem>
        <MenuItem
          disabled={!status.canShutdown || !status.online || Boolean(pending)}
          onClick={() => {
            setAnchor(null);
            setConfirm("suspend");
          }}
        >
          <ListItemIcon>
            <BedtimeIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary={t("pc.suspend")} secondary={!status.canShutdown ? t("pc.noSsh") : undefined} />
        </MenuItem>
        <MenuItem
          disabled={!status.canShutdown || !status.online || Boolean(pending)}
          onClick={() => {
            setAnchor(null);
            setConfirm("shutdown");
          }}
        >
          <ListItemIcon>
            <PowerSettingsNewIcon fontSize="small" color="error" />
          </ListItemIcon>
          <ListItemText primary={t("pc.shutdown")} secondary={!status.canShutdown ? t("pc.noSsh") : undefined} />
        </MenuItem>
      </Menu>

      <Dialog open={Boolean(confirm)} onClose={() => setConfirm(null)}>
        <DialogTitle>{t(confirm === "suspend" ? "pc.confirmSuspendTitle" : "pc.confirmShutdownTitle", { name: status.name })}</DialogTitle>
        <DialogContent>{t("pc.confirmText")}</DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirm(null)}>{t("common.cancel")}</Button>
          <Button color={confirm === "shutdown" ? "error" : "primary"} variant="contained" onClick={() => confirm && void run(confirm)}>
            {t(confirm === "suspend" ? "pc.suspend" : "pc.shutdown")}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={Boolean(error)} autoHideDuration={8000} onClose={() => setError(null)}>
        <Alert severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      </Snackbar>
    </>
  );
}
