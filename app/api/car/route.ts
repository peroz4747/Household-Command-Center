import { NextResponse } from "next/server";
import storage from "../../../lib/storage";

// Shranjeno stanje avta (zaenkrat samo pnevmatike, ostalo so demo podatki v komponenti).
export type TyreSeason = "summer" | "winter";
export type CarState = { tyres: { mounted: TyreSeason; changedOn: string | null } };

const DEFAULT_STATE: CarState = { tyres: { mounted: "summer", changedOn: null } };

async function readState(): Promise<CarState> {
  const raw = await storage.readItems("car");
  return raw && !Array.isArray(raw) && raw.tyres ? (raw as CarState) : DEFAULT_STATE;
}

export async function GET() {
  try {
    return NextResponse.json(await readState());
  } catch {
    return NextResponse.json({ error: "Unable to read car state" }, { status: 500 });
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
    const state: CarState = { ...(await readState()), tyres: { mounted, changedOn } };
    await storage.writeItems("car", state);
    return NextResponse.json(state);
  } catch {
    return NextResponse.json({ error: "Unable to save car state" }, { status: 500 });
  }
}
