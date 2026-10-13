import * as cheerio from "cheerio";

/** String normalization, fuzzy matching and chord-name helpers. */

/**
 * Words that mark a variant of a song rather than a different song. Used both to
 * clean titles before searching and to ignore such suffixes when scoring matches.
 * Covers the English (Spotify) and Italian conventions.
 */
const VARIANT_WORDS =
  "remaster(?:ed|izzat[oa])?|live|dal vivo|in concerto|version|versione|vers\\.|edit|mix|remix|feat\\.?|ft\\.?|with|con|bonus|mono|stereo|demo|acoustic|acustic[oa]|unplugged|radio|single|album|deluxe|anniversary|anniversario|instrumental|strumentale|karaoke|cover|session|take|alternate|alternative|explicit|clean|sped up|slowed|original|originale|soundtrack|colonna sonora|ost|sanremo|studio|mastered|reissue|expanded|edition|edizione|extended|short|long|re-?recorded|rerecorded|nuova|new|official|ufficiale|video|videoclip|clip|lyrics?|testo|audio|hd|hq|4k|visuali[sz]er|\\d{4}";

/** "(Live at Wembley)", "[2011 Remaster]" */
const BRACKETED_VARIANT = new RegExp(`\\s*[\\(\\[][^\\)\\]]*?\\b(?:${VARIANT_WORDS})\\b[^\\)\\]]*[\\)\\]]`, "gi");
/** "Title - Live at Wembley", "Title - 2011 Remaster", "Title - Radio Edit" (the Spotify convention). */
const DASHED_VARIANT = new RegExp(`\\s+[-–—]\\s+[^-–—]*?\\b(?:${VARIANT_WORDS})\\b.*$`, "i");
/** "feat. X" / "ft. X" anywhere, no brackets. */
const FEAT = /\s+(?:feat\.?|ft\.?|featuring)\s+.+$/i;
/** "Title (Live)" and the like, already matched above; this also catches "Title - Live". */
const TRAILING_LIVE = /\s+[-–—]\s+(?:live|dal vivo)\b.*$/i;

/**
 * Reduce a playlist entry to the song it refers to: "Albachiara - Live 1990" -> "Albachiara",
 * "Sally (Remastered 2018)" -> "Sally", "Vieni a ballare in Puglia (feat. Fiorello)" -> "Vieni a ballare in Puglia".
 */
export function canonicalTitle(title: string): string {
  let t = title;
  for (let i = 0; i < 3; i++) {
    const before = t;
    t = t.replace(BRACKETED_VARIANT, "").replace(DASHED_VARIANT, "").replace(TRAILING_LIVE, "").replace(FEAT, "");
    if (t === before) break;
  }
  t = t.replace(/\s+/g, " ").trim();
  // Never return nothing: a title that is all "noise" is better left alone.
  return t.length >= 2 ? t : title.trim();
}

/** Spotify joins artists with ", "; the first one is the one the chord sites file the song under. */
export function primaryArtist(artist: string): string {
  // "&" and "e" are kept: "Simon & Garfunkel", "Al Bano e Romina Power" are one act.
  const first = artist.split(/,|;|\/|\s+feat\.?\s|\s+ft\.?\s|\s+featuring\s/i)[0] ?? artist;
  return first.trim() || artist.trim();
}

export function stripNoise(s: string): string {
  return canonicalTitle(s);
}

export function normalize(s: string): string {
  return stripNoise(s)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function bigrams(s: string): Map<string, number> {
  const m = new Map<string, number>();
  const t = ` ${s} `;
  for (let i = 0; i < t.length - 1; i++) {
    const b = t.slice(i, i + 2);
    m.set(b, (m.get(b) ?? 0) + 1);
  }
  return m;
}

/** Sørensen–Dice similarity on character bigrams, 0..1. */
export function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const ba = bigrams(na);
  const bb = bigrams(nb);
  let inter = 0;
  let total = 0;
  for (const [k, v] of ba) {
    total += v;
    inter += Math.min(v, bb.get(k) ?? 0);
  }
  for (const v of bb.values()) total += v;
  return (2 * inter) / total;
}

/** Artists often come as "A, B" or "A feat. B"; match on the primary one too. */
export function artistSimilarity(wanted: string, found: string): number {
  const primary = wanted.split(/,|feat\.?|ft\.?|&|\bx\b|\/|;/i)[0] ?? wanted;
  return Math.max(similarity(wanted, found), similarity(primary, found));
}

