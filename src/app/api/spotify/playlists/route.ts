import { NextResponse } from "next/server";
import { NotLoggedIn, isConfigured, myPlaylists, readTokens } from "@/lib/spotify";
import { isYoutubeConfigured } from "@/lib/youtube";

/** Session status plus the user's own playlists (the only ones the 2026 API lets us read). */
export async function GET() {
  const youtube = isYoutubeConfigured();
  if (!isConfigured()) return NextResponse.json({ youtube, configured: false, loggedIn: false, playlists: [] });
  if (!(await readTokens())) return NextResponse.json({ youtube, configured: true, loggedIn: false, playlists: [] });
  try {
    return NextResponse.json({ youtube, configured: true, loggedIn: true, playlists: await myPlaylists() });
  } catch (e) {
    if (e instanceof NotLoggedIn) return NextResponse.json({ youtube, configured: true, loggedIn: false, playlists: [] });
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
