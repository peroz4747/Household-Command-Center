import { NextResponse, type NextRequest } from "next/server";
import { getTaskLog } from "../../../../lib/server";

export async function GET(request: NextRequest) {
  const upid = request.nextUrl.searchParams.get("upid") ?? "";
  try {
    return NextResponse.json({ lines: await getTaskLog(upid) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
