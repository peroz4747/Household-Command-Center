import { NextResponse } from "next/server";
import { getWarnings } from "../../../../lib/warnings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ items: await getWarnings() }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ items: [], error: "unavailable" }, { status: 502 });
  }
}
