# Canzoniere

Paste a Spotify playlist (or a list of songs), get a PDF songbook with chords and lyrics, one song per page, ready for a guitar around a table.

## How it works

1. **Track list**: Spotify login (the 2026 API only lets an app read the logged-in user's own playlists) or a pasted `Artist - Title` list.
2. **Chords and lyrics**: one adapter per chord site, searched in parallel, best match wins:
   - Accordi e Spartiti (Italian; chord names converted from DO/RE/MI to C/D/E)
   - Ultimate Guitar
   - Cifra Club (search works; song pages are often blocked at the CDN for server traffic)
3. **Review**: every song shows its match, source link, other versions to switch to, transpose buttons, a preview, and a box to paste your own sheet. Songs with no chords fall back to lyrics-only via LRCLIB.
4. **PDF**: sheets are normalized to ChordPro, rendered with ChordSheetJS, and printed to A4 with headless Chrome (cover, index, one song per page).

## Run locally

```bash
npm install
cp .env.example .env.local   # fill in SPOTIFY_CLIENT_ID (optional: the pasted list works without it)
npm run dev
```

Open http://localhost:3000.

### Spotify setup

1. Create an app at https://developer.spotify.com/dashboard.
2. Add `http://127.0.0.1:3000/api/spotify/callback` (and your production URL) as a redirect URI.
3. Under **User Management**, add the Spotify accounts that will log in (Development Mode allows 5).
4. Put the Client ID in `.env.local`. No client secret is needed (PKCE).

## Deploy to Vercel

`vercel deploy`. Set `SPOTIFY_CLIENT_ID` and `SPOTIFY_REDIRECT_URI` (`https://<your-domain>/api/spotify/callback`) in the project's environment variables. PDF rendering uses `@sparticuz/chromium` on Vercel and the locally downloaded Chrome from the `puppeteer` dev dependency on your machine. Fetched pages are cached in the Vercel Runtime Cache on Vercel and in `.cache/` locally.

## Notes

- The chord sites forbid automated collection in their terms. This is built as a private tool for one group: one request per song, cached for 30 days, browser-like headers.
- No database. Review state lives in the browser tab (sessionStorage).
