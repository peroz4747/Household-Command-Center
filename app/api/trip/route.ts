import { NextResponse } from "next/server";
import { TripError, deleteTrip, getTrip, planTrip, savedTrips, summarize, type TripPlace } from "../../../lib/trip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function place(v: unknown): TripPlace | null {
  const p = v as Partial<TripPlace> | null;
  const { label, lat, lon } = p ?? {};
  if (typeof label !== "string" || label.length > 300) return null;
  if (typeof lat !== "number" || typeof lon !== "number" || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { label, lat, lon };
}

/** Brez ?id: zadnja pot in seznam shranjenih; z ?id: ta pot. */
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  try {
    if (id) return NextResponse.json({ trip: await getTrip(id) }, { headers: { "Cache-Control": "no-store" } });
    const list = await savedTrips();
    return NextResponse.json({ trip: list[0] ?? null, saved: list.map(summarize) }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ trip: null, saved: [] });
  }
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "bad-request" }, { status: 400 });
  await deleteTrip(id);
  return NextResponse.json({ saved: (await savedTrips()).map(summarize) });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const from = place(body?.from);
  const to = place(body?.to);
  const via = Array.isArray(body?.via) ? body.via.map(place) : [];
  const fuelPercent = Number(body?.fuelPercent);
  const reserveKm = Number(body?.reserveKm);
  const lang = ["sl", "en", "de"].includes(body?.lang) ? body.lang : "sl";
  const date = typeof body?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : undefined;
  const valid = from && to && via.length <= 3 && via.every(Boolean) && fuelPercent >= 0 && fuelPercent <= 100 && reserveKm >= 0 && reserveKm <= 200;
  if (!valid) return NextResponse.json({ error: "bad-request" }, { status: 400 });
  try {
    const trip = await planTrip({ from, to, via: via as TripPlace[], roundTrip: Boolean(body.roundTrip), fuelPercent, reserveKm, lang, date });
    return NextResponse.json({ trip, saved: (await savedTrips()).map(summarize) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof TripError ? e.message : "routing" }, { status: 502 });
  }
}
