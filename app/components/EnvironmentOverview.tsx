"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Box, Chip, Card, CardContent, Typography } from "@mui/material";
import { useI18n } from "../i18n";
import { Dimmed, NotConnectedChip } from "./NotConnected";
import type { ClimateStatus } from "../../lib/melcloud";

type Room = {
  name: string;
  temp: string;
  status: string;
  color: string;
  // Temperaturo prostora sporoča klima.
  climate?: boolean;
};

const POLL_MS = 60_000;

export default function EnvironmentOverview({ rooms }: { rooms: Room[] }) {
  const { t, locale } = useI18n();
  const tr = t as unknown as (key: string) => string;
  const [climate, setClimate] = useState<ClimateStatus | null>(null);

  useEffect(() => {
    const load = () =>
      fetch("/api/climate", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then(setClimate)
        .catch(() => setClimate(null));
    void load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, []);

  const row = (name: string, status: string, chip: ReactNode) => (
    <Box
      sx={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        p: 1.5,
        bgcolor: "rgba(148,163,184,0.05)",
        borderRadius: 2,
      }}
    >
      <Box>
        <Typography sx={{ fontWeight: 700 }}>{name}</Typography>
        <Typography variant="body2" color="text.secondary">
          {status}
        </Typography>
      </Box>
      {chip}
    </Box>
  );

  return (
    <Card sx={{ minHeight: 340 }}>
      <CardContent>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 1 }}>
          <Typography variant="subtitle2" color="secondary">
            {t("rooms.overline")}
          </Typography>
          <NotConnectedChip label={t("common.notConnected")} />
        </Box>

        <Typography variant="h6" sx={{ mt: 1, mb: 2, fontWeight: 700 }}>
          {t("rooms.title")}
        </Typography>

        {/* Razen prostora s klimo so temperature zaenkrat primeri, senzorji še niso povezani. */}
        <Box sx={{ display: "grid", gap: 1.5 }}>
          {rooms.map((room) =>
            room.climate ? (
              <Box key={room.name}>
                {row(
                  room.name,
                  climate ? tr(climate.power ? `climate.mode.${climate.mode}` : "climate.offRoom") : "…",
                  <Chip label={climate?.roomTemperature != null ? `${climate.roomTemperature.toLocaleString(locale)}°` : "–"} color="success" size="small" />,
                )}
              </Box>
            ) : (
              <Dimmed key={room.name}>
                {row(room.name, room.status, <Chip label={`${room.temp}°`} color={room.color as "success" | "warning" | "info"} size="small" />)}
              </Dimmed>
            ),
          )}
        </Box>
      </CardContent>
    </Card>
  );
}
