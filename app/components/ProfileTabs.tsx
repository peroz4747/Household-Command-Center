"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Box, Chip, LinearProgress, Tooltip, Typography } from "@mui/material";
import { useI18n } from "../i18n";
import type { InfoText } from "../../lib/countryInfo";
import type { CountryProfile, Domain, Fact } from "../../lib/countryProfile";
import type { Economy } from "../../lib/economies";
import { Figure, InfoBlock } from "./CountryCharts";

// Skupni gradniki zavihkov okvira PMESII-PT (politika, vojska, gospodarstvo, družba, informacije,
// infrastruktura, fizično okolje, čas).

type Tr = (k: string, v?: Record<string, string | number>) => string;
const useT = () => {
  const { t, locale, lang } = useI18n();
  return { tr: t as unknown as Tr, locale, lang };
};

export function Heading({ children }: { children: ReactNode }) {
  return (
    <Typography variant="overline" color="text.secondary" sx={{ display: "block", mb: 1 }}>
      {children}
    </Typography>
  );
}

export function Grid({ children, cols = 4 }: { children: ReactNode; cols?: number }) {
  return <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", sm: `repeat(${Math.min(cols, 3)}, 1fr)`, md: `repeat(${cols}, 1fr)` }, gap: 1.25 }}>{children}</Box>;
}

/** Vrstice z oznako in vrednostjo (dejstva iz infoboxa Wikipedije). */
// Pogoste oznake iz angleškega infoboxa (ključ = oznaka brez letnice v oklepaju).
const LABEL_KEYS: Record<string, string> = {
  government: "government", president: "president", "prime minister": "pm", chancellor: "chancellor", "vice president": "vp", "deputy prime minister": "dpm",
  monarch: "monarch", king: "king", queen: "queen", emir: "emir", "supreme leader": "supremeLeader", "general secretary": "genSec", premier: "premier",
  legislature: "legislature", "upper house": "upperHouse", "lower house": "lowerHouse", "official languages": "officialLanguages", "official language": "officialLanguages",
  "recognised regional languages": "regionalLanguages", "recognized regional languages": "regionalLanguages", "national language": "nationalLanguage", "national languages": "nationalLanguage",
  "ethnic groups": "ethnic", religion: "religion", demonyms: "demonym", demonym: "demonym", gini: "gini", hdi: "hdi", "internet tld": "tld", "calling code": "calling",
  "driving side": "driving", "mains electricity": "mains", "time zone": "timezone", "summer (dst)": "dst", "date format": "dateFormat", currency: "currency",
  "independence from yugoslavia": "independenceYu", "current constitution": "constitution", "speaker of the national assembly": "speakerNA",
};
function useLabel() {
  const { tr } = useT();
  return (label: string) => {
    const m = label.match(/^(.*?)\s*(\((\d{4})\))?$/);
    const base = (m?.[1] ?? label).trim().toLowerCase();
    const key = LABEL_KEYS[base];
    if (!key) return label;
    const text = tr(`pm.f.${key}`);
    return text.startsWith("pm.f.") ? label : `${text}${m?.[3] ? ` (${m[3]})` : ""}`;
  };
}

