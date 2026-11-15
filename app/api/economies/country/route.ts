import { NextResponse } from "next/server";
import { getCountryDetail } from "../../../../lib/economies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const iso3 = new URL(req.url).searchParams.get("iso3") ?? "";
  if (!/^[A-Z]{3}$/.test(iso3)) return NextResponse.json({ error: "bad-request" }, { status: 400 });
  const data = await getCountryDetail(iso3).catch(() => null);
  return data ? NextResponse.json(data, { headers: { "Cache-Control": "no-store" } }) : NextResponse.json({ error: "not-found" }, { status: 404 });
}
