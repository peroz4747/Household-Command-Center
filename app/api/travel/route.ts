import { NextResponse } from "next/server";
import { getTravelHint } from "../../../lib/travel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ item: await getTravelHint() }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ item: null }, { status: 502 });
  }
}
