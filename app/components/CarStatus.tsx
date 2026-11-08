"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
  IconButton,
  LinearProgress,
  Tooltip,
  Typography,
} from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
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
import LockOpenOutlinedIcon from "@mui/icons-material/LockOpenOutlined";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import type { CarLive, CarResponse, Tyres, TyreSeason } from "../../lib/car";
import type { MessageKey, Translate } from "../../lib/i18n";
import SettingsRemoteIcon from "@mui/icons-material/SettingsRemote";
import FuelPrice from "./FuelPrice";
import { useI18n } from "../i18n";

import { CAR_MANUAL as MANUAL } from "../../lib/carManual";

// Demo stanje, dokler v .env ni SKODA_API_KEY in SKODA_VIN.
const DEMO = {
  plate: "MB NA-123",
  locked: true as boolean | null,
  fuelPercent: 62 as number | null,
  rangeKm: 610 as number | null,
  odometerKm: 112_430 as number | null,
  monthKm: 842 as number | null,
  consumption: { avg: 5.4, lastTrip: 6.1 } as { avg: number; lastTrip: number } | null,
  adBlueRangeKm: null as number | null,
  location: { label: "car.home" as MessageKey | string, lat: 46.5547, lon: 15.6459, lastKnown: false } as {
    label: MessageKey | string;
    lat: number | null;
    lon: number | null;
    lastKnown: boolean;
  },
  updated: new Date(Date.now() - 12 * 60_000).toISOString() as string | null,
};
type View = typeof DEMO & { title: string };

// Škoda API je nastavljen, a podatki še niso bili prebrani.
const EMPTY: Omit<View, "title"> = {
  plate: "",
  locked: null,
  fuelPercent: null,
  rangeKm: null,
  odometerKm: null,
  monthKm: null,
  consumption: null,
  adBlueRangeKm: null,
  location: { label: "car.noData", lat: null, lon: null, lastKnown: false },
  updated: null,
};

function timeAgo(iso: string | null, now: Date, t: Translate) {
  if (!iso) return t("common.never");
  const min = Math.round((now.getTime() - Date.parse(iso)) / 60_000);
  if (min < 1) return t("common.justNow");
  if (min < 60) return t("common.minAgo", { n: min });
  const h = Math.round(min / 60);
  if (h < 48) return t("common.hAgo", { n: h });
  return t("common.dAgo", { n: Math.round(h / 24) });
}

// Oznaka lokacije je ključ za prevod ali naslov iz API-ja.
const isKey = (s: string): s is MessageKey => s.startsWith("car.");

function fromLive(live: CarLive): View {
  const p = live.parking;
  return {
    title: live.name && live.name !== MANUAL.model ? `${live.name}` : MANUAL.model,
    plate: live.licensePlate ?? "",
    locked: live.locked,
    fuelPercent: live.fuelPercent,
    rangeKm: live.rangeKm,
    odometerKm: live.odometerKm,
    monthKm: live.monthKm,
    consumption: null,
    adBlueRangeKm: live.adBlueRangeKm,
    location: {
      label:
        p.state === "IN_MOTION" ? "car.driving" : (p.address ?? (p.lat !== null ? "car.parked" : "car.locationUnavailable")),
      lat: p.lat,
      lon: p.lon,
      lastKnown: p.lastKnown,
    },
    updated: live.capturedAt ?? live.fetchedAt,
  };
}

const DAY_MS = 24 * 3600 * 1000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const parseDate = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const toDateString = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const daysUntil = (date: Date, now: Date) => Math.round((startOfDay(date).getTime() - startOfDay(now).getTime()) / DAY_MS);
const fmtDate = (d: Date, locale: string, withYear = true) =>
  d.toLocaleDateString(locale, { day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}) });
const fmtKm = (n: number, locale: string) => `${n.toLocaleString(locale)} km`;

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

function daysLabel(days: number, t: Translate) {
  if (days < 0) return t("common.daysOverdue", { n: -days });
  if (days === 0) return t("common.today");
  return t("common.days", { n: days });
}

