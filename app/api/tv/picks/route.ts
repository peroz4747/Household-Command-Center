import { NextResponse } from "next/server";
import { getPicks, PICK_GENRES, type PickGenre, type PickProvider, type PickType } from "../../../../lib/tvPicks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET ?type=movie|show&provider=all|netflix|hbo&genre=drm (genre je neobvezen)
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const type = q.get("type");
  const provider = q.get("provider") ?? "all";
  const genre = q.get("genre") || null;
  if ((type !== "movie" && type !== "show") || !["all", "netflix", "hbo"].includes(provider)) {
    return NextResponse.json({ error: "bad params" }, { status: 400 });
  }
  if (genre && !(PICK_GENRES as readonly string[]).includes(genre)) {
    return NextResponse.json({ error: "bad genre" }, { status: 400 });
  }
  try {
    const items = await getPicks(type as PickType, genre as PickGenre | null, provider as PickProvider);
    return NextResponse.json({ items }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 502 });
  }
}
