import { DAY, cached } from "./cache";
import { fetchJson } from "./http";

/**
 * LRCLIB (lrclib.net): free, keyless, crowdsourced lyrics. Used only when no chord
 * site has the song, so the PDF can still print the words.
 * The API asks clients to identify themselves in the User-Agent.
 */

type LrclibHit = { plainLyrics?: string | null; trackName: string; artistName: string; instrumental?: boolean };

export async function findLyrics(title: string, artist: string): Promise<string | null> {
  const key = `lyrics:${title}|${artist}`.toLowerCase();
  return cached(key, 30 * DAY, async () => {
    const q = new URLSearchParams({ track_name: title, artist_name: artist });
    try {
      const hits = await fetchJson<LrclibHit[]>(`https://lrclib.net/api/search?${q}`, {
        headers: { "User-Agent": "Canzoniere/0.1 (https://github.com/canzoniere; songbook generator)" },
      });
      const hit = hits.find((h) => h.plainLyrics && !h.instrumental);
      return hit?.plainLyrics ?? null;
    } catch {
      return null;
    }
  });
}