function Stat({ icon, label, value, sub }: { icon: ReactNode; label: string; value: string; sub?: string }) {
  return (
    <Box sx={{ p: 1.5, borderRadius: "14px", bgcolor: "rgba(148,163,184,0.06)" }}>
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
  const { t, locale } = useI18n();
  const days = daysUntil(date, now);
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, py: 0.75 }}>
      <Box sx={{ color: "text.secondary", display: "flex" }}>{icon}</Box>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {label}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {fmtDate(date, locale)}
          {extra ? ` · ${extra}` : ""}
        </Typography>
      </Box>
      <Chip size="small" variant="outlined" color={dueColor(days)} label={daysLabel(days, t)} />
    </Box>
  );
}

export default function CarStatus() {
  const { t, locale } = useI18n();
  const [now, setNow] = useState<Date | null>(null);
  const [tyres, setTyres] = useState<Tyres | null>(null);
  const [car, setCar] = useState<CarResponse | null>(null);
  const [previous, setPrevious] = useState<Tyres | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Na Škoda API gremo samo ob kliku (omejitev 20 klicev/uro); GET vrne zadnje shranjene podatke.
  const refresh = async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/car", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.tyres) throw new Error("refresh");
      setNow(new Date());
      setCar(data);
      setTyres(data.tyres);
      setError(null);
    } catch {
      setError("car.refreshError");
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    const load = () =>
      fetch("/api/car")
        .then((r) => r.json())
        .then((data: CarResponse & { error?: string }) => {
          if (!data.tyres) throw new Error("load");
          setNow(new Date());
          setCar(data);
          setTyres(data.tyres);
        })
        .catch(() => {
          setNow(new Date());
          setError("car.loadError");
          setTyres((t) => t ?? { mounted: "summer", changedOn: null });
        });
    void load();
    // Le prebere shranjeno stanje (brez klica na Škoda API), npr. po osvežitvi z druge naprave.
    const timer = setInterval(load, 5 * 60_000);
    return () => clearInterval(timer);
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
      if (!res.ok) throw new Error("save");
      setTyres(data.tyres);
      setPrevious(prev);
      setError(null);
    } catch {
      setError("car.saveError");
    } finally {
      setSaving(false);
    }
  };

  const isSkoda = car?.source === "skoda";
  const isLive = isSkoda && car!.live !== null;
  const d: View =
    isLive && now
      ? fromLive(car!.live!)
      : isSkoda
        ? { ...EMPTY, title: MANUAL.model }
        : { ...DEMO, title: MANUAL.model };
  const { lat, lon } = d.location;
  const hasMap = lat !== null && lon !== null;
  // Polovična širina/višina območja v stopinjah (manj = bližje).
  const bbox = hasMap ? [lon - 0.003, lat - 0.0015, lon + 0.003, lat + 0.0015].join(",") : "";
  const mapUrl = hasMap
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lon}`
    : "";
  const updatedAgo = now ? timeAgo(d.updated, now, t) : "";
  const locationLabel = isKey(d.location.label) ? t(d.location.label) : d.location.label;
  const keyDays = isLive && car!.live!.keyExpiresAt && now ? daysUntil(new Date(car!.live!.keyExpiresAt), now) : null;
  const apiErr = car?.source === "skoda" ? car.error : null;
  const apiError = apiErr
    ? apiErr.code === "other"
      ? t("car.err.other", { detail: apiErr.detail ?? "" })
      : t(`car.err.${apiErr.code}`)
    : null;
  // Deli, ki jih avto podpira, a jih ne deli (zasebnostne nastavitve v avtu / storitve).
  const PARTS = ["VEHICLE_STATUS", "FUEL_STATUS", "ODOMETER", "PARKING_POSITION"] as const;
  const disabledParts = isLive
    ? PARTS.filter((part) => car!.live!.partErrors.includes(`${part}_DISABLED`)).map((part) => t(`car.part.${part}`))
    : [];
  const disabledHint = disabledParts.length ? t("car.disabled", { parts: disabledParts.join(", ") }) : null;
  const change = now && tyres ? nextTyreChange(tyres.mounted, now) : null;
  const changeDays = change && now ? daysUntil(change.date, now) : 0;

  return (
    <Card>
      <CardContent sx={{ p: { xs: 2, md: 3 } }}>
        {/* Glava */}
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 2, mb: 2.5, flexWrap: "wrap" }}>
          <Box>
            <Typography variant="subtitle2" color="secondary">
              {t("car.overline")}
            </Typography>
            <Typography variant="h6" sx={{ mt: 1, fontWeight: 700, lineHeight: 1.3 }}>
              {d.title}
              <Typography component="span" color="text.secondary" sx={{ ml: 1, fontSize: 14, fontWeight: 500 }}>
                {d.plate}
              </Typography>
            </Typography>
          </Box>
          <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
            {d.locked !== null && (
              <Chip
                size="small"
                icon={d.locked ? <LockOutlinedIcon /> : <LockOpenOutlinedIcon />}
                label={d.locked ? t("car.locked") : t("car.unlocked")}
                color={d.locked ? "secondary" : "warning"}
                variant="outlined"
              />
            )}
            {isSkoda ? (
              <>
                <Chip size="small" label={t("car.skodaChip", { ago: updatedAgo })} variant="outlined" sx={{ color: "text.secondary" }} />
                <Tooltip title={t("car.refreshTooltip")}>
                  <span>
                    <IconButton size="small" onClick={() => void refresh()} disabled={refreshing} aria-label={t("car.refreshAria")}>
                      {refreshing ? <CircularProgress size={18} /> : <RefreshIcon fontSize="small" />}
                    </IconButton>
                  </span>
                </Tooltip>
              </>
            ) : (
              <Chip size="small" label={t("common.demo")} variant="outlined" sx={{ color: "text.secondary" }} />
            )}
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
                borderRadius: "14px",
                overflow: "hidden",
                border: "1px solid rgba(148,163,184,0.15)",
              }}
            >
              {!hasMap ? (
                <Box sx={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "text.secondary" }}>
                  <Typography variant="caption">{t("car.locationUnavailable")}</Typography>
                </Box>
              ) : (
              <Box
                component="iframe"
                title={t("car.mapTitle")}
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
              )}
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              <PlaceOutlinedIcon sx={{ fontSize: 16, color: "text.secondary" }} />
              <Typography variant="caption" color="text.secondary" noWrap title={locationLabel}>
                {locationLabel}
                {isLive || !d.updated ? "" : ` · ${t("car.updated", { ago: updatedAgo })}`}
              </Typography>
              {hasMap && (
              <Button
                size="small"
                href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}`}
                target="_blank"
                rel="noopener noreferrer"
                sx={{ ml: "auto", textTransform: "none", minWidth: 0, py: 0 }}
              >
                {t("car.openMap")}
              </Button>
              )}
            </Box>
          </Box>

          {/* Stanje in poraba */}
          <Box sx={{ display: "grid", gap: 1.25, alignContent: "start" }}>
            <Box sx={{ p: 1.5, borderRadius: "14px", bgcolor: "rgba(148,163,184,0.06)" }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, color: "text.secondary" }}>
                <LocalGasStationIcon sx={{ fontSize: 16 }} />
                <Typography variant="caption">{t("car.fuel")}</Typography>
                {d.rangeKm !== null && (
                  <Typography variant="caption" sx={{ ml: "auto" }}>
                    {t("car.range", { km: fmtKm(d.rangeKm, locale) })}
                  </Typography>
                )}
              </Box>
              <Typography sx={{ mt: 0.5, fontWeight: 700, fontSize: 18 }}>
                {d.fuelPercent !== null ? `${d.fuelPercent} %` : "–"}
              </Typography>
              <LinearProgress
                variant="determinate"
                value={d.fuelPercent ?? 0}
                color={d.fuelPercent === null ? "inherit" : d.fuelPercent < 15 ? "error" : d.fuelPercent < 30 ? "warning" : "secondary"}
                sx={{ mt: 0.75, height: 6, borderRadius: 3, bgcolor: "rgba(148,163,184,0.15)" }}
              />
              <FuelPrice />
            </Box>
            <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.25 }}>
              {d.consumption ? (
                <Stat
                  icon={<DirectionsCarIcon sx={{ fontSize: 16 }} />}
                  label={t("car.consumption")}
                  value={`${d.consumption.avg.toLocaleString(locale)} l`}
                  sub={t("car.perTrip", { n: d.consumption.lastTrip.toLocaleString(locale) })}
                />
              ) : (
                <Stat
                  icon={<DirectionsCarIcon sx={{ fontSize: 16 }} />}
                  label={t("car.thisMonth")}
                  value={d.monthKm !== null ? fmtKm(d.monthKm, locale) : "–"}
                  sub={d.adBlueRangeKm !== null ? t("car.adBlue", { km: fmtKm(d.adBlueRangeKm, locale) }) : t("car.sinceFirst")}
                />
              )}
              <Stat
                icon={<SpeedIcon sx={{ fontSize: 16 }} />}
                label={t("car.odometer")}
                value={d.odometerKm !== null ? fmtKm(d.odometerKm, locale) : "–"}
                sub={d.consumption && d.monthKm !== null ? t("car.monthKm", { km: fmtKm(d.monthKm, locale) }) : undefined}
              />
            </Box>
          </Box>

          {/* Roki in pnevmatike */}
          <Box>
            {now && (
              <>
                <Deadline icon={<ShieldOutlinedIcon fontSize="small" />} label={t("car.insurance")} date={parseDate(MANUAL.insurance)} now={now} />
                <Deadline icon={<BadgeOutlinedIcon fontSize="small" />} label={t("car.registration")} date={parseDate(MANUAL.registration)} now={now} />
                <Deadline icon={<ConfirmationNumberOutlinedIcon fontSize="small" />} label={t("car.vignette")} date={parseDate(MANUAL.vignette)} now={now} />
                <Deadline
                  icon={<BuildOutlinedIcon fontSize="small" />}
                  label={t("car.service")}
                  date={parseDate(MANUAL.service.date)}
                  now={now}
                  extra={t("car.serviceOrKm", { km: fmtKm(MANUAL.service.kmLeft, locale) })}
                />
                <Deadline icon={<SettingsRemoteIcon fontSize="small" />} label={t("car.careConnect")} date={parseDate(MANUAL.careConnect)} now={now} />
              </>
            )}

            {change && tyres && now && (
              <Box
                sx={{
                  mt: 1,
                  p: 1.25,
                  borderRadius: "14px",
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
                    {t(tyres.mounted === "winter" ? "car.tyres.winterOn" : "car.tyres.summerOn")}
                    {tyres.changedOn ? ` ${t("car.tyres.since", { date: fmtDate(parseDate(tyres.changedOn), locale, false) })}` : ""}
                  </Typography>
                  {previous && (
                    <Button
                      size="small"
                      disabled={saving}
                      onClick={() => void saveTyres(previous, null)}
                      sx={{ ml: "auto", textTransform: "none", minWidth: 0, py: 0 }}
                    >
                      {t("car.tyres.undo")}
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
                      {t(change.to === "winter" ? "car.tyres.toWinter" : "car.tyres.toSummer")}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {t(change.kind === "by" ? "car.tyres.by" : "car.tyres.from", { date: fmtDate(change.date, locale) })}
                    </Typography>
                  </Box>
                  {change.kind === "by" ? (
                    <Chip size="small" variant="outlined" color={dueColor(changeDays)} label={daysLabel(changeDays, t)} />
                  ) : (
                    <Chip
                      size="small"
                      variant="outlined"
                      label={changeDays <= 0 ? t("car.tyres.now") : t("car.tyres.in", { n: changeDays })}
                      color={changeDays <= 0 ? "info" : "default"}
                    />
                  )}
                </Box>
              </Box>
            )}

            {[
              { msg: error ? t(error) : null, color: "error" },
              { msg: apiError, color: "error" },
              { msg: disabledHint, color: "warning.main" },
              { msg: keyDays !== null && keyDays < 14 ? t("car.keyExpires", { n: keyDays }) : null, color: "warning.main" },
            ]
              .filter((m) => m.msg)
              .map((m) => (
                <Typography key={m.msg} variant="caption" color={m.color} sx={{ display: "block", mt: 1 }}>
                  {m.msg}
                </Typography>
              ))}
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}
