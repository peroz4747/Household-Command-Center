import { requirePin } from "../../../../lib/pin";
import { NextResponse } from "next/server";
import { getTankControl, requestTank } from "../../../../lib/tankControl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getTankControl(), { headers: { "Cache-Control": "no-store" } });
}

// { action: "export" } = varen izklop, { action: "import" } = vklop
export async function POST(req: Request) {
  const denied = requirePin(req);
  if (denied) return denied;
  const body = await req.json().catch(() => null);
  const action = body?.action;
  if (action !== "export" && action !== "import") return NextResponse.json({ error: "invalid action" }, { status: 400 });
  try {
    return NextResponse.json({ id: await requestTank(action) });
  } catch (e) {
    const busy = e instanceof Error && e.message === "busy";
    return NextResponse.json({ error: busy ? "busy" : "unavailable" }, { status: busy ? 409 : 503 });
  }
}
