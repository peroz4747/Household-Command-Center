import { NextResponse } from "next/server";
import { runShortcut } from "../../../lib/shortcuts";
import { SHORTCUT_STEPS, type ShortcutId } from "../../../lib/shortcutDefs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// { id: "morning" | "leaving" | "arriving" | "dinner" | "sleep" }
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const id = body?.id;
  if (typeof id !== "string" || !Object.hasOwn(SHORTCUT_STEPS, id)) {
    return NextResponse.json({ error: "unknown shortcut" }, { status: 400 });
  }
  const steps = await runShortcut(id as ShortcutId);
  if (!steps) return NextResponse.json({ error: "busy" }, { status: 409 });
  return NextResponse.json({ steps });
}
