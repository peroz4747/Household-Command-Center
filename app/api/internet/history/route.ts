import { NextResponse } from "next/server";
import { getInternetHistory } from "../../../../lib/internetHistory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getInternetHistory(), { headers: { "Cache-Control": "no-store" } });
}
