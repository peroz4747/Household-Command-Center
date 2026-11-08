import { NextResponse } from "next/server";
import { CLIMATE_MODES, ClimateError, getClimate, melcloudConfigured, setClimate, type ClimateCommand } from "../../../lib/melcloud";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const failure = (e: unknown) =>
  NextResponse.json({ error: e instanceof ClimateError ? e.message : "unavailable" }, { status: 502 });

export async function GET() {
  if (!melcloudConfigured()) return NextResponse.json({ error: "not-configured" }, { status: 503 });
  try {
    return NextResponse.json(await getClimate(), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return failure(e);
  }
}

// { power?: boolean, mode?: "Cool"|"Heat"|"Automatic"|"Dry"|"Fan", temperature?: number }
export async function POST(req: Request) {
  if (!melcloudConfigured()) return NextResponse.json({ error: "not-configured" }, { status: 503 });
  const body = await req.json().catch(() => null);
  const command: ClimateCommand = {};
  if (typeof body?.power === "boolean") command.power = body.power;
  if (CLIMATE_MODES.includes(body?.mode)) command.mode = body.mode;
  if (typeof body?.temperature === "number" && body.temperature >= 10 && body.temperature <= 31 && Number.isInteger(body.temperature * 2)) {
    command.temperature = body.temperature;
  }
  if (Object.keys(command).length === 0) return NextResponse.json({ error: "invalid" }, { status: 400 });
  try {
    return NextResponse.json(await setClimate(command));
  } catch (e) {
    return failure(e);
  }
}
