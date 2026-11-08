import { NextResponse } from "next/server";
import { getStatus, launchApp, launchTitle, sendKey, togglePower, TV_APPS, TV_KEYS, type TvApp, type TvKey } from "../../../lib/tv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getStatus(), { headers: { "Cache-Control": "no-store" } });
}

// { action: "key", key: "KEY_VOLUP" } | { action: "app", app: "netflix" } | { action: "power" }
export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  try {
    if (body?.action === "power") return NextResponse.json({ ok: true, result: await togglePower() });
    if (body?.action === "key" && (TV_KEYS as readonly string[]).includes(body.key)) {
      await sendKey(body.key as TvKey);
      return NextResponse.json({ ok: true });
    }
    if (body?.action === "app" && body.app in TV_APPS) {
      await launchApp(body.app as TvApp);
      return NextResponse.json({ ok: true });
    }
    if (body?.action === "title" && typeof body.url === "string") {
      if (!(await launchTitle(body.url))) return NextResponse.json({ error: "unsupported url" }, { status: 400 });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    // unauthorized = na TV-ju je bila povezava zavrnjena; timeout/ECONNREFUSED = TV je ugasnjen ali nedosegljiv
    return NextResponse.json({ error: msg }, { status: msg === "unauthorized" ? 403 : 502 });
  }
}
