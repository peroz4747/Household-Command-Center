"use client";

import { Fragment, useCallback, useEffect, useState, type ReactNode } from "react";
import CloseIcon from "@mui/icons-material/Close";
import RefreshIcon from "@mui/icons-material/Refresh";
import HealthAndSafetyIcon from "@mui/icons-material/HealthAndSafety";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import ErrorIcon from "@mui/icons-material/Error";
import InfoIcon from "@mui/icons-material/Info";
import RemoveCircleOutlineIcon from "@mui/icons-material/RemoveCircleOutlined";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  LinearProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import type { CheckStatus, HealthReport, ServerDetails, TaskEntry } from "../../lib/server";
import { useI18n } from "../i18n";
import type { MessageKey } from "../../lib/i18n";

const REFRESH_MS = 10_000;
const mono = { fontFamily: "var(--font-geist-mono), monospace" };

/* ---------------- Pomožne ---------------- */

type Level = "success" | "warning" | "error";

const levelFor = (value: number, warn: number, fail: number): Level =>
  value >= fail ? "error" : value >= warn ? "warning" : "success";

function formatBytes(bytes: number) {
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatUptime(seconds: number) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return d ? `${d}d ${h}h ${m}m` : h ? `${h}h ${m}m` : `${m}m`;
}

const formatTime = (unix: number, locale: string) =>
  new Date(unix * 1000).toLocaleString(locale, {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "Europe/Ljubljana",
  });

function taskDuration(t: TaskEntry, running: string) {
  if (!t.end) return running;
  const s = t.end - t.start;
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

function taskStatusColor(t: TaskEntry): "success" | "error" | "warning" | "info" {
  if (!t.status) return "info";
  if (t.status === "OK") return "success";
  if (t.status.startsWith("WARNINGS")) return "warning";
  return "error";
}

const checkIcon: Record<CheckStatus, ReactNode> = {
  ok: <CheckCircleIcon fontSize="small" color="success" />,
  info: <InfoIcon fontSize="small" color="info" />,
  warn: <WarningAmberIcon fontSize="small" color="warning" />,
  fail: <ErrorIcon fontSize="small" color="error" />,
  skip: <RemoveCircleOutlineIcon fontSize="small" color="disabled" />,
};

const overallText: Record<CheckStatus, { text: MessageKey; severity: "success" | "info" | "warning" | "error" }> = {
  ok: { text: "sd.overall.ok", severity: "success" },
  info: { text: "sd.overall.ok", severity: "success" },
  skip: { text: "sd.overall.ok", severity: "success" },
  warn: { text: "sd.overall.warn", severity: "warning" },
  fail: { text: "sd.overall.fail", severity: "error" },
};

/* ---------------- Gradniki ---------------- */

function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <Paper variant="outlined" sx={{ p: 2, backgroundColor: "rgba(255,255,255,0.02)" }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1.5, gap: 1 }}>
        <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.5 }}>
          {title}
        </Typography>
        {action}
      </Box>
      {children}
    </Paper>
  );
}

function Gauge({ label, percent, caption, warn, fail }: { label: string; percent: number; caption: string; warn: number; fail: number }) {
  const color = levelFor(percent, warn, fail);
  return (
    <Paper variant="outlined" sx={{ p: 2, textAlign: "center", backgroundColor: "rgba(255,255,255,0.02)" }}>
      <Box sx={{ position: "relative", display: "inline-flex" }}>
        <CircularProgress variant="determinate" value={100} size={88} thickness={4} sx={{ color: "rgba(255,255,255,0.08)" }} />
        <CircularProgress
          variant="determinate"
          value={Math.min(percent, 100)}
          size={88}
          thickness={4}
          color={color}
          sx={{ position: "absolute", left: 0 }}
        />
        <Box sx={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            {percent.toFixed(0)}%
          </Typography>
        </Box>
      </Box>
      <Typography variant="subtitle2" sx={{ mt: 1 }}>
        {label}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {caption}
      </Typography>
    </Paper>
  );
}

function UsageBar({ label, sub, used, total, percent }: { label: string; sub?: string; used: number; total: number; percent: number }) {
  return (
    <Box>
      <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1 }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {label}
          {sub && (
            <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
              {sub}
            </Typography>
          )}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {formatBytes(used)} / {formatBytes(total)} · {percent.toFixed(0)}%
        </Typography>
      </Box>
      <LinearProgress
        variant="determinate"
        value={Math.min(percent, 100)}
        color={levelFor(percent, 80, 90)}
        sx={{ height: 8, borderRadius: 4, mt: 0.5 }}
      />
    </Box>
  );
}

function TempChip({ label, temp, warn, fail }: { label: string; temp?: number; warn: number; fail: number }) {
  const { t } = useI18n();
  return (
    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1, py: 0.5 }}>
      <Typography variant="body2" sx={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {label}
      </Typography>
      {temp === undefined ? (
        <Chip size="small" label={t("common.na")} />
      ) : (
        <Chip size="small" label={`${temp.toFixed(0)} °C`} color={levelFor(temp, warn, fail)} variant="outlined" />
      )}
    </Box>
  );
}

