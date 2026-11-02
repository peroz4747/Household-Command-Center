"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Box, Card, CardContent, Chip, LinearProgress, Typography } from "@mui/material";
import BoltIcon from "@mui/icons-material/Bolt";
import WaterDropIcon from "@mui/icons-material/WaterDrop";
import { useI18n } from "../i18n";
import { billingPeriod } from "../../lib/billing";
import type { ElectricityResponse } from "../../lib/electricity";

// ZAČASNO: izmišljeni podatki (voda vedno, elektrika dokler Moj Elektro ni nastavljen).
// Poraba se računa iz dnevnega povprečja, da je skladna s trenutnim dnem v obdobju.
const DEMO = {
  electricity: { perDay: 11.4, pricePerUnit: 0.21, lastPeriod: 362 },
  water: { perDay: 0.31, pricePerUnit: 2.35, lastPeriod: 9.1 },
};

type MeterValues = {
  used: number | null;
  projected: number | null;
  lastPeriod: number | null;
  cost: number | null;
};

const fmtDate = (d: Date, locale: string) => d.toLocaleDateString(locale, { day: "numeric", month: "short" });
const fmtNum = (n: number, decimals: number, locale: string) =>
  n.toLocaleString(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
const fmtEur = (n: number, locale: string) =>
  n.toLocaleString(locale, { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const parseDay = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};

function demoValues(meter: (typeof DEMO)["water"], elapsedDays: number, totalDays: number): MeterValues {
  const used = meter.perDay * elapsedDays;
  return { used, projected: meter.perDay * totalDays, lastPeriod: meter.lastPeriod, cost: used * meter.pricePerUnit };
}

function Meter({
  icon,
  color,
  label,
  unit,
  decimals,
  values,
  source,
  notes,
}: {
  icon: ReactNode;
  color: string;
  label: string;
  unit: string;
  decimals: number;
  values: MeterValues;
  source: string;
  notes: { text: string; color?: string }[];
}) {
  const { t, locale } = useI18n();
  const { used, projected, lastPeriod, cost } = values;
  const vsLast =
    projected !== null && lastPeriod ? Math.round(((projected - lastPeriod) / lastPeriod) * 100) : null;

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
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.2 }}>
            {label}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10, lineHeight: 1 }}>
            {source}
          </Typography>
        </Box>
        {cost !== null && (
          <Typography variant="caption" color="text.secondary" sx={{ ml: "auto" }}>
            ≈ {fmtEur(cost, locale)}
          </Typography>
        )}
      </Box>

      <Box sx={{ display: "flex", alignItems: "baseline", gap: 0.75 }}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          {used !== null ? fmtNum(used, decimals, locale) : "–"}
        </Typography>
        <Typography color="text.secondary">{unit}</Typography>
      </Box>

      <LinearProgress
        variant="determinate"
        value={used !== null && projected ? Math.min(100, (used / projected) * 100) : 0}
        sx={{
          mt: 1,
          height: 6,
          borderRadius: 3,
          bgcolor: "rgba(148,163,184,0.15)",
          "& .MuiLinearProgress-bar": { bgcolor: color, borderRadius: 3 },
        }}
      />
      <Box sx={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", columnGap: 1, mt: 0.75 }}>
        {projected !== null && (
          <Typography variant="caption" color="text.secondary">
            → {fmtNum(projected, decimals, locale)} {unit}
          </Typography>
        )}
        {vsLast !== null && (
          <Typography variant="caption" sx={{ color: vsLast > 0 ? "#f87171" : "#22c55e", fontWeight: 600 }}>
            {vsLast > 0 ? "+" : ""}
            {t("billing.vsLast", { n: vsLast })}
          </Typography>
        )}
      </Box>
      {notes.map((n) => (
        <Typography key={n.text} variant="caption" color={n.color ?? "text.secondary"} sx={{ display: "block", mt: 0.25 }}>
          {n.text}
        </Typography>
      ))}
    </Box>
  );
}

