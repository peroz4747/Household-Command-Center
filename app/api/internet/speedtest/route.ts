import { NextResponse } from "next/server";
import { runSpeedtest } from "../../../../lib/internetHistory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Ookla Speedtest CLI: meritev traja približno 30 sekund in za ta čas zapolni povezavo. Shrani se v zgodovino. */
export async function POST() {
  const s = await runSpeedtest();
  if (s.downloadMbps === null) return NextResponse.json({ error: "failed" }, { status: 502 });
  return NextResponse.json({ downloadMbps: s.downloadMbps, uploadMbps: s.uploadMbps, pingMs: s.pingMs, server: s.server ?? null });
}
