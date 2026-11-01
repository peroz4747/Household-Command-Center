import { NextResponse } from "next/server";
import { getNetworkOverview } from "../../../lib/network";

export async function GET() {
  try {
    const overview = await getNetworkOverview();
    return NextResponse.json(overview, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: "Unable to load network overview" }, { status: 500 });
  }
}
