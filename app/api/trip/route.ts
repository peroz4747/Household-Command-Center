import { NextResponse } from "next/server";
import { TripError, lastTrip, planTrip, type TripPlace } from "../../../lib/trip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function place(v: unknown): TripPlace | null {
  const p = v as Partial<TripPlace> | null;
  const { label, lat, lon } = p ?? {};
  if (typeof label !== "string" || label.length > 300) return null;
  if (typeof lat !== "number" || typeof lon !== "number" || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { label, lat, lon };
}

export async function GET() {
  try {
    return NextResponse.json({ trip: await lastTrip() }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ trip: null });
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const from = place(body?.from);
  const to = place(body?.to);
  const via = Array.isArray(body?.via) ? body.via.map(place) : [];
  const fuelPercent = Number(body?.fuelPercent);
  const reserveKm = Number(body?.reserveKm);
  const lang = ["sl", "en", "de"].includes(body?.lang) ? body.lang : "sl";
  const valid = from && to && via.length <= 3 && via.every(Boolean) && fuelPercent >= 0 && fuelPercent <= 100 && reserveKm >= 0 && reserveKm <= 200;
  if (!valid) return NextResponse.json({ error: "bad-request" }, { status: 400 });
  try {
    const plan = await planTrip({ from, to, via: via as TripPlace[], roundTrip: Boolean(body.roundTrip), fuelPercent, reserveKm, lang });
    return NextResponse.json({ plan });
  } catch (e) {
    return NextResponse.json({ error: e instanceof TripError ? e.message : "routing" }, { status: 502 });
  }
}
