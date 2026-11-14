import { NextResponse } from "next/server";
import { getTrip, tripText } from "../../../../lib/trip";
import { sendNotification } from "../../../../lib/notifier";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Pošlje pot na telefon (ntfy); klik na obvestilo odpre Google Maps z vsemi postanki. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const trip = typeof body?.id === "string" ? await getTrip(body.id) : null;
  if (!trip) return NextResponse.json({ error: "not-found" }, { status: 404 });
  if (!process.env.NTFY_TOPIC) return NextResponse.json({ error: "no-ntfy" }, { status: 503 });
  const title = `Pot: ${trip.request.from.label.split(",")[0]} → ${trip.request.to.label.split(",")[0]}`;
  const ok = await sendNotification(title, `${tripText(trip)}\nKlikni za Google Maps.`, 3, trip.plan.mapsUrl);
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "send" }, { status: 502 });
}