function TaskRow({ task }: { task: TaskEntry }) {
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { t, locale } = useI18n();

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && !lines) {
      try {
        const res = await fetch(`/api/server/task-log?upid=${encodeURIComponent(task.upid)}`, { cache: "no-store" });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        setLines(body.lines);
      } catch (e) {
        setError((e as Error).message);
      }
    }
  };

  return (
    <Fragment>
      <TableRow hover onClick={() => void toggle()} sx={{ cursor: "pointer", "& > td": { borderBottom: open ? "none" : undefined } }}>
        <TableCell padding="checkbox">
          <IconButton size="small" aria-label={open ? t("sd.hideLog") : t("sd.showLog")}>
            {open ? <KeyboardArrowUpIcon fontSize="small" /> : <KeyboardArrowDownIcon fontSize="small" />}
          </IconButton>
        </TableCell>
        <TableCell sx={{ whiteSpace: "nowrap" }}>{formatTime(task.start, locale)}</TableCell>
        <TableCell>{task.type}</TableCell>
        <TableCell>{task.id || "–"}</TableCell>
        <TableCell>{task.user}</TableCell>
        <TableCell>{taskDuration(task, t("sd.running"))}</TableCell>
        <TableCell>
          <Chip size="small" label={task.status ?? t("sd.running")} color={taskStatusColor(task)} variant="outlined" />
        </TableCell>
      </TableRow>
      <TableRow>
        <TableCell colSpan={7} sx={{ py: 0 }}>
          <Collapse in={open} unmountOnExit>
            <Box
              component="pre"
              sx={{
                ...mono,
                fontSize: 12,
                m: 0,
                my: 1,
                p: 1.5,
                maxHeight: 260,
                overflow: "auto",
                borderRadius: 1,
                backgroundColor: "rgba(0,0,0,0.35)",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
              }}
            >
              {error ? t("sd.logError", { error }) : lines ? lines.join("\n") || t("sd.emptyLog") : t("common.loading")}
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </Fragment>
  );
}

function HealthCheckPanel() {
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<HealthReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { t, locale } = useI18n();

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/server/health", { method: "POST", cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setReport(await res.json());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <Section
      title={t("sd.health")}
      action={
        <Button
          variant="contained"
          size="small"
          startIcon={running ? <CircularProgress size={16} color="inherit" /> : <HealthAndSafetyIcon fontSize="small" />}
          onClick={() => void run()}
          disabled={running}
        >
          {running ? t("sd.healthRunning") : report ? t("sd.healthAgain") : t("sd.healthRun")}
        </Button>
      }
    >
      {error && <Alert severity="error">{t("sd.healthFailed", { error })}</Alert>}
      {!report && !error && (
        <Typography variant="body2" color="text.secondary">
          {t("sd.healthIntro")}
        </Typography>
      )}
      {report && (
        <>
          <Alert severity={overallText[report.overall].severity} sx={{ mb: 1.5 }}>
            {t(overallText[report.overall].text)}{" "}
            <Typography component="span" variant="caption" color="text.secondary">
              ({new Date(report.generatedAt).toLocaleTimeString(locale, { timeZone: "Europe/Ljubljana" })})
            </Typography>
          </Alert>
          <Stack spacing={0.5}>
            {report.checks.map((c, i) => (
              <Box key={`${c.label}-${i}`} sx={{ display: "flex", gap: 1, alignItems: "flex-start" }}>
                <Box sx={{ pt: 0.25 }}>{checkIcon[c.status]}</Box>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {c.label}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ wordBreak: "break-word" }}>
                    {c.detail}
                  </Typography>
                </Box>
                {c.action && (
                  <Button
                    size="small"
                    variant="outlined"
                    href={c.action.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    sx={{ ml: "auto", flexShrink: 0, alignSelf: "center" }}
                  >
                    {c.action.label}
                  </Button>
                )}
              </Box>
            ))}
          </Stack>
        </>
      )}
    </Section>
  );
}

/* ---------------- Dialog ---------------- */

