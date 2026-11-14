import { NextResponse } from "next/server";
import { getFuelAlert, setFuelAlert } from "../../../../lib/fuelAlert";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getFuelAlert(), { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(req: Request) {
  const body = await req.json().catch(() => null);
  const below = body?.below === null ? null : Number(body?.below);
  if (below !== null && !Number.isFinite(below)) return NextResponse.json({ error: "bad-request" }, { status: 400 });
  return NextResponse.json(await setFuelAlert(below));
}