export function matchScore(
  track: { title: string; artist: string },
  cand: { title: string; artist: string },
): number {
  const t = similarity(track.title, cand.title);
  const a = artistSimilarity(track.artist, cand.artist);
  // Lists and video titles sometimes come as "Title - Artist"; a swapped reading counts almost as much.
  const swapped = 0.6 * similarity(track.artist, cand.title) + 0.4 * artistSimilarity(track.title, cand.artist);
  return Math.round(Math.max(0.6 * t + 0.4 * a, 0.95 * swapped) * 1000) / 1000;
}

const SOLFEGE: Record<string, string> = {
  DO: "C",
  RE: "D",
  MI: "E",
  FA: "F",
  SOL: "G",
  LA: "A",
  SI: "B",
};

/**
 * Convert Italian/Latin chord names (DO, RE, MI...) to letter names.
 * Handles the common Italian suffixes: 7+ (maj7), + (aug), - (minor), m, dim, sus.
 */
export function solfegeToLetters(text: string): string {
  const NOTE = "(DO|RE|MI|FA|SOL|LA|SI)";
  const re = new RegExp(
    `(^|[\\s(|])${NOTE}(#|b)?(m(?![a-z])|-)?(7\\+|\\+|dim|sus4|sus2|aug|maj7)?([0-9#b]*)(?:/${NOTE}(#|b)?)?(?:/([0-9]+))?`,
    "g",
  );
  return text
    .replace(
      re,
      (
        _m,
        pre: string,
        root: string,
        acc: string = "",
        minor: string = "",
        qual: string = "",
        rest: string = "",
        bassRoot?: string,
        bassAcc: string = "",
        slashNum?: string,
      ) => {
        let out = pre + SOLFEGE[root] + acc;
        if (minor) out += "m";
        if (qual === "7+") out += "maj7";
        else if (qual === "+") out += "aug";
        else if (qual) out += qual;
        out += rest;
        if (bassRoot) out += "/" + SOLFEGE[bassRoot] + bassAcc; // "RE/FA#" = D/F#
        if (slashNum) out += "/" + slashNum;
        return out;
      },
    )
    .replace(/\/4\b/g, "sus4") // Italian "LA7/4" = A7sus4
    .replace(/\/9\b/g, "add9") // "LAm7/9" = Am7add9
    .replace(/\/6\b/g, "6")
    .replace(/\/(11|13)\b/g, "add$1")
    .replace(/\b([A-G](?:#|b)?m?)4\b/g, "$1sus4"); // "RE4" = Dsus4
}

/** Decode HTML entities, numeric and named (&atilde; etc.). */
export function decodeEntities(s: string): string {
  if (!s.includes("&")) return s;
  return cheerio.load(`<p>${s}</p>`, undefined, false)("p").text();
}

const LETTERS_TO_SOLFEGE: Record<string, string> = { C: "Do", D: "Re", E: "Mi", F: "Fa", G: "Sol", A: "La", B: "Si" };

/**
 * Render one chord symbol the way Italian songbooks write it: Do Re Mi Fa Sol La Si,
 * minor as "Lam", major seventh as "7+", bass note after the slash converted too.
 * Anything that is not a chord (N.C., "x2", …) is returned untouched.
 */
export function chordToItalian(chord: string): string {
  const m = chord.match(/^([A-G])(#|b)?(.*?)(?:\/([A-G])(#|b)?)?$/);
  if (!m) return chord;
  const [, root, acc = "", suffix = "", bass, bassAcc = ""] = m;
  // ChordSheetJS normalizes "maj7" to "ma7"; Italian sheets write the major seventh as "7+".
  let out = LETTERS_TO_SOLFEGE[root] + acc + suffix.replace(/^(m?)(?:maj|ma|M|Δ)7/, "$17+");
  if (bass) out += "/" + LETTERS_TO_SOLFEGE[bass] + bassAcc;
  return out;
}

export type Notation = "italian" | "english";

/** Rewrite the chord labels in ChordSheetJS HTML output (<div class="chord">Am</div>). */
export function applyNotationToHtml(html: string, notation: Notation): string {
  return html.replace(/(class="chord">)([^<]*)/g, (_m, pre: string, chord: string) =>
    notation === "italian" ? pre + chordToItalian(chord) : pre + chord.replace(/^([A-G][#b]?m?)ma7/, "$1maj7"),
  );
}
