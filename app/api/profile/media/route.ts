import { NextResponse } from "next/server";
import { getMedia } from "../../../../lib/countryMedia";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const iso2 = p.get("iso2") ?? "";
  const lang = ["sl", "en", "de"].includes(p.get("lang") ?? "") ? p.get("lang")! : "sl";
  if (!/^[A-Z]{2}$/.test(iso2)) return NextResponse.json({ error: "bad-request" }, { status: 400 });
  return NextResponse.json({ outlets: await getMedia(iso2, lang).catch(() => []) }, { headers: { "Cache-Control": "no-store" } });
}
