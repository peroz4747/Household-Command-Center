"use client";

import { useCallback, useEffect, useState } from "react";
import { Chip } from "@mui/material";
import type { NetworkOverview } from "../../lib/network";
import ServerDetailsDialog from "./ServerDetailsDialog";
import { useI18n } from "../i18n";
import type { MessageKey } from "../../lib/i18n";

const REFRESH_MS = 60_000;

const isUp = (status: string) => status === "running" || status === "online";

type State = { kind: "loading" } | { kind: "error" } | { kind: "ok"; up: number; total: number };

// Barva glede na delež delujočih servisov: >= 80 % zelena, 50–79 % rumena, < 50 % rdeča.
function level(percent: number): { label: MessageKey; color: "success" | "warning" | "error" } {
  if (percent >= 80) return { label: "server.up", color: "success" };
  if (percent >= 50) return { label: "server.issues", color: "warning" };
  return { label: "server.down", color: "error" };
}

export default function ServerStatus() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [open, setOpen] = useState(false);
  const { t } = useI18n();

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/network", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as NetworkOverview;
      setState({
        kind: "ok",
        up: data.items.filter((i) => isUp(i.status)).length,
        total: data.items.length,
      });
    } catch {
      setState({ kind: "error" });
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  let chip: { label: string; color?: "success" | "warning" | "error"; title: string };
  if (state.kind === "loading") {
    chip = { label: t("server.loading"), title: t("server.loadingTitle") };
  } else if (state.kind === "error" || state.total === 0) {
    chip = { label: t("server.down"), color: "error", title: t("server.errorTitle") };
  } else {
    const percent = Math.floor((state.up / state.total) * 100);
    const { label, color } = level(percent);
    chip = {
      label: `${t(label)} (${state.up})`,
      color,
      title: t("server.chipTitle", { up: state.up, total: state.total, percent }),
    };
  }

  return (
    <>
      <Chip label={chip.label} color={chip.color} title={chip.title} onClick={() => setOpen(true)} clickable />
      <ServerDetailsDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
