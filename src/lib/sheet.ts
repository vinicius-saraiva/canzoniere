import ChordSheetJS, { type Song } from "chordsheetjs";
import type { RawSheet } from "./types";

const { ChordProParser, ChordProFormatter, ChordsOverWordsParser, UltimateGuitarParser, HtmlDivFormatter } =
  ChordSheetJS;

/** Turn a site's plain chords-over-words text into a ChordPro string. */
export function rawToChordPro(raw: RawSheet): string {
  const parser = raw.source === "ultimateguitar" ? new UltimateGuitarParser() : new ChordsOverWordsParser();
  let song: Song;
  try {
    song = parser.parse(raw.text);
  } catch {
    // Fall back to the generic parser; worst case the text is kept as lyrics.
    song = new ChordsOverWordsParser().parse(raw.text);
  }
  // The chords-over-words parser turns tokens it cannot read into "[/undefined]"; drop those.
  const body = new ChordProFormatter().format(song).replace(/\[[^\]]*undefined[^\]]*\]/g, "");
  const header = [
    `{title: ${escapeMeta(raw.title)}}`,
    `{artist: ${escapeMeta(raw.artist)}}`,
    raw.key ? `{key: ${escapeMeta(raw.key)}}` : null,
    raw.capo ? `{capo: ${raw.capo}}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  return `${header}\n\n${body.trim()}\n`;
}

/** Wrap plain lyrics (no chords) in ChordPro so the PDF can still print them. */
export function lyricsToChordPro(title: string, artist: string, lyrics: string): string {
  return `{title: ${escapeMeta(title)}}\n{artist: ${escapeMeta(artist)}}\n\n${lyrics.trim()}\n`;
}

function escapeMeta(s: string): string {
  return s.replace(/[{}]/g, "");
}

export function parseChordPro(chordpro: string): Song {
  return new ChordProParser().parse(chordpro);
}

/** Render a ChordPro sheet to HTML, optionally transposed. */
export function renderHtml(chordpro: string, transpose = 0): string {
  // The page prints its own title/artist header; keep the formatter from repeating them.
  let song = parseChordPro(chordpro.replace(/^\{(title|artist|subtitle|t|st):[^}]*\}\s*$/gim, ""));
  if (transpose) song = song.transpose(transpose);
  return new HtmlDivFormatter().format(song);
}

export function chordsIn(chordpro: string): string[] {
  const set = new Set<string>();
  for (const m of chordpro.matchAll(/\[([^\]\s]+)\]/g)) set.add(m[1]);
  return [...set];
}
