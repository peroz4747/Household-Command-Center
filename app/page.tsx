import ThermostatIcon from "@mui/icons-material/Thermostat";
import GarageIcon from "@mui/icons-material/Garage";
import LightbulbIcon from "@mui/icons-material/Lightbulb";
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
import ServerPower from "./components/ServerPower";
import { Box, Typography } from "@mui/material";
import EnvironmentOverview from "./components/EnvironmentOverview";
import Shortcuts from "./components/Shortcuts";
import NetworkAndEnergy from "./components/NetworkAndEnergy";
import NewsFeed from "./components/NewsFeed";
import NetworkOverview from "./components/NetworkOverview";
import HeaderClock from "./components/HeaderClock";
import UtilityUsage from "./components/UtilityUsage";
import CarStatus from "./components/CarStatus";
import LanguageSwitcher from "./components/LanguageSwitcher";
import { translator } from "../lib/i18n";
import { getLang } from "../lib/i18n/server";

export default async function Home() {
  const t = translator(await getLang());

  const cameraZones = [
    { label: t("room.hallway"), active: false },
    { label: t("room.kitchen"), active: false },
    { label: t("room.livingRoom"), active: true },
    { label: t("room.office"), active: false },
    { label: t("room.bedroom"), active: false },
    { label: t("room.balcony"), active: false },
  ];

  const rooms = [
    { name: t("room.hallway"), temp: "24", status: t("room.status.ok"), color: "success" },
    { name: t("room.kitchen"), temp: "24", status: t("room.status.idle"), color: "success" },
    { name: t("room.livingRoom"), temp: "24", status: t("room.status.cool"), color: "success" },
    { name: t("room.office"), temp: "24", status: t("room.status.idle"), color: "success" },
    { name: t("room.bedroom"), temp: "24", status: t("room.status.ok"), color: "success" },
  ];

  const shortcuts = [
    { label: t("shortcuts.goodMorning"), icon: LightModeIcon },
    { label: t("shortcuts.leaving"), icon: TimeToLeaveIcon },
    { label: t("shortcuts.arriving"), icon: MeetingRoomIcon },
    { label: t("shortcuts.dinner"), icon: RamenDiningIcon },
    { label: t("shortcuts.sleep"), icon: ModeNightIcon },
  ];

  const networkAndEnergyItems = [
    { title: t("home.lights"), subtitle: t("home.lightsOff"), icon: LightbulbIcon, color: "success" },
    { title: t("home.ac"), subtitle: t("home.acOn"), icon: ThermostatIcon, color: "primary" },
  ];

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
            {t("header.overline")}
          </Typography>

          <Typography variant="h4" sx={{ mt: 1, fontWeight: 700 }}>
            {t("header.title")}
          </Typography>
        </Box>
        <Box>
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center", justifyContent: { xs: "center", md: "flex-end" } }}>
            <ServerStatus />
            <NetworkOverview />
            <ServerPower />
          </Box>
        </Box>

        <Box sx={{ display: "flex", flexDirection: "column", alignItems: { xs: "center", md: "flex-end" } }}>
          <HeaderClock />
          <Box sx={{ mt: 1 }}>
            <LanguageSwitcher />
          </Box>
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

            <Shortcuts
              shortcuts={shortcuts}
              overline={t("shortcuts.overline")}
              title={t("shortcuts.title")}
              notConnected={t("common.notConnected")}
            />

            <NetworkAndEnergy
              items={networkAndEnergyItems}
              overline={t("home.overline")}
              title={t("home.title")}
              notConnected={t("common.notConnected")}
            />
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