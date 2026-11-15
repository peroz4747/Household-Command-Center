import { NextResponse } from "next/server";
import { CONFLICT_MAX_YEAR, CONFLICT_SOURCE, EQUIP_SOURCE, conflictStatus, conflictsOf, equipmentOf, membershipsOf, relationsOf } from "../../../lib/defense";
import { getEconomies } from "../../../lib/economies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const iso2 = new URL(req.url).searchParams.get("iso2") ?? "";
  if (!/^[A-Z]{2}$/.test(iso2)) return NextResponse.json({ error: "bad-request" }, { status: 400 });
  const economies = await getEconomies().catch(() => null);
  const all = economies?.items.map((e) => e.iso2) ?? [];
  const conflicts = conflictsOf(iso2);
  return NextResponse.json(
    {
      status: conflictStatus(iso2),
      maxYear: CONFLICT_MAX_YEAR,
      // Za prikaz le udeležba izbrane države (ne vseh članic koalicij).
      conflicts: conflicts.slice(0, 40).map(({ byYear: _byYear, members, ...c }) => ({ ...c, member: members[iso2] ?? null })),
      conflictCount: conflicts.length,
      relations: relationsOf(iso2, all.length > 100 ? all : []),
      memberships: membershipsOf(iso2),
      equipment: await equipmentOf(iso2),
      sources: { conflicts: CONFLICT_SOURCE, equipment: EQUIP_SOURCE },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
