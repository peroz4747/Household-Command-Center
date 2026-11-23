import { NextResponse } from "next/server";
import { getMorningReport, ljToday } from "../../../lib/morningReport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const param = new URL(request.url).searchParams.get("day");
  const day = param && /^\d{4}-\d{2}-\d{2}$/.test(param) ? param : ljToday();
  const report = await getMorningReport(day);
  if (!report) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } });
}
