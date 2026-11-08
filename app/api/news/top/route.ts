import { NextResponse } from "next/server";
import { getNewsByTopics, getNewsTop } from "../../../../lib/newsTop";
import { NEWS_TOPICS, type NewsTopic } from "../../../../lib/newsTopics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET ?window=24h|7d&topics=maribor,vojska (brez teme: top novice)
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const window = q.get("window") === "24h" ? "24h" : "7d";
  const topics = (q.get("topics") ?? "").split(",").filter((t): t is NewsTopic => (NEWS_TOPICS as readonly string[]).includes(t));
  const data = topics.length ? await getNewsByTopics(window, topics) : await getNewsTop(window);
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
