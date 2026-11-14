"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import "leaflet/dist/leaflet.css";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  Link,
  MenuItem,
  Paper,
  Slider,
  Switch,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import FlagIcon from "@mui/icons-material/Flag";
import LocalGasStationIcon from "@mui/icons-material/LocalGasStation";
import MyLocationIcon from "@mui/icons-material/MyLocation";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import type { MessageKey } from "../../lib/i18n";
import type { PoiCategory, SavedTrip, TripPlace, TripPlan, TripPoi, TripStop, TripWarning } from "../../lib/trip";
import { useI18n } from "../i18n";

export type TripCar = { fuelPercent: number | null; lat: number | null; lon: number | null; address: string | null };

const RESERVES = [50, 80, 120];
const MAX_VIA = 3;
const CATEGORIES: PoiCategory[] = ["castle", "museum", "nature", "viewpoint", "church", "sight"];
const WARNING_KEY: Record<TripWarning, MessageKey> = {
  lowStart: "trip.warn.lowStart",
  noStation: "trip.warn.noStation",
  noPrice: "trip.warn.noPrice",
  poiUnavailable: "trip.warn.poiUnavailable",
};
const STOP_COLOR: Record<TripStop["kind"], string> = { start: "#34d399", via: "#60a5fa", dest: "#f87171", end: "#34d399", fuel: "#fbbf24" };

function PlaceField({ label, value, onChange, lang }: { label: string; value: TripPlace | null; onChange: (p: TripPlace | null) => void; lang: string }) {
  const { t } = useI18n();
  const [input, setInput] = useState("");
  const [options, setOptions] = useState<TripPlace[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = input.trim();
    if (q.length < 2 || q === value?.label) return;
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      fetch(`/api/trip/geocode?${new URLSearchParams({ q, lang })}`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then((d) => setOptions(d.items ?? []))
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 300);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [input, lang, value?.label]);

  return (
    <Autocomplete
      size="small"
      fullWidth
      value={value}
      options={value && !options.includes(value) ? [value, ...options] : options}
      filterOptions={(x) => x}
      loading={loading}
      loadingText={t("trip.searching")}
      noOptionsText={input.trim().length < 2 ? t("trip.typeToSearch") : t("trip.noPlaces")}
      getOptionLabel={(o) => o.label}
      isOptionEqualToValue={(a, b) => a.lat === b.lat && a.lon === b.lon}
      onChange={(_, v) => onChange(v)}
      onInputChange={(_, v) => setInput(v)}
      renderInput={(params) => <TextField {...params} label={label} />}
    />
  );
}

function TripMap({ plan, pois }: { plan: TripPlan; pois: TripPoi[] }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let map: import("leaflet").Map | null = null;
    let cancelled = false;
    // Dialog se odpira z animacijo; brez tega Leaflet izračuna napačno velikost (sivi pasovi, napačen izsek).
    const resize = new ResizeObserver(() => map?.invalidateSize());
    if (ref.current) resize.observe(ref.current);
    void import("leaflet").then((L) => {
      if (cancelled || !ref.current) return;
      map = L.map(ref.current, { scrollWheelZoom: false });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: "&copy; OpenStreetMap" }).addTo(map);
      const line = L.polyline(plan.geometry, { color: "#38bdf8", weight: 4 }).addTo(map);
      for (const p of pois) {
        L.circleMarker([p.lat, p.lon], { radius: 4, color: "#c084fc", fillOpacity: 0.9, weight: 1 }).bindTooltip(p.title).addTo(map);
      }
      for (const s of plan.stops) {
        L.circleMarker([s.lat, s.lon], { radius: 8, color: "#0f172a", fillColor: STOP_COLOR[s.kind], fillOpacity: 1, weight: 2 })
          .bindTooltip(s.label || `${s.km} km`)
          .addTo(map);
      }
      map.fitBounds(line.getBounds(), { padding: [24, 24] });
    });
    return () => {
      cancelled = true;
      resize.disconnect();
      map?.remove();
    };
  }, [plan, pois]);

  return <Box ref={ref} sx={{ height: { xs: 260, md: 340 }, borderRadius: 1, overflow: "hidden", isolation: "isolate", bgcolor: "#1e293b" }} />;
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
        {label}
      </Typography>
      <Typography sx={{ fontWeight: 700, fontSize: 18 }}>{value}</Typography>
    </Box>
  );
}

