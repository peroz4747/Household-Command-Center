import { NextResponse } from "next/server";
import { getNotifySettings, saveNotifySettings } from "../../../lib/notifySettings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getNotifySettings(), { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "invalid" }, { status: 400 });
  return NextResponse.json(await saveNotifySettings(body));
}
