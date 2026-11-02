"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Box, Button, Card, CardContent, Checkbox, Chip, LinearProgress, Typography } from "@mui/material";
import DirectionsCarIcon from "@mui/icons-material/DirectionsCar";
import LocalGasStationIcon from "@mui/icons-material/LocalGasStation";
import SpeedIcon from "@mui/icons-material/Speed";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import BadgeOutlinedIcon from "@mui/icons-material/BadgeOutlined";
import ConfirmationNumberOutlinedIcon from "@mui/icons-material/ConfirmationNumberOutlined";
import BuildOutlinedIcon from "@mui/icons-material/BuildOutlined";
import AcUnitIcon from "@mui/icons-material/AcUnit";
import WbSunnyOutlinedIcon from "@mui/icons-material/WbSunnyOutlined";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";

// ZAČASNO: izmišljeni podatki, dokler ni pravega vira (OBD/aplikacija proizvajalca, ročni vnos).
// Pnevmatike (kljukica) se shranjujejo v data/car.json prek /api/car.
const DEMO = {
  name: "Family car",
  model: "Octavia Combi 2.0 TDI",
  plate: "MB NA-123",
  locked: true,
  fuelPercent: 62,
  rangeKm: 610,
  odometerKm: 112_430,
  consumption: { avg: 5.4, lastTrip: 6.1, monthKm: 842 },
  location: { label: "Home", lat: 46.5547, lon: 15.6459, updated: "12 min ago" },
  insurance: "2027-03-14",
  registration: "2027-03-14",
  vignette: "2027-01-20",
  service: { date: "2026-12-05", atKm: 120_000 },
};

type TyreSeason = "summer" | "winter";
type Tyres = { mounted: TyreSeason; changedOn: string | null };

const DAY_MS = 24 * 3600 * 1000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const parseDate = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const toDateString = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const daysUntil = (date: Date, now: Date) => Math.round((startOfDay(date).getTime() - startOfDay(now).getTime()) / DAY_MS);
const fmtDate = (d: Date, withYear = true) =>
  d.toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}) });
const fmtKm = (n: number) => `${n.toLocaleString("sl-SI")} km`;

// Slovenija: zimska oprema obvezna od 15. 11. do 15. 3.
function nextTyreChange(mounted: TyreSeason, now: Date) {
  const y = now.getFullYear();
  const afterMar15 = now >= new Date(y, 2, 16);
  if (mounted === "summer") {
    // Rok za zimske: 15. 11. tekoče zime (če smo že v zimi, je rok zamujen).
    return { to: "winter" as const, date: new Date(afterMar15 ? y : y - 1, 10, 15), kind: "by" as const };
  }
  // Na letne se lahko preobuje od 15. 3. naprej.
  return { to: "summer" as const, date: new Date(now.getMonth() >= 6 ? y + 1 : y, 2, 15), kind: "from" as const };
}

function dueColor(days: number): "error" | "warning" | "success" {
  if (days < 14) return "error";
  if (days < 45) return "warning";
  return "success";
}

function daysLabel(days: number) {
  if (days < 0) return `${-days} d overdue`;
  if (days === 0) return "today";
  return `${days} d`;
}

function Stat({ icon, label, value, sub }: { icon: ReactNode; label: string; value: string; sub?: string }) {
  return (
    <Box sx={{ p: 1.5, borderRadius: 3, bgcolor: "rgba(148,163,184,0.06)" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, color: "text.secondary" }}>
        {icon}
        <Typography variant="caption">{label}</Typography>
      </Box>
      <Typography sx={{ mt: 0.5, fontWeight: 700, fontSize: 18 }}>{value}</Typography>
      {sub && (
        <Typography variant="caption" color="text.secondary">
          {sub}
        </Typography>
      )}
    </Box>
  );
}

function Deadline({ icon, label, date, now, extra }: { icon: ReactNode; label: string; date: Date; now: Date; extra?: string }) {
  const days = daysUntil(date, now);
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, py: 0.75 }}>
      <Box sx={{ color: "text.secondary", display: "flex" }}>{icon}</Box>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {label}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {fmtDate(date)}
          {extra ? ` · ${extra}` : ""}
        </Typography>
      </Box>
      <Chip size="small" variant="outlined" color={dueColor(days)} label={daysLabel(days)} />
    </Box>
  );
}

