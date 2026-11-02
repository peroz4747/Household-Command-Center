"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Box, Card, CardContent, Chip, LinearProgress, Typography } from "@mui/material";
import BoltIcon from "@mui/icons-material/Bolt";
import WaterDropIcon from "@mui/icons-material/WaterDrop";

// ZAČASNO: izmišljeni podatki, dokler ni pravega vira (števec / API distributerja).
// Poraba se računa iz dnevnega povprečja, da je skladna s trenutnim dnem v obdobju.
const DEMO = {
  electricity: { perDay: 11.4, unit: "kWh", pricePerUnit: 0.21, lastPeriod: 362, decimals: 0 },
  water: { perDay: 0.31, unit: "m³", pricePerUnit: 2.35, lastPeriod: 9.1, decimals: 1 },
};

// Obračunsko obdobje se zaključi 15. v mesecu (16. prejšnjega → 15. tega meseca).
const BILLING_END_DAY = 15;
const DAY_MS = 24 * 3600 * 1000;

function billingPeriod(now: Date) {
  const y = now.getFullYear();
  const m = now.getMonth();
  const endMonth = now.getDate() <= BILLING_END_DAY ? m : m + 1;
  const start = new Date(y, endMonth - 1, BILLING_END_DAY + 1);
  const end = new Date(y, endMonth, BILLING_END_DAY);
  const today = new Date(y, m, now.getDate());
  const totalDays = Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1;
  const elapsedDays = Math.round((today.getTime() - start.getTime()) / DAY_MS) + 1;
  return { start, end, totalDays, elapsedDays };
}

const fmtDate = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const fmtNum = (n: number, decimals: number) =>
  n.toLocaleString("sl-SI", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
const fmtEur = (n: number) => n.toLocaleString("sl-SI", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

function Meter({
  icon,
  color,
  label,
  meter,
  elapsedDays,
  totalDays,
}: {
  icon: ReactNode;
  color: string;
  label: string;
  meter: (typeof DEMO)["electricity"];
  elapsedDays: number;
  totalDays: number;
}) {
  const used = meter.perDay * elapsedDays;
  const projected = meter.perDay * totalDays;
  const vsLast = Math.round(((projected - meter.lastPeriod) / meter.lastPeriod) * 100);

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
        <Box
          sx={{
            width: 30,
            height: 30,
            borderRadius: "50%",
            display: "grid",
            placeItems: "center",
            bgcolor: `${color}22`,
            color,
          }}
        >
          {icon}
        </Box>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {label}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ ml: "auto" }}>
          ≈ {fmtEur(used * meter.pricePerUnit)}
        </Typography>
      </Box>

      <Box sx={{ display: "flex", alignItems: "baseline", gap: 0.75 }}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          {fmtNum(used, meter.decimals)}
        </Typography>
        <Typography color="text.secondary">{meter.unit}</Typography>
      </Box>

      <LinearProgress
        variant="determinate"
        value={Math.min(100, (used / projected) * 100)}
        sx={{
          mt: 1,
          height: 6,
          borderRadius: 3,
          bgcolor: "rgba(148,163,184,0.15)",
          "& .MuiLinearProgress-bar": { bgcolor: color, borderRadius: 3 },
        }}
      />
      <Box sx={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", columnGap: 1, mt: 0.75 }}>
        <Typography variant="caption" color="text.secondary">
          → {fmtNum(projected, meter.decimals)} {meter.unit}
        </Typography>
        <Typography variant="caption" sx={{ color: vsLast > 0 ? "#f87171" : "#22c55e", fontWeight: 600 }}>
          {vsLast > 0 ? "+" : ""}
          {vsLast} % vs last
        </Typography>
      </Box>
    </Box>
  );
}

export default function UtilityUsage() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []);

  const period = now ? billingPeriod(now) : null;

  return (
    <Card>
      <CardContent>
        <Typography variant="subtitle2" color="secondary">
          Billing period
        </Typography>
        <Typography variant="h6" sx={{ mt: 1, fontWeight: 700, whiteSpace: "nowrap" }}>
          {period ? `${fmtDate(period.start)} – ${fmtDate(period.end)}` : "\u00a0"}
        </Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
          <Typography variant="caption" color="text.secondary">
            {period ? `Day ${period.elapsedDays} of ${period.totalDays}` : "\u00a0"}
          </Typography>
          <Chip label="Demo" size="small" variant="outlined" sx={{ height: 20, fontSize: 11, color: "text.secondary" }} />
        </Box>

        {period && (
          <Box sx={{ display: "grid", gap: 2, mt: 2 }}>
            <Meter
              icon={<BoltIcon sx={{ fontSize: 18 }} />}
              color="#facc15"
              label="Electricity"
              meter={DEMO.electricity}
              elapsedDays={period.elapsedDays}
              totalDays={period.totalDays}
            />
            <Meter
              icon={<WaterDropIcon sx={{ fontSize: 18 }} />}
              color="#38bdf8"
              label="Water"
              meter={DEMO.water}
              elapsedDays={period.elapsedDays}
              totalDays={period.totalDays}
            />
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
