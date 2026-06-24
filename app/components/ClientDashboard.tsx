"use client";

import { useState } from "react";
import { Box, Button, Card, CardContent, Chip, Typography, Divider } from "@mui/material";
import ThermostatIcon from "@mui/icons-material/Thermostat";

interface CameraZone {
  label: string;
  active: boolean;
}

interface ClientDashboardProps {
  cameraZones: CameraZone[];
}

export default function ClientDashboard({ cameraZones }: ClientDashboardProps) {
  const [selectedCamera, setSelectedCamera] = useState(cameraZones.find((z) => z.active)?.label || "Nursery");

  return (
    <Card sx={{ minHeight: 420, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <Box sx={{ background: "linear-gradient(180deg, #0b172f 0%, #111b33 100%)", p: 3, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Box>
          <Typography variant="subtitle2" color="secondary">
            Live Camera
          </Typography>
          <Typography variant="h6" sx={{ mt: 1, fontWeight: 700 }}>
            {selectedCamera} view
          </Typography>
        </Box>
        <Chip label="Online" color="success" />
      </Box>
      <Box sx={{ flex: 1, background: "linear-gradient(180deg, rgba(255,255,255,.04), rgba(255,255,255,.01))", display: "grid", placeItems: "center", p: 2 }}>
        <Box sx={{ width: "100%", height: 260, borderRadius: 3, background: "radial-gradient(circle at 30% 20%, rgba(94, 147, 255, 0.16), transparent 38%), #111b2f", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 30px 120px rgba(0,0,0,0.16)", position: "relative" }}>
          <Typography variant="h6" color="text.secondary" sx={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)" }}>
            {selectedCamera} camera placeholder
          </Typography>
        </Box>
      </Box>
      <Divider sx={{ borderColor: "rgba(255,255,255,0.08)" }} />
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, p: 2 }}>
        {cameraZones.map((zone) => (
          <Button
            key={zone.label}
            variant={selectedCamera === zone.label ? "contained" : "outlined"}
            color={selectedCamera === zone.label ? "primary" : "inherit"}
            size="small"
            sx={{ borderRadius: 99, textTransform: "none" }}
            onClick={() => setSelectedCamera(zone.label)}
          >
            {zone.label}
          </Button>
        ))}
      </Box>
    </Card>
  );
}

export function ClimateControl() {
  const [temperature, setTemperature] = useState(20);

  const handleIncrease = () => setTemperature((prev) => prev + 1);
  const handleDecrease = () => setTemperature((prev) => prev - 1);

  return (
    <Card sx={{ minHeight: 205, overflow: "hidden" }}>
      <CardContent>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Box>
            <Typography variant="subtitle2" color="secondary">
              Climate Control
            </Typography>
            <Typography variant="h6" sx={{ mt: 1, fontWeight: 700 }}>
              Idle
            </Typography>
          </Box>
          <ThermostatIcon sx={{ color: "#facc15", fontSize: 38 }} />
        </Box>
        <Typography variant="h2" sx={{ mt: 4, fontWeight: 700 }}>
          {temperature}°
        </Typography>
        <Typography color="text.secondary" sx={{ mt: 1 }}>
          Average 20.6°
        </Typography>
        <Box sx={{ display: "flex", gap: 1, mt: 3 }}>
          <Button variant="outlined" color="inherit" size="small" sx={{ minWidth: 0, p: 1 }} onClick={handleDecrease}>
            −
          </Button>
          <Button variant="contained" color="primary" size="small" sx={{ minWidth: 0, p: 1 }} onClick={handleIncrease}>
            +
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
}
