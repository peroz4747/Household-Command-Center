"use client";

import { useState } from "react";
import { Box, Button, Card, CardContent, Chip, Typography, Divider } from "@mui/material";
import ThermostatIcon from "@mui/icons-material/Thermostat";
import { useI18n } from "../i18n";
import { Dimmed, NotConnectedChip } from "./NotConnected";

interface CameraZone {
  label: string;
  active: boolean;
}

interface ClientDashboardProps {
  cameraZones: CameraZone[];
}

export default function ClientDashboard({ cameraZones }: ClientDashboardProps) {
  const { t } = useI18n();
  // Indeks namesto imena, da izbira ostane ob menjavi jezika.
  const [selected, setSelected] = useState(Math.max(0, cameraZones.findIndex((z) => z.active)));
  const selectedCamera = cameraZones[selected]?.label ?? "";

  return (
    <Card sx={{ minHeight: 420, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <Box sx={{ background: "linear-gradient(180deg, #0b172f 0%, #111b33 100%)", p: 3, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Box>
          <Typography variant="subtitle2" color="secondary">
            {t("camera.overline")}
          </Typography>
          <Typography variant="h6" sx={{ mt: 1, fontWeight: 700 }}>
            {t("camera.view", { name: selectedCamera })}
          </Typography>
        </Box>
        <Chip label={t("camera.online")} color="success" />
      </Box>
      <Box sx={{ flex: 1, background: "linear-gradient(180deg, rgba(255,255,255,.04), rgba(255,255,255,.01))", display: "grid", placeItems: "center", p: 2 }}>
        <Box sx={{ width: "100%", height: 260, borderRadius: 3, background: "radial-gradient(circle at 30% 20%, rgba(94, 147, 255, 0.16), transparent 38%), #111b2f", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 30px 120px rgba(0,0,0,0.16)", position: "relative" }}>
          <Typography variant="h6" color="text.secondary" sx={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)" }}>
            {t("camera.placeholder", { name: selectedCamera })}
          </Typography>
        </Box>
      </Box>
      <Divider sx={{ borderColor: "rgba(255,255,255,0.08)" }} />
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, p: 2 }}>
        {cameraZones.map((zone, i) => (
          <Button
            key={zone.label}
            variant={selectedCamera === zone.label ? "contained" : "outlined"}
            color={selectedCamera === zone.label ? "primary" : "inherit"}
            size="small"
            sx={{ borderRadius: 99, textTransform: "none" }}
            onClick={() => setSelected(i)}
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
  const { t, locale } = useI18n();

  const handleIncrease = () => setTemperature((prev) => prev + 1);
  const handleDecrease = () => setTemperature((prev) => prev - 1);

  return (
    <Card sx={{ minHeight: 205, overflow: "hidden" }}>
      <CardContent>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 1 }}>
          <Typography variant="subtitle2" color="secondary">
            {t("climate.overline")}
          </Typography>
          <NotConnectedChip label={t("common.notConnected")} />
        </Box>
        {/* Klima še ni povezana - vrednosti in gumbi so samo predogled. */}
        <Dimmed>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Box>
            <Typography variant="h6" sx={{ mt: 1, fontWeight: 700 }}>
              {t("climate.idle")}
            </Typography>
          </Box>
          <ThermostatIcon sx={{ color: "#facc15", fontSize: 38 }} />
        </Box>
        <Typography variant="h2" sx={{ mt: 4, fontWeight: 700 }}>
          {temperature}°
        </Typography>
        <Typography color="text.secondary" sx={{ mt: 1 }}>
          {t("climate.average", { t: (20.6).toLocaleString(locale) })}
        </Typography>
        <Box sx={{ display: "flex", gap: 1, mt: 3 }}>
          <Button variant="outlined" color="inherit" size="small" sx={{ minWidth: 0, p: 1 }} onClick={handleDecrease}>
            −
          </Button>
          <Button variant="contained" color="primary" size="small" sx={{ minWidth: 0, p: 1 }} onClick={handleIncrease}>
            +
          </Button>
        </Box>
        </Dimmed>
      </CardContent>
    </Card>
  );
}