export function FactList({ rows }: { rows: { label: string; value: string }[] }) {
  const label = useLabel();
  if (!rows.length) return null;
  return (
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "200px 1fr" }, columnGap: 2, rowGap: 0.75 }}>
      {rows.map((r, i) => (
        <Box key={i} sx={{ display: "contents" }}>
          <Typography variant="body2" color="text.secondary">
            {label(r.label)}
          </Typography>
          <Typography variant="body2" sx={{ whiteSpace: "pre-line", mb: { xs: 1, sm: 0 } }}>
            {r.value}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

/** Poglavje Wikipedije za področje (naloži se ob odprtju zavihka). */
export function WikiSection({ iso2, domain, heading }: { iso2: string; domain: Domain; heading: string }) {
  const { tr, lang } = useT();
  const [state, setState] = useState<{ key: string; data: InfoText | null } | null>(null);
  const key = `${iso2}|${domain}|${lang}`;
  useEffect(() => {
    let alive = true;
    fetch(`/api/profile/section?iso2=${iso2}&domain=${domain}&lang=${lang}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => alive && setState({ key: `${iso2}|${domain}|${lang}`, data: d.section ?? null }))
      .catch(() => alive && setState({ key: `${iso2}|${domain}|${lang}`, data: null }));
    return () => {
      alive = false;
    };
  }, [iso2, domain, lang]);
  const data = state?.key === key ? state.data : undefined;
  if (data === undefined)
    return (
      <Typography variant="body2" color="text.secondary">
        {tr("common.loading")}
      </Typography>
    );
  if (!data) return null;
  return <InfoBlock heading={heading} info={data} />;
}

/** Iskanje vrstic infoboxa po oznaki (angleški infobox). */
export function pick(facts: Fact[], ...patterns: RegExp[]): Fact[] {
  return facts.filter((f) => patterns.some((p) => p.test(f.label)));
}

export function useFmt() {
  const { locale } = useT();
  return useMemo(
    () => ({
      pct: (v: number | undefined, d = 1) => (v === undefined ? "–" : `${v.toLocaleString(locale, { maximumFractionDigits: d })} %`),
      num: (v: number | undefined, d = 0) => (v === undefined ? "–" : v.toLocaleString(locale, { maximumFractionDigits: d })),
      compact: (v: number | undefined) => (v === undefined ? "–" : v.toLocaleString(locale, { notation: "compact", maximumFractionDigits: 1 })),
    }),
    [locale],
  );
}

const ind = (p: CountryProfile | null, code: string) => p?.indicators[code];
const fig = (p: CountryProfile | null, code: string, label: string, format: (v: number | undefined) => string, sub?: string) => {
  const v = ind(p, code);
  return <Figure key={code} label={label} value={format(v?.value)} sub={[v?.year, sub].filter(Boolean).join(" · ") || undefined} />;
};

function Pending({ profile }: { profile: CountryProfile | null }) {
  const { tr } = useT();
  if (!profile?.indicatorsPending) return null;
  return (
    <Typography variant="caption" color="text.secondary">
      {tr("pm.pending")}
    </Typography>
  );
}

/* ---------------- Politika ---------------- */

const WGI: [string, string][] = [
  ["GOV_WGI_VA.SC", "va"],
  ["GOV_WGI_PV.SC", "pv"],
  ["GOV_WGI_GE.SC", "ge"],
  ["GOV_WGI_RQ.SC", "rq"],
  ["GOV_WGI_RL.SC", "rl"],
  ["GOV_WGI_CC.SC", "cc"],
];

/** Rdeča (slabo) – rumena – zelena (dobro) za lestvice 0–100. */
export const scoreColor = (v: number) => (v < 33 ? "#ef4444" : v < 50 ? "#f59e0b" : v < 67 ? "#eab308" : v < 80 ? "#22c55e" : "#15803d");

export function PoliticsTab({ economy, profile, diplomacy }: { economy: Economy; profile: CountryProfile | null; diplomacy: ReactNode }) {
  const { tr } = useT();
  const facts = profile?.facts ?? [];
  // Voditelji: vrstice med "Government" in "Legislature" v infoboxu.
  const gi = facts.findIndex((f) => /^Government$/i.test(f.label));
  const li = facts.findIndex((f, i) => i > gi && /^Legislature/i.test(f.label));
  const leaders = gi >= 0 ? facts.slice(gi + 1, li > gi ? li : gi + 5).filter((f) => !f.section || /government/i.test(f.section)) : [];
  const rows = [
    ...pick(facts, /^Capital/i),
    ...(gi >= 0 ? [facts[gi]] : []),
    ...leaders,
    ...pick(facts, /^Legislature$/i, /^Upper house$/i, /^Lower house$/i),
  ];
  const independence = facts.filter((f) => /establishment|formation|independence|history/i.test(f.section)).slice(-4);
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <Box>
        <Heading>{tr("pm.p.system")}</Heading>
        {rows.length ? <FactList rows={rows.map((f) => ({ label: f.label.replace(/^Capital.*$/i, tr("pm.p.capital")), value: f.value }))} /> : <Typography color="text.secondary">{profile ? tr("pm.noData") : tr("common.loading")}</Typography>}
        {independence.length > 0 && (
          <Box sx={{ mt: 1.5 }}>
            <FactList rows={independence.map((f) => ({ label: f.label, value: f.value }))} />
          </Box>
        )}
      </Box>
      <Box>
        <Heading>{tr("pm.p.governance")}</Heading>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, columnGap: 4, rowGap: 1.25 }}>
          {WGI.map(([code, key]) => {
            const v = ind(profile, code);
            return (
              <Tooltip key={code} title={tr(`pm.wgi.${key}Tip`)} placement="top-start">
                <Box>
                  <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                    <Typography variant="body2">{tr(`pm.wgi.${key}`)}</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                      {v ? `${Math.round(v.value)} / 100` : "–"}
                    </Typography>
                  </Box>
                  <LinearProgress
                    variant="determinate"
                    value={v?.value ?? 0}
                    sx={{ height: 6, borderRadius: 3, bgcolor: "rgba(148,163,184,0.15)", "& .MuiLinearProgress-bar": { bgcolor: v ? scoreColor(v.value) : "transparent", borderRadius: 3 } }}
                  />
                </Box>
              </Tooltip>
            );
          })}
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
          {tr("pm.p.wgiNote", { year: ind(profile, "GOV_WGI_CC.SC")?.year ?? "–" })}
        </Typography>
        <Pending profile={profile} />
      </Box>
      {diplomacy}
      {profile && profile.neighbours.length > 0 && (
        <Typography variant="caption" color="text.secondary">
          {tr("pm.p.neighbours", { n: profile.neighbours.length })}
        </Typography>
      )}
      <WikiSection iso2={economy.iso2} domain="politics" heading={tr("pm.p.wikiPolitics")} />
      <WikiSection iso2={economy.iso2} domain="foreign" heading={tr("pm.p.wikiForeign")} />
    </Box>
  );
}

/* ---------------- Gospodarstvo (dodatki) ---------------- */

export function EconomyExtras({ profile }: { profile: CountryProfile | null }) {
  const { tr } = useT();
  const f = useFmt();
  const ef = profile?.economyFacts ?? [];
  const sectors: [string, string, string][] = [
    ["NV.AGR.TOTL.ZS", "agr", "#a3e635"],
    ["NV.IND.TOTL.ZS", "ind", "#60a5fa"],
    ["NV.SRV.TOTL.ZS", "srv", "#f472b6"],
  ];
  const total = sectors.reduce((a, [c]) => a + (ind(profile, c)?.value ?? 0), 0);
  const currency = pick(profile?.facts ?? [], /^Currency$/i)[0];
  const trade = pick(ef, /^Main industries$/i, /^Export goods$/i, /^Main export partners$/i, /^Import goods$/i, /^Main import partners$/i);
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <Box>
        <Heading>{tr("pm.e.structure")}</Heading>
        <Grid>
          {fig(profile, "NE.EXP.GNFS.ZS", tr("pm.e.exports"), (v) => f.pct(v))}
          {fig(profile, "NE.IMP.GNFS.ZS", tr("pm.e.imports"), (v) => f.pct(v))}
          {fig(profile, "BN.CAB.XOKA.GD.ZS", tr("pm.e.currentAccount"), (v) => f.pct(v))}
          {fig(profile, "IMF.DEBT", tr("pm.e.debt"), (v) => f.pct(v), "IMF")}
          {fig(profile, "EG.IMP.CONS.ZS", tr("pm.e.energyImports"), (v) => f.pct(v))}
          <Figure label={tr("pm.e.currency")} value={currency?.value.split("\n")[0] ?? "–"} />
        </Grid>
        {total > 0 && (
          <Box sx={{ mt: 1.5 }}>
            <Box sx={{ display: "flex", height: 14, borderRadius: 1, overflow: "hidden", gap: "2px" }}>
              {sectors.map(([c, k, color]) => {
                const v = ind(profile, c)?.value ?? 0;
                return (
                  <Tooltip key={c} title={`${tr(`pm.e.${k}`)}: ${f.pct(v)}`}>
                    <Box sx={{ width: `${(v / total) * 100}%`, bgcolor: color }} />
                  </Tooltip>
                );
              })}
            </Box>
            <Box sx={{ display: "flex", gap: 2, mt: 0.5, flexWrap: "wrap" }}>
              {sectors.map(([c, k, color]) => (
                <Box key={c} sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                  <Box sx={{ width: 10, height: 10, borderRadius: "2px", bgcolor: color }} />
                  <Typography variant="caption" color="text.secondary">
                    {tr(`pm.e.${k}`)} {f.pct(ind(profile, c)?.value)} {tr("pm.e.ofGdp")}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Box>
        )}
      </Box>
      {trade.length > 0 && (
        <Box>
          <Heading>{tr("pm.e.trade")}</Heading>
          <FactList rows={trade.map((x) => ({ label: tr(`pm.e.f.${x.label}`) === `pm.e.f.${x.label}` ? x.label : tr(`pm.e.f.${x.label}`), value: x.value }))} />
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
            {tr("pm.e.tradeNote")}
          </Typography>
        </Box>
      )}
    </Box>
  );
}

/* ---------------- Družba ---------------- */

export function SocietyTab({ economy, profile }: { economy: Economy; profile: CountryProfile | null }) {
  const { tr } = useT();
  const f = useFmt();
  const facts = profile?.facts ?? [];
  const rows = pick(facts, /^Official languages?$/i, /^Recognised|^Recognized|^Regional languages|^National languages?$/i, /^Ethnic groups/i, /^Religion/i, /^Demonym/i, /^HDI/i, /^Gini/i);
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <Box>
        <Heading>{tr("pm.s.demography")}</Heading>
        <Grid>
          {fig(profile, "SP.POP.TOTL", tr("pm.s.population"), f.compact)}
          {fig(profile, "SP.POP.GROW", tr("pm.s.growth"), (v) => f.pct(v, 2))}
          {fig(profile, "EN.POP.DNST", tr("pm.s.density"), (v) => (v === undefined ? "–" : `${f.num(v)} /km²`))}
          {fig(profile, "SP.URB.TOTL.IN.ZS", tr("pm.s.urban"), (v) => f.pct(v))}
          {fig(profile, "SP.DYN.LE00.IN", tr("pm.s.life"), (v) => (v === undefined ? "–" : `${f.num(v, 1)} ${tr("pm.years")}`))}
          {fig(profile, "SP.DYN.TFRT.IN", tr("pm.s.fertility"), (v) => f.num(v, 2))}
          {fig(profile, "SP.POP.0014.TO.ZS", tr("pm.s.young"), (v) => f.pct(v))}
          {fig(profile, "SP.POP.65UP.TO.ZS", tr("pm.s.old"), (v) => f.pct(v))}
          {fig(profile, "SM.POP.NETM", tr("pm.s.migration"), (v) => (v === undefined ? "–" : `${v > 0 ? "+" : ""}${f.compact(v)}`))}
          {fig(profile, "SE.TER.ENRR", tr("pm.s.tertiary"), (v) => f.pct(v))}
          {fig(profile, "SE.ADT.LITR.ZS", tr("pm.s.literacy"), (v) => f.pct(v))}
          {fig(profile, "SI.POV.GINI", tr("pm.s.gini"), (v) => f.num(v, 1))}
        </Grid>
        <Pending profile={profile} />
      </Box>
      {rows.length > 0 && (
        <Box>
          <Heading>{tr("pm.s.groups")}</Heading>
          <FactList rows={rows.map((x) => ({ label: x.label, value: x.value }))} />
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
            {tr("pm.infoboxNote")}
          </Typography>
        </Box>
      )}
      <WikiSection iso2={economy.iso2} domain="society" heading={tr("pm.s.wiki")} />
    </Box>
  );
}

/* ---------------- Informacijsko okolje ---------------- */

export function InformationTab({ economy, profile }: { economy: Economy; profile: CountryProfile | null }) {
  const { tr } = useT();
  const f = useFmt();
  const rows = pick(profile?.facts ?? [], /^Internet TLD$/i, /^Calling code$/i);
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <Box>
        <Heading>{tr("pm.i.connectivity")}</Heading>
        <Grid cols={3}>
          {fig(profile, "IT.NET.USER.ZS", tr("pm.i.internet"), (v) => f.pct(v))}
          {fig(profile, "IT.CEL.SETS.P2", tr("pm.i.mobile"), (v) => f.num(v))}
          {fig(profile, "IT.NET.BBND.P2", tr("pm.i.broadband"), (v) => f.num(v, 1))}
        </Grid>
        <Pending profile={profile} />
        {rows.length > 0 && (
          <Box sx={{ mt: 1.5 }}>
            <FactList rows={rows.map((x) => ({ label: x.label, value: x.value }))} />
          </Box>
        )}
      </Box>
      <WikiSection iso2={economy.iso2} domain="information" heading={tr("pm.i.wiki")} />
      <Typography variant="caption" color="text.secondary">
        {tr("pm.i.note")}
      </Typography>
    </Box>
  );
}

/* ---------------- Infrastruktura ---------------- */

export function InfrastructureTab({ economy, profile }: { economy: Economy; profile: CountryProfile | null }) {
  const { tr } = useT();
  const f = useFmt();
  const rows = pick(profile?.facts ?? [], /^Driving side$/i, /^Mains electricity$/i);
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <Box>
        <Heading>{tr("pm.n.transport")}</Heading>
        <Grid cols={3}>
          {fig(profile, "IS.RRS.TOTL.KM", tr("pm.n.rail"), (v) => (v === undefined ? "–" : `${f.num(v)} km`))}
          {fig(profile, "IS.AIR.PSGR", tr("pm.n.air"), f.compact)}
          {fig(profile, "IS.SHP.GOOD.TU", tr("pm.n.ports"), f.compact)}
          {fig(profile, "LP.LPI.OVRL.XQ", tr("pm.n.lpi"), (v) => (v === undefined ? "–" : `${f.num(v, 2)} / 5`))}
          {fig(profile, "EG.ELC.ACCS.ZS", tr("pm.n.electricity"), (v) => f.pct(v))}
          {fig(profile, "EG.FEC.RNEW.ZS", tr("pm.n.renewables"), (v) => f.pct(v))}
        </Grid>
        <Pending profile={profile} />
        {rows.length > 0 && (
          <Box sx={{ mt: 1.5 }}>
            <FactList rows={rows.map((x) => ({ label: x.label, value: x.value }))} />
          </Box>
        )}
      </Box>
      <WikiSection iso2={economy.iso2} domain="infrastructure" heading={tr("pm.n.wiki")} />
      <WikiSection iso2={economy.iso2} domain="energy" heading={tr("pm.n.wikiEnergy")} />
    </Box>
  );
}

/* ---------------- Fizično okolje ---------------- */

export function PhysicalTab({ economy, profile, items, onOpen }: { economy: Economy; profile: CountryProfile | null; items: Economy[]; onOpen: (e: Economy) => void }) {
  const { tr, locale } = useT();
  const f = useFmt();
  const byIso = useMemo(() => new Map(items.map((e) => [e.iso2, e])), [items]);
  const names = useMemo(() => {
    try {
      return new Intl.DisplayNames([locale], { type: "region" });
    } catch {
      return null;
    }
  }, [locale]);
  const water = pick(profile?.facts ?? [], /^Water \(%\)$/i)[0];
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <Box>
        <Heading>{tr("pm.g.land")}</Heading>
        <Grid>
          {fig(profile, "AG.LND.TOTL.K2", tr("pm.g.area"), (v) => (v === undefined ? "–" : `${f.num(v)} km²`))}
          <Figure label={tr("pm.g.water")} value={water ? `${water.value.replace(/[^\d.,]/g, "")} %` : "–"} />
          {fig(profile, "AG.LND.ARBL.ZS", tr("pm.g.arable"), (v) => f.pct(v))}
          {fig(profile, "AG.LND.FRST.ZS", tr("pm.g.forest"), (v) => f.pct(v))}
        </Grid>
      </Box>
      <Box>
        <Heading>{tr("pm.g.resources")}</Heading>
        <Grid>
          {fig(profile, "NY.GDP.TOTL.RT.ZS", tr("pm.g.rentsTotal"), (v) => f.pct(v))}
          {fig(profile, "NY.GDP.PETR.RT.ZS", tr("pm.g.rentsOil"), (v) => f.pct(v))}
          {fig(profile, "NY.GDP.NGAS.RT.ZS", tr("pm.g.rentsGas"), (v) => f.pct(v))}
          {fig(profile, "NY.GDP.MINR.RT.ZS", tr("pm.g.rentsMinerals"), (v) => f.pct(v))}
        </Grid>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
          {tr("pm.g.rentsNote")}
        </Typography>
        <Pending profile={profile} />
      </Box>
      {profile && profile.neighbours.length > 0 && (
        <Box>
          <Heading>{tr("pm.g.neighbours", { n: profile.neighbours.length })}</Heading>
          <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap" }}>
            {profile.neighbours.map((iso) => {
              const target = byIso.get(iso);
              let name = iso;
              try {
                name = names?.of(iso) ?? iso;
              } catch {
                /* neznana koda */
              }
              return (
                <Chip
                  key={iso}
                  size="small"
                  label={name}
                  onClick={target ? () => onOpen(target) : undefined}
                  avatar={<Box component="img" src={`https://flagcdn.com/w40/${iso.toLowerCase()}.png`} alt="" sx={{ width: "18px !important", height: "13px !important", objectFit: "cover", borderRadius: "2px" }} />}
                />
              );
            })}
          </Box>
        </Box>
      )}
      <WikiSection iso2={economy.iso2} domain="geography" heading={tr("pm.g.wiki")} />
      <WikiSection iso2={economy.iso2} domain="climate" heading={tr("pm.g.wikiClimate")} />
    </Box>
  );
}

