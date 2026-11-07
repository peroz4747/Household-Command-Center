import { Box, Button, Card, CardContent, Typography } from "@mui/material";
import { Dimmed, NotConnectedChip } from "./NotConnected";

type Shortcut = {
  label: string;
  icon: React.ElementType;
};

export default function Shortcuts({
  shortcuts,
  overline,
  title,
  notConnected,
}: {
  shortcuts: Shortcut[];
  overline: string;
  title: string;
  notConnected: string;
}) {
  return (
    <Card sx={{ minHeight: 340 }}>
      <CardContent>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 1 }}>
          <Typography variant="subtitle2" color="secondary">
            {overline}
          </Typography>
          <NotConnectedChip label={notConnected} />
        </Box>

        <Typography variant="h6" sx={{ mt: 1, mb: 2, fontWeight: 700 }}>
          {title}
        </Typography>

        {/* Bližnjice še ne sprožijo ničesar. */}
        <Dimmed>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "1fr",
                sm: "1fr 1fr",
              },
              gap: 1,
            }}
          >
            {shortcuts.map((shortcut) => {
              const Icon = shortcut.icon;
              return (
                <Button
                  key={shortcut.label}
                  variant="outlined"
                  fullWidth
                  disabled
                  startIcon={<Icon />}
                  sx={{
                    justifyContent: "flex-start",
                    textTransform: "none",
                    borderRadius: 3,
                    height: 56,
                  }}
                >
                  {shortcut.label}
                </Button>
              );
            })}
          </Box>
        </Dimmed>
      </CardContent>
    </Card>
  );
}
