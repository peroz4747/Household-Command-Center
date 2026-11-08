"use client";

import { useEffect, useState } from "react";
import { Chip, Tooltip } from "@mui/material";
import { useI18n } from "../i18n";
import { currentTariff } from "../../lib/networkTariff";

/** Trenutna tarifa (VT/MT) in časovni blok omrežnine. */
export default function TariffChip() {
  const { t } = useI18n();
  const tr = t as unknown as (key: string, vars?: Record<string, string | number>) => string;
  const [now, setNow] = useState<ReturnType<typeof currentTariff> | null>(null);

  useEffect(() => {
    const update = () => setNow(currentTariff(new Date()));
    update();
    const id = setInterval(update, 60_000);
    return () => clearInterval(id);
  }, []);

  if (!now) return null;
  return (
    <Tooltip title={tr("tariff.tooltip")}>
      <Chip
        size="small"
        variant="outlined"
        color={now.tariff === "VT" ? "warning" : "success"}
        label={tr(now.tariff === "VT" ? "tariff.high" : "tariff.low", { block: now.block })}
        sx={{ height: 20, fontSize: 11 }}
      />
    </Tooltip>
  );
}
