"use client";

import { useState } from "react";
import { Box, Chip, Card, CardContent, Typography } from "@mui/material";

type Room = {
  name: string;
  temp: string;
  status: string;
  color: string;
};

export default function EnvironmentOverview({ rooms }: { rooms: Room[] }) {
  const [temperature, setTemperature] = useState(20);
  const [humidity, setHumidity] = useState(50);
  const [co2, setCo2] = useState(400);

  return (
    <Card sx={{ minHeight: 205, overflow: "hidden" }}>
            <Card sx={{ minHeight: 340 }}>
              <CardContent>
                <Typography variant="subtitle2" color="secondary">
                  Rooms
                </Typography>

                <Typography variant="h6" sx={{ mt: 1, mb: 2, fontWeight: 700 }}>
                  Environment overview
                </Typography>

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
              </CardContent>
            </Card>
    </Card>
  );
}
