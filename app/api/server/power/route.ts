import { requirePin } from "../../../../lib/pin";
import { NextResponse } from "next/server";
import { getPower, requestPower, saveSchedule, validateSchedule } from "../../../../lib/serverPower";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getPower(), { headers: { "Cache-Control": "no-store" } });
}

// { action: "shutdown" | "reboot" }
export async function POST(req: Request) {
  const denied = requirePin(req);
  if (denied) return denied;
  const body = await req.json().catch(() => null);
  const action = body?.action;
  if (action !== "shutdown" && action !== "reboot") return NextResponse.json({ error: "invalid action" }, { status: 400 });
  try {
    return NextResponse.json({ id: await requestPower(action) });
  } catch (e) {
    const busy = e instanceof Error && e.message === "busy";
    return NextResponse.json({ error: busy ? "busy" : "unavailable" }, { status: busy ? 409 : 503 });
  }
}

// Urnik: { enabled, days: [0..6], on: "HH:MM", off: "HH:MM" }
export async function PUT(req: Request) {
  const denied = requirePin(req);
  if (denied) return denied;
  const schedule = validateSchedule(await req.json().catch(() => null));
  if (!schedule) return NextResponse.json({ error: "invalid schedule" }, { status: 400 });
  try {
    await saveSchedule(schedule);
    return NextResponse.json({ ok: true, schedule });
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
