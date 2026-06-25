"use client";

import { useMemo, useState } from "react";
import CloseIcon from "@mui/icons-material/Close";
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
} from "@mui/material";

type ServerStatusProps = {
  status: 0 | 1 | 2;
  dashboardUrl?: string;
};

const statusMap = {
  0: { label: "Server down", color: "error" as const },
  1: { label: "Server up", color: "success" as const },
  2: { label: "Server issues", color: "warning" as const },
};

export default function ServerStatus({
  status,
  dashboardUrl = "https://grafana.home/public-dashboards/f59310fe04234c6182ff0ac56a214e1c?orgId=1&kiosk",
}: ServerStatusProps) {
  const [open, setOpen] = useState(false);
  const statusInfo = statusMap[status];

  const iframeUrl = useMemo(() => {
    const url = new URL(dashboardUrl);
    url.searchParams.set("kiosk", "");
    return url.toString();
  }, [dashboardUrl]);

  return (
    <>
        <Box
        sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 1,
        }}
        >
            <Chip label={statusInfo.label} color={statusInfo.color} />
            <Button
                variant="outlined"
                size="small"
                onClick={() => setOpen(true)}
            >
                Server status
            </Button>
        </Box>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="xl" fullWidth>
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          Server status dashboard

          <IconButton size="small" onClick={() => setOpen(false)} aria-label="Close">
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>

        <DialogContent dividers sx={{ p: 0, height: "75vh", overflow: "hidden" }}>
          <Box
            component="iframe"
            src={iframeUrl}
            title="Grafana Server Status Dashboard"
            allowFullScreen
            sx={{
              display: "block",
              width: "100%",
              height: "100%",
              border: 0,
            }}
          />
        </DialogContent>

        <DialogActions sx={{ px: 2, py: 1 }}>
          <Button component="a" href={dashboardUrl} target="_blank" rel="noreferrer" size="small">
            Open in Grafana
          </Button>

          <Button onClick={() => setOpen(false)} size="small">
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}