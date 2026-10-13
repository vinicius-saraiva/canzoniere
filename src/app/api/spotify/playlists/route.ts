import { NextResponse } from "next/server";
import { NotLoggedIn, isConfigured, myPlaylists, readTokens } from "@/lib/spotify";

/** Session status plus the user's own playlists (the only ones the 2026 API lets us read). */
export async function GET() {
  if (!isConfigured()) return NextResponse.json({ configured: false, loggedIn: false, playlists: [] });
  if (!(await readTokens())) return NextResponse.json({ configured: true, loggedIn: false, playlists: [] });
  try {
    return NextResponse.json({ configured: true, loggedIn: true, playlists: await myPlaylists() });
  } catch (e) {
    if (e instanceof NotLoggedIn) return NextResponse.json({ configured: true, loggedIn: false, playlists: [] });
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
