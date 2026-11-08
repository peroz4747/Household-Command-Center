import { NextResponse } from "next/server";
import { getPcStatus, runPcAction, type PcAction } from "../../../lib/pcControl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIONS: PcAction[] = ["wake", "shutdown", "suspend"];

export async function GET() {
  try {
    return NextResponse.json(await getPcStatus(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Unable to read PC status" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  // Zaščita pred tujimi spletnimi stranmi (CSRF): zahteva mora priti z istega izvora.
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (origin && host && new URL(origin).host !== host) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let action: unknown;
  try {
    action = (await req.json())?.action;
  } catch {
    action = undefined;
  }
  if (!ACTIONS.includes(action as PcAction)) {
    return NextResponse.json({ error: "action must be wake, shutdown or suspend" }, { status: 400 });
  }

  try {
    await runPcAction(action as PcAction);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 502 });
  }
}
