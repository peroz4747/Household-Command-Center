import { NextResponse } from "next/server";
import { runHealthCheck } from "../../../../lib/server";

// Health check je samo branje prek Proxmox API (token z vlogo PVEAuditor),
// zato ga je varno sprožiti z gumba na dashboardu.
export async function POST() {
  return NextResponse.json(await runHealthCheck(), { headers: { "Cache-Control": "no-store" } });
}
