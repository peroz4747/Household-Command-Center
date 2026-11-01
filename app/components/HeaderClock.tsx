"use client";

import { useSyncExternalStore } from "react";
import { Typography } from "@mui/material";

// Uro izrišemo v brskalniku in jo osvežujemo vsako sekundo. Na strežniku
// (kontejner teče v UTC) bi bil čas napačen in zamrznjen ob renderju.
const TIME_ZONE = "Europe/Ljubljana";

function subscribe(onChange: () => void) {
  const id = setInterval(onChange, 1000);
  return () => clearInterval(id);
}

// Vrnemo string (ne Date), da useSyncExternalStore re-renderira samo ob spremembi minute.
const getSnapshot = () => String(Math.floor(Date.now() / 60_000));
const getServerSnapshot = () => null;

export default function HeaderClock() {
  const minute = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const now = minute ? new Date(Number(minute) * 60_000) : null;

  return (
    <>
      <Typography variant="h6" color="text.secondary" suppressHydrationWarning>
        {now ? now.toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit", timeZone: TIME_ZONE }) : "--:--"}
      </Typography>
      <Typography variant="body2" color="text.secondary" suppressHydrationWarning>
        {now
          ? now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: TIME_ZONE })
          : " "}
      </Typography>
    </>
  );
}
