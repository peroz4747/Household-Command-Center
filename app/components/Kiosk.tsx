"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Box, Typography } from "@mui/material";
import WbSunnyIcon from "@mui/icons-material/WbSunny";
import CloudIcon from "@mui/icons-material/Cloud";
import AcUnitIcon from "@mui/icons-material/AcUnit";
import FlashOnIcon from "@mui/icons-material/FlashOn";
import GrainIcon from "@mui/icons-material/Grain";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import LocalGasStationIcon from "@mui/icons-material/LocalGasStation";
import BoltIcon from "@mui/icons-material/Bolt";
import EventIcon from "@mui/icons-material/Event";
import { useI18n } from "../i18n";
import type { MessageKey } from "../../lib/i18n";
import type { WeatherWarning } from "../../lib/warnings";
import type { FuelData } from "../../lib/fuel";
import { formatWindow, nextCheapWindow } from "../../lib/cheapPower";

// Velikosti v vmin, da je ista stran berljiva na tablici in na 4K TV-ju z razdalje.
const TZ = "Europe/Ljubljana";
const NIGHT_FROM = 22;
const NIGHT_TO = 6;
const REFRESH_MS = 10 * 60_000;
const RELOAD_MS = 6 * 3_600_000; // nova različica dashboarda brez ročnega osveževanja

type Weather = { current: { temperature: number; windspeed: number; weathercode: number }; forecast: { date: string; high: number; low: number; weathercode: number }[] };
type CalEvent = { id: string; title: string; start: string; end: string };

const subscribe = (cb: () => void) => {
  const id = setInterval(cb, 1000);
  return () => clearInterval(id);
};
const getMinute = () => String(Math.floor(Date.now() / 60_000));

function WeatherIcon({ code, size }: { code: number; size: string }) {
  const sx = { fontSize: size };
  if (code === 0) return <WbSunnyIcon sx={{ ...sx, color: "#facc15" }} />;
  if (code >= 95) return <FlashOnIcon sx={{ ...sx, color: "#f59e0b" }} />;
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return <AcUnitIcon sx={{ ...sx, color: "#67e8f9" }} />;
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return <GrainIcon sx={{ ...sx, color: "#38bdf8" }} />;
  return <CloudIcon sx={{ ...sx, color: code <= 2 ? "#94a3b8" : "#64748b" }} />;
}

function useJson<T>(url: string, ms = REFRESH_MS): T | null {
  const [data, setData] = useState<T | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch(url, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => alive && d && !d.error && setData(d))
        .catch(() => {});
    void load();
    const id = setInterval(load, ms);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [url, ms]);
  return data;
}

