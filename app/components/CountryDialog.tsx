"use client";

import { useEffect, useState } from "react";
import { Box, Button, Dialog, DialogContent, DialogTitle, IconButton, Tab, Tabs, ToggleButton, ToggleButtonGroup, Typography, useMediaQuery, useTheme } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import ShieldIcon from "@mui/icons-material/Shield";
import DefensePanel from "./DefensePanel";
import { useI18n } from "../i18n";
import type { CountryDetail, Economy } from "../../lib/economies";
import type { CountryInfo, InfoText } from "../../lib/countryInfo";
import type { MarketQuote, MarketRange } from "../../lib/markets";
import { COUNTRY_MARKETS } from "../../lib/countryMarkets";
import { SloveniaMarket, Tile } from "./MarketOverview";
import { Figure, GrowthBars, LevelLine } from "./CountryCharts";


function CountryMarket({ iso2 }: { iso2: string }) {
  const { t } = useI18n();
  const [range, setRange] = useState<MarketRange>("1d");
  // Podatki skupaj z obdobjem, za katero so: ob menjavi obdobja se pokaže nalaganje brez dodatnega stanja.
  const [loaded, setLoaded] = useState<{ key: string; items: MarketQuote[] } | null>(null);
  const key = `${iso2}|${range}`;
  const items = loaded?.key === key ? loaded.items : null;
  useEffect(() => {
    let alive = true;
    fetch(`/api/markets?country=${iso2}&range=${range}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => alive && setLoaded({ key: `${iso2}|${range}`, items: d.items ?? [] }))
      .catch(() => alive && setLoaded({ key: `${iso2}|${range}`, items: [] }));
    return () => {
      alive = false;
    };
  }, [iso2, range]);
  return (
    <Box>
      <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 1 }}>
        <ToggleButtonGroup size="small" exclusive value={range} onChange={(_, v) => v && setRange(v)}>
          <ToggleButton value="1d">{t("markets.range.1d")}</ToggleButton>
          <ToggleButton value="1mo">{t("markets.range.1mo")}</ToggleButton>
          <ToggleButton value="1y">{t("markets.range.1y")}</ToggleButton>
        </ToggleButtonGroup>
      </Box>
      {!items ? (
        <Typography color="text.secondary">{t("common.loading")}</Typography>
      ) : (
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(3, 1fr)", md: "repeat(4, 1fr)" }, gap: 1.5 }}>
          {items.map((q) => (
            <Tile key={q.symbol} q={q} range={range} />
          ))}
        </Box>
      )}
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
        {t("markets.source")}
      </Typography>
    </Box>
  );
}

const PREVIEW = 600;

function InfoBlock({ heading, info }: { heading: string; info: InfoText }) {
  const { t, lang } = useI18n();
  const [more, setMore] = useState(false);
  const long = info.text.length > PREVIEW + 100;
  const shown = !long || more ? info.text : `${info.text.slice(0, info.text.lastIndexOf(" ", PREVIEW))} …`;
  return (
    <Box>
      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
        {heading}
        {info.lang !== lang && (
          <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1, fontWeight: 400 }}>
            {t("econ.info.otherLang", { lang: info.lang.toUpperCase() })}
          </Typography>
        )}
      </Typography>
      {shown.split(/\n{2,}/).map((para, i) => (
        <Typography key={i} variant="body2" sx={{ mb: 1, whiteSpace: "pre-line", lineHeight: 1.6, color: "text.secondary" }}>
          {para}
        </Typography>
      ))}
      <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
        {long && (
          <Button size="small" onClick={() => setMore(!more)} sx={{ px: 0, minWidth: 0 }}>
            {more ? t("econ.info.less") : t("econ.info.more")}
          </Button>
        )}
        <Button size="small" href={info.url} target="_blank" rel="noreferrer" sx={{ textTransform: "none" }}>
          {t("econ.info.source", { title: info.title })} ↗
        </Button>
      </Box>
    </Box>
  );
}

function CountryInfoSection({ iso2 }: { iso2: string }) {
  const { t, lang } = useI18n();
  const [info, setInfo] = useState<{ key: string; data: CountryInfo | null } | null>(null);
  const key = `${iso2}|${lang}`;
  useEffect(() => {
    let alive = true;
    fetch(`/api/economies/info?iso2=${iso2}&lang=${lang}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => alive && setInfo({ key: `${iso2}|${lang}`, data: d }))
      .catch(() => alive && setInfo({ key: `${iso2}|${lang}`, data: null }));
    return () => {
      alive = false;
    };
  }, [iso2, lang]);
  const data = info?.key === key ? info.data : undefined;
  return (
    <Box>
      <Typography variant="overline" color="text.secondary" sx={{ display: "block", mb: 1 }}>
        {t("econ.info.title")}
      </Typography>
      {data === undefined ? (
        <Typography color="text.secondary">{t("common.loading")}</Typography>
      ) : !data?.intro && !data?.economy ? (
        <Typography color="text.secondary">{t("econ.info.none")}</Typography>
      ) : (
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 3 }}>
          {data.intro && <InfoBlock heading={t("econ.info.about")} info={data.intro} />}
          {data.economy && <InfoBlock heading={t("econ.info.economy")} info={data.economy} />}
        </Box>
      )}
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
        {t("econ.info.license")}
      </Typography>
    </Box>
  );
}

