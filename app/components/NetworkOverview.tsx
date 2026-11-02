"use client";

import { useCallback, useMemo, useState } from "react";
import CloseIcon from "@mui/icons-material/Close";
import RefreshIcon from "@mui/icons-material/Refresh";
import HubIcon from "@mui/icons-material/Hub";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
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
import type { GuestKind, NetworkItem, NetworkOverview as Overview } from "../../lib/network";
import { useI18n } from "../i18n";

const KINDS: GuestKind[] = ["node", "lxc", "qemu", "docker"];

const kindColor: Record<GuestKind, "primary" | "secondary" | "info" | "warning"> = {
  node: "warning",
  lxc: "primary",
  qemu: "info",
  docker: "secondary",
};

function statusColor(status: string): "success" | "error" | "warning" | "default" {
  if (status === "running" || status === "online") return "success";
  if (status === "stopped" || status === "exited" || status === "offline" || status === "dead") return "error";
  if (status === "paused" || status === "restarting" || status === "created") return "warning";
  return "default";
}

function formatUptime(seconds?: number) {
  if (!seconds) return "–";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatMem(used?: number, max?: number) {
  if (!max) return "–";
  const gb = (b: number) => (b / 1024 ** 3).toFixed(1);
  return `${gb(used ?? 0)} / ${gb(max)} GB`;
}

function AddressCell({ item }: { item: NetworkItem }) {
  if (!item.ips.length) return <Typography variant="body2" color="text.secondary">–</Typography>;
  return (
    <Stack spacing={0.25}>
      {item.ips.map((addr) => (
        <Typography key={addr} variant="body2" sx={{ fontFamily: "var(--font-geist-mono), monospace" }}>
          {addr}
        </Typography>
      ))}
    </Stack>
  );
}

function shortName(item: NetworkItem) {
  return item.name.replace(/^\d+ · /, "").replace(/^household-command-center-/, "");
}

export default function NetworkOverview() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Overview | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [filter, setFilter] = useState<GuestKind | "all">("all");
  const { t, locale } = useI18n();
  const kindLabel = (k: GuestKind) => t(`network.kind.${k}`);

  const load = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch("/api/network", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (e) {
      setFetchError(t("network.loadError", { error: (e as Error).message }));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const handleOpen = () => {
    setOpen(true);
    void load();
  };

  const counts = useMemo(() => {
    const c: Record<GuestKind, number> = { node: 0, lxc: 0, qemu: 0, docker: 0 };
    data?.items.forEach((i) => (c[i.kind] += 1));
    return c;
  }, [data]);

  const running = data?.items.filter((i) => statusColor(i.status) === "success").length ?? 0;
  const visible = data?.items.filter((i) => filter === "all" || i.kind === filter) ?? [];
  const webItems = data?.items.filter((i) => i.webUrl) ?? [];

  return (
    <>
      <Button variant="outlined" size="small" startIcon={<HubIcon fontSize="small" />} onClick={handleOpen}>
        {t("network.button")}
      </Button>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="lg" fullWidth>
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2 }}>
          <Box>
            {t("network.title")}
            {data && (
              <Typography variant="body2" color="text.secondary">
                {t("network.summary", {
                  running,
                  total: data.items.length,
                  time: new Date(data.generatedAt).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
                })}
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
            <IconButton size="small" onClick={() => setOpen(false)} aria-label={t("common.close")}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
        </DialogTitle>

        <DialogContent dividers sx={{ minHeight: "50vh" }}>
          {fetchError && <Alert severity="error" sx={{ mb: 2 }}>{fetchError}</Alert>}
          {data?.errors.map((err) => (
            <Alert key={err} severity="warning" sx={{ mb: 2 }}>
              {err}
            </Alert>
          ))}

          {data && (
            <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: "wrap", rowGap: 1 }}>
              <Chip
                label={t("network.all", { n: data.items.length })}
                onClick={() => setFilter("all")}
                variant={filter === "all" ? "filled" : "outlined"}
              />
              {KINDS
                .filter((k) => counts[k] > 0)
                .map((k) => (
                  <Chip
                    key={k}
                    label={`${kindLabel(k)} (${counts[k]})`}
                    color={kindColor[k]}
                    onClick={() => setFilter(k)}
                    variant={filter === k ? "filled" : "outlined"}
                  />
                ))}
            </Stack>
          )}

          {webItems.length > 0 && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="overline" color="text.secondary">
                {t("network.webInterfaces")}
              </Typography>
              <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1 }}>
                {webItems.map((item) => (
                  <Button
                    key={item.id}
                    component="a"
                    href={item.webUrl}
                    target="_blank"
                    rel="noreferrer"
                    variant="outlined"
                    size="small"
                    color={statusColor(item.status) === "success" ? "primary" : "inherit"}
                    endIcon={<OpenInNewIcon fontSize="small" />}
                  >
                    {shortName(item)}
                  </Button>
                ))}
              </Stack>
            </Box>
          )}

          {loading && !data ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
              <CircularProgress />
            </Box>
          ) : (
            data && (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>{t("network.col.name")}</TableCell>
                      <TableCell>{t("network.col.type")}</TableCell>
                      <TableCell>{t("network.col.status")}</TableCell>
                      <TableCell>{t("network.col.ip")}</TableCell>
                      <TableCell>{t("network.col.ports")}</TableCell>
                      <TableCell>{t("network.col.uptime")}</TableCell>
                      <TableCell>{t("network.col.cpu")}</TableCell>
                      <TableCell>{t("network.col.memory")}</TableCell>
                      <TableCell align="center">{t("network.col.web")}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {visible.map((item) => (
                      <TableRow key={item.id} hover>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>{item.name}</Typography>
                          {item.host && (
                            <Typography variant="caption" color="text.secondary">{item.host}</Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          <Chip size="small" label={kindLabel(item.kind)} color={kindColor[item.kind]} variant="outlined" />
                        </TableCell>
                        <TableCell>
                          <Chip size="small" label={item.status} color={statusColor(item.status)} />
                        </TableCell>
                        <TableCell><AddressCell item={item} /></TableCell>
                        <TableCell>
                          <Typography variant="body2" color={item.ports.length ? "text.primary" : "text.secondary"}>
                            {item.ports.length ? item.ports.join(", ") : "–"}
                          </Typography>
                        </TableCell>
                        <TableCell>{formatUptime(item.uptime)}</TableCell>
                        <TableCell>{item.cpu !== undefined ? `${(item.cpu * 100).toFixed(0)} %` : "–"}</TableCell>
                        <TableCell>{formatMem(item.memUsed, item.memMax)}</TableCell>
                        <TableCell align="center">
                          {item.webUrl ? (
                            <Tooltip title={item.webUrl}>
                              <IconButton
                                size="small"
                                component="a"
                                href={item.webUrl}
                                target="_blank"
                                rel="noreferrer"
                                aria-label={t("network.open", { name: shortName(item) })}
                              >
                                <OpenInNewIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          ) : (
                            <Typography variant="body2" color="text.secondary">–</Typography>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    {!visible.length && (
                      <TableRow>
                        <TableCell colSpan={9} align="center" sx={{ py: 4, color: "text.secondary" }}>
                          {t("network.empty")}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            )
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
