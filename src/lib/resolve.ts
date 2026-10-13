import { fetchSheet, searchAll } from "./adapters";
import { findLyrics } from "./lyrics";
import { lyricsToChordPro, rawToChordPro } from "./sheet";
import type { Candidate, Sheet, Track } from "./types";

/** A match below this score is shown to the user as doubtful. */
export const CONFIDENCE_THRESHOLD = 0.8;
/** Below this we do not even try to fetch; the song is treated as not found. */
const MIN_SCORE = 0.55;

/** Find the best chord sheet for one track: search all sources, fetch the best, fall back down the list. */
export async function resolveTrack(track: Track): Promise<Sheet> {
  const base = { trackId: track.id, title: track.title, artist: track.artist, transpose: 0 };
  let candidates: Candidate[] = [];
  try {
    candidates = await searchAll(track.title, track.artist);
  } catch (e) {
    console.warn("search failed", (e as Error).message);
  }

  for (const cand of candidates.filter((c) => c.score >= MIN_SCORE).slice(0, 4)) {
    try {
      const raw = await fetchSheet(cand.source, cand.url);
      if (!raw.text || raw.text.length < 40) continue;
      return {
        ...base,
        status: "ok",
        source: cand.source,
        url: cand.url,
        chordpro: rawToChordPro({ ...raw, title: track.title, artist: track.artist }),
        key: raw.key,
        capo: raw.capo,
        confidence: cand.score >= CONFIDENCE_THRESHOLD ? "good" : "doubtful",
        candidates,
      };
    } catch (e) {
      console.warn(`[${cand.source}] fetch failed for ${cand.url}:`, (e as Error).message);
    }
  }

  const lyrics = await findLyrics(track.title, track.artist);
  if (lyrics) {
    return {
      ...base,
      status: "lyrics-only",
      chordpro: lyricsToChordPro(track.title, track.artist, lyrics),
      confidence: "none",
      candidates,
    };
  }
  return { ...base, status: "missing", chordpro: "", confidence: "none", candidates };
}

/** Fetch one specific candidate the user picked in the review step. */
export async function sheetFromCandidate(track: Track, cand: Candidate, candidates: Candidate[]): Promise<Sheet> {
  const raw = await fetchSheet(cand.source, cand.url);
  return {
    trackId: track.id,
    title: track.title,
    artist: track.artist,
    transpose: 0,
    status: "ok",
    source: cand.source,
    url: cand.url,
    chordpro: rawToChordPro({ ...raw, title: track.title, artist: track.artist }),
    key: raw.key,
    capo: raw.capo,
    confidence: cand.score >= CONFIDENCE_THRESHOLD ? "good" : "doubtful",
    candidates,
  };
}
