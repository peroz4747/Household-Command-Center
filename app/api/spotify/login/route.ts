import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { requirePin } from "../../../../lib/pin";
import { spotifyAuthUrl, spotifyConfigured } from "../../../../lib/spotify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Enkratna povezava računa: odpri https://dashboard.home/api/spotify/login
export async function GET(req: Request) {
  const denied = requirePin(req);
  if (denied) return denied;
  if (!spotifyConfigured()) return new Response("Manjkata SPOTIFY_CLIENT_ID in SPOTIFY_CLIENT_SECRET v .env.", { status: 503 });
  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(spotifyAuthUrl(state));
  res.cookies.set("hcc_spotify_state", state, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 600 });
  return res;
}
