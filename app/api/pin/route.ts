import { NextResponse } from "next/server";
import { checkPin, PIN_COOKIE, PIN_COOKIE_MAX_AGE, pinToken } from "../../../lib/pin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const result = checkPin(String(body?.pin ?? ""));
  if (result !== "ok") return NextResponse.json({ error: result }, { status: result === "blocked" ? 429 : 403 });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(PIN_COOKIE, pinToken(), { httpOnly: true, sameSite: "lax", path: "/", maxAge: PIN_COOKIE_MAX_AGE });
  return res;
}
