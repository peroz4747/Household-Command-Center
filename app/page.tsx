import CalendarTodayIcon from "@mui/icons-material/CalendarToday";
import CloudIcon from "@mui/icons-material/Cloud";
import ThermostatIcon from "@mui/icons-material/Thermostat";
import TvIcon from "@mui/icons-material/Tv";
import GarageIcon from "@mui/icons-material/Garage";
import LightbulbIcon from "@mui/icons-material/Lightbulb";
import WifiIcon from "@mui/icons-material/Wifi";
import ArrowForwardIosIcon from "@mui/icons-material/ArrowForwardIos";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import WeatherSummary from "./components/WeatherSummary";
import CalendarTimeline from "./components/CalendarTimeline";
import MealPlanner from "./components/MealPlanner";
import ClientDashboard, { ClimateControl } from "./components/ClientDashboard";
import { Box, Button, Card, CardContent, Chip, Typography, Divider } from "@mui/material";

const cameraZones = [
  { label: "Front", active: false },
  { label: "Street", active: false },
  { label: "Nursery", active: true },
  { label: "Driveway", active: false },
  { label: "Backyard", active: false },
];

const rooms = [
  { name: "Nursery", temp: "20.6", status: "OK", color: "success" },
  { name: "Bedroom", temp: "20.1", status: "Idle", color: "warning" },
  { name: "Kitchen", temp: "18.7", status: "Cool", color: "info" },
  { name: "Living", temp: "18.5", status: "Idle", color: "warning" },
  { name: "Study", temp: "19.3", status: "OK", color: "success" },
];

const shortcuts = [
  { label: "Garage Door", icon: GarageIcon },
  { label: "Back House", icon: SmartToyIcon },
  { label: "TV", icon: TvIcon },
  { label: "Split System", icon: ThermostatIcon },
  { label: "Dining Room", icon: LightbulbIcon },
  { label: "Living Room", icon: LightbulbIcon },
];

export default function Home() {
  return (
    <Box sx={{ minHeight: "100vh", px: { xs: 2, md: 4 }, py: { xs: 3, md: 4 }, background: "linear-gradient(180deg, #07101e 0%, #05101a 100%)" }}>
      <Box sx={{ display: "flex", flexDirection: { xs: "column", md: "row" }, justifyContent: "space-between", alignItems: { xs: "flex-start", md: "center" }, gap: 2, mb: 3 }}>
        <Box>
          <Typography variant="overline" color="secondary" sx={{ letterSpacing: 2 }}>
            HOUSEHOLD COMMAND CENTER
          </Typography>
          <Typography variant="h4" sx={{ mt: 1, fontWeight: 700 }}>
            Smart home summary
          </Typography>
        </Box>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
          <Chip label="Server up" color="success" />
        </Box>
      </Box>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "5fr 3fr 4fr" }, gap: 3, mb: 3 }}>
        <ClientDashboard cameraZones={cameraZones} />

        <Box sx={{ display: "grid", gap: 3 }}>
          <WeatherSummary />

          <ClimateControl />
        </Box>

        <CalendarTimeline />
      </Box>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr 1fr" }, gap: 3 }}>
        <Card sx={{ minHeight: 340 }}>
          <CardContent>
            <Typography variant="subtitle2" color="secondary">
              Rooms
            </Typography>
            <Typography variant="h6" sx={{ mt: 1, mb: 2, fontWeight: 700 }}>
              Environment overview
            </Typography>
            <Box sx={{ display: "grid", gap: 1.5 }}>
              {rooms.map((room) => (
                <Box key={room.name} sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", p: 1.5, bgcolor: "rgba(148,163,184,0.05)", borderRadius: 2 }}>
                  <Box>
                    <Typography sx={{ fontWeight: 700 }}>{room.name}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {room.status}
                    </Typography>
                  </Box>
                  <Chip label={`${room.temp}°`} color={room.color as "success" | "warning" | "info"} size="small" />
                </Box>
              ))}
            </Box>
          </CardContent>
        </Card>

        <Card sx={{ minHeight: 340 }}>
          <CardContent>
            <Typography variant="subtitle2" color="secondary">
              Shortcuts
            </Typography>
            <Typography variant="h6" sx={{ mt: 1, mb: 2, fontWeight: 700 }}>
              Quick actions
            </Typography>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1 }}>
              {shortcuts.map((shortcut) => {
                const Icon = shortcut.icon;
                return (
                  <Button
                    key={shortcut.label}
                    variant="outlined"
                    fullWidth
                    startIcon={<Icon />}
                    sx={{ justifyContent: "flex-start", textTransform: "none", borderRadius: 3, height: 56 }}
                  >
                    {shortcut.label}
                  </Button>
                );
              })}
            </Box>
          </CardContent>
        </Card>

        <Card sx={{ minHeight: 340 }}>
          <CardContent>
            <Typography variant="subtitle2" color="secondary">
              Network & energy
            </Typography>
            <Typography variant="h6" sx={{ mt: 1, mb: 2, fontWeight: 700 }}>
              Home status details
            </Typography>
            <Box sx={{ display: "grid", gap: 2 }}>
              {[
                { title: "13 Lights On", subtitle: "Home lighting load", icon: LightbulbIcon, color: "warning" },
                { title: "Climate Systems Off", subtitle: "19.46° average temp", icon: ThermostatIcon, color: "info" },
                { title: "7HD Melbourne", subtitle: "Live channel", icon: WifiIcon, color: "secondary" },
                { title: "Garage Door", subtitle: "Closed", icon: GarageIcon, color: "success" },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <Box key={item.title} sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", bgcolor: "rgba(148,163,184,0.05)", p: 2, borderRadius: 3 }}>
                    <Box>
                      <Typography sx={{ fontWeight: 700 }}>{item.title}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {item.subtitle}
                      </Typography>
                    </Box>
                    <Icon color={item.color as "inherit" | "primary" | "secondary" | "error" | "info" | "success" | "warning"} />
                  </Box>
                );
              })}
            </Box>
          </CardContent>
        </Card>
      </Box>

      <Box sx={{ mt: 3 }}>
        <MealPlanner />
      </Box>
    </Box>
  );
}

