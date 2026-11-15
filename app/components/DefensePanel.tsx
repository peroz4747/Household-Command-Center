"use client";

import { useEffect, useMemo, useState } from "react";
import { Alert, Box, Button, Chip, Link, Tooltip, Typography } from "@mui/material";
import SentimentVeryDissatisfiedIcon from "@mui/icons-material/SentimentVeryDissatisfied";
import SentimentDissatisfiedIcon from "@mui/icons-material/SentimentDissatisfied";
import SentimentNeutralIcon from "@mui/icons-material/SentimentNeutral";
import SentimentSatisfiedIcon from "@mui/icons-material/SentimentSatisfied";
import SentimentVerySatisfiedIcon from "@mui/icons-material/SentimentVerySatisfied";
import type { SvgIconComponent } from "@mui/icons-material";
import { useI18n } from "../i18n";
import type { CountryDetail, Economy } from "../../lib/economies";
import type { Conflict, Equipment, Relation, RelationLevel } from "../../lib/defense";
import { Figure, LevelLine } from "./CountryCharts";

type DefenseData = {
  status: "war" | "conflict" | null;
  maxYear: number;
  conflicts: Omit<Conflict, "byYear">[];
  conflictCount: number;
  relations: Relation[];
  memberships: { id: string; name: string; kind: "military" | "political" }[];
  equipment: Equipment | null;
  sources: { conflicts: string; equipment: string };
};

// Odnosi: od temno rdeče (vojna) do temno zelene (zavezniki); vedno z ikono in besedilom.
export const RELATION_STYLE: Record<RelationLevel, { color: string; Icon: SvgIconComponent; key: string }> = {
  [-2]: { color: "#b91c1c", Icon: SentimentVeryDissatisfiedIcon, key: "war" },
  [-1]: { color: "#ef4444", Icon: SentimentDissatisfiedIcon, key: "hostile" },
  0: { color: "#eab308", Icon: SentimentNeutralIcon, key: "neutral" },
  1: { color: "#22c55e", Icon: SentimentSatisfiedIcon, key: "friendly" },
  2: { color: "#15803d", Icon: SentimentVerySatisfiedIcon, key: "ally" },
};
const MIL = "#a78bfa"; // izdatki za obrambo (ena barva, brez pomena dobro/slabo)
const DEATH = "#ef4444";

const flag = (iso2: string, w = 20) => (
  <Box component="img" src={`https://flagcdn.com/w40/${iso2.toLowerCase()}.png`} alt="" loading="lazy" sx={{ width: w, height: Math.round(w * 0.7), objectFit: "cover", borderRadius: "2px", flexShrink: 0, boxShadow: "0 0 0 1px rgba(148,163,184,0.25)" }} />
);

