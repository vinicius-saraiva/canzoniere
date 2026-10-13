import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import type { Track } from "./types";

/**
 * Spotify Web API, Authorization Code with PKCE.
 * Since February 2026 a Development Mode app can only read playlists the logged-in
 * user owns or collaborates on, so login is required; there is no anonymous path.
 */

const SCOPES = "playlist-read-private playlist-read-collaborative";
const TOKEN_COOKIE = "sp_token";
const VERIFIER_COOKIE = "sp_verifier";

export type SpotifyTokens = { access_token: string; refresh_token?: string; expires_at: number };

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

export function isConfigured(): boolean {
  return Boolean(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_REDIRECT_URI);
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function buildLoginUrl(): Promise<string> {
  const verifier = b64url(randomBytes(48));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  const jar = await cookies();
  jar.set(VERIFIER_COOKIE, verifier, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 600 });
  const params = new URLSearchParams({
    response_type: "code",
    client_id: env("SPOTIFY_CLIENT_ID"),
    scope: SCOPES,
    redirect_uri: env("SPOTIFY_REDIRECT_URI"),
    code_challenge_method: "S256",
    code_challenge: challenge,
  });
  return `https://accounts.spotify.com/authorize?${params}`;
}

export async function exchangeCode(code: string): Promise<void> {
  const jar = await cookies();
  const verifier = jar.get(VERIFIER_COOKIE)?.value;
  if (!verifier) throw new Error("Login session expired, start again");
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: env("SPOTIFY_REDIRECT_URI"),
    client_id: env("SPOTIFY_CLIENT_ID"),
    code_verifier: verifier,
  });
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`Spotify token exchange failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number };
  await saveTokens({
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    expires_at: Date.now() + json.expires_in * 1000 - 30_000,
  });
  jar.delete(VERIFIER_COOKIE);
}

async function saveTokens(t: SpotifyTokens): Promise<void> {
  const jar = await cookies();
  jar.set(TOKEN_COOKIE, Buffer.from(JSON.stringify(t)).toString("base64url"), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 30 * 24 * 3600,
  });
}

export async function readTokens(): Promise<SpotifyTokens | null> {
  const jar = await cookies();
  const raw = jar.get(TOKEN_COOKIE)?.value;
  if (!raw) return null;
  try {
    return JSON.parse(Buffer.from(raw, "base64url").toString()) as SpotifyTokens;
  } catch {
    return null;
  }
}

export async function logout(): Promise<void> {
  (await cookies()).delete(TOKEN_COOKIE);
}

async function accessToken(): Promise<string> {
  const t = await readTokens();
  if (!t) throw new NotLoggedIn();
  if (t.expires_at > Date.now()) return t.access_token;
  if (!t.refresh_token) throw new NotLoggedIn();
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: t.refresh_token,
      client_id: env("SPOTIFY_CLIENT_ID"),
    }),
  });
  if (!res.ok) throw new NotLoggedIn();
  const json = (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number };
  const next = {
    access_token: json.access_token,
    refresh_token: json.refresh_token ?? t.refresh_token,
    expires_at: Date.now() + json.expires_in * 1000 - 30_000,
  };
  await saveTokens(next);
  return next.access_token;
}

export class NotLoggedIn extends Error {
  constructor() {
    super("Not logged in to Spotify");
  }
}

async function api<T>(path: string): Promise<T> {
  const token = await accessToken();
  const res = await fetch(`https://api.spotify.com/v1${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401) throw new NotLoggedIn();
  if (!res.ok) throw new Error(`Spotify ${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}

export type Playlist = { id: string; name: string; tracks: number; image?: string };

export async function myPlaylists(): Promise<Playlist[]> {
  type Page = {
    items: { id: string; name: string; tracks?: { total: number }; images?: { url: string }[] }[];
    next: string | null;
  };
  const out: Playlist[] = [];
  let path: string | null = "/me/playlists?limit=50";
  while (path) {
    const page: Page = await api<Page>(path);
    for (const p of page.items) {
      out.push({ id: p.id, name: p.name, tracks: p.tracks?.total ?? 0, image: p.images?.[0]?.url });
    }
    path = page.next ? page.next.replace("https://api.spotify.com/v1", "") : null;
  }
  return out;
}

export function playlistIdFromUrl(input: string): string | null {
  const s = input.trim();
  const m =
    s.match(/open\.spotify\.com\/(?:[a-z-]+\/)?playlist\/([A-Za-z0-9]+)/i) ??
    s.match(/spotify:playlist:([A-Za-z0-9]+)/i) ??
    (/^[A-Za-z0-9]{22}$/.test(s) ? [s, s] : null);
  return m ? m[1] : null;
}

type ItemsPage = {
  items: {
    track?: { id: string | null; name: string; artists: { name: string }[]; album?: { name: string } } | null;
    item?: { id: string | null; name: string; artists: { name: string }[]; album?: { name: string } } | null;
  }[];
  next: string | null;
};

export async function playlistTracks(playlistId: string): Promise<{ name: string; tracks: Track[] }> {
  const meta = await api<{ name: string }>(`/playlists/${playlistId}?fields=name`);
  const tracks: Track[] = [];
  // The February 2026 API renamed /tracks to /items; try the new path first.
  let path: string | null = `/playlists/${playlistId}/items?limit=100`;
  let page: ItemsPage;
  try {
    page = await api<ItemsPage>(path);
  } catch {
    path = `/playlists/${playlistId}/tracks?limit=100`;
    page = await api<ItemsPage>(path);
  }
  for (;;) {
    for (const it of page.items) {
      const t = it.item ?? it.track;
      if (!t || !t.name) continue;
      tracks.push({
        id: t.id ?? `${t.name}-${tracks.length}`,
        title: t.name,
        artist: t.artists.map((a) => a.name).join(", "),
        album: t.album?.name,
      });
    }
    if (!page.next) break;
    page = await api<ItemsPage>(page.next.replace("https://api.spotify.com/v1", ""));
  }
  return { name: meta.name, tracks };
}
