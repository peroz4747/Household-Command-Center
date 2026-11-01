import { google, calendar_v3 } from "googleapis";

const required = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REFRESH_TOKEN",
];

let client: calendar_v3.Calendar | null = null;

// Credentials are checked on first use, not at import time, so `next build`
// works without them and only the calendar API fails until they are set.
export function getGoogleCalendar(): calendar_v3.Calendar {
  if (client) return client;

  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`Missing environment variable: ${key}`);
    }
  }

  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );

  auth.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
  });

  client = google.calendar({
    version: "v3",
    auth,
  });
  return client;
}

export const calendarId = process.env.GOOGLE_CALENDAR_ID || "primary";
export const calendarTimeZone =
  process.env.GOOGLE_CALENDAR_TIMEZONE || "Europe/Ljubljana";
