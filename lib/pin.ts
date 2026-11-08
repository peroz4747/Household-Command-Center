// PIN za občutljiva dejanja (DASHBOARD_PIN v .env). Brez nastavljenega PIN-a zaščita ni vklopljena.
import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

export const PIN_COOKIE = "hcc_pin";
export const PIN_COOKIE_MAX_AGE = 90 * 86_400;
const MAX_FAILS = 5;
const BLOCK_MS = 10 * 60_000;

let fails = 0;
let blockedUntil = 0;

const pin = () => process.env.DASHBOARD_PIN ?? "";
export const pinToken = () => createHmac("sha256", pin()).update("hcc-dashboard-pin").digest("hex");

function same(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Vrne odgovor 401, če PIN je zahtevan in ga brskalnik še ni potrdil; sicer null. */
export function requirePin(req: Request): NextResponse | null {
  if (!pin()) return null;
  const cookie = req.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${PIN_COOKIE}=([a-f0-9]+)`))?.[1] ?? "";
  return same(cookie, pinToken()) ? null : NextResponse.json({ error: "pin" }, { status: 401 });
}

export function checkPin(entered: string): "ok" | "wrong" | "blocked" {
  if (Date.now() < blockedUntil) return "blocked";
  if (pin() && same(entered, pin())) {
    fails = 0;
    return "ok";
  }
  fails += 1;
  if (fails >= MAX_FAILS) {
    fails = 0;
    blockedUntil = Date.now() + BLOCK_MS;
    return "blocked";
  }
  return "wrong";
}
