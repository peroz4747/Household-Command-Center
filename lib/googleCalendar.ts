import { google } from "googleapis";

const required = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REFRESH_TOKEN",
];

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

export const googleCalendar = google.calendar({
  version: "v3",
  auth,
});

export const calendarId = process.env.GOOGLE_CALENDAR_ID || "primary";
export const calendarTimeZone =
  process.env.GOOGLE_CALENDAR_TIMEZONE || "Europe/Ljubljana";