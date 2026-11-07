"use client";

import { useState, type ReactNode } from "react";
import { Box, ButtonBase, Dialog, IconButton, Tooltip, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import PowerSettingsNewIcon from "@mui/icons-material/PowerSettingsNew";
import AddIcon from "@mui/icons-material/Add";
import RemoveIcon from "@mui/icons-material/Remove";
import VolumeOffIcon from "@mui/icons-material/VolumeOff";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowLeftIcon from "@mui/icons-material/KeyboardArrowLeft";
import KeyboardArrowRightIcon from "@mui/icons-material/KeyboardArrowRight";
import UndoIcon from "@mui/icons-material/Undo";
import HomeOutlinedIcon from "@mui/icons-material/HomeOutlined";
import InputIcon from "@mui/icons-material/Input";
import CloseIcon from "@mui/icons-material/Close";
import { useI18n } from "../i18n";
import type { TvStatus } from "../../lib/tv";

const APPS: { id: string; label: string; bg: string; fg: string }[] = [
  { id: "netflix", label: "NETFLIX", bg: "#141414", fg: "#e50914" },
  { id: "youtube", label: "YouTube", bg: "#ff0033", fg: "#ffffff" },
  { id: "hbomax", label: "HBO max", bg: "linear-gradient(135deg, #002be7 0%, #6b1fd1 100%)", fg: "#ffffff" },
  { id: "jellyfin", label: "Jellyfin", bg: "linear-gradient(135deg, #aa5cc3 0%, #00a4dc 100%)", fg: "#ffffff" },
];

const SURFACE = "rgba(148,163,184,0.10)";
const SURFACE_HOVER = "rgba(148,163,184,0.20)";

/** Okrogel gumb daljinca. */
function Key({
  onClick,
  label,
  disabled,
  children,
  size = 48,
}: {
  onClick: () => void;
  label: string;
  disabled?: boolean;
  children: ReactNode;
  size?: number;
}) {
  return (
    <Tooltip title={label} placement="top" enterDelay={600}>
      <span>
        <IconButton
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
          sx={{
            width: size,
            height: size,
            bgcolor: SURFACE,
            color: "text.primary",
            transition: "transform .08s, background-color .15s",
            "&:hover": { bgcolor: SURFACE_HOVER },
            "&:active": { transform: "scale(0.92)" },
          }}
        >
          {children}
        </IconButton>
      </span>
    </Tooltip>
  );
}

/** Smerni obroč z OK na sredini. */
function DPad({ send, disabled, t }: { send: (k: string) => void; disabled: boolean; t: (k: any) => string }) {
  const arrow = (k: string, label: string, icon: ReactNode, pos: object) => (
    <ButtonBase
      onClick={() => send(k)}
      disabled={disabled}
      aria-label={label}
      sx={{
        position: "absolute",
        width: 56,
        height: 56,
        borderRadius: "50%",
        color: "text.primary",
        transition: "background-color .15s",
        "&:hover": { bgcolor: "rgba(255,255,255,0.06)" },
        "&:active": { bgcolor: "rgba(255,255,255,0.12)" },
        ...pos,
      }}
    >
      {icon}
    </ButtonBase>
  );
  return (
    <Box
      sx={{
        position: "relative",
        width: 184,
        height: 184,
        mx: "auto",
        borderRadius: "50%",
        background: "radial-gradient(circle at 50% 35%, rgba(148,163,184,0.18), rgba(148,163,184,0.07) 70%)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06), 0 8px 24px rgba(0,0,0,0.35)",
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {arrow("KEY_UP", t("tv.up"), <KeyboardArrowUpIcon fontSize="large" />, { top: 4, left: 64 })}
      {arrow("KEY_DOWN", t("tv.down"), <KeyboardArrowDownIcon fontSize="large" />, { bottom: 4, left: 64 })}
      {arrow("KEY_LEFT", t("tv.left"), <KeyboardArrowLeftIcon fontSize="large" />, { left: 4, top: 64 })}
      {arrow("KEY_RIGHT", t("tv.right"), <KeyboardArrowRightIcon fontSize="large" />, { right: 4, top: 64 })}
      <ButtonBase
        onClick={() => send("KEY_ENTER")}
        disabled={disabled}
        aria-label="OK"
        sx={{
          position: "absolute",
          inset: 52,
          borderRadius: "50%",
          fontWeight: 700,
          fontSize: 15,
          letterSpacing: 1,
          color: "text.primary",
          background: "linear-gradient(180deg, #2a3a55, #1a2538)",
          boxShadow: "0 2px 8px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.08)",
          "&:active": { transform: "scale(0.95)" },
        }}
      >
        OK
      </ButtonBase>
    </Box>
  );
}

export default function TvRemoteDialog({
  open,
  onClose,
  status,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  status: TvStatus | null;
  onChanged: (afterMs: number) => void;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const on = status?.power === "on";

  const post = async (body: object, refreshAfterMs = 0) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/tv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error === "unauthorized" ? t("tv.err.unauthorized") : t("tv.err.unreachable"));
      }
    } catch {
      setError(t("tv.err.unreachable"));
    } finally {
      setBusy(false);
      if (refreshAfterMs) onChanged(refreshAfterMs);
    }
  };
  const key = (k: string) => void post({ action: "key", key: k });
  const stateLabel = !status ? "…" : on ? t("tv.on") : status.power === "standby" ? t("tv.standby") : t("tv.off");

  return (
    <Dialog
      open={open}
      onClose={onClose}
      slotProps={{
        paper: {
          sx: {
            width: 320,
            maxWidth: "calc(100vw - 32px)",
            m: 2,
            borderRadius: "24px",
            p: 2.5,
            background: "linear-gradient(180deg, #111c2e 0%, #0a1220 100%)",
            border: "1px solid rgba(148,163,184,0.15)",
            boxShadow: "0 24px 60px rgba(0,0,0,0.6)",
          },
        },
      }}
    >
      {/* Glava: ime, stanje, vklop */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
        <Tooltip title={on ? t("tv.turnOff") : t("tv.turnOn")}>
          <span>
            <IconButton
              onClick={() => void post({ action: "power" }, on ? 3000 : 4000)}
              disabled={busy || !status}
              aria-label={on ? t("tv.turnOff") : t("tv.turnOn")}
              sx={{
                width: 48,
                height: 48,
                color: on ? "#fff" : "#ef4444",
                bgcolor: on ? "#ef4444" : alpha("#ef4444", 0.14),
                boxShadow: on ? `0 0 18px ${alpha("#ef4444", 0.5)}` : "none",
                "&:hover": { bgcolor: on ? "#dc2626" : alpha("#ef4444", 0.24) },
              }}
            >
              <PowerSettingsNewIcon />
            </IconButton>
          </span>
        </Tooltip>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography sx={{ fontWeight: 700, lineHeight: 1.2 }} noWrap>
            {status?.name ?? t("tv.title")}
          </Typography>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
            <Box
              sx={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                bgcolor: on ? "#22c55e" : "rgba(148,163,184,0.5)",
                boxShadow: on ? "0 0 6px #22c55e" : "none",
              }}
            />
            <Typography variant="caption" color="text.secondary">
              {stateLabel}
            </Typography>
          </Box>
        </Box>
        <IconButton onClick={onClose} aria-label={t("meals.close")} size="small" sx={{ alignSelf: "flex-start" }}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>

      {error && (
        <Typography variant="caption" color="error" sx={{ display: "block", mt: 1.5, textAlign: "center" }}>
          {error}
        </Typography>
      )}

      {/* Nazaj / Domov / Vir */}
      <Box sx={{ display: "flex", justifyContent: "space-between", mt: 3, px: 1 }}>
        <Key onClick={() => key("KEY_RETURN")} label={t("tv.back")} disabled={!on}>
          <UndoIcon fontSize="small" />
        </Key>
        <Key onClick={() => key("KEY_HOME")} label={t("tv.home")} disabled={!on}>
          <HomeOutlinedIcon fontSize="small" />
        </Key>
        <Key onClick={() => key("KEY_SOURCE")} label={t("tv.source")} disabled={!on}>
          <InputIcon fontSize="small" />
        </Key>
      </Box>

      {/* Smerni obroč */}
      <Box sx={{ mt: 3 }}>
        <DPad send={key} disabled={!on} t={t} />
      </Box>

      {/* Glasnost */}
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 2, mt: 3 }}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            borderRadius: 99,
            bgcolor: SURFACE,
            opacity: on ? 1 : 0.4,
          }}
        >
          <IconButton onClick={() => key("KEY_VOLDOWN")} disabled={!on} aria-label={t("tv.volDown")} sx={{ width: 48, height: 48 }}>
            <RemoveIcon />
          </IconButton>
          <Typography variant="caption" color="text.secondary" sx={{ px: 1, fontWeight: 600, letterSpacing: 1 }}>
            VOL
          </Typography>
          <IconButton onClick={() => key("KEY_VOLUP")} disabled={!on} aria-label={t("tv.volUp")} sx={{ width: 48, height: 48 }}>
            <AddIcon />
          </IconButton>
        </Box>
        <Key onClick={() => key("KEY_MUTE")} label={t("tv.mute")} disabled={!on}>
          <VolumeOffIcon fontSize="small" />
        </Key>
      </Box>

      {/* Aplikacije */}
      <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, mt: 3 }}>
        {APPS.map((a) => (
          <ButtonBase
            key={a.id}
            onClick={() => void post({ action: "app", app: a.id })}
            disabled={!on || busy}
            sx={{
              height: 48,
              borderRadius: "12px",
              background: a.bg,
              color: a.fg,
              fontWeight: 800,
              fontSize: 15,
              letterSpacing: a.id === "netflix" ? 1.5 : 0.2,
              border: "1px solid rgba(255,255,255,0.08)",
              opacity: on ? 1 : 0.35,
              transition: "transform .08s, filter .15s",
              "&:hover": { filter: "brightness(1.15)" },
              "&:active": { transform: "scale(0.96)" },
            }}
          >
            {a.label}
          </ButtonBase>
        ))}
      </Box>
    </Dialog>
  );
}
