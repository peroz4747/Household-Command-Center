import { NextResponse } from "next/server";
import { getFuel } from "../../../lib/fuel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getFuel(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Unable to load fuel prices" }, { status: 502 });
  }
}
