"use client";

import { useState } from "react";
import { Box, Button, Card, CardContent, Chip, Typography, Divider } from "@mui/material";
import ThermostatIcon from "@mui/icons-material/Thermostat";
import { useI18n } from "../i18n";
import { Dimmed, NotConnectedChip } from "./NotConnected";

interface CameraZone {
  label: string;
  active: boolean;
  embedUrl?: string; // javna spletna kamera (iframe); brez tega je nadomestna slika
  source?: string;
}

interface ClientDashboardProps {
  cameraZones: CameraZone[];
}

export default function ClientDashboard({ cameraZones }: ClientDashboardProps) {
  const { t } = useI18n();
  // Indeks namesto imena, da izbira ostane ob menjavi jezika.
  const [selected, setSelected] = useState(Math.max(0, cameraZones.findIndex((z) => z.active)));
  const selectedCamera = cameraZones[selected]?.label ?? "";
  const zone = cameraZones[selected];

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
        <Chip label={zone?.embedUrl ? t("camera.live") : t("camera.online")} color={zone?.embedUrl ? "error" : "success"} />
      </Box>
      <Box sx={{ flex: 1, background: "linear-gradient(180deg, rgba(255,255,255,.04), rgba(255,255,255,.01))", display: "grid", placeItems: "center", p: 2 }}>
        <Box sx={{ width: "100%", height: zone?.embedUrl ? "auto" : 260, aspectRatio: zone?.embedUrl ? "16 / 10" : undefined, borderRadius: 3, overflow: "hidden", background: "radial-gradient(circle at 30% 20%, rgba(94, 147, 255, 0.16), transparent 38%), #111b2f", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 30px 120px rgba(0,0,0,0.16)", position: "relative" }}>
          {zone?.embedUrl ? (
            <Box
              component="iframe"
              key={zone.embedUrl}
              src={zone.embedUrl}
              title={zone.source ?? zone.label}
              allow="autoplay; fullscreen; picture-in-picture"
              allowFullScreen
              loading="lazy"
              sx={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
            />
          ) : (
            <Typography variant="h6" color="text.secondary" sx={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)" }}>
              {t("camera.placeholder", { name: selectedCamera })}
            </Typography>
          )}
        </Box>
        {zone?.source && (
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, justifySelf: "start" }}>
            {t("camera.source", { name: zone.source })}
          </Typography>
        )}
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
