"use client";

import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from "@mui/material";
import LightModeIcon from "@mui/icons-material/LightMode";
import TimeToLeaveIcon from "@mui/icons-material/TimeToLeave";
import MeetingRoomIcon from "@mui/icons-material/MeetingRoom";
import RamenDiningIcon from "@mui/icons-material/RamenDining";
import ModeNightIcon from "@mui/icons-material/ModeNight";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import RemoveIcon from "@mui/icons-material/Remove";
import ErrorIcon from "@mui/icons-material/Error";
import { useI18n } from "../i18n";
import { SHORTCUT_STEPS, type ShortcutId, type StepResult } from "../../lib/shortcutDefs";

const ITEMS: { id: ShortcutId; label: string; Icon: React.ElementType }[] = [
  { id: "morning", label: "shortcuts.goodMorning", Icon: LightModeIcon },
  { id: "leaving", label: "shortcuts.leaving", Icon: TimeToLeaveIcon },
  { id: "arriving", label: "shortcuts.arriving", Icon: MeetingRoomIcon },
  { id: "dinner", label: "shortcuts.dinner", Icon: RamenDiningIcon },
  { id: "sleep", label: "shortcuts.sleep", Icon: ModeNightIcon },
];

type Tr = (key: string, vars?: Record<string, string | number>) => string;

const SECTIONS: Record<ShortcutId, string[]> = {
  morning: ["weather", "eventsToday", "meal", "tasks"],
  leaving: ["weather", "nextEvent", "car", "fuel"],
  arriving: ["meal", "tasks"],
  dinner: ["meal"],
  sleep: ["eventTomorrow", "weatherTomorrow", "tasks"],
};

const dayKey = (d: Date) => d.toLocaleDateString("en-CA");

/** Kratek pregled ob dejanju; manjkajoči podatki se preprosto ne prikažejo. */
async function loadSummary(id: ShortcutId, tr: Tr, locale: string): Promise<string[]> {
  const cache = new Map<string, Promise<any>>();
  const data = (url: string) => {
    if (!cache.has(url)) {
      cache.set(url, fetch(url, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null));
    }
    return cache.get(url)!;
  };
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 86_400_000);
  const time = (start: string) =>
    start.includes("T") ? new Date(start).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }) : tr("shortcuts.sum.allDay");
  const events = async (): Promise<{ title: string; start: string }[]> => (await data("/api/calendar"))?.events ?? [];
  const onDay = (list: { start: string }[], d: Date) => list.filter((e) => dayKey(new Date(e.start)) === dayKey(d));

  const sections: Record<string, () => Promise<string | null>> = {
    weather: async () => {
      const w = await data("/api/weather");
      const today = w?.forecast?.[0];
      return w?.current && today ? tr("shortcuts.sum.weather", { now: w.current.temperature, low: today.low, high: today.high }) : null;
    },
    weatherTomorrow: async () => {
      const day = (await data("/api/weather"))?.forecast?.[1];
      return day ? tr("shortcuts.sum.weatherTomorrow", { low: day.low, high: day.high }) : null;
    },
    eventsToday: async () => {
      const today = onDay(await events(), now);
      return today.length
        ? tr("shortcuts.sum.eventsToday", { list: today.map((e: any) => `${time(e.start)} ${e.title}`).join(", ") })
        : tr("shortcuts.sum.noEvents");
    },
    nextEvent: async () => {
      const next = (await events()).find((e) => new Date(e.start) > now);
      return next ? tr("shortcuts.sum.nextEvent", { title: next.title, when: `${new Date(next.start).toLocaleDateString(locale, { weekday: "short" })} ${time(next.start)}` }) : null;
    },
    eventTomorrow: async () => {
      const first = onDay(await events(), tomorrow)[0] as { title: string; start: string } | undefined;
      return first ? tr("shortcuts.sum.tomorrowEvent", { title: first.title, time: time(first.start) }) : tr("shortcuts.sum.noTomorrow");
    },
    meal: async () => {
      const items: { date: string; meal: string }[] = (await data("/api/meals"))?.items ?? [];
      const meals = items.filter((m) => m.date === dayKey(now)).map((m) => m.meal);
      return meals.length ? tr("shortcuts.sum.meal", { meal: meals.join(", ") }) : tr("shortcuts.sum.noMeal");
    },
    tasks: async () => {
      const items: { done?: boolean; completed?: boolean }[] = (await data("/api/tasks"))?.items ?? [];
      return tr("shortcuts.sum.tasks", { n: items.filter((i) => !i.done && !i.completed).length });
    },
    car: async () => {
      const live = (await data("/api/car"))?.live;
      return live?.fuelPercent != null ? tr("shortcuts.sum.car", { fuel: live.fuelPercent, range: live.rangeKm ?? "?" }) : null;
    },
    fuel: async () => {
      const c = (await data("/api/fuel"))?.cheapest;
      return c ? tr("shortcuts.sum.fuel", { name: c.name, price: c.price }) : null;
    },
  };
  const lines = await Promise.all(SECTIONS[id].map((s) => sections[s]()));
  return lines.filter((l): l is string => Boolean(l));
}

