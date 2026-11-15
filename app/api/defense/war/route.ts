import { NextResponse } from "next/server";
import { conflictById } from "../../../../lib/defense";
import { getWarDetails } from "../../../../lib/warDetails";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Napotene sile in izgube države v konfliktu (infobox vojne na Wikipediji). */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const iso2 = p.get("iso2") ?? "";
  const c = conflictById(Number(p.get("id")));
  const m = c?.members[iso2];
  if (!/^[A-Z]{2}$/.test(iso2) || !c || !m) return NextResponse.json({ error: "bad-request" }, { status: 400 });
  // Kandidati za iskanje članka: najprej glavne strani, nato podporniki z najdaljšo udeležbo.
  const span = (x: [number, number][]) => x.reduce((a, [f, t]) => a + t - f + 1, 0);
  const others = Object.entries(c.members)
    .sort(([, x], [, y]) => Number(y.role === "primary") - Number(x.role === "primary") || span(y.years) - span(x.years))
    .map(([iso]) => iso);
  const details = await getWarDetails(iso2, {
    id: c.id,
    location: c.location,
    sideA: m.sideA,
    sideB: m.sideB,
    side: m.side,
    from: m.years[0][0],
    to: m.years.at(-1)![1],
    primaries: others,
  }).catch(() => null);
  return NextResponse.json({ details }, { headers: { "Cache-Control": "no-store" } });
}
