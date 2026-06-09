import { NextResponse } from "next/server";

const latitude = process.env.WEATHER_LAT ?? "46.5547";
const longitude = process.env.WEATHER_LON ?? "15.6459";

const weatherCodeMap: Record<number, string> = {
  0: "Clear",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Cloudy",
  45: "Fog",
  48: "Depositing rime fog",
  51: "Light drizzle",
  53: "Moderate drizzle",
  55: "Dense drizzle",
  56: "Freezing drizzle",
  57: "Dense freezing drizzle",
  61: "Slight rain",
  63: "Moderate rain",
  65: "Heavy rain",
  66: "Freezing rain",
  67: "Heavy freezing rain",
  71: "Slight snow",
  73: "Moderate snow",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Slight rain showers",
  81: "Moderate rain showers",
  82: "Violent rain showers",
  85: "Slight snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm with slight hail",
  99: "Thunderstorm with heavy hail",
};

function formatForecast(daily: any) {
  return daily.time.slice(0, 4).map((date: string, index: number) => ({
    date,
    high: daily.temperature_2m_max[index],
    low: daily.temperature_2m_min[index],
  }));
}

export async function GET() {
  try {
    const endpoint = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true&daily=temperature_2m_max,temperature_2m_min&timezone=auto`;
    const response = await fetch(endpoint, { next: { revalidate: 600 } });

    if (!response.ok) {
      return NextResponse.json({ error: "Weather provider error" }, { status: 502 });
    }

    const payload = await response.json();
    const current = payload.current_weather;

    return NextResponse.json({
      current: {
        temperature: current.temperature,
        windspeed: current.windspeed,
        weathercode: current.weathercode,
        description: weatherCodeMap[current.weathercode] ?? "Unknown",
      },
      forecast: formatForecast(payload.daily),
    });
  } catch (error) {
    return NextResponse.json({ error: "Unable to load weather" }, { status: 500 });
  }
}
