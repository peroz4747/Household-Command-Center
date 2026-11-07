import { Box, Chip } from "@mui/material";
import LinkOffIcon from "@mui/icons-material/LinkOff";
import type { ReactNode } from "react";

/** Oznaka za del dashboarda, ki še nima pravih podatkov ali funkcionalnosti. */
export function NotConnectedChip({ label }: { label: string }) {
  return (
    <Chip
      icon={<LinkOffIcon />}
      label={label}
      size="small"
      variant="outlined"
      sx={{ color: "text.secondary", borderColor: "rgba(148,163,184,0.25)", "& .MuiChip-icon": { color: "inherit" } }}
    />
  );
}

/** Zatemni vsebino in onemogoči klike, da je jasno, da gre za predogled. */
export function Dimmed({ children }: { children: ReactNode }) {
  return (
    <Box aria-disabled sx={{ opacity: 0.4, filter: "grayscale(0.8)", pointerEvents: "none", userSelect: "none" }}>
      {children}
    </Box>
  );
}
