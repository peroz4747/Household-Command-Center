import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Naslov HLS toka javne spletne kamere WhatsUpCams (CDN strežnik se lahko zamenja, zato ga ne zapišemo v kodo).
const CACHE_MS = 10 * 60_000;
const cache = new Map<string, { at: number; hls: string; snapshot: string | null }>();

export async function GET(req: Request) {
  const name = new URL(req.url).searchParams.get("name") ?? "";
  if (!/^[a-z]{2}_[a-z0-9]{2,40}$/.test(name)) return NextResponse.json({ error: "bad-request" }, { status: 400 });
  const had = cache.get(name);
  if (had && Date.now() - had.at < CACHE_MS) return NextResponse.json(had);
  try {
    const res = await fetch(`https://services.whatsupcams.com/streams/${name}?jsonp=true`, {
      cache: "no-store",
      headers: { "User-Agent": "Mozilla/5.0", Referer: "https://services.whatsupcams.com/" },
      signal: AbortSignal.timeout(10_000),
    });
    const text = await res.text();
    // JSONP: streamData({...}, 200);
    const data = JSON.parse(text.slice(text.indexOf("(") + 1, text.lastIndexOf("}") + 1));
    const hls = String(data?.hls?.url ?? "");
    if (!/^https:\/\/[\w.-]+\.whatsupcams\.com\/.+\.m3u8$/.test(hls)) throw new Error("no stream");
    const entry = { at: Date.now(), hls, snapshot: data?.snapshot ? `${data.snapshot}.jpg` : null };
    cache.set(name, entry);
    return NextResponse.json(entry);
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 502 });
  }
}
