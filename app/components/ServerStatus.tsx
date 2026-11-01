"use client";

import { useCallback, useEffect, useState } from "react";
import { Chip } from "@mui/material";
import type { NetworkOverview } from "../../lib/network";

const REFRESH_MS = 60_000;

const isUp = (status: string) => status === "running" || status === "online";

type State = { kind: "loading" } | { kind: "error" } | { kind: "ok"; up: number; total: number };

// Barva glede na delež delujočih servisov: >= 80 % zelena, 50–79 % rumena, < 50 % rdeča.
function level(percent: number) {
  if (percent >= 80) return { label: "Server up", color: "success" as const };
  if (percent >= 50) return { label: "Server issues", color: "warning" as const };
  return { label: "Server down", color: "error" as const };
}

export default function ServerStatus() {
  const [state, setState] = useState<State>({ kind: "loading" });

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

  if (state.kind === "loading") return <Chip label="Server …" />;
  if (state.kind === "error" || state.total === 0) {
    return <Chip label="Server down" color="error" title="Unable to load service status" />;
  }

  const percent = Math.floor((state.up / state.total) * 100);
  const { label, color } = level(percent);
  return (
    <Chip
      label={`${label} (${state.up})`}
      color={color}
      title={`${state.up} of ${state.total} services online/running (${percent} %)`}
    />
  );
}
