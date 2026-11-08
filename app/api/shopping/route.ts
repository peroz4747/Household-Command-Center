import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import storage from "../../../lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type ShoppingItem = { id: string; text: string; done: boolean };
const read = async (): Promise<ShoppingItem[]> => {
  const items = await storage.readItems("shopping");
  return Array.isArray(items) ? items : [];
};

export async function GET() {
  return NextResponse.json({ items: await read() }, { headers: { "Cache-Control": "no-store" } });
}

// { texts: string[] } - podvojeni neodkljukani vnosi se ne dodajo
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const texts: string[] = Array.isArray(body?.texts) ? body.texts.filter((x: unknown) => typeof x === "string") : [];
  const items = await read();
  for (const raw of texts) {
    const text = raw.trim().slice(0, 120);
    if (text && !items.some((i) => !i.done && i.text.toLowerCase() === text.toLowerCase())) items.push({ id: randomUUID(), text, done: false });
  }
  await storage.writeItems("shopping", items);
  return NextResponse.json({ items });
}

// { id, done }
export async function PUT(req: Request) {
  const body = await req.json().catch(() => null);
  const items = (await read()).map((i) => (i.id === body?.id ? { ...i, done: Boolean(body?.done) } : i));
  await storage.writeItems("shopping", items);
  return NextResponse.json({ items });
}

// Odstrani odkljukane vnose.
export async function DELETE() {
  const items = (await read()).filter((i) => !i.done);
  await storage.writeItems("shopping", items);
  return NextResponse.json({ items });
}
