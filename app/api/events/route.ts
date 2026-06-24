import { NextResponse } from "next/server";
import storage from "../../../lib/storage";

export async function GET() {
  try {
    const items = await storage.readItems("events");
    return NextResponse.json({ items });
  } catch (error) {
    return NextResponse.json({ error: "Unable to read events" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const items = await storage.readItems("events");
    const id = Date.now().toString();
    const item = { id, ...body };
    items.push(item);
    await storage.writeItems("events", items);
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "Unable to save event" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    if (!body.id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    const items = await storage.readItems("events");
    const idx = items.findIndex((i: any) => i.id === body.id);
    if (idx === -1) return NextResponse.json({ error: "Not found" }, { status: 404 });
    items[idx] = { ...items[idx], ...body };
    await storage.writeItems("events", items);
    return NextResponse.json(items[idx]);
  } catch (error) {
    return NextResponse.json({ error: "Unable to update event" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const body = await req.json();
    if (!body.id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    const items = await storage.readItems("events");
    const filtered = items.filter((i: any) => i.id !== body.id);
    if (filtered.length === items.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await storage.writeItems("events", filtered);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Unable to delete event" }, { status: 500 });
  }
}
