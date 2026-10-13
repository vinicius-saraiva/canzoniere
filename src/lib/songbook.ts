import { renderHtml } from "./sheet";
import type { Notation } from "./text";

export type SongbookSong = {
  title: string;
  artist: string;
  chordpro: string;
  transpose: number;
  capo?: number | null;
  status: "ok" | "lyrics-only" | "manual";
};

export type SongbookOptions = {
  title: string;
  fontSize: number; // px for lyrics
  sortAlphabetically: boolean;
  notation: Notation;
};

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Full HTML document for the PDF: cover, index, one song per page. */
export function songbookHtml(songs: SongbookSong[], opts: SongbookOptions): string {
  const list = opts.sortAlphabetically
    ? [...songs].sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }))
    : songs;

  const index = list
    .map(
      (s, i) =>
        `<li><a href="#song-${i}"><span class="t">${esc(s.title)}</span><span class="a">${esc(s.artist)}</span></a></li>`,
    )
    .join("");

  const pages = list
    .map((s, i) => {
      let body: string;
      try {
        body = s.chordpro.trim() ? renderHtml(s.chordpro, s.transpose, opts.notation) : "<p class='note'>No sheet.</p>";
      } catch {
        body = `<pre class="fallback">${esc(s.chordpro)}</pre>`;
      }
      const note = s.status === "lyrics-only" ? '<p class="note">Lyrics only. No chords were found for this song.</p>' : "";
      const capo = s.capo ? `<span class="capo">Capo ${s.capo}</span>` : "";
      return `<section class="song" id="song-${i}">
  <header><h2>${esc(s.title)}</h2><p class="artist">${esc(s.artist)} ${capo}</p></header>
  ${note}
  ${body}
</section>`;
    })
    .join("\n");

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(opts.title)}</title>
<style>
  @page { size: A4; }
  * { box-sizing: border-box; }
  body { font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; color: #111; margin: 0; }
  .cover { height: 250mm; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; page-break-after: always; }
  .cover h1 { font-size: 40px; margin: 0 0 12px; }
  .cover p { color: #666; font-size: 14px; }
  .index { page-break-after: always; }
  .index h2 { font-size: 22px; margin: 0 0 12px; }
  .index ol { columns: 2; column-gap: 24px; padding-left: 22px; margin: 0; font-size: 12px; }
  .index li { break-inside: avoid; margin: 0 0 4px; }
  .index a { color: inherit; text-decoration: none; display: flex; flex-direction: column; }
  .index .a { color: #777; font-size: 10px; }
  .song { page-break-before: always; page-break-inside: auto; }
  .song header { border-bottom: 1px solid #ddd; margin-bottom: 10px; padding-bottom: 4px; }
  .song h2 { font-size: 20px; margin: 0; }
  .song .artist { margin: 2px 0 0; color: #555; font-size: 12px; }
  .capo { display: inline-block; margin-left: 8px; padding: 1px 6px; border: 1px solid #999; border-radius: 4px; font-size: 10px; }
  .note { font-size: 11px; color: #a00; }
  .fallback { white-space: pre-wrap; font-family: Menlo, monospace; font-size: ${opts.fontSize - 1}px; }
  /* ChordSheetJS HtmlDivFormatter output */
  .chord-sheet { font-family: Menlo, "Courier New", monospace; font-size: ${opts.fontSize}px; line-height: 1.25; }
  .chord-sheet .paragraph { margin-bottom: ${Math.round(opts.fontSize * 0.9)}px; break-inside: avoid; }
  .chord-sheet .row { display: flex; flex-wrap: wrap; align-items: flex-start; break-inside: avoid; }
  .chord-sheet .column { display: flex; flex-direction: column; }
  .chord-sheet .chord, .chord-sheet .lyrics { white-space: pre; min-height: 1.25em; }
  .chord-sheet .chord { font-weight: 700; color: #1a4fb3; padding-right: 0.35em; }
  .chord-sheet .comment { font-style: italic; color: #666; }
  /* rows without any chord: collapse the empty chord line */
  .chord-sheet .row:not(:has(.chord:not(:empty))) .chord { display: none; }
  .chord-sheet h2 { font-size: 13px; font-family: inherit; margin: 0; }
</style></head>
<body>
  <div class="cover"><h1>${esc(opts.title)}</h1><p>${list.length} songs · generated with Canzoniere</p></div>
  <div class="index"><h2>Songs</h2><ol>${index}</ol></div>
  ${pages}
</body></html>`;
}
