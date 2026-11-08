"use client";

import { useEffect, useState } from "react";
import { Alert, Tooltip } from "@mui/material";
import DirectionsCarIcon from "@mui/icons-material/DirectionsCar";
import { useI18n } from "../i18n";
import type { TravelHint as Hint } from "../../lib/travel";

/** Kdaj oditi na naslednji dogodek z lokacijo; brez takega dogodka se nič ne prikaže. */
export default function TravelHint() {
  const { t, locale } = useI18n();
  const tr = t as unknown as (key: string, vars?: Record<string, string | number>) => string;
  const [item, setItem] = useState<Hint | null>(null);

  useEffect(() => {
    const load = () =>
      fetch("/api/travel", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : { item: null }))
        .then((d) => setItem(d.item ?? null))
        .catch(() => {});
    void load();
    const id = setInterval(load, 10 * 60_000);
    return () => clearInterval(id);
  }, []);

  if (!item) return null;
  const time = (iso: string) => new Date(iso).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  return (
    <Tooltip title={tr("travel.note")}>
      <Alert severity="info" icon={<DirectionsCarIcon fontSize="inherit" />} sx={{ mb: 2 }}>
        {tr("travel.leave", { time: time(item.leaveAt), title: item.title, minutes: item.minutes })}
      </Alert>
    </Tooltip>
  );
}
