import { NextResponse } from "next/server";

const calendarUrls = [
  process.env.GOOGLE_CALENDAR_ICS_URL,
  process.env.OUTLOOK_CALENDAR_ICS_URL,
].filter(Boolean) as string[];

const sampleCalendar = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Example Corp.//Household Command Center//EN
BEGIN:VEVENT
UID:1
DTSTAMP:20250623T080000Z
DTSTART:20250623T080000Z
DTEND:20250623T170000Z
SUMMARY:Nikoo Babysitting
DESCRIPTION:Home care session.
END:VEVENT
BEGIN:VEVENT
UID:2
DTSTAMP:20250623T090000Z
DTSTART:20250624T090000Z
DTEND:20250624T110000Z
SUMMARY:MOPA
DESCRIPTION:Art project planning.
END:VEVENT
BEGIN:VEVENT
UID:3
DTSTAMP:20250625T080000Z
DTSTART:20250625T080000Z
DTEND:20250625T170000Z
SUMMARY:Daycare
DESCRIPTION:Kids care and pickup.
END:VEVENT
END:VCALENDAR`;

function unfoldIcs(raw: string) {
  return raw.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "");
}

function parseDate(value: string) {
  const trimmed = value.trim();
  if (/^\d{8}T\d{6}Z$/.test(trimmed)) {
    return new Date(trimmed);
  }
  if (/^\d{8}T\d{6}$/.test(trimmed)) {
    return new Date(`${trimmed.slice(0, 4)}-${trimmed.slice(4, 6)}-${trimmed.slice(6, 8)}T${trimmed.slice(9)}`);
  }
  if (/^\d{8}$/.test(trimmed)) {
    return new Date(`${trimmed.slice(0, 4)}-${trimmed.slice(4, 6)}-${trimmed.slice(6)}`);
  }
  return new Date(trimmed);
}

function parseIcs(content: string) {
  const unfolded = unfoldIcs(content);
  return unfolded
    .split("BEGIN:VEVENT")
    .slice(1)
    .map((block) => {
      const summaryMatch = block.match(/SUMMARY:(.+)/i);
      const startMatch = block.match(/DTSTART(?:;[^:]*)?:(.+)/i);
      const endMatch = block.match(/DTEND(?:;[^:]*)?:(.+)/i);
      const descriptionMatch = block.match(/DESCRIPTION:(.+)/i);
      const summary = summaryMatch?.[1]?.trim() ?? "Untitled event";
      const start = startMatch ? parseDate(startMatch[1]) : new Date();
      const end = endMatch ? parseDate(endMatch[1]) : new Date(start.getTime() + 60 * 60 * 1000);
      const description = descriptionMatch?.[1]?.trim() ?? "";
      return { summary, start, end, description };
    })
    .filter((event) => !Number.isNaN(event.start.getTime()));
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export async function GET() {
  try {
    const responses = await Promise.all(
      calendarUrls.length
        ? calendarUrls.map((url) => fetch(url).then((res) => res.text()))
        : [Promise.resolve(sampleCalendar)]
    );

    const events = responses.flatMap((text) => parseIcs(text));
    const upcoming = events
      .filter((event) => event.start.getTime() >= Date.now())
      .sort((a, b) => a.start.getTime() - b.start.getTime())
      .slice(0, 6)
      .map((event) => ({
        title: event.summary,
        start: formatDate(event.start),
        end: formatDate(event.end),
        description: event.description,
      }));

    return NextResponse.json({ events: upcoming });
  } catch (error) {
    return NextResponse.json({ error: "Unable to load calendar events" }, { status: 500 });
  }
}
