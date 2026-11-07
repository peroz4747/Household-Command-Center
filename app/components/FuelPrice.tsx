"use client";

import { useEffect, useState } from "react";
import { Box, Tooltip, Typography } from "@mui/material";
import { useI18n } from "../i18n";
import type { FuelData } from "../../lib/fuel";

const POLL_MS = 60 * 60_000;

/** Cena bencina 95 v okolici (goriva.si) - vrstica pod rezervoarjem v kartici avta. */
export default function FuelPrice() {
  const { t, locale } = useI18n();
  const [fuel, setFuel] = useState<FuelData | null>(null);

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
      </Box>
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
