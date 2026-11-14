import { NextResponse } from "next/server";
import { searchPlaces } from "../../../../lib/trip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const q = (params.get("q") ?? "").trim().slice(0, 200);
  if (q.length < 2) return NextResponse.json({ items: [] });
  try {
    return NextResponse.json({ items: await searchPlaces(q, params.get("lang") ?? "sl") });
  } catch {
    return NextResponse.json({ items: [] }, { status: 502 });
  }
}