function ConflictCard({ c, iso2, nameOf, maxYear }: { c: DefenseData["conflicts"][number]; iso2: string; nameOf: (iso: string) => string; maxYear: number }) {
  const { t, locale } = useI18n();
  const tr = t as unknown as (k: string, v?: Record<string, string | number>) => string;
  const n = (v: number) => v.toLocaleString(locale);
  const recent = Object.entries(c.recent);
  const maxRecent = Math.max(1, ...recent.map(([, v]) => v));
  // Vlade prevedemo v ime države (npr. "Government of Ukraine" → Ukrajina); uporniške skupine ostanejo v izvirniku.
  const actor = (name: string, isos: string[]) =>
    /^Government of /.test(name) && isos.length === 1 ? nameOf(isos[0]) : name.replace(/^Government of /, "").replace(/ \(.*?\)$/, "");
  const sideFlags = (list: string[]) => list.map((i) => <Tooltip key={i} title={nameOf(i)}>{flag(i, 18)}</Tooltip>);
  const mySide = c.a.includes(iso2) || c.a2.includes(iso2) ? "A" : "B";
  return (
    <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: "rgba(148,163,184,0.06)", borderLeft: `3px solid ${c.ongoing ? DEATH : "rgba(148,163,184,0.35)"}` }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1, flexWrap: "wrap", alignItems: "baseline" }}>
        <Typography variant="body2" sx={{ fontWeight: 700 }}>
          {actor(c.sideA, c.aNow.length ? c.aNow : c.a)} <Box component="span" sx={{ color: "text.secondary", fontWeight: 400 }}>{t("def.vs")}</Box> {actor(c.sideB, c.bNow.length ? c.bNow : c.b)}
        </Typography>
        <Typography variant="caption" sx={{ fontWeight: 700, color: c.ongoing ? DEATH : "text.secondary" }}>
          {c.ongoing ? t("def.ongoing", { from: c.first }) : `${c.first}–${c.last}`}
        </Typography>
      </Box>
      <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap", mt: 0.75, alignItems: "center" }}>
        <Chip size="small" label={tr(`def.type.${c.type}`)} variant="outlined" sx={{ height: 20, fontSize: 11 }} />
        <Chip size="small" label={c.inc === 1 ? t("def.inc.territory", { name: c.territory || "–" }) : c.inc === 2 ? t("def.inc.government") : t("def.inc.both")} variant="outlined" sx={{ height: 20, fontSize: 11 }} />
        {c.war > 0 && <Chip size="small" label={t("def.warYears", { n: c.war })} sx={{ height: 20, fontSize: 11, bgcolor: "rgba(239,68,68,0.15)", color: "#fca5a5" }} />}
        {(c.a.length > 0 || c.a2.length > 0) && (
          <Box sx={{ display: "flex", gap: 0.5, alignItems: "center", ml: 0.5 }}>
            <Typography variant="caption" color="text.secondary">{t("def.sideA")}</Typography>
            {sideFlags([...c.a, ...c.a2].slice(0, 8))}
          </Box>
        )}
        {(c.b.length > 0 || c.b2.length > 0) && (
          <Box sx={{ display: "flex", gap: 0.5, alignItems: "center", ml: 0.5 }}>
            <Typography variant="caption" color="text.secondary">{t("def.sideB")}</Typography>
            {sideFlags([...c.b, ...c.b2].slice(0, 8))}
          </Box>
        )}
      </Box>
      <Box sx={{ display: "flex", gap: 3, flexWrap: "wrap", mt: 1, alignItems: "flex-end" }}>
        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
            {c.deathsYears ? t("def.deaths", { from: c.deathsYears[0], to: c.deathsYears[1] }) : t("def.deathsNone")}
          </Typography>
          <Typography sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{c.deathsYears ? n(c.deaths) : "–"}</Typography>
        </Box>
        {recent.length > 1 && (
          <Box sx={{ display: "flex", gap: 0.5, alignItems: "flex-end", height: 40 }}>
            {recent.map(([y, v]) => (
              <Tooltip key={y} title={`${y}: ${n(v)}`}>
                <Box sx={{ width: 16, height: `${Math.max(6, (v / maxRecent) * 100)}%`, bgcolor: Number(y) === maxYear ? DEATH : "rgba(239,68,68,0.45)", borderRadius: "3px 3px 0 0" }} />
              </Tooltip>
            ))}
          </Box>
        )}
        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
            {t("def.outcome")}
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {c.ongoing
              ? t("def.outcome.ongoing")
              : c.outcome
                ? `${c.outcome === 3 || c.outcome === 4 ? tr(`def.outcome.${(c.outcome === 3) === (mySide === "A") ? "won" : "lost"}`, { side: c.outcome === 3 ? actor(c.sideA, c.a) : actor(c.sideB, c.b) }) : tr(`def.outcome.${c.outcome}`)} (${c.outcomeYear})`
                : t("def.outcome.unknown")}
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}