export default function ServerDetailsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [data, setData] = useState<ServerDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { t } = useI18n();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/server", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setData(body);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const first = setTimeout(() => void load(), 0);
    const id = setInterval(() => void load(), REFRESH_MS);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [open, load]);

  const cpuMax = data?.cpuTemps?.length ? Math.max(...data.cpuTemps.map((t) => t.temp)) : undefined;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2 }}>
        <Box>
          {t("sd.title", { node: data?.node ?? "" })}
          {data && (
            <Typography variant="body2" color="text.secondary">
              {data.pveVersion.split("/").slice(0, 2).join(" ")} · {data.kernel} · {t("sd.up", { time: formatUptime(data.uptime) })}
            </Typography>
          )}
        </Box>
        <Box>
          <Tooltip title={t("common.refresh")}>
            <span>
              <IconButton size="small" onClick={() => void load()} disabled={loading} aria-label={t("common.refresh")}>
                <RefreshIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <IconButton size="small" onClick={onClose} aria-label={t("common.close")}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent dividers sx={{ minHeight: "50vh" }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {t("sd.loadError", { error })}
          </Alert>
        )}
        {data?.errors.map((e) => (
          <Alert key={e} severity="warning" sx={{ mb: 2 }}>
            {e}
          </Alert>
        ))}

        {!data && !error ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
            <CircularProgress />
          </Box>
        ) : (
          data && (
            <Stack spacing={2}>
              {/* Gauges */}
              <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" } }}>
                <Gauge
                  label="CPU"
                  percent={data.cpu.percent}
                  caption={t("sd.threadsLoad", { n: data.cpu.cores, load: data.cpu.loadavg[0].toFixed(2) })}
                  warn={80}
                  fail={95}
                />
                <Gauge
                  label="RAM"
                  percent={data.memory.percent}
                  caption={`${formatBytes(data.memory.used)} / ${formatBytes(data.memory.total)}`}
                  warn={85}
                  fail={95}
                />
                {data.pools[0] ? (
                  <Gauge
                    label={`ZFS ${data.pools[0].name}`}
                    percent={data.pools[0].percent}
                    caption={`${formatBytes(data.pools[0].used)} / ${formatBytes(data.pools[0].total)}`}
                    warn={80}
                    fail={90}
                  />
                ) : (
                  <Gauge
                    label="Swap"
                    percent={data.swap.percent}
                    caption={`${formatBytes(data.swap.used)} / ${formatBytes(data.swap.total)}`}
                    warn={50}
                    fail={80}
                  />
                )}
                <Paper variant="outlined" sx={{ p: 2, textAlign: "center", backgroundColor: "rgba(255,255,255,0.02)" }}>
                  <Box sx={{ height: 88, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Typography variant="h4" sx={{ fontWeight: 700 }} color={cpuMax !== undefined ? `${levelFor(cpuMax, 80, 90)}.main` : "text.secondary"}>
                      {cpuMax !== undefined ? `${cpuMax.toFixed(0)}°C` : t("common.na")}
                    </Typography>
                  </Box>
                  <Typography variant="subtitle2" sx={{ mt: 1 }}>
                    {t("sd.cpuTemp")}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {cpuMax !== undefined ? t("sd.hottest") : t("sd.noHostSensor")}
                  </Typography>
                </Paper>
              </Box>

              <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "3fr 2fr" } }}>
                {/* Storage */}
                <Section title={t("sd.storage")}>
                  <Stack spacing={1.5}>
                    {data.pools.map((p) => (
                      <UsageBar key={`pool-${p.name}`} label={p.name} sub={`ZFS · ${p.health}`} used={p.used} total={p.total} percent={p.percent} />
                    ))}
                    {data.storages.map((s) => (
                      <UsageBar key={s.name} label={s.name} sub={s.type} used={s.used} total={s.total} percent={s.percent} />
                    ))}
                  </Stack>
                </Section>

                {/* Temperatures */}
                <Section title={t("sd.temperatures")}>
                  {data.cpuTemps?.length ? (
                    <Box sx={{ mb: 1.5 }}>
                      {data.cpuTemps.map((t) => (
                        <TempChip key={t.label} label={t.label} temp={t.temp} warn={80} fail={90} />
                      ))}
                    </Box>
                  ) : (
                    <Typography variant="caption" color="text.secondary" component="p" sx={{ mb: 1 }}>
                      {t("sd.noCpuTemps")}
                    </Typography>
                  )}
                  {data.disks.map((d) => {
                    const [warn, fail] = d.type === "ssd" || d.type === "nvme" ? [60, 70] : [50, 55];
                    return (
                      <TempChip
                        key={d.device}
                        label={`${d.device.replace("/dev/", "")} · ${d.model} (${formatBytes(d.size)})`}
                        temp={d.temp}
                        warn={warn}
                        fail={fail}
                      />
                    );
                  })}
                </Section>
              </Box>

              <HealthCheckPanel />

              {/* Tasks */}
              <Section title={t("sd.tasks")}>
                <TableContainer sx={{ maxHeight: 420 }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell padding="checkbox" />
                        <TableCell>{t("sd.col.started")}</TableCell>
                        <TableCell>{t("sd.col.type")}</TableCell>
                        <TableCell>{t("sd.col.id")}</TableCell>
                        <TableCell>{t("sd.col.user")}</TableCell>
                        <TableCell>{t("sd.col.duration")}</TableCell>
                        <TableCell>{t("sd.col.status")}</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {data.tasks.map((t) => (
                        <TaskRow key={t.upid} task={t} />
                      ))}
                      {!data.tasks.length && (
                        <TableRow>
                          <TableCell colSpan={7} align="center" sx={{ py: 4, color: "text.secondary" }}>
                            {t("sd.noTasks")}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Section>
            </Stack>
          )
        )}
      </DialogContent>
    </Dialog>
  );
}
