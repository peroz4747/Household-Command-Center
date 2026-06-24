import fs from "fs/promises";
import path from "path";

async function ensureDataDir() {
  const dir = path.join(process.cwd(), "data");
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

async function getFilePath(name: string) {
  const dir = await ensureDataDir();
  return path.join(dir, `${name}.json`);
}

export async function readItems(name: string) {
  const file = await getFilePath(name);
  try {
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw);
  } catch (e) {
    if ((e as any)?.code === "ENOENT") return [];
    throw e;
  }
}

export async function writeItems(name: string, items: unknown) {
  const file = await getFilePath(name);
  await fs.writeFile(file, JSON.stringify(items, null, 2), "utf8");
}

export default { readItems, writeItems };
