import { NextResponse } from "next/server";
import { SNAP_CAMS, getFrames, startSnapCams } from "../../../lib/snapCams";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** ?cam=id → seznam časov slik; ?cam=id&frame=<čas>|latest → slika JPEG. */
export async function GET(req: Request) {
  startSnapCams(); // običajno že teče (instrumentation)
  const params = new URL(req.url).searchParams;
  const cam = params.get("cam") ?? "";
  if (!SNAP_CAMS[cam]) return NextResponse.json({ error: "not-found" }, { status: 404 });
  const list = getFrames(cam);
  const frame = params.get("frame");
  if (!frame) return NextResponse.json({ label: SNAP_CAMS[cam].label, frames: list.map((f) => f.at) }, { headers: { "Cache-Control": "no-store" } });
  const hit = frame === "latest" ? list.at(-1) : list.find((f) => f.at === Number(frame));
  if (!hit) return NextResponse.json({ error: "no-frame" }, { status: 404 });
  return new NextResponse(new Uint8Array(hit.jpeg), {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": frame === "latest" ? "no-store" : "public, max-age=86400, immutable" },
  });
}
