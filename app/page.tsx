import ThermostatIcon from "@mui/icons-material/Thermostat";
import GarageIcon from "@mui/icons-material/Garage";
import LightbulbIcon from "@mui/icons-material/Lightbulb";
import WifiIcon from "@mui/icons-material/Wifi";
import LightModeIcon from "@mui/icons-material/LightMode";
import TimeToLeaveIcon from "@mui/icons-material/TimeToLeave";
import MeetingRoomIcon from "@mui/icons-material/MeetingRoom";
import RamenDiningIcon from "@mui/icons-material/RamenDining";
import ModeNightIcon from "@mui/icons-material/ModeNight";
import WeatherSummary from "./components/WeatherSummary";
import CalendarTimeline from "./components/CalendarTimeline";
import MealPlanner from "./components/MealPlanner";
import ClientDashboard, { ClimateControl } from "./components/ClientDashboard";
import ServerStatus from "./components/ServerStatus";
import { Box, Typography } from "@mui/material";
import EnvironmentOverview from "./components/EnvironmentOverview";
import Shortcuts from "./components/Shortcuts";
import NetworkAndEnergy from "./components/NetworkAndEnergy";
import NewsFeed from "./components/NewsFeed";
import NetworkOverview from "./components/NetworkOverview";
import HeaderClock from "./components/HeaderClock";
import UtilityUsage from "./components/UtilityUsage";
import CarStatus from "./components/CarStatus";

const cameraZones = [
  { label: "Hallway", active: false },
  { label: "Kitchen", active: false },
  { label: "Living room", active: true },
  { label: "Office", active: false },
  { label: "Bedroom", active: false },
  { label: "Balcony", active: false },
];

const rooms = [
  { name: "Hallway", temp: "24", status: "OK", color: "success" },
  { name: "Kitchen", temp: "24", status: "Idle", color: "success" },
  { name: "Living room", temp: "24", status: "Cool", color: "success" },
  { name: "Office", temp: "24", status: "Idle", color: "success" },
  { name: "Bedroom", temp: "24", status: "OK", color: "success" },
];

const shortcuts = [
  { label: "Good morning", icon: LightModeIcon },
  { label: "Leaving home", icon: TimeToLeaveIcon },
  { label: "Arriving home", icon: MeetingRoomIcon },
  { label: "Dinner", icon: RamenDiningIcon },
  { label: "Going to sleep", icon: ModeNightIcon },
];

const networkAndEnergyItems = [
  { title: "Lights", subtitle: "All lights are off", icon: LightbulbIcon, color: "success" },
  { title: "AC", subtitle: "AC is on", icon: ThermostatIcon, color: "primary" },
  { title: "Wi-Fi", subtitle: "Wi-Fi is online", icon: WifiIcon, color: "success" },
];

export default function Home() {
  return (
    <Box
      sx={{
        minHeight: "100vh",
        px: { xs: 2, md: 4 },
        py: { xs: 3, md: 4 },
        background: "linear-gradient(180deg, #07101e 0%, #05101a 100%)",
      }}
    >
      {/* HEADER */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "30vw auto 10vw" },
          gap: 2,
          mb: 3,
          width: "100%",
          alignItems: "center",
        }}
      >
        <Box>
          <Typography variant="overline" color="secondary" sx={{ letterSpacing: 2 }}>
            HOUSEHOLD COMMAND CENTER
          </Typography>

          <Typography variant="h4" sx={{ mt: 1, fontWeight: 700 }}>
            Smart home summary
          </Typography>
        </Box>
        <Box>
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", justifyContent: { xs: "center", md: "flex-end" } }}>
            <ServerStatus />
            <NetworkOverview />
          </Box>
        </Box>

        <Box sx={{ display: "flex", flexDirection: "column", alignItems: { xs: "center", md: "flex-end" } }}>
          <HeaderClock />
        </Box>
      </Box>

      {/* PAGE GRID */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            lg: "minmax(0, 1fr) 420px",
          },
          gap: 3,
          alignItems: "start",
        }}
      >
        {/* MAIN CONTENT */}
        <Box sx={{ minWidth: 0 }}>
          {/* TOP ROW */}
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "1fr",
                md: "5fr 3fr",
              },
              gap: 3,
              mb: 3,
            }}
          >
            <ClientDashboard cameraZones={cameraZones} />

            <Box sx={{ display: "grid", gap: 3 }}>
              <WeatherSummary />
              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 3 }}>
                <ClimateControl />
                <UtilityUsage />
              </Box>
            </Box>
          </Box>

          {/* MIDDLE ROW */}
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "1fr",
                md: "1fr 1fr 1fr",
              },
              gap: 3,
            }}
          >
            <EnvironmentOverview rooms={rooms} />

            <Shortcuts shortcuts={shortcuts} />

            <NetworkAndEnergy items={networkAndEnergyItems} />
          </Box>

          {/* AVTO */}
          <Box sx={{ mt: 3 }}>
            <CarStatus />
          </Box>

          {/* MEAL PLANNER */}
          <Box sx={{ mt: 3 }}>
            <MealPlanner />
          </Box>
        </Box>

        {/* RIGHT SIDEBAR */}
        <Box
          sx={{
            height: {
              xs: "auto",
              lg: "100%",
            },
            top: 24,
            overflow: "hidden",
          }}
        >
          <CalendarTimeline />
        </Box>
      </Box>

      {/* FULL WIDTH NEWS SECTION */}
      <Box sx={{ mt: 4 }}>
        <Box sx={{ width: "100vw", ml: "calc(50% - 50vw)", backgroundColor: "rgba(255,255,255,0.03)", py: 3 }}>
          <Box sx={{ maxWidth: 1200, mx: "auto", px: 2 }}>
            <NewsFeed />
          </Box>
        </Box>
      </Box>

    </Box>
  );
}