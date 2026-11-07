import { NextResponse } from "next/server";
import net from "node:net";

// Ali internet deluje: TCP povezava na javna DNS strežnika (Cloudflare, Google).
// TCP namesto ICMP pinga, ker ping v kontejnerju potrebuje posebne pravice.
const TARGETS = [
  { host: "1.1.1.1", port: 443 },
  { host: "8.8.8.8", port: 443 },
];
const TIMEOUT_MS = 3000;

function probe(host: string, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const started = performance.now();
    const socket = net.connect({ host, port });
    const done = (err?: Error) => {
      socket.destroy();
      if (err) reject(err);
      else resolve(Math.round(performance.now() - started));
    };
    socket.setTimeout(TIMEOUT_MS, () => done(new Error("timeout")));
    socket.once("connect", () => done());
    socket.once("error", (e) => done(e));
  });
}

export async function GET() {
  const checkedAt = new Date().toISOString();
  try {
    // Deluje, če se odzove vsaj eden; latenca je od najhitrejšega.
    const ms = await Promise.any(TARGETS.map((t) => probe(t.host, t.port)));
    return NextResponse.json({ online: true, latencyMs: ms, checkedAt }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ online: false, latencyMs: null, checkedAt }, { headers: { "Cache-Control": "no-store" } });
  }
}