function StopRow({ stop }: { stop: TripStop }) {
  const { t, locale } = useI18n();
  const icon: ReactNode =
    stop.kind === "fuel" ? <LocalGasStationIcon fontSize="small" /> : stop.kind === "start" || stop.kind === "end" ? <MyLocationIcon fontSize="small" /> : stop.kind === "dest" ? <FlagIcon fontSize="small" /> : <PlaceOutlinedIcon fontSize="small" />;
  const details: string[] = [];
  if (stop.kind === "fuel") {
    details.push(t("trip.stop.arrive", { n: stop.fuelPercent }));
    if (stop.liters !== undefined) details.push(t("trip.stop.liters", { n: stop.liters }));
    if (stop.price !== null && stop.price !== undefined) details.push(`${stop.price.toLocaleString(locale, { minimumFractionDigits: 3 })} €/l`);
    if (stop.detourKm !== undefined && stop.detourKm >= 0.5) details.push(t("trip.stop.detour", { n: stop.detourKm.toLocaleString(locale) }));
  } else if (stop.kind !== "start") {
    details.push(t("trip.stop.arrive", { n: stop.fuelPercent }));
  }
  return (
    <Box sx={{ display: "flex", gap: 1.5, alignItems: "flex-start", py: 1 }}>
      <Box sx={{ color: STOP_COLOR[stop.kind], mt: 0.25 }}>{icon}</Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {stop.kind === "fuel" ? stop.label || t("trip.stop.fuelHere") : stop.label}
        </Typography>
        {stop.kind === "fuel" && stop.address && (
          <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
            {stop.address}
          </Typography>
        )}
        {details.length > 0 && (
          <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
            {details.join(" · ")}
          </Typography>
        )}
        {stop.nearby && stop.nearby.length > 0 && (
          <Typography variant="caption" color="secondary" sx={{ display: "block" }}>
            {t("trip.stop.nearby", { names: stop.nearby.join(", ") })}
          </Typography>
        )}
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: "nowrap" }}>
        {stop.km} km
      </Typography>
    </Box>
  );
}

function PoiCard({ poi, showKm }: { poi: TripPoi; showKm: boolean }) {
  const { t, locale } = useI18n();
  return (
    <Paper variant="outlined" sx={{ display: "flex", gap: 1.25, p: 1, minWidth: 0, backgroundColor: "rgba(255,255,255,0.02)" }}>
      {poi.image && <Box component="img" src={poi.image} alt="" loading="lazy" sx={{ width: 72, height: 72, objectFit: "cover", borderRadius: 1, flexShrink: 0 }} />}
      <Box sx={{ minWidth: 0 }}>
        <Link href={poi.url} target="_blank" rel="noreferrer" variant="body2" sx={{ fontWeight: 600 }}>
          {poi.title}
        </Link>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
          {t(`trip.cat.${poi.category}`)}
          {showKm ? ` · ${t("trip.poi.at", { km: poi.km, off: poi.offRouteKm.toLocaleString(locale) })}` : ""}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
          {poi.description}
        </Typography>
      </Box>
    </Paper>
  );
}

function formatDuration(min: number) {
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")} min`;
}

