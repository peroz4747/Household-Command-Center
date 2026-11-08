"use client";

import { useEffect, useState } from "react";
import { Alert } from "@mui/material";
import { useI18n } from "../i18n";
import type { BackupStatus } from "../../lib/backups";

/** Opozorilo ali potrditev stanja varnostnih kopij v podrobnostih strežnika. */
export default function ServerBackups() {
  const { t, locale } = useI18n();
  const tr = t as unknown as (key: string, vars?: Record<string, string | number>) => string;
  const [data, setData] = useState<BackupStatus | null>(null);

  useEffect(() => {
    fetch("/api/server/backups", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => {});
  }, []);

  if (!data) return null;
  const date = data.lastAt ? new Date(data.lastAt * 1000).toLocaleString(locale) : "";
  const stale = data.lastAt !== null && Date.now() / 1000 - data.lastAt > 8 * 86_400;
  let severity: "success" | "warning" | "error" = "success";
  let text = tr("backups.ok", { date });
  if (data.enabledJobs === 0) {
    severity = "error";
    text = tr("backups.none");
  } else if (data.lastOk === null) {
    severity = "warning";
    text = tr("backups.never");
  } else if (!data.lastOk) {
    severity = "error";
    text = tr("backups.failed", { date });
  } else if (stale) {
    severity = "warning";
    text = tr("backups.stale", { date });
  }
  return (
    <Alert severity={severity} sx={{ mb: 2 }}>
      {text}
    </Alert>
  );
}
