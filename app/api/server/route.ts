import { NextResponse } from "next/server";
import { getServerDetails } from "../../../lib/server";

export async function GET() {
  try {
    return NextResponse.json(await getServerDetails(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 502 });
  }
}
