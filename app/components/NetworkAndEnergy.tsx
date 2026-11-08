import { Box, Card, CardContent, Typography } from "@mui/material";
import InternetStatus from "./InternetStatus";
import TvStatusRow from "./TvStatusRow";
import PcPower from "./PcPower";
import { Dimmed, NotConnectedChip } from "./NotConnected";

type Item = { title: string; subtitle: string; icon: React.ElementType; color: string };

export default function NetworkAndEnergy({
  items,
  overline,
  title,
  notConnected,
}: {
  items: Item[];
  overline: string;
  title: string;
  notConnected: string;
}) {
  return (
    <Card sx={{ minHeight: 340 }}>
      <CardContent>
        <Typography variant="subtitle2" color="secondary">
          {overline}
        </Typography>

        <Typography variant="h6" sx={{ mt: 1, mb: 2, fontWeight: 700 }}>
          {title}
        </Typography>

        <Box sx={{ display: "grid", gap: 2 }}>
          {/* Vrstici s pravimi podatki. */}
          <InternetStatus />
          <TvStatusRow />
          <PcPower />

          {/* Luči in klima še niso povezane z ničemer. */}
          <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 0.5, mb: -1 }}>
            <NotConnectedChip label={notConnected} />
          </Box>
          <Dimmed>
            <Box sx={{ display: "grid", gap: 2 }}>
              {items.map((item) => {
                const Icon = item.icon;
                return (
                  <Box
                    key={item.title}
                    sx={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      bgcolor: "rgba(148,163,184,0.05)",
                      p: 2,
                      borderRadius: 3,
                    }}
                  >
                    <Box>
                      <Typography sx={{ fontWeight: 700 }}>{item.title}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {item.subtitle}
                      </Typography>
                    </Box>
                    <Icon color={item.color as "primary" | "success"} />
                  </Box>
                );
              })}
            </Box>
          </Dimmed>
        </Box>
      </CardContent>
    </Card>
  );
}
