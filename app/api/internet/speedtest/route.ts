import { execFile } from "node:child_process";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const toMbps = (bytesPerSecond: number) => Math.round((bytesPerSecond * 8) / 10_000) / 100;

let running = false;

/** Ookla Speedtest CLI: meritev traja približno 30 sekund in za ta čas zapolni povezavo. */
export async function POST() {
  if (running) return NextResponse.json({ error: "busy" }, { status: 409 });
  running = true;
  try {
    const stdout = await new Promise<string>((resolve, reject) =>
      execFile(
        "speedtest",
        ["--accept-license", "--accept-gdpr", "--format=json"],
        { timeout: 120_000, maxBuffer: 1024 * 1024 },
        (err, out) => (err ? reject(err) : resolve(out)),
      ),
    );
    const result = JSON.parse(stdout.trim().split("\n").at(-1) ?? "");
    if (result.type !== "result") throw new Error("no result");
    return NextResponse.json({
      downloadMbps: toMbps(result.download.bandwidth),
      uploadMbps: toMbps(result.upload.bandwidth),
      pingMs: Math.round(result.ping.latency),
      server: result.server?.name ?? null,
    });
  } catch {
    return NextResponse.json({ error: "failed" }, { status: 502 });
  } finally {
    running = false;
  }
}
