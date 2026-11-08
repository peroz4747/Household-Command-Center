import { connectSpotify } from "../../../../lib/spotify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const page = (text: string, status = 200) => new Response(text, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const state = req.headers.get("cookie")?.match(/(?:^|;\s*)hcc_spotify_state=([a-f0-9]+)/)?.[1];
  const code = q.get("code");
  if (!code || !state || q.get("state") !== state) return page("Povezava s Spotifyjem ni uspela. Poskusi znova.", 400);
  try {
    await connectSpotify(code);
    return page("Spotify je povezan. To stran lahko zapreš.");
  } catch {
    return page("Povezava s Spotifyjem ni uspela. Preveri nastavitve aplikacije.", 502);
  }
}
