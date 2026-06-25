import { NextResponse } from "next/server";
import { calendarId, calendarTimeZone, googleCalendar } from "../../../lib/googleCalendar";

export const runtime = "nodejs";

function toAppEvent(event: any) {
  return {
    id: event.id,
    title: event.summary || "Untitled event",
    start: event.start?.dateTime || event.start?.date,
    end: event.end?.dateTime || event.end?.date,
    description: event.description || "",
  };
}

export async function GET() {
  try {
    const response = await googleCalendar.events.list({
      calendarId,
      timeMin: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString(),
      maxResults: 250,
      singleEvents: true,
      orderBy: "startTime",
    });

    const events = (response.data.items || []).map(toAppEvent);

    return NextResponse.json({ events });
  } catch {
    return NextResponse.json(
      { error: "Unable to load Google Calendar events" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    if (!body.title || !body.start || !body.end) {
      return NextResponse.json(
        { error: "Missing title, start or end" },
        { status: 400 }
      );
    }

    const response = await googleCalendar.events.insert({
      calendarId,
      requestBody: {
        summary: body.title,
        description: body.description || "",
        start: {
          dateTime: body.start,
          timeZone: calendarTimeZone,
        },
        end: {
          dateTime: body.end,
          timeZone: calendarTimeZone,
        },
      },
    });

    return NextResponse.json(toAppEvent(response.data), { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Unable to create Google Calendar event" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const body = await req.json();

    if (!body.id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    await googleCalendar.events.delete({
      calendarId,
      eventId: body.id,
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Unable to delete Google Calendar event" },
      { status: 500 }
    );
  }
}