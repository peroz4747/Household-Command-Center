"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Box, Button, Card, CardContent, CircularProgress, IconButton, MenuItem, TextField, Tooltip, Typography } from "@mui/material";
import PowerSettingsNewIcon from "@mui/icons-material/PowerSettingsNew";
import { useI18n } from "../i18n";
import { CLIMATE_MODES, type ClimateMode } from "../../lib/climateModes";
import type { ClimateCommand, ClimateStatus } from "../../lib/melcloud";

const POLL_MS = 60_000;
const SEND_DELAY_MS = 800;

/** Kartica Klima: stanje iz MELCloud Home, vklop, način in nastavljena temperatura. */
export default function ClimateControl() {
  const { t, locale } = useI18n();
  const tr = t as unknown as (key: string, vars?: Record<string, string | number>) => string;
  const [status, setStatus] = useState<ClimateStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<number | null>(null);

  const load = useCallback(() => {
    // Med čakanjem na pošiljanje temperature ne prepisujemo lokalne vrednosti.
    if (timer.current) return;
    fetch("/api/climate", { cache: "no-store" })
      .then(async (r) => {
        const body = await r.json();
        if (r.ok) {
          setStatus(body);
          setError(null);
        } else setError(String(body.error ?? "unavailable"));
      })
      .catch(() => setError("unavailable"));
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  const send = useCallback(async (command: ClimateCommand) => {
    setBusy(true);
    try {
      const res = await fetch("/api/climate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(command),
      });
      const body = await res.json();
      if (res.ok) {
        setStatus(body);
        setError(null);
      } else setError(String(body.error ?? "unavailable"));
    } catch {
      setError("unavailable");
    } finally {
      setBusy(false);
    }
  }, []);

  const changeTemperature = (delta: number) => {
    if (!status || status.setTemperature === null) return;
    const value = Math.min(status.maxTemperature, Math.max(status.minTemperature, status.setTemperature + delta));
    setStatus({ ...status, setTemperature: value });
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      void send({ temperature: value });
    }, SEND_DELAY_MS);
  };

  const number = (n: number) => n.toLocaleString(locale);

  return (
    <Card sx={{ minHeight: 205, overflow: "hidden" }}>
      <CardContent>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 1 }}>
          <Box>
            <Typography variant="subtitle2" color="secondary">
              {tr("climate.overline")}
            </Typography>
            <Typography variant="h6" sx={{ mt: 0.5, fontWeight: 700 }}>
              {status ? tr(status.power ? `climate.mode.${status.mode}` : "climate.off") : "…"}
            </Typography>
          </Box>
          <Tooltip title={tr(status?.power ? "climate.turnOff" : "climate.turnOn")}>
            <span>
              <IconButton
                disabled={!status || busy}
                onClick={() => status && void send({ power: !status.power })}
                aria-label={tr(status?.power ? "climate.turnOff" : "climate.turnOn")}
                color={status?.power ? "success" : "default"}
              >
                {busy ? <CircularProgress size={24} /> : <PowerSettingsNewIcon />}
              </IconButton>
            </span>
          </Tooltip>
        </Box>

        {!status && !error && <CircularProgress size={24} sx={{ mt: 3 }} />}
        {error && (
          <Typography variant="body2" color="error" sx={{ mt: 1 }}>
            {tr(`climate.err.${["credentials", "not-configured", "no-unit"].includes(error) ? error : "unavailable"}`)}
          </Typography>
        )}
        {status && (
          <>
            <Typography variant="h3" sx={{ mt: 1.5, fontWeight: 700, opacity: status.power ? 1 : 0.5 }}>
              {status.setTemperature !== null ? `${number(status.setTemperature)}°` : "–"}
            </Typography>
            <Typography color="text.secondary" variant="body2">
              {status.roomTemperature !== null ? tr("climate.room", { t: number(status.roomTemperature) }) : ""}
            </Typography>
            {status.error && (
              <Typography variant="body2" color="error">
                {tr("climate.err.device")}
              </Typography>
            )}
            <Box sx={{ display: "flex", gap: 1, mt: 1.5, alignItems: "center" }}>
              <Button variant="outlined" color="inherit" size="small" sx={{ minWidth: 36, p: 0.75 }} disabled={busy || !status.power || status.setTemperature === null} onClick={() => changeTemperature(-0.5)} aria-label={tr("climate.cooler")}>
                −
              </Button>
              <Button variant="contained" size="small" sx={{ minWidth: 36, p: 0.75 }} disabled={busy || !status.power || status.setTemperature === null} onClick={() => changeTemperature(0.5)} aria-label={tr("climate.warmer")}>
                +
              </Button>
              <TextField
                select
                size="small"
                fullWidth
                disabled={busy || !status.power}
                value={status.mode}
                onChange={(e) => void send({ mode: e.target.value as ClimateMode })}
                aria-label={tr("climate.modeLabel")}
              >
                {CLIMATE_MODES.map((mode) => (
                  <MenuItem key={mode} value={mode}>
                    {tr(`climate.mode.${mode}`)}
                  </MenuItem>
                ))}
              </TextField>
            </Box>
          </>
        )}
      </CardContent>
    </Card>
  );
}
