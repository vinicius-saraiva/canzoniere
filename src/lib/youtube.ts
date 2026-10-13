import { HttpError } from "./http";
import { canonicalTitle, similarity } from "./text";
import type { Track } from "./types";

/**
 * YouTube playlists via the Data API v3. Public and unlisted playlists only need an API
 * key, no login: the easiest way for a group to build a list together.
 * Create a key at https://console.cloud.google.com (enable "YouTube Data API v3").
 */

const API = "https://www.googleapis.com/youtube/v3";
const MAX_TRACKS = 300;

export function isYoutubeConfigured(): boolean {
  return Boolean(process.env.YOUTUBE_API_KEY);
}

/** Playlist id from a watch/playlist URL with ?list=, or a bare id (PL…, OL…, RD…, UU…, FL…, LL…). */
export function youtubePlaylistIdFromUrl(input: string): string | null {
  const s = input.trim();
  const m = s.match(/[?&]list=([A-Za-z0-9_-]+)/) ?? (/^(PL|OL|RD|UU|FL|LL)[A-Za-z0-9_-]{10,}$/.test(s) ? [s, s] : null);
  return m ? m[1] : null;
}

export function looksLikeYoutube(input: string): boolean {
  return /youtube\.com|youtu\.be|[?&]list=/i.test(input) || /^(PL|OL|RD|UU|FL|LL)[A-Za-z0-9_-]{10,}$/.test(input.trim());
}

type PlaylistItem = {
  snippet: {
    title: string;
    videoOwnerChannelTitle?: string;
    resourceId?: { videoId?: string };
  };
  status?: { privacyStatus?: string };
};
type Page<T> = { items: T[]; nextPageToken?: string; error?: { message: string } };

async function api<T>(path: string, params: Record<string, string>): Promise<T> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new Error("YouTube is not configured (YOUTUBE_API_KEY)");
  const q = new URLSearchParams({ ...params, key });
  const res = await fetch(`${API}/${path}?${q}`, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    let detail = "";
    try {
      detail = ((await res.json()) as { error?: { message?: string } }).error?.message ?? "";
    } catch {
      // keep the status only
    }
    if (res.status === 404) throw new Error("YouTube playlist not found. Is it public or unlisted?");
    if (res.status === 403) throw new Error(`YouTube refused the request: ${detail || "quota or key problem"}`);
    throw new HttpError(res.status, `${API}/${path}`);
  }
  return (await res.json()) as T;
}

export async function youtubePlaylistTracks(playlistId: string): Promise<{ name: string; tracks: Track[] }> {
  const meta = await api<Page<{ snippet: { title: string } }>>("playlists", { part: "snippet", id: playlistId });
  const name = meta.items[0]?.snippet.title;
  if (!name) throw new Error("YouTube playlist not found. Is it public or unlisted?");

  const tracks: Track[] = [];
  let pageToken: string | undefined;
  do {
    const page = await api<Page<PlaylistItem>>("playlistItems", {
      part: "snippet,status",
      maxResults: "50",
      playlistId,
      ...(pageToken ? { pageToken } : {}),
    });
    for (const it of page.items) {
      const { title, videoOwnerChannelTitle, resourceId } = it.snippet;
      if (!title || /^(deleted video|private video)$/i.test(title)) continue;
      const parsed = parseVideoTitle(title, videoOwnerChannelTitle ?? "");
      tracks.push({ id: resourceId?.videoId ?? `yt-${tracks.length}`, ...parsed });
    }
    pageToken = page.nextPageToken;
  } while (pageToken && tracks.length < MAX_TRACKS);

  return { name, tracks };
}

/** Channel names carry the artist, minus YouTube's own decorations. */
export function artistFromChannel(channel: string): string {
  return channel
    .replace(/\s*-\s*topic$/i, "")
    .replace(/vevo$/i, "")
    .replace(/\s*\b(official|ufficiale|channel|canale|music|musica|tv|records|hd)\b\s*/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Strip the decorations video titles carry: (Official Video), [Testo], | Lyrics, HD, ft. … */
export function cleanVideoTitle(title: string): string {
  return canonicalTitle(
    title
      .replace(/\s*[\(\[【][^\)\]】]*[\)\]】]\s*/g, (m) => (/[a-z]{3}/i.test(m) ? " " : m)) // drop any bracket with words
      .replace(/\s*[|•·]\s*.*$/, "") // "Title | Official Video"
      .replace(/\s*#[a-z_]\w*/gi, "") // hashtags ("#brunorisas"), but not "Marmellata #25"
      .replace(/[“”"']+$/, "")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

/**
 * "Vasco Rossi - Albachiara (Official Video)" -> artist "Vasco Rossi", title "Albachiara".
 * The channel decides which side of the dash is the artist, and supplies the artist when
 * the title has no dash at all ("Albachiara" on channel "VascoRossiVEVO").
 */
export function parseVideoTitle(raw: string, channel: string): { title: string; artist: string } {
  const channelArtist = artistFromChannel(channel);
  const cleaned = cleanVideoTitle(raw);

  // Artist "Title" / Artist: Title
  const quoted = cleaned.match(/^(.+?)\s*[:：]?\s*["“](.+?)["”]$/);
  if (quoted) return { artist: quoted[1].trim(), title: canonicalTitle(quoted[2]) };

  const parts = cleaned.split(/\s+[-–—]\s+|\s*[:：]\s+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const [a, b] = [parts[0], parts.slice(1).join(" - ")];
    // Default is "Artist - Title"; swap when the channel name clearly matches the second part.
    const swap = channelArtist && similarity(channelArtist, b) > similarity(channelArtist, a) + 0.2;
    const artist = swap ? b : a;
    const title = swap ? a : b;
    return { artist: tidyCase(artist), title: canonicalTitle(tidyCase(title)) };
  }
  return { artist: tidyCase(channelArtist), title: canonicalTitle(tidyCase(cleaned)) };
}

/** ALL CAPS titles are common on YouTube; chord sites file songs in normal case. */
function tidyCase(s: string): string {
  if (s.length < 4 || s !== s.toUpperCase() || !/[A-Z]/.test(s)) return s;
  return s.toLowerCase().replace(/(^|[\s'’(])(\p{L})/gu, (_m, pre: string, c: string) => pre + c.toUpperCase());
}
