import { NextResponse } from "next/server";
import { sendNotification } from "../../../../lib/notifier";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Testno obvestilo: enako kot jutranje poročilo, odpre današnje poročilo. Ne upošteva tihih ur. */
export async function POST() {
  const day = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Ljubljana" });
  const ok = await sendNotification("Dobro jutro (test)", "Vaše jutranje poročilo je pripravljeno.", 3, `https://dashboard.home/?porocilo=${day}`);
  return NextResponse.json({ ok }, { status: ok ? 200 : 502 });
}