export default function Kiosk() {
  const { t, locale } = useI18n();
  const minute = useSyncExternalStore(subscribe, getMinute, () => null);
  const now = minute ? new Date(Number(minute) * 60_000) : null;
  const weather = useJson<Weather>("/api/weather");
  const warnings = useJson<{ items: WeatherWarning[] }>("/api/weather/warnings");
  const calendar = useJson<{ events: CalEvent[] }>("/api/calendar");
  const fuel = useJson<FuelData>("/api/fuel", 60 * 60_000);
  const [wakeUntil, setWakeUntil] = useState(0);

  const hour = now ? Number(now.toLocaleString("en-GB", { timeZone: TZ, hour: "numeric", hourCycle: "h23" })) % 24 : 12;
  const night = (hour >= NIGHT_FROM || hour < NIGHT_TO) && (now?.getTime() ?? 0) > wakeUntil;

  // Zaslon naj ne ugasne (Wake Lock, kjer ga brskalnik podpira) in stran se občasno osveži.
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const request = () =>
      (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock
        ?.request("screen")
        .then((l) => (lock = l))
        .catch(() => {});
    void request();
    const onVisible = () => document.visibilityState === "visible" && void request();
    document.addEventListener("visibilitychange", onVisible);
    const reload = setTimeout(() => location.reload(), RELOAD_MS);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      clearTimeout(reload);
      void lock?.release();
    };
  }, []);

  const describe = (code: number) => {
    const key = `weather.code.${code}` as MessageKey;
    return t(key) === key ? t("weather.code.unknown") : t(key);
  };
  const tr = t as unknown as (key: string) => string;

  const upcoming = (calendar?.events ?? [])
    .filter((e) => now && new Date(e.end).getTime() > now.getTime() && new Date(e.start).getTime() < now.getTime() + 2 * 86_400_000)
    .slice(0, 4);
  const cheap = now ? nextCheapWindow(now) : null;
  const time = now ? now.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", timeZone: TZ }) : "--:--";
  const date = now ? now.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long", timeZone: TZ }) : "";

  const dayLabel = (iso: string) => {
    const d = new Date(iso);
    const today = new Date().toLocaleDateString("sv-SE", { timeZone: TZ });
    const day = d.toLocaleDateString("sv-SE", { timeZone: TZ });
    const allDay = /^\d{4}-\d{2}-\d{2}$/.test(iso);
    const when = day === today ? t("kiosk.today") : t("kiosk.tomorrow");
    return allDay ? when : `${when} ${d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", timeZone: TZ })}`;
  };

  return (
    <Box
      onClick={() => night && setWakeUntil(Date.now() + 2 * 60_000)}
      sx={{
        minHeight: "100dvh",
        bgcolor: night ? "#000" : undefined,
        background: night ? "#000" : "radial-gradient(circle at 20% 10%, #10203a 0%, #05101a 60%)",
        color: night ? "rgba(203,213,225,0.55)" : "#e2e8f0",
        p: "4vmin",
        display: "flex",
        flexDirection: "column",
        gap: "3vmin",
        cursor: night ? "pointer" : "default",
        transition: "background 2s, color 2s",
        overflow: "hidden",
      }}
    >
      {/* Ura in trenutno vreme */}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: night ? "center" : "flex-start", flexWrap: "wrap", gap: "3vmin", flex: night ? 1 : "none" }}>
        <Box sx={{ mx: night ? "auto" : 0, textAlign: night ? "center" : "left" }}>
          <Typography suppressHydrationWarning sx={{ fontSize: night ? "24vmin" : "18vmin", fontWeight: 200, lineHeight: 0.95, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}>
            {time}
          </Typography>
          <Typography suppressHydrationWarning sx={{ fontSize: "4vmin", opacity: 0.8, "&::first-letter": { textTransform: "uppercase" } }}>
            {date}
          </Typography>
          {night && weather && (
            <Typography sx={{ fontSize: "6vmin", mt: "2vmin", fontWeight: 300 }}>
              {Math.round(weather.current.temperature)}° · {describe(weather.current.weathercode)}
            </Typography>
          )}
        </Box>
        {!night && weather && (
          <Box sx={{ display: "flex", alignItems: "center", gap: "2vmin" }}>
            <WeatherIcon code={weather.current.weathercode} size="16vmin" />
            <Box>
              <Typography sx={{ fontSize: "14vmin", fontWeight: 300, lineHeight: 1 }}>{Math.round(weather.current.temperature)}°</Typography>
              <Typography sx={{ fontSize: "3.2vmin", opacity: 0.8 }}>
                {describe(weather.current.weathercode)} · {t("weather.wind", { n: Math.round(weather.current.windspeed) })}
              </Typography>
            </Box>
          </Box>
        )}
      </Box>

      {!night && (
        <>
          {(warnings?.items ?? []).length > 0 && (
            <Box sx={{ display: "flex", gap: "1.5vmin", flexWrap: "wrap" }}>
              {warnings!.items.map((w) => (
                <Box key={w.id} sx={{ display: "flex", alignItems: "center", gap: "1vmin", px: "2vmin", py: "1vmin", borderRadius: "1.5vmin", bgcolor: w.severity === "Moderate" ? "rgba(234,179,8,0.18)" : "rgba(239,68,68,0.2)", border: `1px solid ${w.severity === "Moderate" ? "#eab308" : "#ef4444"}` }}>
                  <WarningAmberIcon sx={{ fontSize: "3.5vmin", color: w.severity === "Moderate" ? "#eab308" : "#ef4444" }} />
                  <Typography sx={{ fontSize: "3vmin" }}>
                    {tr(`warnings.kind.${/thunder/i.test(w.event) ? "storm" : /wind/i.test(w.event) ? "wind" : /snow/i.test(w.event) ? "snow" : /rain/i.test(w.event) ? "rain" : /ice/i.test(w.event) ? "ice" : /flood/i.test(w.event) ? "flood" : "other"}`)} · {tr(`warnings.level.${w.severity}`)} ·{" "}
                    {t("kiosk.until", { time: new Date(w.expires).toLocaleString(locale, { weekday: "short", hour: "2-digit", minute: "2-digit", timeZone: TZ }) })}
                  </Typography>
                </Box>
              ))}
            </Box>
          )}

          {/* Napoved */}
          {weather && (
            <Box sx={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "2vmin" }}>
              {weather.forecast.slice(0, 4).map((d, i) => (
                <Box key={d.date} sx={{ textAlign: "center", p: "2vmin", borderRadius: "2vmin", bgcolor: "rgba(148,163,184,0.07)" }}>
                  <Typography sx={{ fontSize: "3vmin", opacity: 0.75, "&::first-letter": { textTransform: "uppercase" } }}>
                    {i === 0 ? t("kiosk.today") : new Date(`${d.date}T12:00:00`).toLocaleDateString(locale, { weekday: "short" })}
                  </Typography>
                  <WeatherIcon code={d.weathercode} size="8vmin" />
                  <Typography sx={{ fontSize: "3.6vmin", fontWeight: 600 }}>
                    {Math.round(d.high)}° <Box component="span" sx={{ opacity: 0.6, fontWeight: 400 }}>{Math.round(d.low)}°</Box>
                  </Typography>
                </Box>
              ))}
            </Box>
          )}

          {/* Dogodki, gorivo, elektrika */}
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "2fr 1fr" }, gap: "3vmin", flex: 1, minHeight: 0 }}>
            <Box>
              <Typography sx={{ fontSize: "2.6vmin", letterSpacing: 2, textTransform: "uppercase", opacity: 0.6, mb: "1vmin" }}>{t("kiosk.events")}</Typography>
              {upcoming.length === 0 && <Typography sx={{ fontSize: "3.4vmin", opacity: 0.7 }}>{t("kiosk.noEvents")}</Typography>}
              {upcoming.map((e) => (
                <Box key={e.id} sx={{ display: "flex", alignItems: "center", gap: "2vmin", py: "1vmin" }}>
                  <EventIcon sx={{ fontSize: "4vmin", color: "#60a5fa" }} />
                  <Box sx={{ minWidth: 0 }}>
                    <Typography noWrap sx={{ fontSize: "3.6vmin", fontWeight: 600 }}>
                      {e.title}
                    </Typography>
                    <Typography sx={{ fontSize: "2.8vmin", opacity: 0.7 }}>{dayLabel(e.start)}</Typography>
                  </Box>
                </Box>
              ))}
            </Box>
            <Box sx={{ display: "flex", flexDirection: "column", gap: "2vmin" }}>
              {fuel && (
                <Box sx={{ display: "flex", alignItems: "center", gap: "2vmin" }}>
                  <LocalGasStationIcon sx={{ fontSize: "5vmin", color: "#fbbf24" }} />
                  <Box>
                    <Typography sx={{ fontSize: "4vmin", fontWeight: 600 }}>{fuel.price.toLocaleString(locale, { minimumFractionDigits: 3 })} €</Typography>
                    <Typography sx={{ fontSize: "2.6vmin", opacity: 0.7 }}>{t("fuel.label", { fuel: fuel.fuel })}</Typography>
                  </Box>
                </Box>
              )}
              {cheap && (
                <Box sx={{ display: "flex", alignItems: "center", gap: "2vmin" }}>
                  <BoltIcon sx={{ fontSize: "5vmin", color: cheap.active ? "#22c55e" : "#facc15" }} />
                  <Box>
                    <Typography sx={{ fontSize: "3.4vmin", fontWeight: 600 }}>
                      {cheap.active ? t("kiosk.cheapNow") : formatWindow(cheap.window)}
                    </Typography>
                    <Typography sx={{ fontSize: "2.6vmin", opacity: 0.7 }}>{cheap.active ? (cheap.window.to - cheap.window.from >= 24 ? t("kiosk.allDay") : t("kiosk.cheapUntil", { window: formatWindow(cheap.window) })) : t("kiosk.cheapNext")}</Typography>
                  </Box>
                </Box>
              )}
            </Box>
          </Box>
        </>
      )}
    </Box>
  );
}