export default function TripPlanner({ open, onClose, car }: { open: boolean; onClose: () => void; car: TripCar }) {
  const { t, locale } = useI18n();
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("md"));
  const lang = locale.slice(0, 2);
  const carPlace = useMemo<TripPlace | null>(
    () => (car.lat !== null && car.lon !== null ? { label: car.address ?? t("trip.carLocation"), lat: car.lat, lon: car.lon } : null),
    [car.lat, car.lon, car.address, t],
  );
  const [from, setFrom] = useState<TripPlace | null>(carPlace);
  const [to, setTo] = useState<TripPlace | null>(null);
  const [via, setVia] = useState<(TripPlace | null)[]>([]);
  const [roundTrip, setRoundTrip] = useState(false);
  const [fuel, setFuel] = useState(car.fuelPercent ?? 50);
  const [reserve, setReserve] = useState(80);
  const [plan, setPlan] = useState<TripPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);
  const [filter, setFilter] = useState<PoiCategory | null>(null);

  useEffect(() => {
    fetch("/api/trip", { cache: "no-store" })
      .then((r) => r.json())
      .then(({ trip }: { trip: SavedTrip | null }) => {
        if (!trip) return;
        setFrom(trip.request.from);
        setTo(trip.request.to);
        setVia(trip.request.via);
        setRoundTrip(trip.request.roundTrip);
        setReserve(trip.request.reserveKm);
        setPlan(trip.plan);
      })
      .catch(() => {});
  }, []);

  const submit = async () => {
    if (!from || !to) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/trip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from, to, via: via.filter(Boolean), roundTrip, fuelPercent: fuel, reserveKm: reserve, lang }),
      });
      const body = await res.json();
      if (!res.ok || !body.plan) throw new Error(body.error);
      setPlan(body.plan);
      setFilter(null);
    } catch (e) {
      setError((e as Error).message === "no-route" ? "trip.err.noRoute" : "trip.err.routing");
    } finally {
      setBusy(false);
    }
  };

  const allPois = useMemo(() => (plan ? [...plan.destination, ...plan.along] : []), [plan]);
  const visible = (list: TripPoi[]) => (filter ? list.filter((p) => p.category === filter) : list);
  const present = CATEGORIES.filter((c) => allPois.some((p) => p.category === c));
  const fuelStops = plan?.stops.filter((s) => s.kind === "fuel").length ?? 0;
  const arrival = plan?.stops[plan.stops.length - 1];

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md" fullScreen={fullScreen}>
      <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", pr: 1.5 }}>
        {t("trip.title")}
        <IconButton onClick={onClose} aria-label={t("common.close")}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, pt: 1 }}>
          <PlaceField label={t("trip.from")} value={from} onChange={setFrom} lang={lang} />
          {via.map((v, i) => (
            <Box key={i} sx={{ display: "flex", gap: 0.5, alignItems: "center" }}>
              <PlaceField label={t("trip.via")} value={v} onChange={(p) => setVia(via.map((x, j) => (j === i ? p : x)))} lang={lang} />
              <IconButton size="small" onClick={() => setVia(via.filter((_, j) => j !== i))} aria-label={t("trip.removeVia")}>
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            </Box>
          ))}
          <PlaceField label={t("trip.to")} value={to} onChange={setTo} lang={lang} />
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 1 }}>
            <Button size="small" startIcon={<AddIcon />} disabled={via.length >= MAX_VIA} onClick={() => setVia([...via, null])}>
              {t("trip.addVia")}
            </Button>
            <FormControlLabel control={<Switch checked={roundTrip} onChange={(e) => setRoundTrip(e.target.checked)} />} label={t("trip.roundTrip")} />
          </Box>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 160px" }, gap: 2.5, alignItems: "center" }}>
            <Box sx={{ px: 1 }}>
              <Typography variant="caption" color="text.secondary">
                {t("trip.fuelNow", { n: fuel })}
              </Typography>
              <Slider size="small" min={0} max={100} value={fuel} onChange={(_, v) => setFuel(v as number)} aria-label={t("trip.fuelAria")} color="secondary" />
            </Box>
            <TextField select size="small" label={t("trip.reserve")} value={reserve} onChange={(e) => setReserve(Number(e.target.value))}>
              {RESERVES.map((r) => (
                <MenuItem key={r} value={r}>
                  {r} km
                </MenuItem>
              ))}
            </TextField>
          </Box>
          <Button variant="contained" color="secondary" disabled={!from || !to || busy} onClick={() => void submit()} startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}>
            {busy ? t("trip.calculating") : t("trip.calculate")}
          </Button>
          {error && <Alert severity="error">{t(error)}</Alert>}
        </Box>

        {plan && (
          <>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(4, 1fr)" }, gap: 2 }}>
              <Figure label={t("trip.distance")} value={`${plan.distanceKm.toLocaleString(locale)} km`} />
              <Figure label={t("trip.duration")} value={formatDuration(plan.durationMin)} />
              <Figure label={t("trip.fuelUsed")} value={`~${plan.liters} l`} />
              <Figure label={t("trip.cost")} value={plan.cost === null ? "–" : `~${plan.cost} €`} />
            </Box>
            <Alert severity={fuelStops ? "warning" : "success"} icon={<LocalGasStationIcon fontSize="inherit" />}>
              {fuelStops ? t("trip.needStops", { n: fuelStops }) : t("trip.noStops", { n: arrival?.fuelPercent ?? 0 })}
            </Alert>
            {plan.warnings.map((w) => (
              <Alert key={w} severity="info">
                {t(WARNING_KEY[w])}
              </Alert>
            ))}
            <TripMap plan={plan} pois={allPois} />
            <Box>
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1 }}>
                <Typography variant="overline" color="text.secondary">
                  {t("trip.itinerary")}
                </Typography>
                <Button size="small" href={plan.mapsUrl} target="_blank" rel="noreferrer" endIcon={<OpenInNewIcon />}>
                  {t("trip.openMaps")}
                </Button>
              </Box>
              {plan.stops.map((s, i) => (
                <StopRow key={i} stop={s} />
              ))}
              <Typography variant="caption" color="text.secondary">
                {t("trip.estimate", { km: plan.fullRangeKm })}
              </Typography>
            </Box>
            {allPois.length > 0 && (
              <Box>
                <Typography variant="overline" color="text.secondary">
                  {t("trip.pois")}
                </Typography>
                <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap", my: 1 }}>
                  {present.map((c) => (
                    <Chip key={c} size="small" label={t(`trip.cat.${c}`)} color={filter === c ? "secondary" : "default"} variant={filter === c ? "filled" : "outlined"} onClick={() => setFilter(filter === c ? null : c)} />
                  ))}
                </Box>
                {[
                  { title: t("trip.poisDest"), list: visible(plan.destination), showKm: false },
                  { title: t("trip.poisAlong"), list: visible(plan.along), showKm: true },
                ].map(
                  (g) =>
                    g.list.length > 0 && (
                      <Box key={g.title} sx={{ mb: 2 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
                          {g.title}
                        </Typography>
                        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1 }}>
                          {g.list.map((p) => (
                            <PoiCard key={p.url} poi={p} showKm={g.showKm} />
                          ))}
                        </Box>
                      </Box>
                    ),
                )}
              </Box>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
