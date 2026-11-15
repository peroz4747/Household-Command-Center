import { NextResponse } from "next/server";
import { getCountryMarket, getMarkets, type MarketRange } from "../../../lib/markets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const r = new URL(req.url).searchParams.get("range");
  const range: MarketRange = r === "1mo" || r === "1y" ? r : "1d";
  const country = new URL(req.url).searchParams.get("country");
  if (country && !/^[A-Z]{2}$/.test(country)) return NextResponse.json({ error: "bad-request" }, { status: 400 });
  const items = country ? await getCountryMarket(country, range) : await getMarkets(range);
  return NextResponse.json({ range, items }, { headers: { "Cache-Control": "no-store" } });
}
