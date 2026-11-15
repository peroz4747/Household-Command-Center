import { NextResponse } from "next/server";
import { getCountryInfo } from "../../../../lib/countryInfo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const iso2 = params.get("iso2") ?? "";
  const lang = ["sl", "en", "de"].includes(params.get("lang") ?? "") ? params.get("lang")! : "sl";
  if (!/^[A-Z]{2}$/.test(iso2)) return NextResponse.json({ error: "bad-request" }, { status: 400 });
  try {
    return NextResponse.json(await getCountryInfo(iso2, lang), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ intro: null, economy: null });
  }
}
