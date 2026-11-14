"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Box, Card, CardContent, Chip, LinearProgress, Tooltip, Typography } from "@mui/material";
import BoltIcon from "@mui/icons-material/Bolt";
import LocalLaundryServiceIcon from "@mui/icons-material/LocalLaundryService";
import TariffChip from "./TariffChip";
import { useI18n } from "../i18n";
import { billingPeriod } from "../../lib/billing";
import type { ElectricityResponse } from "../../lib/electricity";
import type { BillBreakdown } from "../../lib/electricityBill";
import { cheapDay, formatWindow, hourPrices, localDay, nextCheapWindow } from "../../lib/cheapPower";

// Izmišljeni podatki, dokler Moj Elektro ni nastavljen.
// Poraba se računa iz dnevnega povprečja, da je skladna s trenutnim dnem v obdobju.
const DEMO = {
  electricity: { perDay: 11.4, pricePerUnit: 0.21, lastPeriod: 362 },
};

type MeterValues = {
  used: number | null;
  projected: number | null;
  lastPeriod: number | null;
  cost: number | null;
  projectedCost?: number | null;
  lastPeriodCost?: number | null; // če je znan, se primerja v evrih namesto v enotah
  lastPeriodLabel?: string; // npr. "oktober"
  bill?: BillBreakdown | null; // postavke računa (za namig ob znesku)
};

