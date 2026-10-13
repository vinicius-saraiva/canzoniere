import { DAY, cached } from "../cache";
import type { Adapter, Candidate, RawSheet, SourceId } from "../types";
import { accordiespartiti } from "./accordiespartiti";
import { cifraclub } from "./cifraclub";
import { ultimateguitar } from "./ultimateguitar";

/** Preference order when scores tie. */
export const ADAPTERS: Adapter[] = [accordiespartiti, ultimateguitar, cifraclub];

export const adapterById: Record<SourceId, Adapter> = {
  accordiespartiti,
  ultimateguitar,
  cifraclub,
};

/** Search every source in parallel; a failing source just contributes nothing. */
export async function searchAll(title: string, artist: string): Promise<Candidate[]> {
  const key = `search:${title}|${artist}`.toLowerCase();
  return cached(key, 7 * DAY, async () => {
    const results = await Promise.allSettled(ADAPTERS.map((a) => a.search(title, artist)));
    const all: Candidate[] = [];
    results.forEach((r, i) => {
      if (r.status === "fulfilled") all.push(...r.value.slice(0, 5));
      else console.warn(`[${ADAPTERS[i].id}] search failed:`, (r.reason as Error).message);
    });
    const order = new Map(ADAPTERS.map((a, i) => [a.id, i]));
    return all.sort((a, b) => {
      // Scores within 0.05 count as a tie; then source preference, then votes.
      if (Math.abs(a.score - b.score) > 0.05) return b.score - a.score;
      const o = (order.get(a.source) ?? 9) - (order.get(b.source) ?? 9);
      if (o !== 0) return o;
      return (b.votes ?? 0) - (a.votes ?? 0);
    });
  });
}

export async function fetchSheet(source: SourceId, url: string): Promise<RawSheet> {
  return cached(`sheet:${url}`, 30 * DAY, () => adapterById[source].fetch(url));
}
