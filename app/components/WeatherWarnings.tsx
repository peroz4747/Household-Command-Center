"use client";

import { useEffect, useState } from "react";
import { Box, Chip, Tooltip } from "@mui/material";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { useI18n } from "../i18n";
import type { WeatherWarning } from "../../lib/warnings";

const KINDS: [RegExp, string][] = [
  [/thunder/i, "storm"],
  [/wind/i, "wind"],
  [/snow/i, "snow"],
  [/rain/i, "rain"],
  [/\bice\b|icy/i, "ice"],
  [/fog/i, "fog"],
  [/flood/i, "flood"],
  [/high temp|heat/i, "heat"],
  [/low temp|cold/i, "cold"],
];

/** Veljavna vremenska opozorila za lokacijo doma; brez opozoril se nič ne prikaže. */
export default function WeatherWarnings() {
  const { t, locale } = useI18n();
  const tr = t as unknown as (key: string) => string;
  const [items, setItems] = useState<WeatherWarning[]>([]);

  useEffect(() => {
    const load = () =>
      fetch("/api/weather/warnings", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : { items: [] }))
        .then((d) => setItems(d.items ?? []))
        .catch(() => {});
    void load();
    const id = setInterval(load, 15 * 60_000);
    return () => clearInterval(id);
  }, []);

  if (items.length === 0) return null;
  return (
    <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap", mb: 1 }}>
      {items.map((w) => (
        <Tooltip key={w.id} title={`${tr("warnings.until")} ${new Date(w.expires).toLocaleString(locale, { weekday: "short", hour: "2-digit", minute: "2-digit" })}`}>
          <Chip
            size="small"
            icon={<WarningAmberIcon />}
            color={w.severity === "Moderate" ? "warning" : "error"}
            label={`${tr(`warnings.kind.${KINDS.find(([re]) => re.test(w.event))?.[1] ?? "other"}`)} · ${tr(`warnings.level.${w.severity}`)}`}
          />
        </Tooltip>
      ))}
    </Box>
  );
}
