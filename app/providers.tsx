"use client";

import type { ReactNode } from "react";
import { CssBaseline, ThemeProvider, createTheme } from "@mui/material";
import { useMemo } from "react";

export default function Providers({ children }: { children: ReactNode }) {
  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          mode: "dark",
          background: {
            default: "#07101e",
            paper: "#0f172a",
          },
          primary: {
            main: "#5b8cff",
          },
          secondary: {
            main: "#22c55e",
          },
          text: {
            primary: "#f8fafc",
            secondary: "#94a3b8",
          },
        },
        typography: {
          fontFamily: "var(--font-geist-sans), Inter, Arial, sans-serif",
        },
        shape: {
          borderRadius: 22,
        },
        components: {
          MuiPaper: {
            defaultProps: {
              elevation: 0,
            },
          },
        },
      }),
    []
  );

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}