export default function CarStatus() {
  const [now, setNow] = useState<Date | null>(null);
  const [tyres, setTyres] = useState<Tyres | null>(null);
  const [previous, setPrevious] = useState<Tyres | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setNow(new Date());
    fetch("/api/car")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setTyres(data.tyres);
      })
      .catch(() => {
        setError("Unable to load tyre status");
        setTyres({ mounted: "summer", changedOn: null });
      });
  }, []);

  const saveTyres = async (next: Tyres, prev: Tyres | null) => {
    setSaving(true);
    try {
      const res = await fetch("/api/car", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tyres: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unable to save");
      setTyres(data.tyres);
      setPrevious(prev);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const d = DEMO;
  const { lat, lon } = d.location;
  const bbox = [lon - 0.012, lat - 0.006, lon + 0.012, lat + 0.006].join(",");
  const mapUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lon}`;
  const kmToService = d.service.atKm - d.odometerKm;
  const change = now && tyres ? nextTyreChange(tyres.mounted, now) : null;
  const changeDays = change && now ? daysUntil(change.date, now) : 0;

  return (
    <Card>
      <CardContent sx={{ p: { xs: 2, md: 3 } }}>
        {/* Glava */}
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 2, mb: 2.5, flexWrap: "wrap" }}>
          <Box>
            <Typography variant="subtitle2" color="secondary">
              Car
            </Typography>
            <Typography variant="h6" sx={{ mt: 1, fontWeight: 700, lineHeight: 1.3 }}>
              {d.model}
              <Typography component="span" color="text.secondary" sx={{ ml: 1, fontSize: 14, fontWeight: 500 }}>
                {d.plate}
              </Typography>
            </Typography>
          </Box>
          <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
            <Chip
              size="small"
              icon={<LockOutlinedIcon />}
              label={d.locked ? "Parked · Locked" : "Unlocked"}
              color={d.locked ? "secondary" : "warning"}
              variant="outlined"
            />
            <Chip size="small" label="Demo" variant="outlined" sx={{ color: "text.secondary" }} />
          </Box>
        </Box>

        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1.1fr 1fr 1fr" }, gap: 2.5 }}>
          {/* Lokacija */}
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <Box
              sx={{
                position: "relative",
                height: { xs: 180, md: "100%" },
                minHeight: 180,
                borderRadius: 3,
                overflow: "hidden",
                border: "1px solid rgba(148,163,184,0.15)",
              }}
            >
              <Box
                component="iframe"
                title="Car location"
                src={mapUrl}
                loading="lazy"
                sx={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  border: 0,
                  // temna različica OSM, da se ujema z dashboardom
                  filter: "invert(0.92) hue-rotate(180deg) saturate(0.6) brightness(0.95)",
                }}
              />
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              <PlaceOutlinedIcon sx={{ fontSize: 16, color: "text.secondary" }} />
              <Typography variant="caption" color="text.secondary">
                {d.location.label} · updated {d.location.updated}
              </Typography>
              <Button
                size="small"
                href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}`}
                target="_blank"
                rel="noopener noreferrer"
                sx={{ ml: "auto", textTransform: "none", minWidth: 0, py: 0 }}
              >
                Open map
              </Button>
            </Box>
          </Box>

          {/* Stanje in poraba */}
          <Box sx={{ display: "grid", gap: 1.25, alignContent: "start" }}>
            <Box sx={{ p: 1.5, borderRadius: 3, bgcolor: "rgba(148,163,184,0.06)" }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, color: "text.secondary" }}>
                <LocalGasStationIcon sx={{ fontSize: 16 }} />
                <Typography variant="caption">Fuel</Typography>
                <Typography variant="caption" sx={{ ml: "auto" }}>
                  {fmtKm(d.rangeKm)} range
                </Typography>
              </Box>
              <Typography sx={{ mt: 0.5, fontWeight: 700, fontSize: 18 }}>{d.fuelPercent} %</Typography>
              <LinearProgress
                variant="determinate"
                value={d.fuelPercent}
                color={d.fuelPercent < 15 ? "error" : d.fuelPercent < 30 ? "warning" : "secondary"}
                sx={{ mt: 0.75, height: 6, borderRadius: 3, bgcolor: "rgba(148,163,184,0.15)" }}
              />
            </Box>
            <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.25 }}>
              <Stat
                icon={<DirectionsCarIcon sx={{ fontSize: 16 }} />}
                label="Consumption"
                value={`${d.consumption.avg.toLocaleString("sl-SI")} l`}
                sub={`per 100 km · last trip ${d.consumption.lastTrip.toLocaleString("sl-SI")}`}
              />
              <Stat
                icon={<SpeedIcon sx={{ fontSize: 16 }} />}
                label="Odometer"
                value={fmtKm(d.odometerKm)}
                sub={`${fmtKm(d.consumption.monthKm)} this month`}
              />
            </Box>
          </Box>

          {/* Roki in pnevmatike */}
          <Box>
            {now && (
              <>
                <Deadline icon={<ShieldOutlinedIcon fontSize="small" />} label="Insurance" date={parseDate(d.insurance)} now={now} />
                <Deadline icon={<BadgeOutlinedIcon fontSize="small" />} label="Registration" date={parseDate(d.registration)} now={now} />
                <Deadline icon={<ConfirmationNumberOutlinedIcon fontSize="small" />} label="Vignette" date={parseDate(d.vignette)} now={now} />
                <Deadline
                  icon={<BuildOutlinedIcon fontSize="small" />}
                  label="Next service"
                  date={parseDate(d.service.date)}
                  now={now}
                  extra={`or ${fmtKm(d.service.atKm)} (${fmtKm(kmToService)} left)`}
                />
              </>
            )}

            {change && tyres && now && (
              <Box
                sx={{
                  mt: 1,
                  p: 1.25,
                  borderRadius: 3,
                  bgcolor: "rgba(148,163,184,0.06)",
                  border: "1px solid",
                  borderColor: change.kind === "by" && changeDays < 14 ? "rgba(248,113,113,0.5)" : "rgba(148,163,184,0.12)",
                }}
              >
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                  {tyres.mounted === "winter" ? (
                    <AcUnitIcon sx={{ fontSize: 16, color: "#38bdf8" }} />
                  ) : (
                    <WbSunnyOutlinedIcon sx={{ fontSize: 16, color: "#facc15" }} />
                  )}
                  <Typography variant="caption" color="text.secondary">
                    {tyres.mounted === "winter" ? "Winter" : "Summer"} tyres on
                    {tyres.changedOn ? ` since ${fmtDate(parseDate(tyres.changedOn), false)}` : ""}
                  </Typography>
                  {previous && (
                    <Button
                      size="small"
                      disabled={saving}
                      onClick={() => void saveTyres(previous, null)}
                      sx={{ ml: "auto", textTransform: "none", minWidth: 0, py: 0 }}
                    >
                      Undo
                    </Button>
                  )}
                </Box>
                <Box
                  component="label"
                  sx={{ display: "flex", alignItems: "center", gap: 0.5, mt: 0.5, cursor: saving ? "default" : "pointer" }}
                >
                  <Checkbox
                    checked={false}
                    disabled={saving}
                    onChange={() =>
                      void saveTyres({ mounted: change.to, changedOn: toDateString(now) }, tyres)
                    }
                    sx={{ p: 0.5, ml: -0.5 }}
                  />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      Change to {change.to} tyres
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {change.kind === "by" ? "by" : "from"} {fmtDate(change.date)}
                    </Typography>
                  </Box>
                  {change.kind === "by" ? (
                    <Chip size="small" variant="outlined" color={dueColor(changeDays)} label={daysLabel(changeDays)} />
                  ) : (
                    <Chip
                      size="small"
                      variant="outlined"
                      label={changeDays <= 0 ? "now" : `in ${changeDays} d`}
                      color={changeDays <= 0 ? "info" : "default"}
                    />
                  )}
                </Box>
              </Box>
            )}

            {error && (
              <Typography variant="caption" color="error" sx={{ display: "block", mt: 1 }}>
                {error}
              </Typography>
            )}
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}
