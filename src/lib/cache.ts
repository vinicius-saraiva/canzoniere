import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Cache for fetched chord pages and search results, so each site is hit once per song.
 * - In-memory for the process lifetime (always).
 * - On Vercel: the Runtime Cache from @vercel/functions, shared across instances in a region.
 * - Locally: a JSON copy under .cache/ so dev restarts do not refetch.
 */

type Entry<T> = { value: T; expires: number };
const memory = new Map<string, Entry<unknown>>();
const ON_VERCEL = Boolean(process.env.VERCEL);
const DISK_DIR = path.join(process.cwd(), ".cache");

function fileFor(key: string): string {
  return path.join(DISK_DIR, createHash("sha1").update(key).digest("hex") + ".json");
}

async function readDisk<T>(key: string): Promise<Entry<T> | null> {
  try {
    return JSON.parse(await readFile(fileFor(key), "utf8")) as Entry<T>;
  } catch {
    return null;
  }
}

async function writeDisk<T>(key: string, entry: Entry<T>): Promise<void> {
  try {
    await mkdir(DISK_DIR, { recursive: true });
    await writeFile(fileFor(key), JSON.stringify(entry));
  } catch (e) {
    console.warn("[cache] disk write failed:", (e as Error).message);
  }
}

async function runtimeCache() {
  const { getCache } = await import("@vercel/functions");
  return getCache({ namespace: "canzoniere" });
}

export async function cached<T>(key: string, ttlMs: number, produce: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = memory.get(key) as Entry<T> | undefined;
  if (hit && hit.expires > now) return hit.value;

  if (ON_VERCEL) {
    try {
      const v = (await (await runtimeCache()).get(key)) as T | undefined;
      if (v !== undefined && v !== null) {
        memory.set(key, { value: v, expires: now + ttlMs });
        return v;
      }
    } catch {
      // runtime cache unavailable (e.g. `next dev` with VERCEL set); fall through
    }
  } else {
    const entry = await readDisk<T>(key);
    if (entry && entry.expires > now) {
      memory.set(key, entry);
      return entry.value;
    }
  }

  const value = await produce();
  const entry: Entry<T> = { value, expires: now + ttlMs };
  memory.set(key, entry);
  if (ON_VERCEL) {
    try {
      const tag = key.split(":")[0];
      await (await runtimeCache()).set(key, value, { ttl: Math.floor(ttlMs / 1000), tags: [tag], name: tag });
    } catch {
      // best effort
    }
  } else {
    await writeDisk(key, entry);
  }
  return value;
}

export const DAY = 24 * 60 * 60 * 1000;