export default function UtilityUsage() {
  const [now, setNow] = useState<Date | null>(null);
  const [electricity, setElectricity] = useState<ElectricityResponse | null>(null);
  const { t, locale } = useI18n();

  useEffect(() => {
    setNow(new Date());
    const load = () =>
      fetch("/api/electricity")
        .then((r) => r.json())
        .then((data: ElectricityResponse) => setElectricity(data))
        .catch(() => setElectricity({ source: "mojelektro", data: null, error: { code: "other" } }));
    void load();
    // Strežnik sam omejuje klice na Moj Elektro (podatki so dnevni).
    const timer = setInterval(load, 30 * 60_000);
    return () => clearInterval(timer);
  }, []);

  const period = now ? billingPeriod(now) : null;
  const live = electricity?.source === "mojelektro";
  const e = electricity?.data;

  let elValues: MeterValues | null = null;
  const elNotes: { text: string; color?: string }[] = [];
  if (period) {
    if (!live) {
      elValues = demoValues(DEMO.electricity, period.elapsedDays, period.totalDays);
    } else {
      elValues = {
        used: e?.usedKwh ?? null,
        projected: e?.projectedKwh ?? null,
        lastPeriod: e?.lastPeriodKwh ?? null,
        cost: e?.costEur ?? null,
      };
      if (e?.byTariff.VT !== undefined && e?.byTariff.MT !== undefined) {
        elNotes.push({
          text: t("billing.tariffs", { vt: fmtNum(e.byTariff.VT, 0, locale), mt: fmtNum(e.byTariff.MT, 0, locale) }),
        });
      }
      if (e?.networkEur != null) {
        elNotes.push({
          text: `${t("billing.network", { eur: e.networkEur.toLocaleString(locale, { style: "currency", currency: "EUR" }) })}${
            e.networkPowerIncluded ? "" : ` ${t("billing.noPower")}`
          }`,
        });
        if (e.supplyEur === null) elNotes.push({ text: t("billing.noSupply") });
      }
      if (e?.dataUntil) elNotes.push({ text: t("billing.dataUntil", { date: fmtDate(parseDay(e.dataUntil), locale) }) });
      if (electricity?.error) {
        const err = electricity.error;
        elNotes.push({
          text: t(`billing.err.${err.code}`, { detail: err.detail ?? "" }),
          color: e ? "warning.main" : "error",
        });
      }
    }
  }

  return (
    <Card>
      <CardContent>
        <Typography variant="subtitle2" color="secondary">
          {t("billing.overline")}
        </Typography>
        <Typography variant="h6" sx={{ mt: 1, fontWeight: 700, whiteSpace: "nowrap" }}>
          {period ? `${fmtDate(period.start, locale)} – ${fmtDate(period.end, locale)}` : " "}
        </Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
          <Typography variant="caption" color="text.secondary">
            {period ? t("billing.day", { n: period.elapsedDays, total: period.totalDays }) : " "}
          </Typography>
          {!live && electricity && (
            <Chip label={t("common.demo")} size="small" variant="outlined" sx={{ height: 20, fontSize: 11, color: "text.secondary" }} />
          )}
        </Box>

        {period && elValues && (
          <Box sx={{ display: "grid", gap: 2, mt: 2 }}>
            <Meter
              icon={<BoltIcon sx={{ fontSize: 18 }} />}
              color="#facc15"
              label={t("billing.electricity")}
              unit="kWh"
              decimals={0}
              values={elValues}
              source={live ? "Moj Elektro" : t("common.demo")}
              notes={elNotes}
            />
            <Meter
              icon={<WaterDropIcon sx={{ fontSize: 18 }} />}
              color="#38bdf8"
              label={t("billing.water")}
              unit="m³"
              decimals={1}
              values={demoValues(DEMO.water, period.elapsedDays, period.totalDays)}
              source={t("common.demo")}
              notes={[]}
            />
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
