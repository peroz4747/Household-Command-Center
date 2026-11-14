import { NextResponse } from "next/server";
import { getMarkets, type MarketRange } from "../../../lib/markets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const r = new URL(req.url).searchParams.get("range");
  const range: MarketRange = r === "1mo" || r === "1y" ? r : "1d";
  return NextResponse.json({ range, items: await getMarkets(range) }, { headers: { "Cache-Control": "no-store" } });
}