/* ---------------- Čas ---------------- */

const SEASON_N = ["winter", "winter", "spring", "spring", "spring", "summer", "summer", "summer", "autumn", "autumn", "autumn", "winter"];

export function TimeTab({ profile }: { profile: CountryProfile | null }) {
  const { tr, locale } = useT();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const tz = profile?.timezone ?? undefined;
  const timeFacts = pick(profile?.facts ?? [], /^Time zone$/i, /^Summer \(DST\)$/i, /^Date format$/i);
  const clim = profile?.climate;
  const month = tz ? Number(new Date(now).toLocaleString("en-GB", { timeZone: tz, month: "numeric" })) : new Date(now).getMonth() + 1;
  const southern = useMemo(() => {
    // Južna polobla: najtoplejši mesec je med decembrom in februarjem.
    if (!clim) return false;
    const warmest = [...clim.months].sort((a, b) => b.tempMean - a.tempMean)[0]?.month ?? 7;
    return warmest === 12 || warmest <= 3;
  }, [clim]);
  const season = (m: number) => {
    const s = SEASON_N[m - 1];
    return southern ? ({ winter: "summer", summer: "winter", spring: "autumn", autumn: "spring" } as Record<string, string>)[s] : s;
  };
  const fmtDate = (d: string, prec = 11) =>
    prec >= 11
      ? new Date(`${d}T12:00:00`).toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" })
      : prec === 10
        ? new Date(`${d}T12:00:00`).toLocaleDateString(locale, { month: "long", year: "numeric" })
        : d.slice(0, 4);
  const maxP = Math.max(1, ...(clim?.months.map((m) => m.precip) ?? [1]));
  const tMin = Math.min(0, ...(clim?.months.map((m) => m.tempMin) ?? [0]));
  const tMax = Math.max(1, ...(clim?.months.map((m) => m.tempMax) ?? [1]));
  const elections = profile?.elections ?? [];
  const next = elections.filter((e) => e.upcoming);
  const past = elections.filter((e) => !e.upcoming).slice(-3).reverse();

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <Box>
        <Heading>{tr("pm.t.now")}</Heading>
        <Grid cols={3}>
          <Figure label={tr("pm.t.localTime")} value={tz ? new Date(now).toLocaleTimeString(locale, { timeZone: tz, hour: "2-digit", minute: "2-digit" }) : "–"} sub={tz ? new Date(now).toLocaleDateString(locale, { timeZone: tz, weekday: "long", day: "numeric", month: "long" }) : undefined} />
          <Figure label={tr("pm.t.timezone")} value={tz ?? "–"} sub={timeFacts[0]?.value} />
          <Figure label={tr("pm.t.season")} value={tr(`pm.t.season.${season(month)}`)} sub={southern ? tr("pm.t.southern") : undefined} />
        </Grid>
      </Box>
      <Box>
        <Heading>{tr("pm.t.elections")}</Heading>
        {elections.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            {profile ? tr("pm.t.noElections") : tr("common.loading")}
          </Typography>
        ) : (
          <FactList
            rows={[
              ...next.map((e) => ({ label: `${tr("pm.t.next")} · ${fmtDate(e.date, e.precision)}`, value: e.label })),
              ...past.map((e) => ({ label: `${tr("pm.t.last")} · ${fmtDate(e.date, e.precision)}`, value: e.label })),
            ]}
          />
        )}
      </Box>
      <Box>
        <Heading>{tr("pm.t.holidays")}</Heading>
        {profile?.holidays.length ? (
          <FactList rows={profile.holidays.map((h) => ({ label: fmtDate(h.date), value: h.localName === h.name ? h.name : `${h.localName} (${h.name})` }))} />
        ) : (
          <Typography variant="body2" color="text.secondary">
            {profile ? tr("pm.t.noHolidays") : tr("common.loading")}
          </Typography>
        )}
      </Box>
      {clim && (
        <Box>
          <Heading>{tr("pm.t.climate", { place: clim.place, year: clim.year })}</Heading>
          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 0.75, alignItems: "end" }}>
            {clim.months.map((m) => {
              const top = ((tMax - m.tempMax) / (tMax - tMin)) * 100;
              const bottom = ((m.tempMin - tMin) / (tMax - tMin)) * 100;
              return (
                <Tooltip
                  key={m.month}
                  title={tr("pm.t.climateTip", { t: m.tempMean.toFixed(1), min: m.tempMin.toFixed(1), max: m.tempMax.toFixed(1), p: Math.round(m.precip) })}
                >
                  <Box sx={{ textAlign: "center", outline: m.month === month ? "1px solid rgba(148,163,184,0.5)" : "none", borderRadius: 1, p: 0.25 }}>
                    <Typography variant="caption" sx={{ display: "block", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                      {Math.round(m.tempMean)}°
                    </Typography>
                    <Box sx={{ position: "relative", height: 90, mx: "auto", width: 10 }}>
                      <Box sx={{ position: "absolute", left: 0, right: 0, top: `${top}%`, bottom: `${bottom}%`, borderRadius: 5, background: `linear-gradient(180deg, #f97316, #38bdf8)` }} />
                    </Box>
                    <Box sx={{ height: 40, display: "flex", alignItems: "flex-end", justifyContent: "center", mt: 0.5 }}>
                      <Box sx={{ width: 12, height: `${Math.max(3, (m.precip / maxP) * 100)}%`, bgcolor: "#3987e5", borderRadius: "3px 3px 0 0" }} />
                    </Box>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>
                      {new Date(2000, m.month - 1, 1).toLocaleDateString(locale, { month: "short" })}
                    </Typography>
                  </Box>
                </Tooltip>
              );
            })}
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
            {tr("pm.t.climateNote")}
          </Typography>
        </Box>
      )}
      {timeFacts.length > 1 && <FactList rows={timeFacts.map((x) => ({ label: x.label, value: x.value }))} />}
    </Box>
  );
}