const fmtDate = (d: Date, locale: string) => d.toLocaleDateString(locale, { day: "numeric", month: "short" });
const fmtNum = (n: number, decimals: number, locale: string) =>
  n.toLocaleString(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
const fmtEur = (n: number, locale: string, decimals = 0) =>
  n.toLocaleString(locale, {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

function BillTooltip({ bill }: { bill: BillBreakdown }) {
  const { t, locale } = useI18n();
  const rows: [string, number][] = [
    [t("billing.bill.supply"), bill.supply],
    [t("billing.bill.network"), bill.networkEnergy + bill.networkPower],
    [t("billing.bill.contributions"), bill.contributions + bill.excise],
    [t("billing.bill.fees"), bill.fees],
    [t("billing.bill.vat"), bill.vat],
  ];
  return (
    <Box sx={{ display: "grid", gridTemplateColumns: "auto auto", columnGap: 2, rowGap: 0.25, py: 0.5 }}>
      <Typography variant="caption" sx={{ gridColumn: "1 / -1", fontWeight: 700, mb: 0.25 }}>
        {t("billing.bill.title")}
      </Typography>
      {rows.map(([label, v]) => (
        <Box key={label} sx={{ display: "contents" }}>
          <Typography variant="caption">{label}</Typography>
          <Typography variant="caption" sx={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
            {fmtEur(v, locale, 2)}
          </Typography>
        </Box>
      ))}
      <Typography variant="caption" sx={{ fontWeight: 700, borderTop: "1px solid rgba(255,255,255,0.2)", pt: 0.25 }}>
        {t("billing.bill.total")}
      </Typography>
      <Typography
        variant="caption"
        sx={{ fontWeight: 700, textAlign: "right", borderTop: "1px solid rgba(255,255,255,0.2)", pt: 0.25 }}
      >
        {fmtEur(bill.total, locale, 2)}
      </Typography>
    </Box>
  );
}

function demoValues(meter: (typeof DEMO)["electricity"], elapsedDays: number, totalDays: number): MeterValues {
  const used = meter.perDay * elapsedDays;
  return {
    used,
    projected: meter.perDay * totalDays,
    lastPeriod: meter.lastPeriod,
    cost: used * meter.pricePerUnit,
    projectedCost: meter.perDay * totalDays * meter.pricePerUnit,
  };
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
  const { used, projected, lastPeriod, cost, projectedCost, bill, lastPeriodCost, lastPeriodLabel } = values;
  const byEur = projectedCost != null && !!lastPeriodCost;
  const vsLast = byEur
    ? Math.round(((projectedCost! - lastPeriodCost!) / lastPeriodCost!) * 100)
    : projected !== null && lastPeriod
      ? Math.round(((projected - lastPeriod) / lastPeriod) * 100)
      : null;

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
          <Tooltip title={bill ? <BillTooltip bill={bill} /> : ""} placement="top" arrow>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ ml: "auto", cursor: bill ? "help" : "default", whiteSpace: "nowrap" }}
            >
              ≈ {fmtEur(cost, locale)}
            </Typography>
          </Tooltip>
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
            {projectedCost != null && ` · ≈ ${fmtEur(projectedCost, locale)}`}
          </Typography>
        )}
        {vsLast !== null && (
          <Typography variant="caption" sx={{ color: vsLast > 0 ? "#f87171" : "#22c55e", fontWeight: 600 }}>
            {vsLast > 0 ? "+" : ""}
            {byEur && lastPeriodLabel
              ? t("billing.vsLastEur", { n: vsLast, month: lastPeriodLabel, eur: fmtEur(lastPeriodCost!, locale) })
              : t("billing.vsLast", { n: vsLast })}
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

/** Kdaj prižgati pralni/pomivalni stroj: najcenejše ure danes po tarifi in časovnem bloku. */
function CheapPower({ now }: { now: Date }) {
  const { t, locale } = useI18n();
  const next = nextCheapWindow(now);
  if (!next) return null;
  const hour = Number(now.toLocaleString("en-GB", { timeZone: "Europe/Ljubljana", hour: "numeric", hourCycle: "h23" })) % 24;
  const nowPrice = hourPrices(localDay(now))[hour].eurPerKwh;
  const cheap = next.window.eurPerKwh;
  const saving = nowPrice > cheap ? Math.round((1 - cheap / nowPrice) * 100) : 0;
  const today = cheapDay(localDay(now)).windows.map(formatWindow).join(", ");
  const eur = (n: number) => n.toLocaleString(locale, { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  return (
    <Tooltip title={t("billing.cheap.tooltip", { today, now: eur(nowPrice), cheap: eur(cheap) })} arrow>
      <Box sx={{ display: "flex", gap: 1, alignItems: "flex-start", p: 1, borderRadius: 1, bgcolor: "rgba(34,197,94,0.08)", cursor: "help" }}>
        <LocalLaundryServiceIcon sx={{ fontSize: 18, color: "#22c55e", mt: 0.25 }} />
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="caption" sx={{ display: "block", fontWeight: 600 }}>
            {next.active ? t("billing.cheap.now") : t(next.day === localDay(now) ? "billing.cheap.today" : "billing.cheap.tomorrow", { window: formatWindow(next.window) })}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
            {next.active
              ? next.window.from === 0 && next.window.to === 24
                ? t("billing.cheap.allDay")
                : t("billing.cheap.nowDetail", { window: formatWindow(next.window) })
              : t("billing.cheap.saving", { n: saving })}
          </Typography>
        </Box>
      </Box>
    </Tooltip>
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
        projectedCost: e?.projectedCostEur ?? null,
        bill: e?.bill ?? null,
        lastPeriodCost: e?.lastPeriodCostEur ?? null,
        lastPeriodLabel: billingPeriod(period.start, -1).start.toLocaleDateString(locale, { month: "long" }),
      };
      if (e?.lastYearSameDaysKwh != null && e.usedKwh != null && e.lastYearSameDaysKwh > 0) {
        const diff = Math.round(((e.usedKwh - e.lastYearSameDaysKwh) / e.lastYearSameDaysKwh) * 100);
        elNotes.push({
          text: t("billing.lastYear", {
            n: `${diff > 0 ? "+" : ""}${diff}`,
            kwh: fmtNum(e.lastYearSameDaysKwh, 0, locale),
            total: e.lastYearKwh != null ? fmtNum(e.lastYearKwh, 0, locale) : "–",
          }),
          color: diff > 0 ? "#f87171" : "#22c55e",
        });
      }
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
          <TariffChip />
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
              source={live ? `Moj Elektro${electricity?.distributor ? ` (${electricity.distributor})` : ""}` : t("common.demo")}
              notes={elNotes}
            />
            {now && <CheapPower now={now} />}
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
