"use client";

import { Box, Chip, Card, CardContent, Typography } from "@mui/material";
import { useI18n } from "../i18n";
import { Dimmed, NotConnectedChip } from "./NotConnected";

type Room = {
  name: string;
  temp: string;
  status: string;
  color: string;
};

export default function EnvironmentOverview({ rooms }: { rooms: Room[] }) {
  const { t } = useI18n();

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

        {/* Temperature prostorov so zaenkrat primeri, senzorji še niso povezani. */}
        <Dimmed>
          <Box sx={{ display: "grid", gap: 1.5 }}>
            {rooms.map((room) => (
              <Box
                key={room.name}
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
                  <Typography sx={{ fontWeight: 700 }}>{room.name}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {room.status}
                  </Typography>
                </Box>

                <Chip
                  label={`${room.temp}°`}
                  color={room.color as "success" | "warning" | "info"}
                  size="small"
                />
              </Box>
            ))}
          </Box>
        </Dimmed>
      </CardContent>
    </Card>
  );
}
