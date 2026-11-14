"use client";

import { useEffect, useState } from "react";
import { Box, Button, IconButton, InputAdornment, Popover, TextField, Tooltip, Typography } from "@mui/material";
import NotificationsActiveIcon from "@mui/icons-material/NotificationsActive";
import NotificationsNoneIcon from "@mui/icons-material/NotificationsNone";
import { useI18n } from "../i18n";
import type { FuelData } from "../../lib/fuel";

const POLL_MS = 60 * 60_000;

/** Cena bencina 95 v okolici (goriva.si) - vrstica pod rezervoarjem v kartici avta. */
export default function FuelPrice() {
  const { t, locale } = useI18n();
  const [fuel, setFuel] = useState<FuelData | null>(null);
  const [below, setBelow] = useState<number | null>(null);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    fetch("/api/fuel/alert", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setBelow(d.below))
      .catch(() => {});
  }, []);

  const saveAlert = async (value: number | null) => {
    const res = await fetch("/api/fuel/alert", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ below: value }) }).catch(() => null);
    const d = res?.ok ? await res.json() : null;
    if (d) setBelow(d.below);
    setAnchor(null);
  };

  useEffect(() => {
    const load = () =>
      fetch("/api/fuel", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d && !d.error && setFuel(d))
        .catch(() => {});
    void load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, []);

  if (!fuel) return null;

  const eur = (n: number) => n.toLocaleString(locale, { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  const diff = fuel.change ? fuel.change.to - fuel.change.from : 0;
  const since = fuel.change
    ? new Date(`${fuel.change.since}T12:00:00`).toLocaleDateString(locale, { day: "numeric", month: "numeric" })
    : "";

  return (
    <Box sx={{ mt: 1, pt: 1, borderTop: "1px solid rgba(148,163,184,0.12)" }}>
      <Box sx={{ display: "flex", alignItems: "baseline", gap: 0.75, flexWrap: "wrap" }}>
        <Tooltip title={t("fuel.tooltip", { n: fuel.stations })}>
          <Typography variant="caption" color="text.secondary" sx={{ cursor: "help" }}>
            {t("fuel.label", { fuel: fuel.fuel })}
          </Typography>
        </Tooltip>
        <Typography sx={{ fontWeight: 700, fontSize: 14 }}>{eur(fuel.price)} €/l</Typography>
        {fuel.change && (
          <Typography
            variant="caption"
            sx={{ fontWeight: 600, color: diff > 0 ? "#f87171" : "#22c55e", whiteSpace: "nowrap" }}
          >
            {diff > 0 ? "▲ +" : "▼ "}
            {eur(diff)} {t("fuel.since", { date: since })}
          </Typography>
        )}
        <Tooltip title={below === null ? t("fuel.alert.none") : t("fuel.alert.set", { price: eur(below) })}>
          <IconButton
            size="small"
            sx={{ ml: "auto", p: 0.25 }}
            aria-label={t("fuel.alert.title")}
            onClick={(e) => {
              setDraft(below === null ? "" : below.toFixed(3).replace(".", locale.startsWith("en") ? "." : ","));
              setAnchor(e.currentTarget);
            }}
          >
            {below === null ? <NotificationsNoneIcon sx={{ fontSize: 16 }} /> : <NotificationsActiveIcon sx={{ fontSize: 16 }} color="secondary" />}
          </IconButton>
        </Tooltip>
      </Box>
      <Popover open={Boolean(anchor)} anchorEl={anchor} onClose={() => setAnchor(null)} anchorOrigin={{ vertical: "bottom", horizontal: "right" }} transformOrigin={{ vertical: "top", horizontal: "right" }}>
        <Box sx={{ p: 2, width: 260, display: "flex", flexDirection: "column", gap: 1.5 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {t("fuel.alert.title")}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {t("fuel.alert.help")}
          </Typography>
          <TextField
            size="small"
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={eur(Math.floor((fuel.price - 0.03) * 100) / 100)}
            slotProps={{ input: { endAdornment: <InputAdornment position="end">€/l</InputAdornment> }, htmlInput: { inputMode: "decimal" } }}
          />
          <Box sx={{ display: "flex", justifyContent: "space-between" }}>
            <Button size="small" color="inherit" disabled={below === null} onClick={() => void saveAlert(null)}>
              {t("fuel.alert.off")}
            </Button>
            <Button size="small" variant="contained" color="secondary" disabled={!Number(draft.replace(",", "."))} onClick={() => void saveAlert(Number(draft.replace(",", ".")))}>
              {t("common.save")}
            </Button>
          </Box>
        </Box>
      </Popover>
      {fuel.cheapest && (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block" }} noWrap title={fuel.cheapest.address}>
          {t("fuel.cheapest", {
            price: eur(fuel.cheapest.price),
            name: fuel.cheapest.name,
            km: fuel.cheapest.distanceKm.toLocaleString(locale, { maximumFractionDigits: 1 }),
          })}
        </Typography>
      )}
    </Box>
  );
}
