"use client";

import { useEffect, useState } from "react";
import { Box, Button, Card, CardContent, CircularProgress, Typography, Divider } from "@mui/material";
import WbSunnyIcon from "@mui/icons-material/WbSunny";
import CloudIcon from "@mui/icons-material/Cloud";
import AcUnitIcon from "@mui/icons-material/AcUnit";
import FlashOnIcon from "@mui/icons-material/FlashOn";

interface ForecastItem {
  date: string;
  high: number;
  low: number;
  weathercode: number;
}

interface WeatherPayload {
  current: {
    temperature: number;
    windspeed: number;
    weathercode: number;
    description: string;
  };
  forecast: ForecastItem[];
}

const getWeatherIcon = (weathercode: number) => {
  if (weathercode === 0) return <WbSunnyIcon sx={{ fontSize: 48, color: "#facc15" }} />;
  if (weathercode === 1 || weathercode === 2) return <CloudIcon sx={{ fontSize: 48, color: "#94a3b8" }} />;
  if (weathercode === 3) return <CloudIcon sx={{ fontSize: 48, color: "#64748b" }} />;
  if (weathercode === 45 || weathercode === 48) return <CloudIcon sx={{ fontSize: 48, color: "#cbd5e1" }} />;
  if (weathercode >= 51 && weathercode <= 67) return <CloudIcon sx={{ fontSize: 48, color: "#0ea5e9" }} />;
  if (weathercode >= 71 && weathercode <= 86) return <AcUnitIcon sx={{ fontSize: 48, color: "#06b6d4" }} />;
  if (weathercode >= 80 && weathercode <= 82) return <CloudIcon sx={{ fontSize: 48, color: "#3b82f6" }} />;
  if (weathercode >= 85 && weathercode <= 86) return <AcUnitIcon sx={{ fontSize: 48, color: "#1e40af" }} />;
  if (weathercode >= 95 && weathercode <= 99) return <FlashOnIcon sx={{ fontSize: 48, color: "#f59e0b" }} />;
  return <CloudIcon sx={{ fontSize: 48, color: "#94a3b8" }} />;
};

export default function WeatherSummary() {
  const [weather, setWeather] = useState<WeatherPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    fetch("/api/weather")
      .then((res) => res.json())
      .then((data) => {
        if (!mounted) return;
        if (data.error) {
          setError(data.error);
        } else {
          setWeather(data);
        }
      })
      .catch(() => setError("Unable to load weather data."))
      .finally(() => mounted && setLoading(false));

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <Card sx={{ minHeight: 205, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
      <CardContent>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Box>
            <Typography variant="subtitle2" color="secondary">
              Weather
            </Typography>
            <Typography variant="h5" sx={{ mt: 1, fontWeight: 700 }}>
              Maribor
            </Typography>
          </Box>
          {loading ? <CircularProgress size={32} color="inherit" /> : weather ? getWeatherIcon(weather.current.weathercode) : null}
        </Box>

        {error ? (
          <Typography color="error" sx={{ mt: 3 }}>
            {error}
          </Typography>
        ) : (
          <>
            <Typography variant="h2" sx={{ mt: 2, fontWeight: 700 }}>
              {weather ? `${Math.round(weather.current.temperature)}°` : "—"}
            </Typography>
            <Typography color="text.secondary" sx={{ mt: 1, fontSize: 14 }}>
              {weather ? `${weather.current.description} • Wind ${Math.round(weather.current.windspeed)} km/h` : ""}
            </Typography>
          </>
        )}
      </CardContent>
      <Box sx={{ px: 3, pb: 3 }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", mt: 1, gap: 1 }}>
          {(weather?.forecast ?? []).slice(0, 4).map((item) => (
            <Box key={item.date} sx={{ textAlign: "center", flex: 1 }}>
              <Typography variant="subtitle2" color="text.secondary" sx={{ fontSize: 12 }}>
                {new Date(item.date).toLocaleDateString("en-US", { weekday: "short" })}
              </Typography>
              <Box sx={{ display: "flex", justifyContent: "center", mt: 1 }}>
                {getWeatherIcon(item.weathercode)}
              </Box>
              <Typography sx={{ fontWeight: 700, fontSize: 13, mt: 1 }}>
                {Math.round(item.high)}° / {Math.round(item.low)}°
              </Typography>
            </Box>
          ))}
        </Box>
      </Box>
    </Card>
  );
}
