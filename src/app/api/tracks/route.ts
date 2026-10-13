import { NextResponse } from "next/server";
import { z } from "zod";
import { NotLoggedIn, playlistIdFromUrl, playlistTracks } from "@/lib/spotify";
import type { Track } from "@/lib/types";
import { youtubePlaylistIdFromUrl, youtubePlaylistTracks, looksLikeYoutube } from "@/lib/youtube";

const Body = z.union([
  z.object({ playlist: z.string().min(1) }),
  z.object({ list: z.string().min(1) }),
]);

/**
 * Turn the user's input into a track list.
 * { playlist } = YouTube playlist link/ID (public or unlisted) or Spotify link, URI or ID (needs login);
 * { list } = one song per line, "Artist - Title" or "Title - Artist" or "Title | Artist".
 */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  if ("list" in parsed.data) {
    const tracks = parseList(parsed.data.list);
    if (tracks.length === 0) return NextResponse.json({ error: "No songs found in the list" }, { status: 400 });
    return NextResponse.json({ name: "My songbook", tracks });
  }

  if (looksLikeYoutube(parsed.data.playlist)) {
    const ytId = youtubePlaylistIdFromUrl(parsed.data.playlist);
    if (!ytId) return NextResponse.json({ error: "That YouTube link has no playlist in it (no list= part)" }, { status: 400 });
    try {
      const result = await youtubePlaylistTracks(ytId);
      if (result.tracks.length === 0) return NextResponse.json({ error: "That playlist is empty" }, { status: 400 });
      return NextResponse.json(result);
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 502 });
    }
  }

  const id = playlistIdFromUrl(parsed.data.playlist);
  if (!id) return NextResponse.json({ error: "That does not look like a Spotify or YouTube playlist link" }, { status: 400 });
  try {
    return NextResponse.json(await playlistTracks(id));
  } catch (e) {
    if (e instanceof NotLoggedIn) return NextResponse.json({ error: "login" }, { status: 401 });
    const msg = (e as Error).message;
    const hint = /40[34]/.test(msg)
      ? " Since February 2026 Spotify only lets an app read playlists the logged-in user owns or collaborates on."
      : "";
    return NextResponse.json({ error: msg + hint }, { status: 502 });
  }
}

function parseList(list: string): Track[] {
  const out: Track[] = [];
  for (const rawLine of list.split(/\r?\n/)) {
    const line = rawLine.replace(/^\s*[\d]+[.)]\s*/, "").trim();
    if (!line) continue;
    const parts = line.split(/\s+[-–—|]\s+/);
    let title = line;
    let artist = "";
    if (parts.length >= 2) {
      // Default to "Artist - Title" (the Spotify convention); the resolver scores both ways anyway.
      artist = parts[0].trim();
      title = parts.slice(1).join(" - ").trim();
    }
    out.push({ id: `list-${out.length}`, title, artist });
  }
  return out;
}
