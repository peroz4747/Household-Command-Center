"use client";

// Jutranje poročilo v oknu. Obvestilo ob 5:00 vodi na /?porocilo=YYYY-MM-DD, ki okno odpre samodejno;
// gumb v glavi odpre današnje poročilo kadarkoli.
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Box, CircularProgress, Dialog, DialogContent, DialogTitle, Divider, IconButton, Link, Stack, Tooltip, Typography } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import WbTwilightIcon from "@mui/icons-material/WbTwilight";
import { useI18n } from "../i18n";
import type { MorningReport } from "../../lib/morningReport";
import type { MessageKey } from "../../lib/i18n";

const PARAM = "porocilo";

function Section({ icon, title, children }: { icon: string; title: string; children: ReactNode }) {
  return (
    <Box sx={{ py: 1.5 }}>
      <Typography variant="overline" color="secondary" sx={{ letterSpacing: 1.5 }}>
        {icon} {title}
      </Typography>
      <Box sx={{ mt: 0.5 }}>{children}</Box>
    </Box>
  );
}

export default function MorningReportDialog() {
  const { t, locale } = useI18n();
  const [day, setDay] = useState<string | null>(null);
  const [report, setReport] = useState<MorningReport | null>(null);
  const [error, setError] = useState<"notFound" | "error" | null>(null);

  const openDay = useCallback((d: string | null) => {
    setDay(d ?? "");
    setReport(null);
    setError(null);
    fetch(`/api/morning-report${d ? `?day=${encodeURIComponent(d)}` : ""}`, { cache: "no-store" })
      .then(async (r) => {
        if (r.status === 404) return setError("notFound");
        if (!r.ok) throw new Error(String(r.status));
        setReport(await r.json());
      })
      .catch(() => setError("error"));
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    const d = url.searchParams.get(PARAM);
    if (d === null) return;
    const timer = setTimeout(() => {
      // Povezavo počistimo, da osvežitev strani okna ne odpre znova.
      url.searchParams.delete(PARAM);
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
      openDay(/^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null);
    }, 0);
    return () => clearTimeout(timer);
  }, [openDay]);

  const close = () => setDay(null);
  const time = (iso: string | number) => new Date(iso).toLocaleString(locale, { timeZone: "Europe/Ljubljana", weekday: "short", hour: "2-digit", minute: "2-digit" });
  const dateLabel = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" });
  const clock = (ms: number) => new Date(ms).toLocaleTimeString(locale, { timeZone: "Europe/Ljubljana", hour: "2-digit", minute: "2-digit" });
  const aqiLevel = (aqi: number): MessageKey =>
    aqi <= 20 ? "report.aqi.good" : aqi <= 40 ? "report.aqi.fair" : aqi <= 60 ? "report.aqi.moderate" : aqi <= 80 ? "report.aqi.poor" : aqi <= 100 ? "report.aqi.veryPoor" : "report.aqi.extreme";
  const aqiColor = (aqi: number) => (aqi <= 40 ? "success.main" : aqi <= 60 ? "warning.main" : "error.main");
  const pct = (v: number) => `${v > 0 ? "+" : ""}${v.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`;
  const weatherDesc = (code: number) => {
    const key = `weather.code.${code}` as MessageKey;
    const text = t(key);
    return text === key ? "" : text;
  };

  return (
    <>
      <Tooltip title={t("report.open")}>
        <IconButton size="small" aria-label={t("report.open")} onClick={() => openDay(null)}>
          <WbTwilightIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Dialog open={day !== null} onClose={close} fullWidth maxWidth="sm" scroll="paper">
        <DialogTitle sx={{ pr: 6 }}>
          {t("report.title")}
          {report && (
            <Typography variant="body2" color="text.secondary">
              {dateLabel(report.day)} · {t("report.generated", { time: new Date(report.generatedAt).toLocaleTimeString(locale, { timeZone: "Europe/Ljubljana", hour: "2-digit", minute: "2-digit" }) })}
            </Typography>
          )}
          <IconButton aria-label="close" onClick={close} sx={{ position: "absolute", right: 8, top: 8 }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {error && <Typography color="text.secondary">{t(error === "notFound" ? "report.notFound" : "report.error")}</Typography>}
          {!error && !report && (
            <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
              <CircularProgress size={28} />
            </Box>
          )}
          {report && (
            <Stack divider={<Divider flexItem />}>
              {report.weather && (
                <Section icon="🌤" title={t("report.weather")}>
                  <Typography variant="h6">
                    {Math.round(report.weather.low)}–{Math.round(report.weather.high)} °C
                  </Typography>
                  <Typography color="text.secondary">
                    {[
                      weatherDesc(report.weather.weathercode),
                      report.weather.precipitationChance !== null && report.weather.precipitationChance >= 30 ? t("report.rain", { pct: report.weather.precipitationChance }) : "",
                      report.weather.windMaxKmh >= 30 ? t("report.wind", { kmh: Math.round(report.weather.windMaxKmh) }) : "",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </Typography>
                </Section>
              )}

              {report.sun && (
                <Section icon="🌅" title={t("report.sun")}>
                  <Typography>{t("report.sunTimes", { rise: report.sun.sunrise, set: report.sun.sunset })}</Typography>
                  <Typography color="text.secondary">
                    {t("report.daylight", { h: Math.floor(report.sun.daylightMin / 60), m: report.sun.daylightMin % 60 })}
                    {report.sun.changeMin !== null && ` ${t("report.daylightChange", { sign: report.sun.changeMin > 0 ? "+" : report.sun.changeMin < 0 ? "−" : "±", min: Math.abs(report.sun.changeMin) })}`}
                  </Typography>
                </Section>
              )}

              {report.air && report.air.aqi !== null && (
                <Section icon="🌫" title={t("report.air")}>
                  <Typography>
                    <Box component="span" sx={{ color: aqiColor(report.air.aqi), fontWeight: 600 }}>
                      {t(aqiLevel(report.air.aqi))}
                    </Box>{" "}
                    · {t("report.aqi", { aqi: report.air.aqi })}
                  </Typography>
                  {report.air.pm10 !== null && report.air.pm25 !== null && (
                    <Typography variant="body2" color="text.secondary">
                      {t("report.pm", { pm10: report.air.pm10, pm25: report.air.pm25 })}
                    </Typography>
                  )}
                  {report.air.pollen.length > 0 && (
                    <Typography variant="body2" color="text.secondary">
                      {t("report.pollen", { list: report.air.pollen.map((p) => `${t(`report.pollen.${p.name}` as MessageKey)} ${p.value}`).join(", ") })}
                    </Typography>
                  )}
                </Section>
              )}

              {report.warnings.length > 0 && (
                <Section icon="⚠️" title={t("report.warnings")}>
                  {report.warnings.map((w, i) => (
                    <Typography key={i}>
                      {w.event} ({t(`warnings.level.${w.severity}` as MessageKey)}) — {t("report.until", { time: time(w.expires) })}
                    </Typography>
                  ))}
                </Section>
              )}

              <Section icon="📅" title={t("report.calendar")}>
                {report.events === null ? (
                  <Typography color="text.secondary">{t("report.calendarError")}</Typography>
                ) : report.events.length === 0 ? (
                  <Typography color="text.secondary">{t("report.noEvents")}</Typography>
                ) : (
                  report.events.map((e, i) => (
                    <Typography key={i}>
                      <Box component="span" sx={{ color: "text.secondary", display: "inline-block", minWidth: 64 }}>
                        {e.time ?? t("report.allDay")}
                      </Box>
                      {e.title}
                    </Typography>
                  ))
                )}
              </Section>

              {report.car && (
                <Section icon="🚗" title={t("report.car")}>
                  {report.car.fuelPercent !== null && (
                    <Typography>{t("report.carFuel", { pct: report.car.fuelPercent, km: report.car.rangeKm ?? "?" })}</Typography>
                  )}
                  {report.car.locked !== null && (
                    <Typography sx={{ color: report.car.locked ? "text.primary" : "error.main", fontWeight: report.car.locked ? 400 : 600 }}>
                      {report.car.locked ? `🔒 ${t("report.carLocked")}` : `🔓 ${t("report.carUnlocked")}`}
                    </Typography>
                  )}
                  {report.car.doorsOpen && <Typography sx={{ color: "error.main", fontWeight: 600 }}>{t("report.carDoorsOpen")}</Typography>}
                  {report.car.windowsOpen && <Typography sx={{ color: "error.main", fontWeight: 600 }}>{t("report.carWindowsOpen")}</Typography>}
                  {report.car.tyresWarning && <Typography sx={{ color: "warning.main" }}>{t("report.carTyres")}</Typography>}
                  {(report.car.address || report.car.capturedAt) && (
                    <Typography variant="body2" color="text.secondary">
                      {[report.car.address && t("report.carAt", { address: report.car.address.replace(/, Slovenia$/, "") }), report.car.capturedAt && t("report.carData", { time: time(report.car.capturedAt) })]
                        .filter(Boolean)
                        .join(" · ")}
                    </Typography>
                  )}
                </Section>
              )}

              {report.night && (
                <Section icon="🖥" title={t("report.night")}>
                  {report.night.alerts.length === 0 && report.night.outages.length === 0 && (report.night.health?.issues.length ?? 0) === 0 && (
                    <Typography sx={{ color: "success.main" }}>✅ {t("report.nightAllOk")}</Typography>
                  )}
                  {report.night.alerts.map((a, i) => (
                    <Typography key={`a${i}`}>
                      <Box component="span" sx={{ color: "text.secondary", display: "inline-block", minWidth: 52 }}>
                        {clock(a.at)}
                      </Box>
                      <b>{a.title}</b>: {a.message}
                    </Typography>
                  ))}
                  {report.night.outages.map((o, i) => (
                    <Typography key={`o${i}`} sx={{ color: "warning.main" }}>
                      {t("report.outage", { from: clock(o.from), to: clock(o.to) })}
                    </Typography>
                  ))}
                  {report.night.health && report.night.health.issues.length === 0 && (
                    <Typography variant="body2" color="text.secondary">
                      {t("report.healthOk")}
                    </Typography>
                  )}
                  {report.night.health?.issues.map((c, i) => (
                    <Typography key={`h${i}`} sx={{ color: c.status === "fail" ? "error.main" : "warning.main" }}>
                      {c.label}: {c.detail}
                    </Typography>
                  ))}
                  {report.night.speed && (
                    <Typography variant="body2" color="text.secondary">
                      {t("report.speed", {
                        down: Math.round(report.night.speed.downloadMbps ?? 0),
                        up: Math.round(report.night.speed.uploadMbps ?? 0),
                        ping: Math.round(report.night.speed.pingMs ?? 0),
                      })}
                    </Typography>
                  )}
                </Section>
              )}

              {report.fuel && (
                <Section icon="⛽" title={t("report.fuel")}>
                  <Typography>
                    {report.fuel.price.toFixed(3)} €/l
                    {report.fuel.change && (
                      <Box component="span" sx={{ color: report.fuel.change.diff > 0 ? "error.main" : "success.main", ml: 1 }}>
                        {t("report.fuelChange", {
                          diff: `${report.fuel.change.diff > 0 ? "+" : ""}${report.fuel.change.diff.toFixed(3)}`,
                          date: new Date(`${report.fuel.change.since}T12:00:00Z`).toLocaleDateString(locale, { day: "numeric", month: "numeric" }),
                        })}
                      </Box>
                    )}
                  </Typography>
                </Section>
              )}

              <Section icon="⚡" title={t("report.power")}>
                <Typography>{report.power.flat ? t("report.powerFlat") : report.power.windows.join(", ")}</Typography>
              </Section>

              <Section icon="📰" title={t("report.news")}>
                {report.news.length === 0 ? (
                  <Typography color="text.secondary">{t("report.noNews")}</Typography>
                ) : (
                  <Stack spacing={1.5}>
                    {report.news.map((n, i) => (
                      <Box key={n.url}>
                        <Link href={n.url} target="_blank" rel="noopener noreferrer" underline="hover" sx={{ fontWeight: 600 }}>
                          {i + 1}. {n.title}
                        </Link>
                        {n.lead && (
                          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                            {n.lead}
                          </Typography>
                        )}
                        <Typography variant="caption" color="text.secondary">
                          {n.source}
                          {n.published ? ` · ${time(n.published)}` : ""}
                          {n.alsoOn.length > 0 ? ` · ${t("report.alsoOn", { sources: n.alsoOn.join(", ") })}` : ""}
                        </Typography>
                      </Box>
                    ))}
                  </Stack>
                )}
              </Section>
              {report.markets && report.markets.length > 0 && (
                <Section icon="📈" title={t("report.markets")}>
                  <Box sx={{ display: "grid", gridTemplateColumns: "1fr auto auto", columnGap: 2, rowGap: 0.25 }}>
                    {report.markets.map((m) => (
                      <Box key={m.name} sx={{ display: "contents" }}>
                        <Typography variant="body2">{m.name}</Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ textAlign: "right" }}>
                          {m.price.toLocaleString(locale, { maximumFractionDigits: m.price < 10 ? 4 : 2 })}
                        </Typography>
                        <Typography
                          variant="body2"
                          sx={{ textAlign: "right", fontWeight: 600, color: m.changePct === null ? "text.secondary" : m.changePct >= 0 ? "success.main" : "error.main" }}
                        >
                          {m.changePct === null ? "–" : pct(m.changePct)}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                </Section>
              )}
            </Stack>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
