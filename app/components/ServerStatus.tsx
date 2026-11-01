"use client";

import { useCallback, useEffect, useState } from "react";
import { Chip } from "@mui/material";
import type { NetworkOverview } from "../../lib/network";

const REFRESH_MS = 60_000;

const isUp = (status: string) => status === "running" || status === "online";

type State =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ok"; up: number; total: number; hasErrors: boolean };

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
        hasErrors: data.errors.length > 0,
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
  if (state.kind === "error" || state.up === 0) {
    return <Chip label={state.kind === "ok" ? `Server down (0)` : "Server down"} color="error" />;
  }

  const allUp = state.up === state.total && !state.hasErrors;
  return (
    <Chip
      label={`${allUp ? "Server up" : "Server issues"} (${state.up})`}
      color={allUp ? "success" : "warning"}
      title={`${state.up} of ${state.total} services online/running`}
    />
  );
}