export default function DefensePanel({ economy, detail, items, onOpen }: { economy: Economy; detail: CountryDetail | null; items: Economy[]; onOpen: (e: Economy) => void }) {
  const { t, locale } = useI18n();
  const tr = t as unknown as (k: string, v?: Record<string, string | number>) => string;
  const [data, setData] = useState<{ iso: string; d: DefenseData | null } | null>(null);
  const [allConflicts, setAllConflicts] = useState(false);
  const d = data?.iso === economy.iso2 ? data.d : undefined;

  useEffect(() => {
    let alive = true;
    fetch(`/api/defense?iso2=${economy.iso2}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((x) => alive && setData({ iso: economy.iso2, d: x }))
      .catch(() => alive && setData({ iso: economy.iso2, d: null }));
    return () => {
      alive = false;
    };
  }, [economy.iso2]);

  const names = useMemo(() => {
    try {
      return new Intl.DisplayNames([locale], { type: "region" });
    } catch {
      return null;
    }
  }, [locale]);
  const nameOf = (iso: string) => {
    try {
      return names?.of(iso) ?? iso;
    } catch {
      return iso;
    }
  };
  const byIso = useMemo(() => new Map(items.map((e) => [e.iso2, e])), [items]);
  const money = (n: number | null | undefined) => (n == null ? "–" : n.toLocaleString(locale, { notation: "compact", maximumFractionDigits: 1, style: "currency", currency: "USD" }));
  const num = (n: number | null | undefined) => (n == null ? "–" : n.toLocaleString(locale));
  const compact = (n: number | null | undefined) => (n == null ? "–" : n.toLocaleString(locale, { notation: "compact", maximumFractionDigits: 1 }));

  if (d === undefined) return <Typography color="text.secondary">{t("common.loading")}</Typography>;
  if (d === null) return <Typography color="error">{t("def.error")}</Typography>;

  const wars = d.relations.filter((r) => r.level === -2);
  const eq = d.equipment;
  const ongoing = d.conflicts.filter((c) => c.ongoing);
  const shownConflicts = allConflicts ? d.conflicts : d.conflicts.slice(0, Math.max(3, ongoing.length));
  const groups = ([-2, -1, 1, 2] as RelationLevel[]).map((level) => ({ level, list: d.relations.filter((r) => r.level === level) }));
  const neutralCount = items.length - 1 - d.relations.length;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {/* Stanje */}
      {wars.length ? (
        <Alert severity="error" icon={<SentimentVeryDissatisfiedIcon />}>
          {t("def.atWar", { list: wars.map((w) => nameOf(w.iso2)).join(", ") })}
        </Alert>
      ) : ongoing.length ? (
        <Alert severity="warning">{t("def.inConflicts", { n: ongoing.length })}</Alert>
      ) : (
        <Alert severity="success">{t("def.peace", { year: d.maxYear })}</Alert>
      )}
      {d.memberships.length > 0 && (
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center", mt: -1.5 }}>
          <Typography variant="caption" color="text.secondary">
            {t("def.members")}
          </Typography>
          {d.memberships.map((m) => (
            <Chip key={m.id} size="small" label={m.name} variant={m.kind === "military" ? "filled" : "outlined"} color={m.kind === "military" ? "success" : "default"} sx={{ height: 22 }} />
          ))}
        </Box>
      )}

      {/* Zmogljivosti */}
      <Box>
        <Typography variant="overline" color="text.secondary" sx={{ display: "block", mb: 1 }}>
          {t("def.capabilities")}
        </Typography>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(4, 1fr)" }, gap: 1.25 }}>
          <Figure label={t("def.personnel")} value={compact(detail?.armedForces?.value)} sub={detail?.armedForces?.year} />
          <Figure label={t("def.spending")} value={money(detail?.milSpending.at(-1)?.value)} sub={detail?.milSpending.at(-1)?.year} />
          <Figure label={t("def.spendingPct")} value={detail?.milPct ? `${detail.milPct.value.toLocaleString(locale, { maximumFractionDigits: 1 })} %` : "–"} sub={detail?.milPct?.year} />
          <Figure label={t("def.nuclear")} value={eq?.nuclearWeapons ? num(eq.nuclearWeapons) : eq ? t("def.none") : "–"} />
          <Figure label={t("def.armsImports")} value={detail?.armsImports ? compact(detail.armsImports.value) : "–"} sub={detail?.armsImports ? `${detail.armsImports.year} · TIV` : undefined} />
          <Figure label={t("def.armsExports")} value={detail?.armsExports ? compact(detail.armsExports.value) : "–"} sub={detail?.armsExports ? `${detail.armsExports.year} · TIV` : undefined} />
        </Box>
        {eq ? (
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, 1fr)", sm: "repeat(4, 1fr)", md: "repeat(6, 1fr)" }, gap: 1.25, mt: 1.25 }}>
            {(
              [
                ["tanks", eq.tanks],
                ["combatAircraft", eq.combatAircraft],
                ["attackHelicopters", eq.attackHelicopters],
                ["carriers", eq.carriers],
                ["destroyers", eq.destroyers],
                ["frigates", eq.frigates],
                ["corvettes", eq.corvettes],
                ["cruisers", eq.cruisers],
                ["subs", (eq.subs ?? 0) + (eq.nuclearSubs ?? 0)],
                ["nuclearSubs", eq.nuclearSubs],
                ["amphibious", eq.amphibious],
              ] as [string, number | null][]
            ).map(([k, v]) => (
              <Figure key={k} label={tr(`def.eq.${k}`)} value={num(v)} />
            ))}
          </Box>
        ) : (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {t("def.noEquipment")}
          </Typography>
        )}
        {detail && detail.milSpending.length > 1 && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="overline" color="text.secondary">
              {t("def.spendingChart")}
            </Typography>
            <LevelLine color={MIL} points={detail.milSpending.map((p) => ({ label: p.year, value: p.value }))} format={(v) => money(v)} />
          </Box>
        )}
      </Box>

      {/* Konflikti */}
      <Box>
        <Typography variant="overline" color="text.secondary" sx={{ display: "block", mb: 1 }}>
          {t("def.conflicts", { n: d.conflictCount })}
        </Typography>
        {d.conflicts.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            {t("def.noConflicts")}
          </Typography>
        ) : (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}>
            {shownConflicts.map((c) => (
              <ConflictCard key={c.id} c={c} iso2={economy.iso2} nameOf={nameOf} maxYear={d.maxYear} />
            ))}
            {d.conflicts.length > shownConflicts.length || allConflicts ? (
              <Button size="small" onClick={() => setAllConflicts(!allConflicts)} sx={{ alignSelf: "flex-start" }}>
                {allConflicts ? t("econ.showLess") : t("def.showAllConflicts", { n: d.conflicts.length })}
              </Button>
            ) : null}
          </Box>
        )}
      </Box>

      {/* Diplomacija */}
      <Box>
        <Typography variant="overline" color="text.secondary" sx={{ display: "block", mb: 1 }}>
          {t("def.diplomacy")}
        </Typography>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
          {groups.map(({ level, list }) => {
            const { color, Icon, key } = RELATION_STYLE[level];
            return (
              <Box key={level} sx={{ display: "flex", gap: 1.5, alignItems: "flex-start" }}>
                <Tooltip title={tr(`def.rel.${key}Tip`)}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, minWidth: 150, color }}>
                    <Icon />
                    <Typography variant="body2" sx={{ fontWeight: 700, color }}>
                      {tr(`def.rel.${key}`)} ({list.length})
                    </Typography>
                  </Box>
                </Tooltip>
                <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap", flex: 1 }}>
                  {list.length === 0 && (
                    <Typography variant="caption" color="text.disabled" sx={{ mt: 0.5 }}>
                      –
                    </Typography>
                  )}
                  {list.map((r) => {
                    const target = byIso.get(r.iso2);
                    return (
                      <Tooltip key={r.iso2} title={r.reasons.join(" · ")}>
                        <Chip
                          size="small"
                          avatar={flag(r.iso2, 18)}
                          label={nameOf(r.iso2)}
                          onClick={target ? () => onOpen(target) : undefined}
                          sx={{ height: 24, border: `1px solid ${color}`, bgcolor: `${color}22`, "& .MuiChip-avatar": { width: 18, height: 13, ml: 0.75 } }}
                        />
                      </Tooltip>
                    );
                  })}
                </Box>
              </Box>
            );
          })}
          <Box sx={{ display: "flex", gap: 1.5, alignItems: "center" }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, minWidth: 150, color: RELATION_STYLE[0].color }}>
              <SentimentNeutralIcon />
              <Typography variant="body2" sx={{ fontWeight: 700, color: RELATION_STYLE[0].color }}>
                {t("def.rel.neutral")} ({Math.max(0, neutralCount)})
              </Typography>
            </Box>
            <Typography variant="caption" color="text.secondary">
              {t("def.rel.neutralNote")}
            </Typography>
          </Box>
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1.5 }}>
          {t("def.rel.method")}
        </Typography>
      </Box>

      <Typography variant="caption" color="text.secondary">
        {t("def.sources")}{" "}
        <Link href="https://ucdp.uu.se/" target="_blank" rel="noreferrer">
          UCDP
        </Link>
        {" · "}
        <Link href={d.sources.equipment} target="_blank" rel="noreferrer">
          Wikipedia / IISS
        </Link>
        {" · SIPRI / "}
        <Link href="https://data.worldbank.org/indicator/MS.MIL.XPND.CD" target="_blank" rel="noreferrer">
          {t("def.worldBank")}
        </Link>
      </Typography>
    </Box>
  );
}