export default function Shortcuts() {
  const { t, locale } = useI18n();
  const tr = t as unknown as Tr;
  const [active, setActive] = useState<(typeof ITEMS)[number] | null>(null);
  const [summary, setSummary] = useState<string[] | null>(null);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<StepResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const open = (item: (typeof ITEMS)[number]) => {
    setActive(item);
    setSummary(null);
    setResults(null);
    setError(null);
    void loadSummary(item.id, tr, locale).then(setSummary);
  };

  const run = async () => {
    if (!active) return;
    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/shortcuts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: active.id }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) setResults(body.steps);
      else setError(tr(res.status === 409 ? "shortcuts.busy" : "shortcuts.failed"));
    } catch {
      setError(tr("shortcuts.failed"));
    } finally {
      setRunning(false);
    }
  };

  const stepIcon = (r: StepResult) =>
    r.status === "ok" ? <CheckCircleIcon fontSize="small" color="success" /> : r.status === "skipped" ? <RemoveIcon fontSize="small" color="disabled" /> : <ErrorIcon fontSize="small" color="error" />;

  return (
    <Card sx={{ minHeight: 340 }}>
      <CardContent>
        <Typography variant="subtitle2" color="secondary">
          {tr("shortcuts.overline")}
        </Typography>
        <Typography variant="h6" sx={{ mt: 1, mb: 2, fontWeight: 700 }}>
          {tr("shortcuts.title")}
        </Typography>

        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1 }}>
          {ITEMS.map((item) => (
            <Button
              key={item.id}
              variant="outlined"
              fullWidth
              startIcon={<item.Icon />}
              onClick={() => open(item)}
              sx={{ justifyContent: "flex-start", textTransform: "none", borderRadius: 3, height: 56 }}
            >
              {tr(item.label)}
            </Button>
          ))}
        </Box>
      </CardContent>

      <Dialog open={Boolean(active)} onClose={() => !running && setActive(null)} fullWidth maxWidth="xs">
        {active && (
          <>
            <DialogTitle>{tr(active.label)}</DialogTitle>
            <DialogContent>
              <Typography variant="subtitle2" color="secondary" sx={{ mb: 0.5 }}>
                {tr(results ? "shortcuts.result" : "shortcuts.willDo")}
              </Typography>
              {!results &&
                SHORTCUT_STEPS[active.id].map((key) => (
                  <Typography key={key} variant="body2">
                    • {tr(`shortcuts.step.${key}`)}
                  </Typography>
                ))}
              {results?.map((r) => (
                <Box key={r.key} sx={{ display: "flex", gap: 1, alignItems: "center", mb: 0.5 }}>
                  {stepIcon(r)}
                  <Typography variant="body2">
                    {tr(`shortcuts.step.${r.key}`)}
                    {r.note ? ` – ${tr(`shortcuts.note.${r.note}`)}` : ""}
                  </Typography>
                </Box>
              ))}

              {error && (
                <Alert severity="error" sx={{ mt: 2 }}>
                  {error}
                </Alert>
              )}

              <Typography variant="subtitle2" color="secondary" sx={{ mt: 2, mb: 0.5 }}>
                {tr("shortcuts.info")}
              </Typography>
              {!summary && <CircularProgress size={18} />}
              {summary?.map((line) => (
                <Typography key={line} variant="body2" color="text.secondary">
                  {line}
                </Typography>
              ))}
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setActive(null)} disabled={running}>
                {tr(results ? "common.close" : "common.cancel")}
              </Button>
              {!results && (
                <Button variant="contained" onClick={() => void run()} disabled={running} startIcon={running ? <CircularProgress size={16} color="inherit" /> : undefined}>
                  {tr(running ? "shortcuts.running" : "shortcuts.run")}
                </Button>
              )}
            </DialogActions>
          </>
        )}
      </Dialog>
    </Card>
  );
}
