import { NextResponse } from "next/server";
import { getSection, type Domain } from "../../../../lib/countryProfile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DOMAINS: Domain[] = ["politics", "foreign", "military", "society", "information", "infrastructure", "energy", "geography", "climate"];

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const iso2 = p.get("iso2") ?? "";
  const domain = p.get("domain") as Domain;
  const lang = ["sl", "en", "de"].includes(p.get("lang") ?? "") ? p.get("lang")! : "sl";
  if (!/^[A-Z]{2}$/.test(iso2) || !DOMAINS.includes(domain)) return NextResponse.json({ error: "bad-request" }, { status: 400 });
  return NextResponse.json({ section: await getSection(iso2, domain, lang).catch(() => null) }, { headers: { "Cache-Control": "no-store" } });
}
