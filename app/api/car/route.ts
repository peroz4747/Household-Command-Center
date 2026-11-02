import { NextResponse } from "next/server";
import { getCar, refreshCar, setTyres } from "../../../lib/car";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getCar());
  } catch {
    return NextResponse.json({ error: "Unable to read car state" }, { status: 500 });
  }
}

// Ročno osveževanje iz Škoda API-ja (gumb "Refresh" na kartici).
export async function POST() {
  try {
    return NextResponse.json(await refreshCar());
  } catch {
    return NextResponse.json({ error: "Unable to refresh car data" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const mounted = body?.tyres?.mounted;
    const changedOn = body?.tyres?.changedOn ?? null;
    if (mounted !== "summer" && mounted !== "winter") {
      return NextResponse.json({ error: "tyres.mounted must be summer or winter" }, { status: 400 });
    }
    if (changedOn !== null && !/^\d{4}-\d{2}-\d{2}$/.test(changedOn)) {
      return NextResponse.json({ error: "tyres.changedOn must be YYYY-MM-DD or null" }, { status: 400 });
    }
    return NextResponse.json({ tyres: await setTyres({ mounted, changedOn }) });
  } catch {
    return NextResponse.json({ error: "Unable to save car state" }, { status: 500 });
  }
}
