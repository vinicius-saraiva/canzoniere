import { NextResponse } from "next/server";
import { exchangeCode } from "@/lib/spotify";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  // Go back to the host the cookie was set on (the redirect URI's host), not whatever
  // hostname the dev server reports in req.url.
  const origin = process.env.SPOTIFY_REDIRECT_URI ? new URL(process.env.SPOTIFY_REDIRECT_URI).origin : url.origin;
  const home = new URL("/", origin);
  if (error || !code) {
    home.searchParams.set("spotify", `error:${error ?? "no_code"}`);
    return NextResponse.redirect(home);
  }
  try {
    await exchangeCode(code);
    home.searchParams.set("spotify", "ok");
  } catch (e) {
    home.searchParams.set("spotify", `error:${(e as Error).message}`);
  }
  return NextResponse.redirect(home);
}