export default function CountryDialog({
  economy,
  name,
  ranks,
  items,
  onOpen,
  onClose,
  initialTab = "economy",
}: {
  economy: Economy;
  name: string;
  ranks: { gdp?: number; pc?: number };
  items: Economy[];
  onOpen: (e: Economy) => void;
  onClose: () => void;
  initialTab?: "economy" | "defense";
}) {
  const [tab, setTab] = useState<"economy" | "defense">(initialTab);
  const { t, locale } = useI18n();
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("md"));
  const [detail, setDetail] = useState<CountryDetail | null>(null);
  const [failed, setFailed] = useState(false);
  const tr = t as unknown as (k: string) => string;

  useEffect(() => {
    fetch(`/api/economies/country?iso3=${economy.iso3}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setDetail)
      .catch(() => setFailed(true));
  }, [economy.iso3]);

  const money = (n: number | null | undefined, compact = true) =>
    n == null ? "–" : n.toLocaleString(locale, compact ? { notation: "compact", maximumFractionDigits: n >= 1e12 ? 2 : 1, style: "currency", currency: "USD" } : { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const pct = (n: number | null | undefined, sign = true) => (n == null ? "–" : `${sign && n > 0 ? "+" : ""}${n.toLocaleString(locale, { maximumFractionDigits: 1, minimumFractionDigits: 1 })} %`);
  const people = (n: number | null | undefined) => (n == null ? "–" : n.toLocaleString(locale, { notation: "compact", maximumFractionDigits: 1 }));
  const income = detail?.incomeLevel ? tr(`econ.income.${detail.incomeLevel}`) : "";
  const hasMarket = economy.iso2 === "SI" || Boolean(COUNTRY_MARKETS[economy.iso2]);

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="lg" fullScreen={fullScreen}>
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1.5, pr: 1.5 }}>
        <Box component="img" src={`https://flagcdn.com/w80/${economy.iso2.toLowerCase()}.png`} alt="" sx={{ width: 36, height: 24, objectFit: "cover", borderRadius: "3px", boxShadow: "0 0 0 1px rgba(148,163,184,0.3)" }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
            {name}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {[detail?.capital, income && !income.startsWith("econ.") ? income : null].filter(Boolean).join(" · ")}
          </Typography>
        </Box>
        <IconButton onClick={onClose} aria-label={t("common.close")}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ px: 3, borderBottom: "1px solid rgba(148,163,184,0.15)", minHeight: 40, "& .MuiTab-root": { minHeight: 40 } }}>
        <Tab value="economy" icon={<TrendingUpIcon fontSize="small" />} iconPosition="start" label={t("econ.tab.economy")} />
        <Tab
          value="defense"
          icon={<ShieldIcon fontSize="small" />}
          iconPosition="start"
          label={
            <Box component="span" sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
              {t("econ.tab.defense")}
              {economy.conflict && <Box component="span" sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: economy.conflict === "war" ? "#b91c1c" : "#ef4444" }} />}
            </Box>
          }
        />
      </Tabs>
      <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 3, pt: "20px !important" }}>
        {tab === "defense" ? (
          <DefensePanel economy={economy} detail={detail} items={items} onOpen={onOpen} />
        ) : (
        <>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(4, 1fr)" }, gap: 1.25 }}>
          <Figure label={t("econ.gdp")} value={money(economy.gdpUsd)} sub={[economy.gdpYear, ranks.gdp ? `#${ranks.gdp}` : null].filter(Boolean).join(" · ")} />
          <Figure label={t("econ.gdpPc")} value={money(economy.gdpPerCapitaUsd, false)} sub={ranks.pc ? `#${ranks.pc}` : undefined} />
          <Figure label={t("econ.growthYear")} value={pct(economy.growthYear)} sub={economy.growthYearOf ?? undefined} />
          <Figure label={t("econ.qoq")} value={pct(economy.qoq)} sub={economy.quarter ? `${economy.quarter.replace("-", " ")} · y/y ${pct(economy.yoyQ)}` : t("econ.noQuarterly")} />
          <Figure label={t("econ.population")} value={people(detail?.population?.value)} sub={detail?.population?.year} />
          <Figure label={t("econ.inflation")} value={pct(detail?.inflation?.value, false)} sub={detail?.inflation?.year} />
          <Figure label={t("econ.unemployment")} value={pct(detail?.unemployment?.value, false)} sub={detail?.unemployment?.year} />
          <Figure label={t("econ.exports")} value={pct(detail?.exports?.value, false)} sub={detail?.exports?.year} />
        </Box>

        {failed && <Typography color="error">{t("econ.detailError")}</Typography>}
        {!detail && !failed && <Typography color="text.secondary">{t("common.loading")}</Typography>}
        {detail && (
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 3 }}>
            <Box>
              <Typography variant="overline" color="text.secondary">
                {t("econ.chart.quarters")}
              </Typography>
              {detail.quarters.length ? (
                <GrowthBars
                  labelEvery={2}
                  points={detail.quarters
                    .filter((q) => q.qoq !== null)
                    .map((q) => ({
                      label: q.quarter.replace(/^\d\d(\d\d)-Q/, "$1 Q"),
                      value: q.qoq!,
                      tip: `${q.quarter.replace("-", " ")}: q/q ${pct(q.qoq)} · y/y ${pct(q.yoy)}`,
                    }))}
                />
              ) : (
                <Typography variant="body2" color="text.secondary">
                  {t("econ.noQuarterly")}
                </Typography>
              )}
            </Box>
            <Box>
              <Typography variant="overline" color="text.secondary">
                {t("econ.chart.growth")}
              </Typography>
              <GrowthBars
                labelEvery={Math.ceil(detail.growth.length / 7)}
                points={detail.growth.map((g) => ({ label: g.year, value: g.value, tip: `${g.year}: ${pct(g.value)}` }))}
              />
            </Box>
            <Box>
              <Typography variant="overline" color="text.secondary">
                {t("econ.chart.perCapita")}
              </Typography>
              <LevelLine points={detail.gdpPerCapita.map((p) => ({ label: p.year, value: p.value }))} format={(v) => money(v)} />
            </Box>
            <Box>
              <Typography variant="overline" color="text.secondary">
                {t("econ.chart.gdp")}
              </Typography>
              <LevelLine points={detail.gdp.map((p) => ({ label: p.year, value: p.value }))} format={(v) => money(v)} />
            </Box>
          </Box>
        )}

        <CountryInfoSection iso2={economy.iso2} />

        <Box>
          <Typography variant="overline" color="text.secondary" sx={{ display: "block", mb: 1 }}>
            {t("econ.market")}
          </Typography>
          {economy.iso2 === "SI" ? <SloveniaMarket /> : hasMarket ? <CountryMarket iso2={economy.iso2} /> : <Typography color="text.secondary">{t("econ.noMarket")}</Typography>}
        </Box>
        <Typography variant="caption" color="text.secondary">
          {t("econ.detailSource")}
        </Typography>
        </>
        )}
      </DialogContent>
    </Dialog>
  );
}
