import { google, calendar_v3 } from "googleapis";

let client: calendar_v3.Calendar | null = null;

// Prijava se preveri ob prvi uporabi, ne ob importu, da `next build` deluje brez podatkov.
// Prednostno service account (GOOGLE_SERVICE_ACCOUNT_JSON, koledar mora biti deljen z njegovim
// emailom), sicer OAuth z refresh tokenom (GOOGLE_CLIENT_ID / _SECRET / _REFRESH_TOKEN).
export function getGoogleCalendar(): calendar_v3.Calendar {
  if (client) return client;

  const serviceAccount = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (serviceAccount) {
    const key = JSON.parse(serviceAccount) as { client_email: string; private_key: string };
    const auth = new google.auth.JWT({
      email: key.client_email,
      key: key.private_key,
      scopes: ["https://www.googleapis.com/auth/calendar.events"],
    });
    client = google.calendar({ version: "v3", auth });
    return client;
  }

  for (const k of ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN"]) {
    if (!process.env[k]) {
      throw new Error(`Missing environment variable: ${k} (or GOOGLE_SERVICE_ACCOUNT_JSON)`);
    }
  }
  const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  client = google.calendar({ version: "v3", auth });
  return client;
}

export const calendarId = process.env.GOOGLE_CALENDAR_ID || "primary";
export const calendarTimeZone = process.env.GOOGLE_CALENDAR_TIMEZONE || "Europe/Ljubljana";
