import { NextResponse } from "next/server";
import { getElectricity } from "../../../lib/electricity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Poraba elektrike v obračunskem obdobju (Moj Elektro; brez nastavitve vrne source "demo").
export async function GET() {
  try {
    return NextResponse.json(await getElectricity());
  } catch {
    return NextResponse.json({ source: "mojelektro", data: null, error: { code: "other" } }, { status: 500 });
  }
}
