import { NextResponse } from "next/server";
import { getProfile } from "../../../lib/countryProfile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const iso2 = p.get("iso2") ?? "";
  const iso3 = p.get("iso3") ?? "";
  if (!/^[A-Z]{2}$/.test(iso2) || !/^[A-Z]{3}$/.test(iso3)) return NextResponse.json({ error: "bad-request" }, { status: 400 });
  try {
    return NextResponse.json(await getProfile(iso2, iso3), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 502 });
  }
}
