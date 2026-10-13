import { NextResponse } from "next/server";
import { buildLoginUrl, isConfigured } from "@/lib/spotify";

export async function GET(req: Request) {
  if (!isConfigured()) {
    return NextResponse.json(
      { error: "Spotify is not configured. Set SPOTIFY_CLIENT_ID and SPOTIFY_REDIRECT_URI." },
      { status: 500 },
    );
  }
  // Cookies are per host. If the user opened the app on localhost but the registered redirect
  // URI uses 127.0.0.1 (or vice versa), the PKCE cookie would be missing on the way back.
  // So first hop to the host the callback will land on, then start the login there.
  // Use the Host header: in dev, req.url reports the bound hostname, not the one the browser used.
  const hereHost = req.headers.get("host") ?? new URL(req.url).host;
  const callback = new URL(process.env.SPOTIFY_REDIRECT_URI!);
  if (hereHost !== callback.host) {
    return NextResponse.redirect(new URL("/api/spotify/login", callback.origin));
  }
  return NextResponse.redirect(await buildLoginUrl());
}
